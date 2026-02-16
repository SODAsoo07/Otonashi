
import React, { useState, useMemo, useRef } from 'react';
import { Activity, HelpCircle, User, Download, Upload } from 'lucide-react';
import FileRack from './components/FileRack';
import HelpModal from './components/HelpModal';
import StudioTab from './components/StudioTab';
import ConsonantTab from './components/ConsonantTab';
import AdvancedTractTab from './components/AdvancedTractTab';
import ConsonantGeneratorTab from './components/ConsonantGeneratorTab';
import { AudioFile } from './types';
import { AudioUtils } from './utils/audioUtils';

const App: React.FC = () => {
    const [audioContext] = useState(() => new (window.AudioContext || (window as any).webkitAudioContext)());
    const [files, setFiles] = useState<AudioFile[]>([]);
    const [activeFileId, setActiveFileId] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'editor' | 'consonant' | 'generator' | 'sim'>('editor');
    const [showHelp, setShowHelp] = useState(false);
    const [fileCounter, setFileCounter] = useState(1);
    const [isRackOpen, setIsRackOpen] = useState(true);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const activeFile = useMemo(() => files.find(f => f.id === activeFileId), [files, activeFileId]);

    const ensureAudioContext = async () => {
        if (audioContext.state === 'suspended') {
            await audioContext.resume();
        }
    };

    const handleFileUpload = async (filesToUpload: FileList | File[]) => {
        await ensureAudioContext();
        const selFiles = Array.from(filesToUpload);
        for(const file of selFiles) {
            try {
                const arrayBuffer = await file.arrayBuffer();
                const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
                const newFile = { id: Math.random().toString(36).substr(2, 9), name: file.name, buffer: audioBuffer };
                setFiles(prev => [...prev, newFile]);
                if(!activeFileId) setActiveFileId(newFile.id);
            } catch (err) {
                console.error("Audio decoding failed", err);
            }
        }
    };

    const onFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) handleFileUpload(e.target.files);
    };

    const handleProjectExport = async () => {
        const fileData = await Promise.all(files.map(async (f) => {
            const blob = AudioUtils.bufferToWavBlob(f.buffer);
            const base64 = await AudioUtils.blobToBase64(blob);
            return { id: f.id, name: f.name, data: base64 };
        }));
        const projectData = { version: '1.1', files: fileData };
        const blob = new Blob([JSON.stringify(projectData)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `otonashi_proj_${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const handleProjectImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            const data = JSON.parse(await file.text());
            if (data.files) {
                const newFiles: AudioFile[] = [];
                for (const f of data.files) {
                    const res = await fetch(f.data);
                    const buf = await audioContext.decodeAudioData(await res.arrayBuffer());
                    newFiles.push({ id: f.id, name: f.name, buffer: buf });
                }
                setFiles(newFiles);
                if(newFiles.length > 0) setActiveFileId(newFiles[0].id);
            }
        } catch (err) {
            alert("프로젝트 로드 실패");
        }
    };

    const addToRack = (buffer: AudioBuffer, name: string) => { 
      const finalName = `${name}_${fileCounter.toString().padStart(3, '0')}`;
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
            <header className="h-14 border-b border-slate-300 bg-white flex items-center justify-between px-6 shrink-0 z-20 shadow-sm">
                <div className="flex items-center gap-3">
                    <div className="bg-[#209ad6] p-1.5 rounded-lg text-white shadow-lg shadow-blue-200"><Activity size={20}/></div>
                    <div className="flex flex-col">
                        <h1 className="font-black text-xl tracking-tighter leading-none bg-clip-text text-transparent bg-gradient-to-r from-[#b2d4ed] via-[#3c78e8] to-[#e3daf5]">OTONASHI</h1>
                        <span className="text-[10px] text-slate-400 font-black uppercase tracking-tight">AUgmented vocal-TracT and Nasal SImulator</span>
                    </div>
                </div>
                <nav className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
                    {([['editor', '스튜디오'], ['generator', '자음 생성'], ['consonant', '자음 합성'], ['sim', '성도 시뮬레이터']] as const).map(([id, label]) => (
                        <button key={id} onClick={()=>{ ensureAudioContext(); setActiveTab(id); }} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${activeTab===id?'bg-white text-[#209ad6] shadow-sm border border-slate-200':'text-slate-500 hover:text-slate-800'}`}>{label}</button>
                    ))}
                </nav>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1 border border-slate-200">
                      <button onClick={handleProjectExport} title="저장" className="p-1.5 text-slate-500 hover:bg-white hover:text-indigo-600 rounded-md transition-all"><Download size={16}/></button>
                      <button onClick={()=>fileInputRef.current?.click()} title="열기" className="p-1.5 text-slate-500 hover:bg-white hover:text-indigo-600 rounded-md transition-all"><Upload size={16}/></button>
                      <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={handleProjectImport}/>
                  </div>
                  <button onClick={()=>setShowHelp(true)} className="text-slate-400 hover:text-slate-600 transition-colors"><HelpCircle size={20}/></button>
                  <div className="w-8 h-8 rounded-full bg-slate-200 border border-slate-300 flex items-center justify-center shadow-inner"><User size={20} className="text-slate-400"/></div>
                </div>
            </header>
            <main className="flex-1 flex overflow-hidden relative">
                <FileRack files={files} activeFileId={activeFileId} setActiveFileId={setActiveFileId} handleFileUpload={onFileInputChange} handleFilesDrop={handleFileUpload} removeFile={removeFile} renameFile={renameFile} isOpen={isRackOpen} toggleOpen={() => setIsRackOpen(!isRackOpen)} />
                <div className="flex-1 flex flex-col min-w-0 bg-slate-50 overflow-y-auto custom-scrollbar">
                    <div className={activeTab === 'editor' ? 'flex-1 flex flex-col' : 'hidden'}>
                        <StudioTab audioContext={audioContext} activeFile={activeFile} files={files} onUpdateFile={updateFile} onAddToRack={addToRack} setActiveFileId={setActiveFileId} isActive={activeTab === 'editor'} />
                    </div>
                    <div className={activeTab === 'generator' ? 'flex-1 flex flex-col' : 'hidden'}>
                        <ConsonantGeneratorTab audioContext={audioContext} files={files} onAddToRack={addToRack} isActive={activeTab === 'generator'} />
                    </div>
                    <div className={activeTab === 'consonant' ? 'flex-1 flex flex-col' : 'hidden'}>
                        <ConsonantTab audioContext={audioContext} files={files} onAddToRack={addToRack} isActive={activeTab === 'consonant'} />
                    </div>
                    <div className={activeTab === 'sim' ? 'flex-1 flex flex-col' : 'hidden'}>
                        <AdvancedTractTab audioContext={audioContext} files={files} onAddToRack={addToRack} isActive={activeTab === 'sim'} />
                    </div>
                </div>
            </main>
            {showHelp && <HelpModal onClose={()=>setShowHelp(false)} />}
        </div>
    );
};

export default App;
