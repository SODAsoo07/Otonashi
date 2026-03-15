# GitHub Actions: Windows/macOS 수동 데스크톱 빌드 가이드

이 저장소는 `workflow_dispatch`(수동 실행)으로만 데스크톱 패키징을 실행합니다.

## 현재 구성

- Workflow: `.github/workflows/desktop-manual-build.yml`
- Desktop runtime: `electron` + `electron-builder`
- npm scripts:
  - `build:desktop:win`
  - `build:desktop:mac`

## 실행 방법

1. GitHub 저장소의 **Actions** 탭 이동
2. **Desktop Manual Build** 선택
3. **Run workflow** 클릭
4. 입력값 설정

입력값 설명:
- `ref`: 빌드할 브랜치/태그 (예: `Public`, `main`)
- `commit_sha`: 특정 커밋만 빌드할 경우 SHA 입력(선택)
- `target_os`: `windows` / `macos` / `all`
- `fail_if_no_desktop_script`: 데스크톱 스크립트가 없을 때 실패 처리 여부

## 산출물

워크플로우 완료 후 Artifacts에서 확인:
- `desktop-windows-<run_number>`
- `desktop-macos-<run_number>`

포함 경로:
- `release/**`
- `dist/**`
- `dist-electron/**`
- `out/**`

## 워크플로우 동작 요약

1. `actions/checkout@v6`로 대상 ref 체크아웃
2. `commit_sha` 입력 시 해당 커밋으로 override checkout
3. `actions/setup-node@v6` + Node 22
4. `npm ci`
5. `npm run build` (웹 번들 생성)
6. OS별 데스크톱 패키징 실행
   - Windows: `npm run build:desktop:win`
   - macOS: `npm run build:desktop:mac`

## 서명 관련

현재 설정은 **무서명 빌드** 기준입니다.

- Windows 코드 서명은 미설정
- macOS는 `identity: null`로 unsigned 패키징

정식 배포용 서명이 필요하면 아래 시크릿을 추가해 별도 단계 구성 권장:
- Windows: 인증서(base64), 비밀번호
- macOS: Apple ID, app-specific password, Team ID, 인증서(base64), 비밀번호

## 문제 해결 체크리스트

1. Workflow를 올바른 브랜치(`main` 또는 `Public`)에서 실행했는지
2. `build:desktop:win` / `build:desktop:mac` 스크립트가 `package.json`에 존재하는지
3. Actions 권한이 저장소 설정에서 허용되어 있는지
4. 특정 `commit_sha` 사용 시 해당 SHA가 ref 범위에 실제로 존재하는지
