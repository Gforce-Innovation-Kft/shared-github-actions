# Pipeline map — the Salesforce CI/CD chain

The whole system on one page. The tables live in
[`sf-cicd-pipeline-map.xlsx`](sf-cicd-pipeline-map.xlsx); the diagrams live here
because **the diagrams are the editable part**.

> **How to steer the work with this file.** Edit a diagram below — add a box,
> redraw an arrow, cross something out, write `?` on a node you want explained —
> and hand it back. Mermaid is plain text, so a diff of this file is a
> specification. That is faster and less ambiguous than describing a pipeline in
> prose.
>
> Conventions used in the diagrams:
> `:::built` = exists and works · `:::new` = added in this change ·
> `:::planned` = designed, not written · `:::gap` = missing and it matters.

---

## 1. The four layers

```mermaid
flowchart TB
    subgraph SF["Salesforce org"]
        LWC["LWC<br/><i>user asks for an operation</i>"]:::built
        APEX["Apex<br/>GitHubDispatchService<br/>GitHubActionsService"]:::built
        REST["Apex REST<br/>/gforce/ops-callback/v1"]:::gap
    end

    subgraph L4["L4 — consumer repo (sf-develop-demo)"]
        CALLER["sf-ops.yml<br/><i>thin uses: caller</i><br/>sets run-name with the correlation id"]:::gap
    end

    subgraph L3["L3 — dispatch (shared-github-actions)"]
        DISPATCH["reusable-sf-ops-dispatch.yml<br/><i>validate → route → report</i>"]:::new
    end

    subgraph L2["L2 — reusable workflows"]
        REL["reusable-sf-package-release.yml"]:::built
        PRV["sf-pr-validate.yml"]:::built
        SFR["sf-release.yml"]:::built
    end

    subgraph L1["L1 — capability actions"]
        A1["sf-org-login"]:::new
        A2["sf-org-scratch-create"]:::built
        A3["sf-package-create"]:::built
        A4["sf-package-promote"]:::new
        A5["sf-package-install"]:::new
        A6["sf-ops-callback"]:::new
        A7["sf-package-resolve"]:::planned
    end

    LWC --> APEX
    APEX -->|"POST /dispatches<br/>204, no body"| CALLER
    CALLER -->|uses:| DISPATCH
    DISPATCH -->|create-version| REL
    DISPATCH -->|promote| A4
    DISPATCH -->|install| A7
    A7 -->|install-order| A5
    DISPATCH -->|always| A6
    REL --> A1 & A2 & A3
    PRV --> A1 & A2
    SFR --> A1
    A4 --> A1
    A5 --> A1
    A6 -->|"POST callback"| REST
    REST -.->|"platform event"| LWC

    classDef built fill:#d6efd6,stroke:#4a7c4a,color:#1a331a
    classDef new fill:#b7e1b7,stroke:#2f6b2f,color:#0f280f,stroke-width:2px
    classDef planned fill:#fff2cc,stroke:#b38f00,color:#3d3000,stroke-dasharray: 5 3
    classDef gap fill:#fce4e4,stroke:#c04d4d,color:#3d1414,stroke-dasharray: 5 3
```

**The layer rules, in one line each.** L1 never calls L1 — an action that only
picks between two other actions is routing. L3 inlines no Salesforce logic. No
pass-through layer that forwards inputs unchanged. Nesting caps at 4 and
L4→L3→L2→action already spends three.

---

## 2. Inside the dispatcher — where a request actually goes

```mermaid
flowchart TB
    IN(["request<br/>operation + correlation-id"]):::built

    NORM["<b>normalize</b><br/><i>Tier 2 — github-script@v9</i><br/>allow-list the operation<br/>regex every value<br/>values via env: only, never inline expressions"]:::new

    CV["<b>create-version</b><br/>→ reusable-sf-package-release.yml"]:::built
    CVD["<b>create-version-dry-run</b><br/><i>a uses: job cannot skip<br/>its own steps</i>"]:::new
    PR["<b>promote</b><br/>→ sf-package-promote<br/>🔒 environment gate"]:::new
    IN2["<b>install</b><br/>→ sf-package-install<br/>🔒 environment gate"]:::new

    REP["<b>report</b><br/><i>needs: ALL routes · if: always()</i><br/>succeeded | failed | cancelled | no-route"]:::new
    CB["sf-ops-callback<br/>→ Salesforce"]:::new
    FAIL{"status ==<br/>succeeded?"}:::new
    GREEN(["run is green"]):::built
    RED(["run is RED"]):::gap

    IN --> NORM
    NORM -->|"valid = false"| REP
    NORM -->|"op == create-version"| CV
    NORM -->|"op == create-version<br/>&& dry-run"| CVD
    NORM -->|"op == promote"| PR
    NORM -->|"op == install"| IN2
    CV --> REP
    CVD --> REP
    PR --> REP
    IN2 --> REP
    REP --> CB
    CB --> FAIL
    FAIL -->|yes| GREEN
    FAIL -->|"no — incl. every route skipped"| RED

    classDef built fill:#d6efd6,stroke:#4a7c4a,color:#1a331a
    classDef new fill:#b7e1b7,stroke:#2f6b2f,color:#0f280f,stroke-width:2px
    classDef planned fill:#fff2cc,stroke:#b38f00,color:#3d3000,stroke-dasharray: 5 3
    classDef gap fill:#fce4e4,stroke:#c04d4d,color:#3d1414,stroke-dasharray: 5 3
```

