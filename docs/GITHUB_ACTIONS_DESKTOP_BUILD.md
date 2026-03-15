# GitHub Actions: Windows/macOS 수동 빌드 설정 가이드

이 문서는 `workflow_dispatch`(수동 실행)로만 Windows/macOS 빌드를 돌리는 구성을 설명합니다.

## 현재 상태

현재 저장소(`package.json`)에는 웹 빌드 스크립트(`vite build`)만 있고,
데스크톱 패키징(`electron-builder`, `tauri`, `electron-forge`) 스크립트가 없습니다.

즉, Windows/macOS "앱 설치 파일"(.exe/.dmg/.pkg) 생성은
아래 데스크톱 런타임 중 하나를 먼저 추가해야 가능합니다.

1. Electron + electron-builder (권장)
2. Tauri
3. Electron Forge

## 1) npm 스크립트 추가 (Electron 기준 예시)

`package.json` 예시:

```json
{
  "scripts": {
    "build:web": "vite build",
    "build:desktop:win": "electron-builder --win",
    "build:desktop:mac": "electron-builder --mac"
  },
  "devDependencies": {
    "electron": "^31.0.0",
    "electron-builder": "^24.13.3"
  }
}
```

주의:
- 실제 메인 프로세스 엔트리(`main`)와 빌더 설정(`build`)이 필요합니다.
- macOS 서명/노터리제이션은 Apple 인증서/키가 있어야 합니다.

## 2) 수동 빌드 전용 Workflow 생성

경로: `.github/workflows/desktop-manual-build.yml`

```yaml
name: Desktop Manual Build

on:
  workflow_dispatch:
    inputs:
      ref:
        description: "브랜치 또는 태그"
        required: true
        default: "Public"
      commit_sha:
        description: "특정 커밋 SHA (선택)"
        required: false
        default: ""

jobs:
  build:
    strategy:
      fail-fast: false
      matrix:
        os: [windows-latest, macos-latest]

    runs-on: ${{ matrix.os }}

    steps:
      - name: Checkout (ref)
        uses: actions/checkout@v4
        with:
          ref: ${{ inputs.ref }}
          fetch-depth: 0

      - name: Checkout (commit override)
        if: ${{ inputs.commit_sha != '' }}
        run: |
          git checkout ${{ inputs.commit_sha }}

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install deps
        run: npm ci

      - name: Build web assets
        run: npm run build:web

      - name: Build desktop (Windows)
        if: runner.os == 'Windows'
        run: npm run build:desktop:win

      - name: Build desktop (macOS)
        if: runner.os == 'macOS'
        run: npm run build:desktop:mac

      - name: Upload artifacts
        uses: actions/upload-artifact@v4
        with:
          name: desktop-${{ runner.os }}-${{ github.run_number }}
          path: |
            dist/**
            release/**
            dist-electron/**
```

핵심 포인트:
- 자동 트리거(`push`, `pull_request`) 없이 `workflow_dispatch`만 사용
- `ref`(브랜치) + `commit_sha`(선택)로 빌드 대상을 명시
- `commit_sha`를 넣으면 해당 커밋으로 강제 체크아웃

## 3) 브랜치/커밋 선택 전략

권장:
1. `ref`는 배포 대상 브랜치(`Public` 등)
2. 특정 스냅샷이 필요하면 `commit_sha` 입력
3. 입력값 없이 자동으로 최신 커밋 빌드되게 두지 않기

## 4) 서명/배포 시 필요한 Secrets (선택)

Windows 코드서명(선택):
- `WINDOWS_CERT_BASE64`
- `WINDOWS_CERT_PASSWORD`

macOS 서명/노터리제이션(선택):
- `APPLE_ID`
- `APPLE_APP_SPECIFIC_PASSWORD`
- `APPLE_TEAM_ID`
- `MAC_CERT_BASE64`
- `MAC_CERT_PASSWORD`

## 5) 실행 체크리스트

1. 로컬에서 `npm run build:web` 성공
2. 데스크톱 런타임(Electron/Tauri) 설정 완료
3. GitHub Actions workflow 파일 추가
4. Actions 탭에서 수동 실행 시 `ref`/`commit_sha` 지정
5. Artifacts에서 OS별 빌드 결과 확인

## 6) 실패 시 점검

1. `build:desktop:win`, `build:desktop:mac` 스크립트 존재 여부
2. 빌더 출력 경로(`release`, `dist-electron`)와 업로드 경로 일치 여부
3. macOS 서명 단계에서 인증서/시크릿 누락 여부
4. 커밋 SHA 오탈자 여부

---

현재 저장소 기준으로는 데스크톱 런타임이 아직 없어,
위 workflow를 바로 실행하면 데스크톱 패키징 단계는 실패합니다.
먼저 데스크톱 빌드 스크립트를 추가한 뒤 적용하세요.
