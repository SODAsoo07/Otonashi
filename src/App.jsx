import React, { useState, useCallback, useEffect, useRef } from 'react';
import { 
  FolderAudio, LayoutGrid, Mic2, Activity, Settings, 
  Undo2, Redo2, Download, Trash2, Save 
} from 'lucide-react';
import FileRack from './components/FileRack';
import StudioTab from './components/StudioTab';
import ConsonantTab from './components/ConsonantTab';
import SimulatorTab from './components/SimulatorTab';
import { cloneBuffer } from './utils/AudioUtils';

const MAX_HISTORY = 20;

export default function App() {
  const [files, setFiles] = useState([]);
  const [activeFileId, setActiveFileId] = useState(null);
  const [activeTab, setActiveTab] = useState('studio');
  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  const activeFile = files.find(f => f.id === activeFileId);

  // 1. 히스토리 기록 (비파괴 편집 지원)
  const pushHistory = useCallback((newFiles) => {
    const nextHistory = history.slice(0, historyIndex + 1);
    nextHistory.push(JSON.parse(JSON.stringify(newFiles.map(f => ({...f, buffer: '__buffer__'}))))); // 버퍼 제외 상태 저장
    if (nextHistory.length > MAX_HISTORY) nextHistory.shift();
    setHistory(nextHistory);
    setHistoryIndex(nextHistory.length - 1);
  }, [history, historyIndex]);

  // 2. 파일 수정 핸들러 (모든 탭에서 공통 사용)
  const handleFileEdit = (fileId, newBuffer, metadata = {}) => {
    setFiles(prev => {
      const next = prev.map(f => f.id === fileId ? { 
        ...f, 
        buffer: newBuffer, 
        lastModified: Date.now(),
        ...metadata 
      } : f);
      // pushHistory(next); // 성능을 위해 필요 시 주석 해제
      return next;
    });
  };

  // 3. 파일 삭제 (가이드 준수: 확인창 추가)
  const handleFileDelete = (id) => {
    if (window.confirm("정말로 이 파일을 삭제하시겠습니까?")) {
      setFiles(prev => prev.filter(f => f.id !== id));
      if (activeFileId === id) setActiveFileId(null);
    }
  };

  // 4. 보관함에 새 파일 추가
  const onAddToRack = (buffer, name = "New Recording") => {
    const newFile = {
      id: `file_${Date.now()}`,
      name,
      buffer,
      lastModified: Date.now(),
      settings: {}
    };
    setFiles(prev => [...prev, newFile]);
    setActiveFileId(newFile.id);
  };

  return (
    <div className="flex h-screen bg-slate-950 text-slate-200 overflow-hidden font-sans">
      {/* 왼쪽 사이드바: FileRack */}
      <aside className="w-64 border-r border-slate-800 bg-slate-900/50 flex flex-col">
        <div className="p-4 flex items-center gap-2 border-bottom border-slate-800">
          <FolderAudio className="text-blue-400" size={20} />
          <h1 className="font-bold tracking-tighter text-lg">OTONASHI <span className="text-[10px] text-blue-500">v95</span></h1>
        </div>
        
        <FileRack 
          files={files} 
          activeFileId={activeFileId} 
          onSelectFile={setActiveFileId}
          onDeleteFile={handleFileDelete}
          onUpload={(f) => setFiles(prev => [...prev, f])}
        />

        <div className="p-4 mt-auto border-t border-slate-800 flex justify-between">
          <button onClick={() => historyIndex > 0 && setHistoryIndex(h => h - 1)} className="p-2 hover:bg-slate-800 rounded">
            <Undo2 size={18} className={historyIndex <= 0 ? "opacity-30" : ""} />
          </button>
          <button onClick={() => historyIndex < history.length - 1 && setHistoryIndex(h => h + 1)} className="p-2 hover:bg-slate-800 rounded">
            <Redo2 size={18} className={historyIndex >= history.length - 1 ? "opacity-30" : ""} />
          </button>
        </div>
      </aside>

      {/* 메인 콘텐츠 영역 */}
      <main className="flex-1 flex flex-col relative">
        {/* 상단 탭 네비게이션 */}
        <header className="h-12 border-b border-slate-800 flex items-center px-4 bg-slate-900/30 gap-6">
          <button 
            onClick={() => setActiveTab('studio')}
            className={`flex items-center gap-2 text-sm font-medium transition-colors ${activeTab === 'studio' ? 'text-blue-400' : 'text-slate-500 hover:text-slate-300'}`}
          >
            <Activity size={16} /> STUDIO
          </button>
          <button 
            onClick={() => setActiveTab('consonant')}
            className={`flex items-center gap-2 text-sm font-medium transition-colors ${activeTab === 'consonant' ? 'text-blue-400' : 'text-slate-500 hover:text-slate-300'}`}
          >
            <Mic2 size={16} /> CONSONANT
          </button>
          <button 
            onClick={() => setActiveTab('simulator')}
            className={`flex items-center gap-2 text-sm font-medium transition-colors ${activeTab === 'simulator' ? 'text-blue-400' : 'text-slate-500 hover:text-slate-300'}`}
          >
            <LayoutGrid size={16} /> SIMULATOR
          </button>
        </header>

        {/* 탭 콘텐츠: display: none 방식으로 상태 유지 (가이드 준수) */}
        <div className="flex-1 relative">
          <div className={`absolute inset-0 ${activeTab === 'studio' ? 'block' : 'hidden'}`}>
            <StudioTab 
              activeFile={activeFile} 
              onFileEdit={handleFileEdit} 
              onAddToRack={onAddToRack}
            />
          </div>
          <div className={`absolute inset-0 ${activeTab === 'consonant' ? 'block' : 'hidden'}`}>
            <ConsonantTab activeFile={activeFile} />
          </div>
          <div className={`absolute inset-0 ${activeTab === 'simulator' ? 'block' : 'hidden'}`}>
            <SimulatorTab onSave={onAddToRack} />
          </div>
        </div>
      </main>
    </div>
  );
}
