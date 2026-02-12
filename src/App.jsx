import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Activity, DownloadCloud, UploadCloud, Settings, History, User 
} from 'lucide-react';

// 분리된 컴포넌트 및 유틸리티 임포트
import { AudioUtils } from './utils/AudioUtils';
import { FileRack } from './components/FileRack';
import { StudioTab } from './components/StudioTab';
import { ConsonantTab } from './components/ConsonantTab';
import { SimulatorTab } from './components/SimulatorTab';
import { HelpModal, HistoryModal } from './components/Modals';

// Firebase (선택 사항 - 필요 없으면 삭제 가능)
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// ==========================================
// 1. 초기 설정 (Firebase 등)
// ==========================================
let app, auth, db;
try {
  const firebaseConfig = {
    apiKey: import.meta.env?.VITE_FIREBASE_API_KEY || "",
    authDomain: import.meta.env?.VITE_FIREBASE_AUTH_DOMAIN || "",
    projectId: import.meta.env?.VITE_FIREBASE_PROJECT_ID || "",
    storageBucket: import.meta.env?.VITE_FIREBASE_STORAGE_BUCKET || "",
    messagingSenderId: import.meta.env?.VITE_FIREBASE_MESSAGING_SENDER_ID || "",
    appId: import.meta.env?.VITE_FIREBASE_APP_ID || ""
  };
  if (firebaseConfig.apiKey) {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
  }
} catch (e) { console.warn("Firebase Offline Mode Active"); }

