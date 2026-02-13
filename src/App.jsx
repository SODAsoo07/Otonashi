import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  Activity, DownloadCloud, UploadCloud, Settings, History, User 
} from 'lucide-react';

// 분리된 파일들을 임포트합니다. 경로와 대소문자를 확인하세요.
import { AudioUtils } from './utils/AudioUtils';
import { FileRack } from './components/FileRack';
import { StudioTab } from './components/StudioTab';
import { ConsonantTab } from './components/ConsonantTab';
import { SimulatorTab } from './components/SimulatorTab';
import { HelpModal, HistoryModal } from './components/Modals';

const App = () => {
  // --- 1. 상태 관리 ---
  const [audioContext, setAudioContext] = useState(null);
  const [files, setFiles] = useState([]);
  const [activeFileId, setActiveFileId] = useState(null);
  const [activeTab, setActiveTab] = useState('editor');
  const [showHelp, setShowHelp] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  // AudioContext 초기화
  useEffect(() => {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (Ctx) setAudioContext(new Ctx());
  }, []);

  // 현재 선택된 파일 객체 계산
  const activeFile = useMemo(() => files.find(f => f.id === activeFileId), [files, activeFileId]);

  // --- 2. 히스토리 및 편집 함수 (정의 순서 중요) ---

  // 특정 히스토리 시점으로 이동 (ReferenceError 해결 포인트)
  const handleJumpHistory = useCallback((id, index) => {
    setFiles(prev => prev.map(f => {
      if (f.id !== id || !f.history || index < 0 || index >= f.history.length) return f;
      return { ...f, buffer: f.history[index].data, historyIndex: index };
    }));
  }, []);

  // 실행 취소 (Undo)
  const handleUndo = useCallback((id) => {
    setFiles(prev => {
      const target = prev.find(f => f.id === id);
      if (!target || target.historyIndex <= 0) return prev;
      return prev.map(f => f.id === id ? { 
        ...f, 
        buffer: f.history[f.historyIndex - 1].data, 
        historyIndex: f.historyIndex - 1 
      } : f);
    });
  }, []);

  // 다시 실행 (Redo)
  const handleRedo = useCallback((id) => {
    setFiles(prev => {
      const target = prev.find(f => f.id === id);
      if (!target || !target.history || target.historyIndex >= target.history.length - 1) return prev;
      return prev.map(f => f.id === id ? { 
        ...f, 
        buffer: f.history[f.historyIndex + 1].data, 
        historyIndex: f.historyIndex + 1 
      } : f);
    });
  }, []);

  // 편집 내역 기록
  const handleFileEdit = useCallback((id, newBuffer, label) => {
    setFiles(prev => prev.map(f => {
      if (f.id !== id) return f;
      const currentHistory = f.history ? f.history.slice(0, f.historyIndex + 1) : [];
      const newHistory = [...currentHistory, { label, data: newBuffer, timestamp: Date.now() }];
      if (newHistory.length > 20) newHistory.shift(); // 최대 20단계
      return { ...f, buffer: newBuffer, history: newHistory, historyIndex: newHistory.length - 1 };
    }));
  }, []);

  // --- 3. 파일 관리 함수 ---

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

  const removeFile = useCallback((id) => {
    setFiles(prev => prev.filter(f => f.id !== id));
    if (activeFileId === id) setActiveFileId(null);
  }, [activeFileId]);

  const renameFile = useCallback((id, newName) => {
    setFiles(prev => prev.map(f => f.id === id ? { ...f, name: newName } : f));
  }, []);

  // --- 4. 프로젝트 Export/Import ---

  const exportProject = async () => {
    if (files.length === 0) return alert("저장할 파일이 없습니다.");
    const data = {
      files: await Promise.all(files.map(async f => ({
        id: f.id, name: f.name,
        history: f.history.map(h => ({ label: h.label, timestamp: h.timestamp, data: AudioUtils.serializeBuffer(h.data) })),
        historyIndex: f.historyIndex
      })))
    };
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `otonashi_project.json`; a.click();
  };

  const importProject = async (e) => {
    const file = e.target.files[0];
    if (!file || !audioContext) return;
    const reader = new FileReader();
    reader.onload = async (re) => {
      try {
        const data = JSON.parse(re.target.result);
        const loaded = await Promise.all(data.files.map(async f => {
          const h = await Promise.all(f.history.map(async item => ({ label: item.label, timestamp: item.timestamp, data: await AudioUtils.deserializeBuffer(audioContext, item.data) })));
          return { id: f.id, name: f.name, buffer: h[f.historyIndex].data, history: h, historyIndex: f.historyIndex };
        }));
        setFiles(loaded);
        if (loaded.length > 0) setActiveFileId(loaded[0].id);
      } catch (err) { alert("프로젝트 파일을 불러올 수 없습니다."); }
    };
    reader.readAsText(file);
  };

  // --- 5. 렌더링 ---
  return (
    <div className="h-screen w-full bg-[#f8f8f6] text-[#1f1e1d] flex flex-col font-sans overflow-hidden font-bold">
      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
      
      {/* HistoryModal에 handleJumpHistory 전달 확인 */}
      {showHistory && activeFile && (
        <HistoryModal 
          history={activeFile.history} 
          currentIndex={activeFile.historyIndex} 
          onJump={(idx) => { 
            handleJumpHistory(activeFile.id, idx); 
            setShowHistory(false); 
          }} 
          onClose={() => setShowHistory(false)} 
        />
      )}

      <header className="h-14 border-b border-slate-300 bg-white flex items-center justify-between px-6 shrink-0 z-10 shadow-sm font-bold font-sans">
        <div className="flex items-center gap-3">
          <div className="bg-[#209ad6] p-1.5 rounded-lg text-white shadow-lg"><Activity size={24}/></div>
          <div className="flex flex-col">
            <h1 className="font-black text-2xl tracking-tighter leading-none bg-clip-text text-transparent bg-gradient-to-r from-[#b2d4ed] via-[#3c78e8] to-[#e3daf5]">OTONASHI</h1>
            <span className="text-[8px] text-slate-400 font-bold uppercase tracking-tight">Vocal-Tract Workstation</span>
          </div>
        </div>

        <nav className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
          <button onClick={()=>setActiveTab('editor')} className={`px-5 py-2 rounded-lg text-sm font-black transition-all ${activeTab==='editor'?'bg-white text-[#209ad6] shadow-sm border border-slate-200':'text-slate-500 hover:text-slate-800'}`}>스튜디오</button>
          <button onClick={()=>setActiveTab('consonant')} className={`px-5 py-2 rounded-lg text-sm font-black transition-all ${activeTab==='consonant'?'bg-white text-[#209ad6] shadow-sm border border-slate-200':'text-slate-500 hover:text-slate-800'}`}>자음 합성</button>
          <button onClick={()=>setActiveTab('sim')} className={`px-5 py-2 rounded-lg text-sm font-black transition-all ${activeTab==='sim'?'bg-white text-[#209ad6] shadow-sm border border-slate-200':'text-slate-500 hover:text-slate-800'}`}>시뮬레이터</button>
        </nav>

        <div className="flex items-center gap-3">
          <button onClick={() => setShowHistory(true)} className="flex items-center gap-1 p-2.5 bg-slate-100 border border-slate-300 rounded-xl text-slate-600 hover:text-[#209ad6] hover:bg-white shadow-sm transition-all">
            <History size={18}/> <span className="text-xs hidden md:inline font-black">History</span>
          </button>
          <button onClick={exportProject} className="p-2.5 bg-white border border-slate-300 rounded-xl text-slate-600 hover:text-[#209ad6] shadow-sm transition-all"><DownloadCloud size={20}/></button>
          <label className="p-2.5 bg-white border border-slate-300 rounded-xl text-slate-600 hover:text-[#209ad6] shadow-sm cursor-pointer transition-all">
            <UploadCloud size={20}/><input type="file" className="hidden" accept=".json" onChange={importProject}/>
          </label>
          <button onClick={() => setShowHelp(true)} className="text-slate-400 hover:text-slate-600 transition-colors"><Settings size={22}/></button>
          <div className="w-10 h-10 rounded-full bg-slate-200 border border-slate-300 overflow-hidden flex items-center justify-center shadow-inner"><User size={24} className="text-slate-400"/></div>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden">
        <FileRack 
          files={files} 
          activeFileId={activeFileId} 
          setActiveFileId={setActiveFileId} 
          handleFileUpload={async (e) => {
            if (!audioContext) return;
            for (const file of Array.from(e.target.files)) {
              const buffer = await audioContext.decodeAudioData(await file.arrayBuffer());
              addToRack(buffer, file.name);
            }
          }} 
          removeFile={removeFile} 
          renameFile={renameFile} 
          isSaving={false} 
        />
        <div className="flex-1 flex flex-col min-w-0 bg-slate-50 overflow-y-auto relative shadow-inner">
          <div className={activeTab === 'editor' ? 'block h-full' : 'hidden'}>
            <StudioTab 
              audioContext={audioContext} 
              activeFile={activeFile} 
              onAddToRack={addToRack} 
              setActiveFileId={setActiveFileId} 
              onEdit={handleFileEdit} 
              onUndo={() => handleUndo(activeFile?.id)} 
              onRedo={() => handleRedo(activeFile?.id)} 
            />
          </div>
          <div className={activeTab === 'consonant' ? 'block h-full' : 'hidden'}>
            <ConsonantTab audioContext={audioContext} files={files} onAddToRack={addToRack} />
          </div>
          <div className={activeTab === 'sim' ? 'block h-full' : 'hidden'}>
            <SimulatorTab audioContext={audioContext} files={files} onAddToRack={addToRack} />
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;
