#!/bin/bash

echo "Current Vercel Branch: $VERCEL_GIT_COMMIT_REF"

echo "Commit: $VERCEL_GIT_COMMIT_SHA"

if [ "$VERCEL_FORCE_BUILD" = "1" ] || [ "$VERCEL_MANUAL_BUILD" = "1" ]; then
  echo "Proceeding with deployment (manual override)"
  exit 1
fi

if [ "$VERCEL_GIT_COMMIT_REF" = "main" ]; then
  echo "Proceeding with deployment (main branch)"
  exit 1
fi

echo "Skipping deployment (manual override required for non-main branches)"
exit 0