const App = () => {
  // ==========================================
  // 2. 전역 상태 관리
  // ==========================================
  const [audioContext, setAudioContext] = useState(null);
  const [files, setFiles] = useState([]); // 보관함 파일 목록 {id, name, buffer, history, historyIndex}
  const [activeFileId, setActiveFileId] = useState(null);
  const [activeTab, setActiveTab] = useState('editor');
  const [showHelp, setShowHelp] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  // AudioContext 초기화
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx) setAudioContext(new Ctx());
    }
  }, []);

  // ==========================================
  // 3. 파일 및 히스토리 핸들러
  // ==========================================

  // 보관함에 새 파일 추가 (히스토리 초기화 포함)
  const addToRack = useCallback((buffer, name) => {
    const newFile = {
      id: Math.random().toString(36).substr(2, 9),
      name: name || "새 오디오",
      buffer,
      history: [{ label: "원본", data: buffer, timestamp: Date.now() }],
      historyIndex: 0
    };
    setFiles(prev => [...prev, newFile]);
    setActiveFileId(newFile.id);
  }, []);

  // 편집 시 히스토리 기록 업데이트
  const handleFileEdit = useCallback((id, newBuffer, label) => {
    setFiles(prev => prev.map(f => {
      if (f.id !== id) return f;
      const currentHistory = f.history.slice(0, f.historyIndex + 1);
      const newHistory = [...currentHistory, { label, data: newBuffer, timestamp: Date.now() }];
      if (newHistory.length > 20) newHistory.shift(); // 최대 20단계 제한
      return {
        ...f,
        buffer: newBuffer,
        history: newHistory,
        historyIndex: newHistory.length - 1
      };
    }));
  }, []);

  // 실행 취소 (Undo)
  const handleUndo = useCallback((id) => {
    setFiles(prev => prev.map(f => {
      if (f.id !== id || f.historyIndex <= 0) return f;
      const newIdx = f.historyIndex - 1;
      return { ...f, buffer: f.history[newIdx].data, historyIndex: newIdx };
    }));
  }, []);

  // 다시 실행 (Redo)
  const handleRedo = useCallback((id) => {
    setFiles(prev => prev.map(f => {
      if (f.id !== id || f.historyIndex >= f.history.length - 1) return f;
      const newIdx = f.historyIndex + 1;
      return { ...f, buffer: f.history[newIdx].data, historyIndex: newIdx };
    }));
  }, []);

  // 특정 히스토리 시점으로 점프
  const handleJumpHistory = useCallback((id, index) => {
    setFiles(prev => prev.map(f => {
      if (f.id !== id) return f;
      return { ...f, buffer: f.history[index].data, historyIndex: index };
    }));
  }, []);

  // 파일 삭제/이름변경
  const removeFile = (id) => {
    setFiles(prev => prev.filter(f => f.id !== id));
    if (activeFileId === id) setActiveFileId(null);
  };
  const renameFile = (id, newName) => {
    setFiles(prev => prev.map(f => f.id === id ? { ...f, name: newName } : f));
  };

  const handleFileUpload = async (e) => {
    if (!audioContext) return;
    for (const file of Array.from(e.target.files)) {
      const buffer = await audioContext.decodeAudioData(await file.arrayBuffer());
      addToRack(buffer, file.name);
    }
  };

  // ==========================================
  // 4. 프로젝트 저장 및 불러오기
  // ==========================================
  const exportProject = async () => {
    const data = {
      files: await Promise.all(files.map(async f => ({
        id: f.id,
        name: f.name,
        history: f.history.map(h => ({
          label: h.label,
          timestamp: h.timestamp,
          data: AudioUtils.serializeBuffer(h.data)
        })),
        historyIndex: f.historyIndex
      }))),
      exportDate: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `otonashi_project.json`;
    a.click();
  };

  const importProject = async (e) => {
    const file = e.target.files[0];
    if (!file || !audioContext) return;
    const reader = new FileReader();
    reader.onload = async (re) => {
      try {
        const data = JSON.parse(re.target.result);
        const loaded = await Promise.all(data.files.map(async f => {
          const h = await Promise.all(f.history.map(async item => ({
            label: item.label,
            timestamp: item.timestamp,
            data: await AudioUtils.deserializeBuffer(audioContext, item.data)
          })));
          return { id: f.id, name: f.name, buffer: h[f.historyIndex].data, history: h, historyIndex: f.historyIndex };
        }));
        setFiles(loaded);
        if (loaded.length > 0) setActiveFileId(loaded[0].id);
      } catch (err) { alert("프로젝트 파일을 불러올 수 없습니다."); }
    };
    reader.readAsText(file);
  };

  // 현재 선택된 파일 객체 계산
  const activeFile = useMemo(() => files.find(f => f.id === activeFileId), [files, activeFileId]);

  return (
    <div className="h-screen w-full bg-[#f8f8f6] text-[#1f1e1d] flex flex-col font-sans overflow-hidden font-bold">
      
      {/* 팝업 모달 */}
      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
      {showHistory && activeFile && (
        <HistoryModal 
          history={activeFile.history} 
          currentIndex={activeFile.historyIndex} 
          onJump={(idx) => { handleJumpHistory(activeFile.id, idx); setShowHistory(false); }} 
          onClose={() => setShowHistory(false)} 
        />
      )}

      {/* 헤더 */}
      <header className="h-14 border-b border-slate-300 bg-white flex items-center justify-between px-6 shrink-0 z-10 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="bg-[#209ad6] p-1.5 rounded-lg text-white shadow-lg"><Activity size={24}/></div>
          <div className="flex flex-col">
            <h1 className="font-black text-2xl tracking-tighter leading-none bg-clip-text text-transparent bg-gradient-to-r from-[#b2d4ed] via-[#3c78e8] to-[#e3daf5]">OTONASHI</h1>
            <span className="text-[8px] text-slate-400 font-bold uppercase tracking-tight">AUgmented vocal-TracT and Nasal SImulator</span>
          </div>
        </div>

        {/* 탭 네비게이션 */}
        <nav className="flex bg-slate-100 p-1.5 rounded-xl border border-slate-200">
          <button onClick={()=>setActiveTab('editor')} className={`px-5 py-2 rounded-lg text-sm font-black transition-all ${activeTab==='editor'?'bg-white text-[#209ad6] shadow-sm border border-slate-200':'text-slate-500 hover:text-slate-800'}`}>스튜디오</button>
          <button onClick={()=>setActiveTab('consonant')} className={`px-5 py-2 rounded-lg text-sm font-black transition-all ${activeTab==='consonant'?'bg-white text-[#209ad6] shadow-sm border border-slate-200':'text-slate-500 hover:text-slate-800'}`}>자음 합성</button>
          <button onClick={()=>setActiveTab('sim')} className={`px-5 py-2 rounded-lg text-sm font-black transition-all ${activeTab==='sim'?'bg-white text-[#209ad6] shadow-sm border border-slate-200':'text-slate-500 hover:text-slate-800'}`}>성도 시뮬레이터</button>
        </nav>

        {/* 프로젝트 관리 액션 */}
        <div className="flex items-center gap-3">
          <button onClick={() => setShowHistory(true)} className="flex items-center gap-1 p-2.5 bg-slate-100 border border-slate-300 rounded-xl text-slate-600 hover:text-[#209ad6] hover:bg-white shadow-sm transition-all">
            <History size={18}/> <span className="text-xs hidden md:inline">History</span>
          </button>
          <button onClick={exportProject} className="p-2.5 bg-white border border-slate-300 rounded-xl text-slate-600 hover:text-[#209ad6] shadow-sm transition-all"><DownloadCloud size={20}/></button>
          <label className="p-2.5 bg-white border border-slate-300 rounded-xl text-slate-600 hover:text-[#209ad6] shadow-sm cursor-pointer transition-all">
            <UploadCloud size={20}/><input type="file" className="hidden" accept=".json" onChange={importProject}/>
          </label>
          <button onClick={() => setShowHelp(true)} className="text-slate-400 hover:text-slate-600 transition-colors"><Settings size={22}/></button>
          <div className="w-10 h-10 rounded-full bg-slate-200 border border-slate-300 overflow-hidden flex items-center justify-center shadow-inner"><User size={24} className="text-slate-400"/></div>
        </div>
      </header>

      {/* 메인 레이아웃 */}
      <main className="flex-1 flex overflow-hidden">
        {/* 왼쪽 사이드바 (보관함) */}
        <FileRack 
          files={files} 
          activeFileId={activeFileId} 
          setActiveFileId={setActiveFileId} 
          handleFileUpload={handleFileUpload} 
          removeFile={removeFile} 
          renameFile={renameFile} 
        />

        {/* 중앙 작업 영역 (탭 유지 방식) */}
        <div className="flex-1 flex flex-col min-w-0 bg-slate-50 overflow-y-auto relative shadow-inner">
          <div className={activeTab === 'editor' ? 'block h-full' : 'hidden'}>
            <StudioTab 
              audioContext={audioContext} 
              activeFile={activeFile} 
              onAddToRack={addToRack} 
              setActiveFileId={setActiveFileId} 
              onEdit={handleFileEdit} 
              onUndo={handleUndo} 
              onRedo={handleRedo} 
            />
          </div>
          <div className={activeTab === 'consonant' ? 'block h-full' : 'hidden'}>
            <ConsonantTab 
              audioContext={audioContext} 
              files={files} 
              onAddToRack={addToRack} 
            />
          </div>
          <div className={activeTab === 'sim' ? 'block h-full' : 'hidden'}>
            <SimulatorTab 
              audioContext={audioContext} 
              files={files} 
              onAddToRack={addToRack} 
            />
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;
