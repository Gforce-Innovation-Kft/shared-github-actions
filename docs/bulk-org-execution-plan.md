# Bulk Salesforce Org Execution — Design Plan

## Goal

Execute idempotent scripts against Salesforce orgs in parallel.
Each org is a separate job in the GitHub Actions UI — named, individually clickable, shows its own logs.

---

## UI Result

```
Actions › Bulk Org Execute › Run #42

  ✅ prepare
  ✅ acme          (1m 23s)
  ✅ globex         (1m 41s)
  ❌ initech        (0m 08s)   ← click to see logs for just this org
  ✅ contoso        (1m 55s)
  ✅ fabrikam       (2m 01s)
  ...
```

---

## How It Works

One matrix job per org. `max-parallel` controls how many run at the same time.
Each job spins up exactly one `gforceinnovation/sf-ci:latest` container.

```
prepare job
  → fetch all orgs from AWS
  → filter by customer names (optional)
  → output: [{alias, url}, ...]  ← becomes the matrix

execute job  (matrix, 1 org per job, max-parallel: concurrency)
  name: ${{ matrix.alias }}       ← org name shown in GitHub UI
  │
  ├─ checkout repo
  ├─ mask auth URL in logs
  └─ docker run --rm -i \
       -v $GITHUB_WORKSPACE:/workspace:ro \
       gforceinnovation/sf-ci:latest \
       bash -c "
         sf org login sfdx-url --sfdx-url-stdin --alias $ALIAS
         bash /workspace/scripts/run-org.sh $ALIAS
       "
```

**No orchestrator script needed.** GitHub Actions handles the concurrency.

---

## Inputs

```yaml
# workflow_dispatch (GitHub UI) — all string, choice, or boolean
# workflow_call     — can use number / boolean

inputs:
  customers:
    description: 'Customer names (comma-separated). Leave empty to run ALL.'
    type: string
    required: false
    default: ''

  script_path:
    description: 'Per-org script, relative to repo root'
    type: string
    required: false
    default: 'scripts/run-org.sh'

  concurrency:
    description: 'Max orgs running at the same time (1 container each)'
    type: number        # workflow_call
    required: false
    default: 10

  fail_fast:
    description: 'Stop all orgs if one fails'
    type: boolean
    required: false
    default: false
```

> **Note:** `workflow_dispatch` only supports `string`, `choice`, `boolean`, `environment`.
> Use `type: string` for `concurrency` in the dispatch block; cast with `fromJson()` in the strategy.

---

## Limitation: 256-job matrix cap

GitHub Actions limits a single matrix to **256 jobs**.
- Running a specific customer list: no issue
- Running all orgs: if > 256, split into two workflow runs or use customer list batches
- 400 orgs: trigger two runs — e.g., `customers: "org-001..org-200"` + `"org-201..org-400"`

---

## Auth URL Security

The auth URL contains a refresh token. Mask it immediately so it never appears in logs:

```yaml
- name: Mask auth URL
  run: echo "::add-mask::${{ matrix.url }}"
```

After this step, `${{ matrix.url }}` is replaced with `***` in all subsequent log output.

---

## Workflow

