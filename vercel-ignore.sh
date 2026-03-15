#!/bin/bash
set -euo pipefail

# Vercel "Ignored Build Step" policy:
# - exit 0: skip deployment
# - exit 1: proceed with deployment
#
# This script disables automatic Git-triggered builds by default.
# It only allows a build when MANUAL_VERCEL_BUILD=1 is set, and
# optional branch/commit filters match.
#
# Optional filters:
#   MANUAL_VERCEL_BRANCH=<branch-name>
#   MANUAL_VERCEL_COMMIT=<full-or-prefix-sha>

ref="${VERCEL_GIT_COMMIT_REF:-}"
sha="${VERCEL_GIT_COMMIT_SHA:-}"
manual="${MANUAL_VERCEL_BUILD:-0}"
target_branch="${MANUAL_VERCEL_BRANCH:-}"
target_commit="${MANUAL_VERCEL_COMMIT:-}"

echo "Vercel ref: ${ref:-<none>}"
echo "Vercel sha: ${sha:-<none>}"

if [[ "$manual" != "1" ]]; then
  echo "Skipping build: MANUAL_VERCEL_BUILD is not enabled."
  exit 0
fi

if [[ -n "$target_branch" && "$ref" != "$target_branch" ]]; then
  echo "Skipping build: branch mismatch (expected '$target_branch', got '${ref:-<none>}')."
  exit 0
fi

if [[ -n "$target_commit" ]]; then
  # commit prefix match is allowed (e.g. first 7~12 chars)
  if [[ -z "$sha" || "$sha" != "$target_commit"* ]]; then
    echo "Skipping build: commit mismatch (expected prefix '$target_commit', got '${sha:-<none>}')."
    exit 0
  fi
fi

echo "Proceeding with manual deployment (filters matched)."
exit 1
