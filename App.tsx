import React, { useState, useMemo, useRef } from 'react';
import { Activity, HelpCircle, Settings, User, Download, Upload, FileJson } from 'lucide-react';
import FileRack from './components/FileRack';
import StudioTab from './components/StudioTab';
import ConsonantTab from './components/ConsonantTab';
import AdvancedTractTab from './components/AdvancedTractTab';
import ConsonantGeneratorTab from './components/ConsonantGeneratorTab';
import HelpModal from './components/HelpModal';
import { AudioFile } from './types';
import { AudioUtils } from './utils/audioUtils';

const App: React.FC = () => {
    const [audioContext] = useState(() => new (window.AudioContext || (window as any).webkitAudioContext)());
    const [files, setFiles] = useState<AudioFile[]>([]);
    const [activeFileId, setActiveFileId] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'editor' | 'consonant' | 'generator' | 'sim'>('editor');
    const [showHelp, setShowHelp] = useState(false);
    const [fileCounter, setFileCounter] = useState(1);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const activeFile = useMemo(() => files.find(f => f.id === activeFileId), [files, activeFileId]);

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files) return;
        const selFiles = Array.from(e.target.files) as File[];
        for(const file of selFiles) {
            const arrayBuffer = await file.arrayBuffer();
            const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
            const newFile = { id: Math.random().toString(36).substr(2, 9), name: file.name, buffer: audioBuffer };
            setFiles(prev => [...prev, newFile]);
            if(!activeFileId) setActiveFileId(newFile.id);
        }
    };

    const handleProjectExport = async () => {
        const fileData = await Promise.all(files.map(async (f) => {
            const blob = AudioUtils.bufferToWavBlob(f.buffer);
            const base64 = await AudioUtils.blobToBase64(blob);
            return { id: f.id, name: f.name, data: base64 };
        }));
        const projectData = {
            version: '1.0',
            timestamp: new Date().toISOString(),
            files: fileData
        };
        const jsonString = JSON.stringify(projectData);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `otonashi_project_${new Date().getTime()}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const handleProjectImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            const text = await file.text();
            const data = JSON.parse(text);
            if (data.files && Array.isArray(data.files)) {
                const newFiles: AudioFile[] = [];
                for (const f of data.files) {
                    const res = await fetch(f.data);
                    const buf = await res.arrayBuffer();
                    const audioBuf = await audioContext.decodeAudioData(buf);
                    newFiles.push({ id: f.id, name: f.name, buffer: audioBuf });
                }
                setFiles(newFiles);
                if(newFiles.length > 0) setActiveFileId(newFiles[0].id);
                alert("프로젝트를 성공적으로 불러왔습니다.");
            }
        } catch (err) {
            console.error(err);
            alert("프로젝트 파일을 불러오는 중 오류가 발생했습니다.");
        }
        if(fileInputRef.current) fileInputRef.current.value = '';
    };

    const addToRack = (buffer: AudioBuffer, name: string) => { 
      const seqStr = fileCounter.toString().padStart(3, '0');
      const finalName = `${name}_${seqStr}`;
      const newFile = { id: Math.random().toString(36).substr(2, 9), name: finalName, buffer }; 
      setFiles(prev => [...prev, newFile]); 
      setActiveFileId(newFile.id); 
      setFileCounter(prev => prev + 1);
    };
    
    const updateFile = (newBuffer: AudioBuffer) => { 
      setFiles(prev => prev.map(f => f.id === activeFileId ? { ...f, buffer: newBuffer } : f)); 
    };
    
    const removeFile = (id: string) => { 
      setFiles(prev => prev.filter(f => f.id !== id)); 
      if(activeFileId === id) setActiveFileId(null); 
    };
    
    const renameFile = (id: string, newName: string) => { 
      setFiles(prev => prev.map(f => f.id === id ? { ...f, name: newName } : f)); 
    };

    return (
        <div className="h-screen w-full bg-[#f8f8f6] text-[#1f1e1d] flex flex-col font-sans overflow-hidden">
            <header className="h-14 border-b border-slate-300 bg-white flex items-center justify-between px-6 shrink-0 z-10 shadow-sm">
                <div className="flex items-center gap-3">
                    <div className="bg-[#209ad6] p-1.5 rounded-lg text-white shadow-lg shadow-blue-200">
                      <Activity size={20}/>
                    </div>
                    <div className="flex flex-col">
                        <h1 className="font-black text-xl tracking-tighter leading-none bg-clip-text text-transparent bg-gradient-to-r from-[#b2d4ed] via-[#3c78e8] to-[#e3daf5]">
                          OTONASHI
                        </h1>
                        <span className="text-[8px] text-slate-400 font-black uppercase tracking-tight">
                          AUgmented vocal-TracT and Nasal SImulator
                        </span>
                    </div>
                </div>
                <nav className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
                    <button onClick={()=>setActiveTab('editor')} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${activeTab==='editor'?'bg-white text-[#209ad6] shadow-sm border border-slate-200':'text-slate-500 hover:text-slate-800'}`}>스튜디오</button>
                    <button onClick={()=>setActiveTab('generator')} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${activeTab==='generator'?'bg-white text-[#209ad6] shadow-sm border border-slate-200':'text-slate-500 hover:text-slate-800'}`}>자음 생성</button>
                    <button onClick={()=>setActiveTab('consonant')} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${activeTab==='consonant'?'bg-white text-[#209ad6] shadow-sm border border-slate-200':'text-slate-500 hover:text-slate-800'}`}>자음 합성</button>
                    <button onClick={()=>setActiveTab('sim')} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${activeTab==='sim'?'bg-white text-[#209ad6] shadow-sm border border-slate-200':'text-slate-500 hover:text-slate-800'}`}>성도 시뮬레이터</button>
                </nav>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1 border border-slate-200">
                      <button onClick={handleProjectExport} title="프로젝트 저장 (.json)" className="p-1.5 text-slate-500 hover:bg-white hover:text-indigo-600 rounded-md transition-all"><Download size={16}/></button>
                      <button onClick={()=>fileInputRef.current?.click()} title="프로젝트 열기" className="p-1.5 text-slate-500 hover:bg-white hover:text-indigo-600 rounded-md transition-all"><Upload size={16}/></button>
                      <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={handleProjectImport}/>
                  </div>
                  <div className="w-px h-6 bg-slate-300 mx-1"></div>
                  <button onClick={()=>setShowHelp(true)} className="text-slate-400 hover:text-slate-600 transition-colors"><HelpCircle size={20}/></button>
                  <button className="text-slate-400 hover:text-slate-600 transition-colors"><Settings size={20}/></button>
                  <div className="w-8 h-8 rounded-full bg-slate-200 border border-slate-300 overflow-hidden flex items-center justify-center shadow-inner">
                    <User size={20} className="text-slate-400"/>
                  </div>
                </div>
            </header>
            <main className="flex-1 flex overflow-hidden">
                <FileRack files={files} activeFileId={activeFileId} setActiveFileId={setActiveFileId} handleFileUpload={handleFileUpload} removeFile={removeFile} renameFile={renameFile} />
                <div className="flex-1 flex flex-col min-w-0 bg-slate-50 overflow-y-auto custom-scrollbar relative">
                    <div className={`w-full h-full flex flex-col ${activeTab === 'editor' ? '' : 'hidden'}`}>
                        <StudioTab audioContext={audioContext} activeFile={activeFile} files={files} onUpdateFile={updateFile} onAddToRack={addToRack} setActiveFileId={setActiveFileId} />
                    </div>
                    <div className={`w-full h-full flex flex-col ${activeTab === 'generator' ? '' : 'hidden'}`}>
                        <ConsonantGeneratorTab audioContext={audioContext} files={files} onAddToRack={addToRack} />
                    </div>
                    <div className={`w-full h-full flex flex-col ${activeTab === 'consonant' ? '' : 'hidden'}`}>
                        <ConsonantTab audioContext={audioContext} files={files} onAddToRack={addToRack} />
                    </div>
                    <div className={`w-full h-full flex flex-col ${activeTab === 'sim' ? '' : 'hidden'}`}>
                        <AdvancedTractTab audioContext={audioContext} files={files} onAddToRack={addToRack} />
                    </div>
                </div>
            </main>
            {showHelp && <HelpModal onClose={()=>setShowHelp(false)} />}
        </div>
    );
};

export default App;