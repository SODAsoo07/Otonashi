#!/bin/bash

echo "Current Vercel Branch: $VERCEL_GIT_COMMIT_REF"

# 아래 case 문 안에 배포를 막고 싶은 브랜치 이름을 | (파이프)로 구분해서 적어주세요.
# 예시: "dev" | "staging" | "test-v1"

case "$VERCEL_GIT_COMMIT_REF" in
  "Dev_ing" | "Local_App")
    # 여기에 나열된 브랜치는 배포를 건너뜁니다 (Exit Code 0)
    echo "🛑 Skipping deployment for blocked branch: $VERCEL_GIT_COMMIT_REF"
    exit 0
    ;;
  *)
    # 그 외의 모든 브랜치(main, master 등)는 배포를 진행합니다 (Exit Code 1)
    echo "✅ Proceeding with deployment for branch: $VERCEL_GIT_COMMIT_REF"
    exit 1
    ;;
esac