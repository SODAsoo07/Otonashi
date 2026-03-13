# OTONASHI Tract VST3

JUCE 기반의 모노 입력/모노 출력 VST3 서브프로젝트입니다.

## 포함 범위
- Tract Simulator
- Hybrid Analysis
- Harmonic Inject
- 내부 Envelope 저장/복원

## 빌드
```powershell
cd vst3
cmake -B build -S .
cmake --build build --config Release
```

## 요구 도구
- CMake 3.22+
- Visual Studio C++ Build Tools 또는 Visual Studio with MSVC
- 인터넷 연결
  - 최초 configure 시 JUCE를 FetchContent로 받아옵니다.

## 현재 구현 제약
- 입출력 버스는 모노 전용입니다.
- 오프라인 분석은 최근 입력 히스토리 최대 7초를 대상으로 동작합니다.
- 내부 Envelope는 Apply 후 재생 시간 기준으로 진행되며, 종료 후 마지막 값을 유지합니다.
