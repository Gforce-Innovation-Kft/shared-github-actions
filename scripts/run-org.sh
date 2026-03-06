#!/bin/bash
# Demo per-org script for testing bulk execution.
# Runs inside gforceinnovation/sf-bulk:latest.
# Org is already authenticated before this script is called.
#
# Usage: bash scripts/run-org.sh <org-alias>

set -euo pipefail

ORG_ALIAS="${1:?'ORG_ALIAS required as first argument'}"

echo "▶ [$ORG_ALIAS] started at $(date -u +%H:%M:%S)"

# Simulate work — each container sleeps 2 seconds before doing anything
sleep 2

# ── Query ─────────────────────────────────────────────────────────────────
echo "[$ORG_ALIAS] querying Lead count..."

RESULT=$(sf data query \
  --target-org "$ORG_ALIAS" \
  --query "SELECT COUNT() FROM Lead" \
  --json)

COUNT=$(echo "$RESULT" | jq '.result.totalSize')
echo "[$ORG_ALIAS] Lead count: $COUNT"

# ── Insert ────────────────────────────────────────────────────────────────
echo "[$ORG_ALIAS] inserting test Lead..."

sf data create record \
  --target-org "$ORG_ALIAS" \
  --sobject Lead \
  --values "LastName='BulkTest' FirstName='$ORG_ALIAS' Company='BulkExec' LeadSource='Web'" \
  --json

echo "✅ [$ORG_ALIAS] done at $(date -u +%H:%M:%S)"
