
import React, { useState, useMemo, useRef, Suspense, lazy } from 'react';
import { Activity, HelpCircle, User, Download, Upload, Loader2, Globe } from 'lucide-react';
import FileRack from './components/FileRack';
import HelpModal from './components/HelpModal';
import { AudioFile } from './types';
import { AudioUtils } from './utils/audioUtils';
import { LanguageProvider, useLanguage } from './contexts/LanguageContext';

// 컴포넌트 지연 로딩 (Vercel 배포 시 초기 번들 크기 최적화)
const StudioTab = lazy(() => import('./components/StudioTab'));
const ConsonantTab = lazy(() => import('./components/ConsonantTab'));
const AdvancedTractTab = lazy(() => import('./components/AdvancedTractTab'));
const ConsonantGeneratorTab = lazy(() => import('./components/ConsonantGeneratorTab'));

const AppContent: React.FC = () => {
    const { t, language, setLanguage } = useLanguage();
    const [audioContext] = useState(() => new (window.AudioContext || (window as any).webkitAudioContext)());
    const [files, setFiles] = useState<AudioFile[]>([]);
    const [activeFileId, setActiveFileId] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'editor' | 'consonant' | 'generator' | 'sim'>('editor');
    const [showHelp, setShowHelp] = useState(false);
    const [fileCounter, setFileCounter] = useState(1);
    const [isRackOpen, setIsRackOpen] = useState(true);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const activeFile = useMemo(() => files.find(f => f.id === activeFileId), [files, activeFileId]);

    // AudioContext 재개 로직 (브라우저 보안 정책 대응)
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

    const toggleLanguage = () => {
        setLanguage(language === 'ko' ? 'en' : 'ko');
    };

    const LoadingFallback = () => (
        <div className="flex-1 flex flex-col items-center justify-center text-slate-400 gap-2">
            <Loader2 className="animate-spin" size={32}/>
            <span className="text-xs font-bold uppercase tracking-widest">{t.common.loading}</span>
        </div>
    );

    const tabConfig = [
        { id: 'editor' as const, label: t.app.tabs.editor },
        { id: 'generator' as const, label: t.app.tabs.generator },
        { id: 'consonant' as const, label: t.app.tabs.consonant },
        { id: 'sim' as const, label: t.app.tabs.sim }
    ];

    return (
        <div className="h-screen w-full bg-[#f8f8f6] text-[#1f1e1d] flex flex-col font-sans overflow-hidden">
            <header className="h-14 border-b border-slate-300 bg-white flex items-center justify-between px-6 shrink-0 z-20 shadow-sm">
                <div className="flex items-center gap-3">
                    <div className="bg-[#209ad6] p-1.5 rounded-lg text-white shadow-lg shadow-blue-200"><Activity size={20}/></div>
                    <div className="flex flex-col">
                        <h1 className="font-black text-xl tracking-tighter leading-none bg-clip-text text-transparent bg-gradient-to-r from-[#b2d4ed] via-[#3c78e8] to-[#e3daf5]">{t.app.title}</h1>
                        <span className="text-[10px] text-slate-400 font-black uppercase tracking-tight">{t.app.subtitle}</span>
                    </div>
                </div>
                <nav className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
                    {tabConfig.map(({id, label}) => (
                        <button key={id} onClick={()=>{ ensureAudioContext(); setActiveTab(id); }} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${activeTab===id?'bg-white text-[#209ad6] shadow-sm border border-slate-200':'text-slate-500 hover:text-slate-800'}`}>{label}</button>
                    ))}
                </nav>
                <div className="flex items-center gap-3">
                    <button onClick={toggleLanguage} className="flex items-center gap-1.5 bg-slate-100 px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-black text-slate-500 hover:bg-white hover:text-indigo-600 transition-all">
                        <Globe size={14} /> {language.toUpperCase()}
                    </button>
                    <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1 border border-slate-200">
                        <button onClick={handleProjectExport} title={t.common.save} className="p-1.5 text-slate-500 hover:bg-white hover:text-indigo-600 rounded-md transition-all"><Download size={16}/></button>
                        <button onClick={()=>fileInputRef.current?.click()} title={t.common.open} className="p-1.5 text-slate-500 hover:bg-white hover:text-indigo-600 rounded-md transition-all"><Upload size={16}/></button>
                        <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={handleProjectImport}/>
                    </div>
                    <button onClick={()=>setShowHelp(true)} className="text-slate-400 hover:text-slate-600 transition-colors" title={t.common.help}><HelpCircle size={20}/></button>
                    <div className="w-8 h-8 rounded-full bg-slate-200 border border-slate-300 flex items-center justify-center shadow-inner"><User size={20} className="text-slate-400"/></div>
                </div>
            </header>
            <main className="flex-1 flex overflow-hidden relative">
                <FileRack files={files} activeFileId={activeFileId} setActiveFileId={setActiveFileId} handleFileUpload={onFileInputChange} handleFilesDrop={handleFileUpload} removeFile={removeFile} renameFile={renameFile} isOpen={isRackOpen} toggleOpen={() => setIsRackOpen(!isRackOpen)} />
                <div className="flex-1 flex flex-col min-w-0 bg-slate-50 overflow-y-auto custom-scrollbar">
                    <Suspense fallback={<LoadingFallback />}>
                        <div className={activeTab === 'editor' ? 'flex-1 flex flex-col' : 'hidden'}><StudioTab audioContext={audioContext} activeFile={activeFile} files={files} onUpdateFile={updateFile} onAddToRack={addToRack} setActiveFileId={setActiveFileId} isActive={activeTab === 'editor'} /></div>
                        <div className={activeTab === 'generator' ? 'flex-1 flex flex-col' : 'hidden'}><ConsonantGeneratorTab audioContext={audioContext} files={files} onAddToRack={addToRack} isActive={activeTab === 'generator'} /></div>
                        <div className={activeTab === 'consonant' ? 'flex-1 flex flex-col' : 'hidden'}><ConsonantTab audioContext={audioContext} files={files} onAddToRack={addToRack} isActive={activeTab === 'consonant'} /></div>
                        <div className={activeTab === 'sim' ? 'flex-1 flex flex-col' : 'hidden'}><AdvancedTractTab audioContext={audioContext} files={files} onAddToRack={addToRack} isActive={activeTab === 'sim'} /></div>
                    </Suspense>
                </div>
            </main>
            {showHelp && <HelpModal onClose={()=>setShowHelp(false)} />}
        </div>
    );
};

const App: React.FC = () => {
    return (
        <LanguageProvider>
            <AppContent />
        </LanguageProvider>
    );
};

export default App;
