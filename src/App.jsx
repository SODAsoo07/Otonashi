import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  Activity, DownloadCloud, UploadCloud, Settings, History, User 
} from 'lucide-react';

// 파일 경로와 대소문자를 반드시 확인하세요!
import { AudioUtils } from './utils/AudioUtils';
import { FileRack } from './components/FileRack';
import { StudioTab } from './components/StudioTab';
import { ConsonantTab } from './components/ConsonantTab';
import { SimulatorTab } from './components/SimulatorTab';
import { HelpModal, HistoryModal } from './components/Modals';

// Firebase (없어도 앱이 멈추지 않게 처리)
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const App = () => {
  const [audioContext, setAudioContext] = useState(null);
  const [files, setFiles] = useState([]);
  const [activeFileId, setActiveFileId] = useState(null);
  const [activeTab, setActiveTab] = useState('editor');
  const [showHelp, setShowHelp] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (Ctx) setAudioContext(new Ctx());
  }, []);

  const activeFile = useMemo(() => files.find(f => f.id === activeFileId), [files, activeFileId]);

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

  const handleFileEdit = useCallback((id, newBuffer, label) => {
    setFiles(prev => prev.map(f => {
      if (f.id !== id) return f;
      const currentHistory = f.history ? f.history.slice(0, f.historyIndex + 1) : [];
      const newHistory = [...currentHistory, { label, data: newBuffer, timestamp: Date.now() }];
      if (newHistory.length > 20) newHistory.shift();
      return { ...f, buffer: newBuffer, history: newHistory, historyIndex: newHistory.length - 1 };
    }));
  }, []);

  const handleUndo = useCallback((id) => {
    setFiles(prev => prev.map(f => {
      if (f.id !== id || f.historyIndex <= 0) return f;
      const newIdx = f.historyIndex - 1;
      return { ...f, buffer: f.history[newIdx].data, historyIndex: newIdx };
    }));
  }, []);

  const handleRedo = useCallback((id) => {
    setFiles(prev => prev.map(f => {
      if (f.id !== id || !f.history || f.historyIndex >= f.history.length - 1) return f;
      const newIdx = f.historyIndex + 1;
      return { ...f, buffer: f.history[newIdx].data, historyIndex: newIdx };
    }));
  }, []);

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
      } catch (err) { alert("잘못된 프로젝트 파일입니다."); }
    };
    reader.readAsText(file);
  };

  return (
    <div className="h-screen w-full bg-[#f8f8f6] text-[#1f1e1d] flex flex-col font-sans overflow-hidden">
      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
      {showHistory && activeFile && (
        <HistoryModal 
          history={activeFile.history} currentIndex={activeFile.historyIndex} 
          onJump={(idx) => { 
            setFiles(prev => prev.map(f => f.id === activeFile.id ? {...f, buffer: f.history[idx].data, historyIndex: idx} : f));
            setShowHistory(false); 
          }} 
          onClose={() => setShowHistory(false)} 
        />
      )}

      <header className="h-14 border-b border-slate-300 bg-white flex items-center justify-between px-6 shrink-0 z-10 shadow-sm font-bold">
        <div className="flex items-center gap-3">
          <div className="bg-[#209ad6] p-1.5 rounded-lg text-white shadow-lg"><Activity size={24}/></div>
          <div className="flex flex-col">
            <h1 className="font-black text-xl tracking-tighter leading-none bg-clip-text text-transparent bg-gradient-to-r from-[#b2d4ed] via-[#3c78e8] to-[#e3daf5]">OTONASHI</h1>
            <span className="text-[8px] text-slate-400 font-bold uppercase tracking-tight">Vocal-Tract Workstation</span>
          </div>
        </div>

        <nav className="flex bg-slate-100 p-1.5 rounded-xl border border-slate-200">
          {['editor', 'consonant', 'sim'].map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)} className={`px-5 py-2 rounded-lg text-sm font-black transition-all ${activeTab === tab ? 'bg-white text-[#209ad6] shadow-sm border border-slate-200' : 'text-slate-500'}`}>
              {tab === 'editor' ? '스튜디오' : tab === 'consonant' ? '자음 합성' : '시뮬레이터'}
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <button onClick={() => setShowHistory(true)} className="flex items-center gap-1 p-2.5 bg-slate-100 border border-slate-300 rounded-xl text-slate-600 hover:text-[#209ad6] transition-all">
            <History size={18}/> <span className="text-xs hidden md:inline">History</span>
          </button>
          <button onClick={exportProject} className="p-2.5 bg-white border border-slate-300 rounded-xl text-slate-600 hover:text-[#209ad6] transition-all"><DownloadCloud size={20}/></button>
          <label className="p-2.5 bg-white border border-slate-300 rounded-xl text-slate-600 hover:text-[#209ad6] cursor-pointer transition-all">
            <UploadCloud size={20}/><input type="file" className="hidden" accept=".json" onChange={importProject}/>
          </label>
          <button onClick={() => setShowHelp(true)} className="text-slate-400 hover:text-slate-600 transition-colors"><Settings size={22}/></button>
          <div className="w-10 h-10 rounded-full bg-slate-200 border border-slate-300 flex items-center justify-center"><User size={24} className="text-slate-400"/></div>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden">
        <FileRack 
          files={files} activeFileId={activeFileId} setActiveFileId={setActiveFileId} 
          handleFileUpload={async (e) => {
            if(!audioContext) return;
            for(const file of Array.from(e.target.files)) {
                const buffer = await audioContext.decodeAudioData(await file.arrayBuffer());
                addToRack(buffer, file.name);
            }
          }} 
          removeFile={removeFile} renameFile={renameFile} 
        />
        <div className="flex-1 flex flex-col min-w-0 bg-slate-50 overflow-y-auto relative shadow-inner">
          <div className={activeTab === 'editor' ? 'block h-full' : 'hidden'}>
            <StudioTab 
              audioContext={audioContext} activeFile={activeFile} onAddToRack={addToRack} 
              setActiveFileId={setActiveFileId} onEdit={handleFileEdit} 
              onUndo={() => handleUndo(activeFile?.id)} onRedo={() => handleRedo(activeFile?.id)} 
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
