#!/usr/bin/env bash
#
# The one definition of an artifact's checksum.
#
# sf-artifact-build writes it; sf-artifact-deploy verifies it. If the two ever
# compute it differently, every deployment fails as if the artifact had been
# tampered with — which is exactly what happened once, when the build started
# covering secret-templates and the deploy still hashed mdapi alone. Hence one
# script, resolved from the same tag by both actions, so they cannot drift.
#
# Usage:  artifact-checksum.sh <artifact-dir> [--write-manifest]
#
# Prints the digest on stdout. With --write-manifest, also writes the per-file
# listing to <artifact-dir>/checksums.txt — the digest is the sha256 of exactly
# that listing, so both come from a single traversal of the tree.
#
# NOTE: smoke-sf-artifact.yml deliberately does NOT call this script. It
# recomputes the digest inline as an independent oracle; sharing the code there
# would make the test agree with the implementation by construction and prove
# nothing about the formula.
set -euo pipefail

ARTIFACT_DIR="${1:?usage: artifact-checksum.sh <artifact-dir> [--write-manifest]}"
WRITE_MANIFEST="${2:-}"

[ -d "$ARTIFACT_DIR/mdapi" ] || {
  echo "artifact-checksum: no mdapi/ under '$ARTIFACT_DIR'" >&2
  exit 1
}

# Everything that reaches the org is covered: the metadata AND the secret
# templates, since the templates are rendered and deployed too. Covering only
# one is a hole in "the artifact deployed is the artifact stored".
PATHS=(mdapi)
[ -d "$ARTIFACT_DIR/secret-templates" ] && PATHS+=(secret-templates)

# -print0 | sort -z keeps the order independent of filesystem traversal, so the
# same content always yields the same digest. LC_ALL=C keeps that sort stable
# across runners with different locales.
cd "$ARTIFACT_DIR"
if [ "$WRITE_MANIFEST" = "--write-manifest" ]; then
  find "${PATHS[@]}" -type f -print0 | LC_ALL=C sort -z \
    | xargs -0 sha256sum > checksums.txt
  sha256sum < checksums.txt | cut -d' ' -f1
else
  find "${PATHS[@]}" -type f -print0 | LC_ALL=C sort -z \
    | xargs -0 sha256sum | sha256sum | cut -d' ' -f1
fi