```yaml
# .github/workflows/bulk-org-execute.yml
name: Bulk Org Execute

on:
  workflow_dispatch:
    inputs:
      customers:
        description: 'Customer names (comma-separated). Leave empty for ALL.'
        type: string
        required: false
        default: ''
      script_path:
        description: 'Per-org script (relative to repo root)'
        type: string
        required: false
        default: 'scripts/run-org.sh'
      concurrency:
        description: 'Max orgs running simultaneously'
        type: string      # dispatch only supports string
        required: false
        default: '10'
      fail_fast:
        description: 'Stop all orgs if one fails'
        type: boolean
        required: false
        default: false

  workflow_call:
    inputs:
      customers:    { type: string,  required: false, default: '' }
      script_path:  { type: string,  required: false, default: 'scripts/run-org.sh' }
      concurrency:  { type: number,  required: false, default: 10 }
      fail_fast:    { type: boolean, required: false, default: false }
    secrets:
      AWS_ROLE_ARN: { required: true }

permissions:
  id-token: write   # OIDC → AWS
  contents: read

jobs:
  prepare:
    runs-on: pi5-runners-dind
    outputs:
      org_list: ${{ steps.filter.outputs.org_list }}
      count:    ${{ steps.filter.outputs.count }}
    steps:
      - uses: actions/checkout@v4

      # ── Fetch org list from AWS ──────────────────────────────────────────
      # TODO: replace with real fetch
      # Option A — S3:
      #   aws s3 cp s3://my-bucket/orgs.json /tmp/all-orgs.json
      # Option B — Secrets Manager:
      #   aws secretsmanager get-secret-value \
      #     --secret-id salesforce/all-orgs \
      #     --query SecretString --output text > /tmp/all-orgs.json
      # ────────────────────────────────────────────────────────────────────
      - name: Fetch org list from AWS
        run: |
          echo "TODO: fetch org list from AWS into /tmp/all-orgs.json"

      - name: Filter to requested customers
        id: filter
        run: |
          node -e "
            const all       = JSON.parse(require('fs').readFileSync('/tmp/all-orgs.json'));
            const requested = (process.env.CUSTOMERS || '').trim();
            let orgs        = all;

            if (requested) {
              const names = requested.split(',').map(s => s.trim().toLowerCase());
              orgs = all.filter(o => names.includes(o.alias.toLowerCase()));
              if (orgs.length === 0) { console.error('No matching customers: ' + requested); process.exit(1); }
              console.log('Filtered to ' + orgs.length + ' of ' + all.length + ' orgs');
            } else {
              console.log('Running ALL ' + orgs.length + ' orgs');
            }

            if (orgs.length > 256) {
              console.error('Matrix cap: ' + orgs.length + ' orgs exceeds 256. Use customer filter to split.');
              process.exit(1);
            }

            const fs = require('fs');
            fs.appendFileSync(process.env.GITHUB_OUTPUT,
              'org_list=' + JSON.stringify(orgs) + '\n' +
              'count=' + orgs.length + '\n'
            );
          "
        env:
          CUSTOMERS: ${{ inputs.customers }}

  execute:
    needs: prepare
    runs-on: pi5-runners-dind
    name: ${{ matrix.alias }}          # ← org name shown in GitHub Actions UI
    strategy:
      matrix:
        include: ${{ fromJson(needs.prepare.outputs.org_list) }}
      max-parallel: ${{ fromJson(inputs.concurrency) }}
      fail-fast: ${{ fromJson(toJson(inputs.fail_fast)) }}
    steps:
      - uses: actions/checkout@v4

      - name: Pull sf-ci image
        run: docker pull gforceinnovation/sf-ci:latest || true

      - name: Mask auth URL
        run: echo "::add-mask::${{ matrix.url }}"

      - name: Run ${{ matrix.alias }}
        run: |
          mkdir -p logs

          # Create container (not started yet) — gives us a writable, isolated copy
          CID=$(docker create -i \
            -e ORG_ALIAS="${{ matrix.alias }}" \
            gforceinnovation/sf-ci:latest \
            bash -c "
              set -euo pipefail
              sf org login sfdx-url --sfdx-url-stdin \
                --alias '${{ matrix.alias }}' \
                --no-prompt
              bash /workspace/${{ inputs.script_path }} '${{ matrix.alias }}'
            ")

          # Copy checked-out repo into container — each container gets its own writable copy
          docker cp "$GITHUB_WORKSPACE/." "$CID:/workspace/"

          # Start and pipe auth URL to stdin; capture all output to log
          echo "$ORG_URL" | docker start -ai "$CID" \
            > logs/${{ matrix.alias }}.log 2>&1
          EXIT=$?

          docker rm -f "$CID" 2>/dev/null || true
          exit $EXIT
        env:
          ORG_URL: ${{ matrix.url }}   # masked in logs after the mask step

      - name: Upload log
        if: always()   # upload even when the org script fails
        uses: actions/upload-artifact@v4
        with:
          name: log-${{ matrix.alias }}
          path: logs/${{ matrix.alias }}.log
          if-no-files-found: warn
```

---

## `scripts/run-org.sh`

Runs **inside** `gforceinnovation/sf-ci:latest`. Org is already authenticated.

```bash
#!/bin/bash
# run-org.sh — runs inside sf-ci, org is authenticated, must be idempotent
set -euo pipefail

ORG_ALIAS="${1:?'ORG_ALIAS required'}"
echo "▶ $ORG_ALIAS"

# ── your logic here ───────────────────────────────────────
# sf project deploy start --target-org "$ORG_ALIAS" --metadata "..." --json
# sf apex run --target-org "$ORG_ALIAS" --file /workspace/scripts/apex/patch.apex
# ─────────────────────────────────────────────────────────

echo "✅ $ORG_ALIAS"
```

---

## File Structure

```
# shared-github-actions repo (this repo)
.github/
  workflows/
    bulk-org-execute.yml      ← the reusable workflow

# calling repo (where your scripts live)
scripts/
  run-org.sh                  ← your per-org logic
```

---

## Open Question

- **AWS org list format / location**: What does the org list look like in AWS and where is it stored?
  `[{"alias":"acme","url":"force://..."},...]`
  This determines only the `Fetch org list from AWS` step.
