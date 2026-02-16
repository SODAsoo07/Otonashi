
import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { Activity, HelpCircle, User, Download, Upload, Undo2, Redo2 } from 'lucide-react';
import FileRack from './components/FileRack';
import HelpModal from './components/HelpModal';
import StudioTab from './components/StudioTab';
import ConsonantTab from './components/ConsonantTab';
import AdvancedTractTab from './components/AdvancedTractTab';
import ConsonantGeneratorTab from './components/ConsonantGeneratorTab';
import DevTool from './components/DevTool';
import { AudioFile, UIConfig } from './types';
import { AudioUtils } from './utils/audioUtils';

const App: React.FC = () => {
    const [audioContext] = useState(() => new (window.AudioContext || (window as any).webkitAudioContext)());
    const [files, setFiles] = useState<AudioFile[]>([]);
    const [activeFileId, setActiveFileId] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'editor' | 'generator' | 'consonant' | 'sim'>('editor');
    const [showHelp, setShowHelp] = useState(false);
    const [fileCounter, setFileCounter] = useState(1);
    const [isRackOpen, setIsRackOpen] = useState(true);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // 글로벌 히스토리 (파일 시스템)
    const [globalUndoStack, setGlobalUndoStack] = useState<AudioFile[][]>([]);
    const [globalRedoStack, setGlobalRedoStack] = useState<AudioFile[][]>([]);

    const commitGlobalHistory = useCallback((currentFiles: AudioFile[]) => {
        setGlobalUndoStack(prev => [...prev.slice(-29), [...currentFiles]]);
        setGlobalRedoStack([]);
    }, []);

    const handleGlobalUndo = useCallback(() => {
        if (globalUndoStack.length === 0) return;
        const prevState = globalUndoStack[globalUndoStack.length - 1];
        setGlobalRedoStack(prev => [...prev, [...files]]);
        setGlobalUndoStack(prev => prev.slice(0, -1));
        setFiles(prevState);
    }, [globalUndoStack, files]);

    const handleGlobalRedo = useCallback(() => {
        if (globalRedoStack.length === 0) return;
        const nextState = globalRedoStack[globalRedoStack.length - 1];
        setGlobalUndoStack(prev => [...prev, [...files]]);
        setGlobalRedoStack(prev => prev.slice(0, -1));
        setFiles(nextState);
    }, [globalRedoStack, files]);

    const [isResizing, setIsResizing] = useState(false);
    const [isDevModeActive, setIsDevModeActive] = useState(false);
    const [inputBuffer, setInputBuffer] = useState("");

    const [uiConfig, setUiConfig] = useState<UIConfig>({
        primaryColor: '#209ad6',
        accentColor: '#ec4899',
        bgColor: '#f8f8f6',
        panelRadius: '1.5rem',
        headerHeight: '3.5rem',
        sidebarWidth: 256
    });

    useEffect(() => {
        const styleId = 'otonashi-theme-vars';
        let styleTag = document.getElementById(styleId) as HTMLStyleElement;
        if (!styleTag) {
            styleTag = document.createElement('style');
            styleTag.id = styleId;
            document.head.appendChild(styleTag);
        }
        styleTag.innerHTML = `
            :root {
                --primary: ${uiConfig.primaryColor};
                --accent: ${uiConfig.accentColor};
                --app-bg: ${uiConfig.bgColor};
                --radius: ${uiConfig.panelRadius};
                --header-h: ${uiConfig.headerHeight};
                --sidebar-w: ${isRackOpen ? uiConfig.sidebarWidth : 48}px;
            }
            .dynamic-primary { background-color: var(--primary); }
            .dynamic-primary-text { color: var(--primary); }
            .dynamic-primary-border { border-color: var(--primary); }
            .dynamic-radius { border-radius: var(--radius); }
            .dynamic-bg { background-color: var(--app-bg); }
        `;
    }, [uiConfig, isRackOpen]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
            const char = e.key.toLowerCase();
            if (char.length === 1) {
                setInputBuffer(prev => {
                    const next = (prev + char).slice(-7);
                    if (next === "devtool") {
                        setIsDevModeActive(true);
                        return "";
                    }
                    return next;
                });
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isResizing) return;
            const newWidth = Math.max(200, Math.min(600, e.clientX));
            setUiConfig(prev => ({ ...prev, sidebarWidth: newWidth }));
        };
        const handleMouseUp = () => setIsResizing(false);

        if (isResizing) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        }
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isResizing]);

    const activeFile = useMemo(() => files.find(f => f.id === activeFileId), [files, activeFileId]);

    const ensureAudioContext = async () => {
        if (audioContext.state === 'suspended') await audioContext.resume();
    };

    const handleFileUpload = async (filesToUpload: FileList | File[]) => {
        await ensureAudioContext();
        commitGlobalHistory(files);
        const selFiles = Array.from(filesToUpload);
        const newFilesList = [...files];
        for(const file of selFiles) {
            try {
                const arrayBuffer = await file.arrayBuffer();
                const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
                const newFile = { id: Math.random().toString(36).substr(2, 9), name: file.name, buffer: audioBuffer };
                newFilesList.push(newFile);
            } catch (err) {
                console.error("Decoding failed", err);
            }
        }
        setFiles(newFilesList);
        if(!activeFileId && newFilesList.length > 0) setActiveFileId(newFilesList[0].id);
    };

    const handleProjectExport = async () => {
        const fileData = await Promise.all(files.map(async (f) => {
            const blob = AudioUtils.bufferToWavBlob(f.buffer);
            const base64 = await AudioUtils.blobToBase64(blob);
            return { id: f.id, name: f.name, data: base64 };
        }));
        const projectData = { version: '1.4', files: fileData, ui: uiConfig };
        const blob = new Blob([JSON.stringify(projectData)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `otonashi_project_${Date.now()}.json`;
        a.click();
    };

    const handleProjectImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            const data = JSON.parse(await file.text());
            if (data.ui) setUiConfig(data.ui);
            if (data.files) {
                const newFiles: AudioFile[] = [];
                for (const f of data.files) {
                    const res = await fetch(f.data);
                    const buf = await audioContext.decodeAudioData(await res.arrayBuffer());
                    newFiles.push({ id: f.id, name: f.name, buffer: buf });
                }
                commitGlobalHistory(files);
                setFiles(newFiles);
                if(newFiles.length > 0) setActiveFileId(newFiles[0].id);
            }
        } catch (err) {
            alert("프로젝트 로드 중 오류가 발생했습니다.");
        }
    };

    const addToRack = (buffer: AudioBuffer, name: string) => { 
        commitGlobalHistory(files);
        const finalName = `${name}_${fileCounter.toString().padStart(3, '0')}`;
        const newFile = { id: Math.random().toString(36).substr(2, 9), name: finalName, buffer }; 
        setFiles(prev => [...prev, newFile]); 
        setActiveFileId(newFile.id); 
        setFileCounter(prev => prev + 1);
    };

    const updateFile = (newBuffer: AudioBuffer) => { 
        commitGlobalHistory(files);
        setFiles(prev => prev.map(f => f.id === activeFileId ? { ...f, buffer: newBuffer } : f)); 
    };

    const removeFile = (id: string) => {
        commitGlobalHistory(files);
        setFiles(prev => prev.filter(f => f.id !== id));
        if (activeFileId === id) setActiveFileId(null);
    };

    const renameFile = (id: string, newName: string) => {
        commitGlobalHistory(files);
        setFiles(prev => prev.map(f => f.id === id ? { ...f, name: newName } : f));
    };

    return (
        <div className="h-screen w-full dynamic-bg text-[#1f1e1d] flex flex-col font-sans overflow-hidden select-none">
            <header style={{ height: 'var(--header-h)' }} className="border-b border-slate-300 bg-white flex items-center justify-between px-6 shrink-0 z-20 shadow-sm">
                <div className="flex items-center gap-3">
                    <div className="dynamic-primary p-1.5 rounded-lg text-white shadow-lg"><Activity size={20}/></div>
                    <div className="flex flex-col">
                        <h1 className="font-black text-xl tracking-tighter leading-none dynamic-primary-text">OTONASHI</h1>
                        <span className="text-[10px] text-slate-400 font-black uppercase tracking-tight">Vocal Tract Simulator</span>
                    </div>
                </div>
                <nav className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
                    {([['editor', '스튜디오'], ['generator', '자음 생성'], ['consonant', '자음 합성'], ['sim', '성도 시뮬레이터']] as const).map(([id, label]) => (
                        <button key={id} onClick={()=>{ ensureAudioContext(); setActiveTab(id); }} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${activeTab===id?'bg-white dynamic-primary-text shadow-sm border border-slate-200':'text-slate-500 hover:text-slate-800'}`}>{label}</button>
                    ))}
                </nav>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5 border border-slate-200">
                      <button onClick={handleGlobalUndo} disabled={globalUndoStack.length === 0} title="파일 목록 작업 취소" className="p-1.5 text-slate-500 hover:bg-white hover:text-indigo-600 rounded-md transition-all disabled:opacity-30"><Undo2 size={16}/></button>
                      <button onClick={handleGlobalRedo} disabled={globalRedoStack.length === 0} title="파일 목록 다시 실행" className="p-1.5 text-slate-500 hover:bg-white hover:text-indigo-600 rounded-md transition-all disabled:opacity-30"><Redo2 size={16}/></button>
                  </div>
                  <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5 border border-slate-200">
                      <button onClick={handleProjectExport} title="프로젝트 저장" className="p-1.5 text-slate-500 hover:bg-white hover:dynamic-primary-text rounded-md transition-all"><Download size={16}/></button>
                      <button onClick={()=>fileInputRef.current?.click()} title="프로젝트 불러오기" className="p-1.5 text-slate-500 hover:bg-white hover:dynamic-primary-text rounded-md transition-all"><Upload size={16}/></button>
                      <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={handleProjectImport}/>
                  </div>
                  <button onClick={()=>setShowHelp(true)} className="text-slate-400 hover:text-slate-600 transition-colors"><HelpCircle size={20}/></button>
                  <div className="w-8 h-8 rounded-full bg-slate-200 border border-slate-300 flex items-center justify-center"><User size={20} className="text-slate-400"/></div>
                </div>
            </header>
            <main className="flex-1 flex overflow-hidden relative">
                <FileRack 
                    files={files} 
                    activeFileId={activeFileId} 
                    setActiveFileId={setActiveFileId} 
                    handleFileUpload={(e)=>e.target.files && handleFileUpload(e.target.files)} 
                    handleFilesDrop={handleFileUpload} 
                    removeFile={removeFile} 
                    renameFile={renameFile} 
                    isOpen={isRackOpen} 
                    toggleOpen={() => setIsRackOpen(!isRackOpen)} 
                    width={isRackOpen ? uiConfig.sidebarWidth : 48}
                />
                
                {isRackOpen && (
                    <div 
                        onMouseDown={() => setIsResizing(true)}
                        className={`absolute top-0 bottom-0 z-50 w-1.5 cursor-col-resize hover:bg-blue-400/30 transition-colors ${isResizing ? 'bg-blue-500/50' : ''}`}
                        style={{ left: `${uiConfig.sidebarWidth}px` }}
                    />
                )}

                <div className="flex-1 flex flex-col min-w-0 overflow-y-auto custom-scrollbar relative">
                    <div className="absolute inset-0 flex flex-col" style={{ display: activeTab === 'editor' ? 'flex' : 'none' }}>
                        <StudioTab audioContext={audioContext} activeFile={activeFile} files={files} onUpdateFile={updateFile} onAddToRack={addToRack} setActiveFileId={setActiveFileId} isActive={activeTab === 'editor'} />
                    </div>
                    <div className="absolute inset-0 flex flex-col" style={{ display: activeTab === 'generator' ? 'flex' : 'none' }}>
                        <ConsonantGeneratorTab audioContext={audioContext} files={files} onAddToRack={addToRack} isActive={activeTab === 'generator'} />
                    </div>
                    <div className="absolute inset-0 flex flex-col" style={{ display: activeTab === 'consonant' ? 'flex' : 'none' }}>
                        <ConsonantTab audioContext={audioContext} files={files} onAddToRack={addToRack} isActive={activeTab === 'consonant'} />
                    </div>
                    <div className="absolute inset-0 flex flex-col" style={{ display: activeTab === 'sim' ? 'flex' : 'none' }}>
                        <AdvancedTractTab audioContext={audioContext} files={files} onAddToRack={addToRack} isActive={activeTab === 'sim'} />
                    </div>
                </div>
            </main>
            {showHelp && <HelpModal onClose={()=>setShowHelp(false)} />}
            <DevTool config={uiConfig} onChange={setUiConfig} isActive={isDevModeActive} />
        </div>
    );
};

export default App;