Three properties this shape exists to hold:

| Hazard | What stops it |
|---|---|
| **A skipped job is green.** An operation matching no route would report success. | `report` needs every route; all-skipped → `no-route` → the run fails. |
| **Both dispatch APIs return 204 with no body**, so the requester never learns a run id. Polling means searching runs by name after the 204 — racy in a way the client cannot fix. | The run calls Salesforce back, keyed by the correlation id. |
| **A rejected request would die in `normalize`**, leaving the LWC waiting forever. | `normalize` sets `valid=false` instead of failing, so `report` still calls back — *then* the run goes red. |

---

## 3. The round trip, in time order

```mermaid
sequenceDiagram
    autonumber
    participant U as LWC
    participant A as Apex
    participant G as GitHub (L4 → L3)
    participant S as Salesforce CLI / Dev Hub

    U->>A: promote 0.1.0-2
    A->>A: generate correlationId, save request record
    A->>G: POST /dispatches {operation, correlationId, versionId}
    G-->>A: 204 No Content (no run id — this is the whole problem)
    A-->>U: "queued" (record status = requested)

    Note over G: concurrency: sf-ops-<correlationId><br/>a duplicate delivery queues, never races

    G->>G: normalize — allow-list + regex
    G->>S: sf data query Package2Version
    S-->>G: IsReleased, ValidationSkipped
    alt built with --skip-validation
        G-->>G: fail NOT_VALIDATED
    else already released
        G-->>G: status = already-released (success, not failure)
    else
        G->>S: sf package version promote
    end

    G->>A: POST /gforce/ops-callback/v1 {correlationId, status, outputs}
    A->>A: upsert on correlationId, publish platform event
    A-->>U: re-render with the terminal status
    G->>G: exit non-zero unless status == succeeded
```

---

## 4. The create-version pipeline (the expensive one)

```mermaid
flowchart LR
    D["L3 create-version"]:::new --> V

    subgraph REL["L2 reusable-sf-package-release.yml"]
        direction TB
        V["<b>validate</b><br/>scratch org<br/>deploy + RunLocalTests"]:::built
        P["<b>package</b><br/>Dev Hub only"]:::built
        R["<b>release</b><br/>no Salesforce"]:::built
        V -->|"success or skipped"| P --> R
    end

    V --> SO["sf-org-scratch-create<br/><i>capacity preflight</i>"]:::built
    P --> PC["sf-package-create<br/><i>headroom preflight</i>"]:::built
    PC --> TAG["provenance tag<br/>pkg/&lt;pkg&gt;/&lt;version&gt;"]:::built
    R --> GH["GitHub Release<br/>+ release-manifest.json"]:::built
    PC -.->|"planned:<br/>--tag corr:&lt;id&gt; preflight<br/>short-circuits a retry"| IDEM["Package2Version.Tag<br/>ledger"]:::planned

    classDef built fill:#d6efd6,stroke:#4a7c4a,color:#1a331a
    classDef new fill:#b7e1b7,stroke:#2f6b2f,color:#0f280f,stroke-width:2px
    classDef planned fill:#fff2cc,stroke:#b38f00,color:#3d3000,stroke-dasharray: 5 3
```

**Why validate runs first:** a tree that does not compile costs zero
`Package2VersionCreates` slots. There are 6 per Dev Hub per day.

**What is still missing:** `sf-package-create` hardcodes `--tag "$GITHUB_SHA"`.
Making it an input and passing `corr:<correlation-id>` would let a preflight SOQL
resolve an existing `04t` for a retried request without spending a slot. This is
the one operation that is **not** idempotent today.

---

## 5. Installing a chain — why order is not optional

```mermaid
flowchart LR
    REQ["install weather-app"]:::built --> RES

    RES["<b>sf-package-resolve</b><br/>Tier 3 TypeScript<br/>latest released + flatten deps"]:::planned
    RES -->|"install-order: JSON array"| MTX

    MTX["strategy.matrix<br/>max-parallel: 1"]:::planned
    MTX --> I1["fflib-apex-mocks<br/>04tgL...M0arQAC"]:::built
    I1 --> I2["fflib-apex-common<br/>04tgL...M0cTQAS"]:::built
    I2 --> I3["weather-app<br/>04tgL...M26PQAS"]:::built

    classDef built fill:#d6efd6,stroke:#4a7c4a,color:#1a331a
    classDef planned fill:#fff2cc,stroke:#b38f00,color:#3d3000,stroke-dasharray: 5 3
```

