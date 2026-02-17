
export type Language = 'kr' | 'en';

export const i18n = {
  kr: {
    app: {
      title: "OTONASHI",
      subTitle: "Vocal Tract Simulator",
      tabs: {
        editor: "Studio",
        generator: "자음 생성기",
        consonant: "C-V 믹서",
        sim: "시뮬레이터"
      },
      tooltips: {
        undo: "전체 실행 취소",
        redo: "전체 다시 실행",
        saveProject: "프로젝트 저장",
        openProject: "프로젝트 불러오기"
      }
    },
    fileRack: {
      title: "파일 보관함",
      upload: "파일 업로드",
      empty: "파일을 여기로 드래그하거나\n+를 눌러 추가하세요",
      drop: "파일을 놓아 업로드",
      confirmDelete: "이 파일을 삭제하시겠습니까?",
      download: "WAV 다운로드",
      rename: "이름 변경",
      delete: "삭제"
    },
    help: {
      title: "OTONASHI 사용 가이드",
      aiDisclaimer: "※ 이 소스코드는 AI의 도움을 받아 작성되었습니다.",
      enDisclaimer: "※ 영어 UI는 기계 번역으로 인해 어색할 수 있습니다.",
      intro: "OTONASHI는 웹 기반 보컬 트랙 시뮬레이터 및 오디오 합성 툴입니다.",
      studio: {
        title: "Studio",
        automation: "오토메이션: 파형 위에 직접 클릭하여 볼륨 변화를 그릴 수 있습니다.",
        eq: "파라메트릭 EQ: 특정 주파수 대역을 조절합니다. 원을 더블 클릭하여 활성화하세요.",
        editing: "편집: 파형을 드래그하여 영역을 선택하고 페이드 인/아웃을 적용하세요."
      },
      gen: {
        title: "자음 생성기",
        desc: "화이트/핑크 노이즈와 필터를 조합하여 'S', 'T', 'K' 같은 자음을 합성합니다. ADSR 엔벨로프로 어택과 지속 시간을 조절하세요."
      },
      mixer: {
        title: "C-V mixer (자음-모음)",
        desc: "두 개의 오디오 파일을 정밀하게 결합합니다. 자음의 Stretch를 조절하여 명료도를 바꾸고, 볼륨 모드에서 크로스페이드를 그려 자연스러운 연결을 만드세요."
      },
      sim: {
        title: "시뮬레이터",
        desc: "인간의 발성 기관을 물리적으로 모델링하여 소리를 생성합니다.",
        tongue: "혀 위치 (X, Y): 핑크색 영역을 드래그하여 혀의 위치를 조절하세요.",
        lips: "입술: 입술의 열림 정도와 길이를 조절하여 공명음을 바꿉니다.",
        velum: "연구개 (Velum): 노란색 선을 드래그하여 비성(Nasality)을 조절하세요.",
        timeline: "타임라인: 실시간 파형을 확인하고 키프레임을 사용하여 변화를 기록하세요."
      },
      project: {
        title: "프로젝트 관리",
        desc: "헤더의 다운로드 버튼으로 작업 내용을 .json 파일로 내보낼 수 있습니다. 업로드 버튼으로 다시 불러오세요."
      }
    },
    common: {
      save: "보관함에 저장",
      preview: "미리보기",
      stop: "중지",
      apply: "적용",
      cancel: "취소",
      confirm: "확인",
      wav: "WAV 저장",
      crop: "자르기",
      delete: "삭제",
      fadeIn: "페이드 인",
      fadeOut: "페이드 아웃",
      automation: "오토메이션",
      effects: "이펙트",
      formants: "포먼트"
    }
  },
  en: {
    app: {
      title: "OTONASHI",
      subTitle: "Vocal Tract Simulator",
      tabs: {
        editor: "Studio",
        generator: "Consonant Gen",
        consonant: "C-V Mixer",
        sim: "Simulator"
      },
      tooltips: {
        undo: "Global Undo",
        redo: "Global Redo",
        saveProject: "Save Project",
        openProject: "Open Project"
      }
    },
    fileRack: {
      title: "File Rack",
      upload: "Upload File",
      empty: "Drag files here or\nclick + to add files",
      drop: "Drop files to upload",
      confirmDelete: "Are you sure you want to delete this file?",
      download: "Download WAV",
      rename: "Rename",
      delete: "Delete"
    },
    help: {
      title: "OTONASHI User Guide",
      aiDisclaimer: "※ This source code was written with AI assistance.",
      enDisclaimer: "※ English translation is machine-generated and may be inaccurate.",
      intro: "OTONASHI is a web-based vocal tract simulator and audio synthesis tool.",
      studio: {
        title: "Studio",
        automation: "Automation: Click and draw directly on the waveform to control volume changes.",
        eq: "Parametric EQ: Adjust specific frequency ranges. Double-click a circle to toggle.",
        editing: "Editing: Drag to select a region and apply Fade In/Out."
      },
      gen: {
        title: "Consonant Gen",
        desc: "Synthesize consonants like 'S', 'T', or 'K' using noise and filters. Adjust ADSR envelope for timing."
      },
      mixer: {
        title: "C-V Mixer (Consonant-Vowel)",
        desc: "Precisely combine two audio files. Adjust Stretch for clarity and draw volume crossfades."
      },
      sim: {
        title: "Simulator",
        desc: "Generate sound by physically modeling human vocal organs.",
        tongue: "Tongue (X, Y): Drag the pink area to control tongue position.",
        lips: "Lips: Adjust lip opening and length to change resonance.",
        velum: "Velum: Drag the yellow line to adjust nasality.",
        timeline: "Timeline: Preview waveforms and record changes with keyframes."
      },
      project: {
        title: "Project Management",
        desc: "Export your work as .json via the download button. Use upload to reload later."
      }
    },
    common: {
      save: "Save to Rack",
      preview: "Preview",
      stop: "Stop",
      apply: "Apply",
      cancel: "Cancel",
      confirm: "Confirm",
      wav: "Save WAV",
      crop: "Crop",
      delete: "Delete",
      fadeIn: "Fade In",
      fadeOut: "Fade Out",
      automation: "Automation",
      effects: "Effects",
      formants: "Formants"
    }
  }
};
