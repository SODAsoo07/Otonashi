import React, { useState, useCallback } from 'react';
import { 
  FolderAudio, LayoutGrid, Mic2, Activity, 
  Undo2, Redo2, Save, Trash2, Download 
} from 'lucide-react';
import FileRack from './components/FileRack';
import StudioTab from './components/StudioTab';
import ConsonantTab from './components/ConsonantTab';
import SimulatorTab from './components/SimulatorTab';

export default function App() {
  const [files, setFiles] = useState([]);
  const [activeFileId, setActiveFileId] = useState(null);
  const [activeTab, setActiveTab] = useState('studio');

  const activeFile = files.find(f => f.id === activeFileId);

  // 보관함 저장 핸들러
  const handleAddToRack = useCallback((buffer, name = "Synthesized Audio") => {
    const newFile = {
      id: `file_${Date.now()}`,
      name: name.endsWith('.wav') ? name : `${name}.wav`,
      buffer,
      lastModified: Date.now()
    };
    setFiles(prev => [...prev, newFile]);
    setActiveFileId(newFile.id);
  }, []);

  // 파일 수정 핸들러 (Studio에서 사용)
  const handleFileEdit = useCallback((fileId, newBuffer) => {
    setFiles(prev => prev.map(f => f.id === fileId ? { ...f, buffer: newBuffer, lastModified: Date.now() } : f));
  }, []);

  // 파일 삭제 (가이드 준수: Confirm 추가)
  const handleFileDelete = useCallback((id) => {
    if (window.confirm("정말로 이 파일을 삭제하시겠습니까?")) {
      setFiles(prev => prev.filter(f => f.id !== id));
      if (activeFileId === id) setActiveFileId(null);
    }
  }, [activeFileId]);

  return (
    <div className="flex h-screen bg-slate-950 text-slate-200 overflow-hidden font-sans">
      {/* Sidebar */}
      <aside className="w-64 border-r border-slate-800 bg-slate-900/50 flex flex-col">
        <div className="p-4 flex items-center gap-2 border-b border-slate-800">
          <FolderAudio className="text-blue-400" size={20} />
          <h1 className="font-bold tracking-tighter text-lg underline decoration-blue-500/50">OTONASHI <span className="text-[10px] opacity-50">v95</span></h1>
        </div>
        
        <div className="flex-1 overflow-y-auto">
          <FileRack 
            files={files} 
            activeFileId={activeFileId} 
            onSelectFile={setActiveFileId}
            onDeleteFile={handleFileDelete}
          />
        </div>

        <div className="p-4 border-t border-slate-800 flex justify-between bg-slate-950/50">
          <button className="p-2 hover:bg-slate-800 rounded text-slate-500 hover:text-white transition-colors"><Undo2 size={18} /></button>
          <button className="p-2 hover:bg-slate-800 rounded text-slate-500 hover:text-white transition-colors"><Redo2 size={18} /></button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col relative">
        <header className="h-12 border-b border-slate-800 flex items-center px-4 bg-slate-900/30 gap-6">
          {[
            { id: 'studio', icon: Activity, label: 'STUDIO' },
            { id: 'consonant', icon: Mic2, label: 'CONSONANT' },
            { id: 'simulator', icon: LayoutGrid, label: 'SIMULATOR' }
          ].map(tab => (
            <button 
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 text-xs font-bold tracking-widest transition-all ${
                activeTab === tab.id ? 'text-blue-400 border-b-2 border-blue-400 h-full' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              <tab.icon size={14} /> {tab.label}
            </button>
          ))}
        </header>

        <div className="flex-1 relative">
          {/* 가이드 준수: display: none으로 상태 유지 */}
          <div className={`absolute inset-0 ${activeTab === 'studio' ? 'block' : 'hidden'}`}>
            <StudioTab activeFile={activeFile} onFileEdit={handleFileEdit} onAddToRack={handleAddToRack} />
          </div>
          <div className={`absolute inset-0 ${activeTab === 'consonant' ? 'block' : 'hidden'}`}>
            <ConsonantTab activeFile={activeFile} />
          </div>
          <div className={`absolute inset-0 ${activeTab === 'simulator' ? 'block' : 'hidden'}`}>
            <SimulatorTab onSave={handleAddToRack} />
          </div>
        </div>
      </main>
    </div>
  );
}