**2GP dependencies are not transitive.** Salesforce installs exactly the version
you name and does not walk the graph — declaring only `fflib-apex-common` fails
with *"Install package 'fflib-apex-mocks' before you install
'fflib-apex-common'"*. That is why the order is computed, not assumed, and why
`sf-package-resolve` is the one Tier 3 action in this batch: version-number
ordering plus dependency flattening is a data model and an algorithm, which is
exactly what earns a unit test.

Until it lands, `install` takes an explicit `04t` and Apex issues one request per
version, waiting for each callback.

---

## 6. What is missing, drawn honestly

```mermaid
flowchart LR
    subgraph DONE["Works today"]
        X1["L1 capability actions"]:::built
        X2["L2 pipelines"]:::built
        X3["L3 routing + fail-closed report"]:::new
        X4["callback payload contract"]:::new
    end

    subgraph TODO["Not built"]
        Y1["sf-package-resolve"]:::planned
        Y2["create-version idempotency"]:::gap
        Y3["Apex REST callback endpoint"]:::gap
        Y4["L4 caller sf-ops.yml"]:::gap
        Y5["v1 tag is stale"]:::gap
    end

    X3 --> Y1 & Y2
    X4 --> Y3
    X3 --> Y4
    X3 --> Y5

    classDef built fill:#d6efd6,stroke:#4a7c4a,color:#1a331a
    classDef new fill:#b7e1b7,stroke:#2f6b2f,color:#0f280f,stroke-width:2px
    classDef planned fill:#fff2cc,stroke:#b38f00,color:#3d3000,stroke-dasharray: 5 3
    classDef gap fill:#fce4e4,stroke:#c04d4d,color:#3d1414,stroke-dasharray: 5 3
```

| Missing | Why it matters | Where it lands |
|---|---|---|
| `sf-package-resolve` | Nothing can answer *"latest released version of X"* or produce an install order | New Tier 3 action + a Tooling API client under `gforce-gha-src/clients/salesforce/` |
| `create-version` idempotency | A retry with the same correlation id builds a second version and spends a second slot out of 6/day | `sf-package-create`: `--tag` as an input + a `Package2Version.Tag` preflight |
| Apex REST callback endpoint | Every callback currently 404s | `sf-develop-demo` — upsert on `correlationId`, publish a platform event |
| L4 caller `sf-ops.yml` | Nothing in the app repo receives `sf_ops_requested` | Copy the template from [consuming-sf-dispatch.md](consuming-sf-dispatch.md) §6 |
| `v1` tag is stale | It predates `sf-org-login`, `sf-package-create` and `sf-org-scratch-create`, so `@v1` refs do not resolve | `release.yml` force-moves the floating tag — cut a release |

---

## 7. A blank diagram to draw on

Copy this, change it, hand it back. Anything in it becomes the plan.

```mermaid
flowchart TB
    START(["what triggers it?"]):::sketch
    STEP1["step 1 — which action?"]:::sketch
    STEP2["step 2 — which action?"]:::sketch
    DECIDE{"what decides<br/>between them?"}:::sketch
    DONE(["what does the caller<br/>learn at the end?"]):::sketch

    START --> STEP1 --> DECIDE
    DECIDE -->|"case A"| STEP2
    DECIDE -->|"case B"| DONE
    STEP2 --> DONE

    classDef sketch fill:#eef2ff,stroke:#5566cc,color:#1a1f4d,stroke-dasharray: 4 3
```

Questions worth answering on the drawing, because they are the ones that change
the shape:

1. **Who triggers it** — a human, a push, a tag, or Salesforce?
2. **Is any step irreversible or metered?** Promotion is irreversible; package
   creates are 6/day; scratch orgs are capped both concurrently and daily.
3. **What must the caller learn, and how?** A run that goes silent is worse than
   one that fails.
4. **What happens on a retry?** If the answer is "it runs again", say whether
   that is acceptable.

---

## Related

- [ADR 0001 — Salesforce dispatch layer](adr/0001-salesforce-dispatch-layer.md) — the five decisions and what was rejected
- [consuming-sf-dispatch.md](consuming-sf-dispatch.md) — the exact contract the Apex/LWC side codes against
- [architecture.md](architecture.md) — L1–L4 plus the code layering inside a TypeScript action
- [sf-cicd-pipeline-map.xlsx](sf-cicd-pipeline-map.xlsx) — the same content as sortable tables
