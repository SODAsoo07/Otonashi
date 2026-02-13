import React, { useState, useCallback } from 'react';
import { 
  Library, LayoutGrid, Mic2, Activity, 
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

  const handleAddToRack = useCallback((buffer, name = "Synthesized") => {
    const newFile = { id: `file_${Date.now()}`, name: name.endsWith('.wav') ? name : `${name}.wav`, buffer, lastModified: Date.now() };
    setFiles(prev => [...prev, newFile]);
    setActiveFileId(newFile.id);
  }, []);

  const handleFileEdit = useCallback((id, newBuf) => {
    setFiles(prev => prev.map(f => f.id === id ? { ...f, buffer: newBuf, lastModified: Date.now() } : f));
  }, []);

  const handleFileDelete = useCallback((id) => {
    if (window.confirm("정말로 이 파일을 삭제하시겠습니까?")) {
      setFiles(prev => prev.filter(f => f.id !== id));
      if (activeFileId === id) setActiveFileId(null);
    }
  }, [activeFileId]);

  return (
    <div className="flex h-screen bg-slate-950 text-slate-200 overflow-hidden font-sans">
      <aside className="w-64 border-r border-slate-800 bg-slate-900/50 flex flex-col">
        <div className="p-4 flex items-center gap-2 border-b border-slate-800">
          <Library className="text-blue-400" size={20} />
          <h1 className="font-bold tracking-tighter text-lg uppercase">Otonashi <span className="text-[10px] text-blue-500">v95</span></h1>
        </div>
        <div className="flex-1 overflow-y-auto">
          <FileRack files={files} activeFileId={activeFileId} onSelectFile={setActiveFileId} onDeleteFile={handleFileDelete} onUpload={handleAddToRack} />
        </div>
        <div className="p-4 border-t border-slate-800 flex justify-between bg-slate-950/50">
          <button className="p-2 hover:bg-slate-800 rounded text-slate-500"><Undo2 size={18} /></button>
          <button className="p-2 hover:bg-slate-800 rounded text-slate-500"><Redo2 size={18} /></button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col relative">
        <header className="h-12 border-b border-slate-800 flex items-center px-4 bg-slate-900/30 gap-6">
          {[{ id: 'studio', icon: Activity, label: 'STUDIO' }, { id: 'consonant', icon: Mic2, label: 'CONSONANT' }, { id: 'simulator', icon: LayoutGrid, label: 'SIMULATOR' }].map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex items-center gap-2 text-xs font-bold tracking-widest ${activeTab === tab.id ? 'text-blue-400 border-b-2 border-blue-400 h-full' : 'text-slate-500 hover:text-slate-300'}`}>
              <tab.icon size={14} /> {tab.label}
            </button>
          ))}
        </header>

        <div className="flex-1 relative">
          <div className={`absolute inset-0 ${activeTab === 'studio' ? 'block' : 'hidden'}`}><StudioTab activeFile={activeFile} onFileEdit={handleFileEdit} onAddToRack={handleAddToRack} /></div>
          <div className={`absolute inset-0 ${activeTab === 'consonant' ? 'block' : 'hidden'}`}><ConsonantTab files={files} onAddToRack={handleAddToRack} /></div>
          <div className={`absolute inset-0 ${activeTab === 'simulator' ? 'block' : 'hidden'}`}><SimulatorTab files={files} onAddToRack={handleAddToRack} /></div>
        </div>
      </main>
    </div>
  );
}
