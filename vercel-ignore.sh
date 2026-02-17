#!/bin/bash

echo "Current Vercel Branch: $VERCEL_GIT_COMMIT_REF"

# [Whitelist 방식] 
# 배포를 허용할 브랜치 이름을 | (파이프)로 구분해서 적어주세요.
# 여기에 적히지 않은 모든 브랜치는 Vercel 배포가 자동으로 취소됩니다.

case "$VERCEL_GIT_COMMIT_REF" in
  "public")
    # 1. 배포를 허용할 브랜치들 (Exit Code 1 -> 빌드 진행)
    echo "✅ Proceeding with deployment for ALLOWED branch: $VERCEL_GIT_COMMIT_REF"
    exit 1
    ;;
  *)
    # 2. 그 외 모든 브랜치 (Exit Code 0 -> 빌드 취소)
    echo "🛑 Skipping deployment for branch: $VERCEL_GIT_COMMIT_REF (Not in whitelist)"
    exit 0
    ;;
esac