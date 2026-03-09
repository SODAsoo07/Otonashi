import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { Activity, Download, Globe, HelpCircle, Redo2, Undo2, Upload, User, Volume2 } from 'lucide-react';
import FileRack from './components/FileRack';
import HelpModal from './components/HelpModal';
import StudioTab from './components/StudioTab';
import ConsonantTab from './components/ConsonantTab';
import AdvancedTractTab from './components/AdvancedTractTab';
import ConsonantGeneratorTab from './components/ConsonantGeneratorTab';
import VocoderTab from './components/VocoderTab';
import { LanguageProvider, useLanguage } from './contexts/LanguageContext';
import { AudioFile, UIConfig } from './types';
import { AudioUtils } from './utils/audioUtils';
import { LANGUAGE_LABELS } from './utils/translations';

type TabId = 'editor' | 'generator' | 'consonant' | 'sim' | 'vocoder';
type HistoryState = {
    files: AudioFile[];
    activeFileId: string | null;
};

const APP_TEXT = {
    ko: {
        subtitle: 'Augmented Vocal-Tract & Nasal Simulator',
        monitor: '모니터',
        tabs: {
            editor: '스튜디오',
            generator: '자음 생성',
            consonant: '자음 합성',
            sim: '성도 시뮬레이터',
            vocoder: '보코더',
        },
        undo: '전체 작업 실행 취소',
        redo: '전체 작업 다시 실행',
        exportProject: '프로젝트 저장',
        importProject: '프로젝트 열기',
        projectLoadError: '프로젝트를 불러오는 중 오류가 발생했습니다.',
    },
    en: {
        subtitle: 'Augmented Vocal-Tract & Nasal Simulator',
        monitor: 'Monitor',
        tabs: {
            editor: 'Studio',
            generator: 'Consonant Gen',
            consonant: 'C-V Mixer',
            sim: 'Tract Sim',
            vocoder: 'Vocoder',
        },
        undo: 'Undo all actions',
        redo: 'Redo all actions',
        exportProject: 'Save project',
        importProject: 'Open project',
        projectLoadError: 'An error occurred while loading the project.',
    },
    ja: {
        subtitle: 'Augmented Vocal-Tract & Nasal Simulator',
        monitor: 'モニター',
        tabs: {
            editor: 'スタジオ',
            generator: '子音生成',
            consonant: 'C-V ミキサー',
            sim: '声道シミュレーター',
            vocoder: 'ボコーダー',
        },
        undo: '全体の操作を元に戻す',
        redo: '全体の操作をやり直す',
        exportProject: 'プロジェクトを保存',
        importProject: 'プロジェクトを開く',
        projectLoadError: 'プロジェクトの読み込み中にエラーが発生しました。',
    },
} as const;

const AppContent: React.FC = () => {
    const { language, cycleLanguage } = useLanguage();
    const text = APP_TEXT[language];
    const [audioContext] = useState(() => new (window.AudioContext || (window as any).webkitAudioContext)());
    const [files, setFiles] = useState<AudioFile[]>([]);
    const [activeFileId, setActiveFileId] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<TabId>('editor');
    const [showHelp, setShowHelp] = useState(false);
    const [fileCounter, setFileCounter] = useState(1);
    const [isRackOpen, setIsRackOpen] = useState(true);
    const [historyStack, setHistoryStack] = useState<HistoryState[]>([]);
    const [redoStack, setRedoStack] = useState<HistoryState[]>([]);
    const [monitorVolume, setMonitorVolume] = useState(80);
    const [isResizing, setIsResizing] = useState(false);
    const [uiConfig, setUiConfig] = useState<UIConfig>({
        primaryColor: '#209ad6',
        accentColor: '#ec4899',
        bgColor: '#f8f8f6',
        panelRadius: '1.5rem',
        headerHeight: '3.5rem',
        sidebarWidth: 256,
    });
    const fileInputRef = useRef<HTMLInputElement>(null);

    const monitorGainValue = monitorVolume / 100;
    const activeFile = useMemo(() => files.find(f => f.id === activeFileId), [files, activeFileId]);
    const tabConfig: Array<{ id: TabId; label: string }> = [
        { id: 'editor', label: text.tabs.editor },
        { id: 'generator', label: text.tabs.generator },
        { id: 'consonant', label: text.tabs.consonant },
        { id: 'sim', label: text.tabs.sim },
        { id: 'vocoder', label: text.tabs.vocoder },
    ];

    const commitHistory = useCallback((currentFiles: AudioFile[], currentActiveFileId: string | null) => {
        setHistoryStack(prev => [...prev.slice(-29), { files: [...currentFiles], activeFileId: currentActiveFileId }]);
        setRedoStack([]);
    }, []);

    const handleGlobalUndo = useCallback(() => {
        if (historyStack.length === 0) return;
        const prevState = historyStack[historyStack.length - 1];
        setRedoStack(prev => [...prev, { files: [...files], activeFileId }]);
        setHistoryStack(prev => prev.slice(0, -1));
        setFiles(prevState.files);
        setActiveFileId(prevState.activeFileId);
    }, [historyStack, files, activeFileId]);

    const handleGlobalRedo = useCallback(() => {
        if (redoStack.length === 0) return;
        const nextState = redoStack[redoStack.length - 1];
        setHistoryStack(prev => [...prev, { files: [...files], activeFileId }]);
        setRedoStack(prev => prev.slice(0, -1));
        setFiles(nextState.files);
        setActiveFileId(nextState.activeFileId);
    }, [redoStack, files, activeFileId]);

    useEffect(() => {
        const styleId = 'otonashi-theme-vars';
        let styleTag = document.getElementById(styleId) as HTMLStyleElement | null;
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

    const ensureAudioContext = async () => {
        if (audioContext.state === 'suspended') {
            await audioContext.resume();
        }
    };

    const handleFileUpload = async (filesToUpload: FileList | File[]) => {
        await ensureAudioContext();
        commitHistory(files, activeFileId);
        const nextFiles = [...files];

        for (const file of Array.from(filesToUpload)) {
            if (file.size === 0) continue;
            try {
                const arrayBuffer = await file.arrayBuffer();
                const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
                nextFiles.push({
                    id: Math.random().toString(36).substr(2, 9),
                    name: file.name,
                    buffer: audioBuffer,
                });
            } catch (err) {
                console.error('Decoding failed', err);
            }
        }

        setFiles(nextFiles);
        if (!activeFileId && nextFiles.length > 0) {
            setActiveFileId(nextFiles[0].id);
        }
    };

    const handleProjectExport = async () => {
        const fileData = await Promise.all(
            files.map(async file => {
                const blob = AudioUtils.bufferToWavBlob(file.buffer);
                const base64 = await AudioUtils.blobToBase64(blob);
                return { id: file.id, name: file.name, data: base64 };
            })
        );

        const projectData = { version: '1.5', files: fileData, ui: uiConfig };
        const blob = new Blob([JSON.stringify(projectData)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `otonashi_project_${Date.now()}.json`;
        link.click();
        URL.revokeObjectURL(url);
    };

    const handleProjectImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            const data = JSON.parse(await file.text());
            if (data.ui) setUiConfig(data.ui);
            if (data.files) {
                const importedFiles: AudioFile[] = [];
                for (const item of data.files) {
                    const response = await fetch(item.data);
                    const buffer = await audioContext.decodeAudioData(await response.arrayBuffer());
                    importedFiles.push({ id: item.id, name: item.name, buffer });
                }
                commitHistory(files, activeFileId);
                setFiles(importedFiles);
                setActiveFileId(importedFiles[0]?.id ?? null);
            }
        } catch (err) {
            alert(text.projectLoadError);
        } finally {
            e.target.value = '';
        }
    };

    const addToRack = (buffer: AudioBuffer, name: string) => {
        commitHistory(files, activeFileId);
        const newFile = {
            id: Math.random().toString(36).substr(2, 9),
            name: `${name}_${fileCounter.toString().padStart(3, '0')}`,
            buffer,
        };
        setFiles(prev => [...prev, newFile]);
        setActiveFileId(newFile.id);
        setFileCounter(prev => prev + 1);
        return newFile.id;
    };

    const sendSimToStudio = (buffer: AudioBuffer, name: string) => {
        const id = addToRack(buffer, name);
        setActiveFileId(id);
        setActiveTab('editor');
    };

    const sendSimToVocoder = (buffer: AudioBuffer, name: string) => {
        addToRack(buffer, name);
        setActiveTab('vocoder');
    };

    const updateFile = (newBuffer: AudioBuffer) => {
        commitHistory(files, activeFileId);
        setFiles(prev => prev.map(file => (file.id === activeFileId ? { ...file, buffer: newBuffer } : file)));
    };

    const removeFile = (id: string) => {
        commitHistory(files, activeFileId);
        setFiles(prev => prev.filter(file => file.id !== id));
        if (activeFileId === id) {
            setActiveFileId(null);
        }
    };

    const renameFile = (id: string, newName: string) => {
        commitHistory(files, activeFileId);
        setFiles(prev => prev.map(file => (file.id === id ? { ...file, name: newName } : file)));
    };

    return (
        <div className="h-screen w-full dynamic-bg text-[#1f1e1d] flex flex-col font-sans overflow-hidden select-none">
            <header style={{ height: 'var(--header-h)' }} className="border-b border-slate-300 bg-white flex items-center justify-between px-6 shrink-0 z-20 shadow-sm">
                <div className="flex items-center gap-3">
                    <div className="dynamic-primary p-1.5 rounded-lg text-white shadow-lg">
                        <Activity size={20} />
                    </div>
                    <div className="flex flex-col">
                        <h1 className="font-black text-xl tracking-tighter leading-none dynamic-primary-text">OTONASHI</h1>
                        <span className="text-[10px] text-slate-400 font-black uppercase tracking-tight">{text.subtitle}</span>
                    </div>
                </div>
                <nav className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
                    {tabConfig.map(({ id, label }) => (
                        <button
                            key={id}
                            onClick={() => {
                                ensureAudioContext();
                                setActiveTab(id);
                            }}
                            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${activeTab === id ? 'bg-white dynamic-primary-text shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-800'}`}
                        >
                            {label}
                        </button>
                    ))}
                </nav>
                <div className="flex items-center gap-3">
                    <button
                        onClick={cycleLanguage}
                        className="flex items-center gap-1.5 bg-slate-100 px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-black text-slate-500 hover:bg-white hover:text-indigo-600 transition-all"
                        title={language}
                    >
                        <Globe size={14} /> {LANGUAGE_LABELS[language]}
                    </button>
                    <div className="flex items-center gap-2 px-2.5 py-1 rounded-xl border bg-slate-100 border-slate-200">
                        <Volume2 size={13} className="text-slate-400 shrink-0" />
                        <input
                            type="range"
                            min={0}
                            max={100}
                            step={1}
                            value={monitorVolume}
                            onChange={e => setMonitorVolume(Number(e.target.value))}
                            className="w-20 h-1.5 rounded-full appearance-none accent-sky-500"
                        />
                        <span className="text-[10px] font-black text-slate-500 w-8 text-right">{monitorVolume}%</span>
                        <span className="text-[9px] text-slate-400 font-bold">{text.monitor}</span>
                    </div>
                    <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5 border border-slate-200">
                        <button onClick={handleGlobalUndo} disabled={historyStack.length === 0} title={text.undo} className="p-1.5 text-slate-500 hover:bg-white hover:text-indigo-600 rounded-md transition-all disabled:opacity-30">
                            <Undo2 size={16} />
                        </button>
                        <button onClick={handleGlobalRedo} disabled={redoStack.length === 0} title={text.redo} className="p-1.5 text-slate-500 hover:bg-white hover:text-indigo-600 rounded-md transition-all disabled:opacity-30">
                            <Redo2 size={16} />
                        </button>
                    </div>
                    <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5 border border-slate-200">
                        <button onClick={handleProjectExport} title={text.exportProject} className="p-1.5 text-slate-500 hover:bg-white hover:dynamic-primary-text rounded-md transition-all">
                            <Download size={16} />
                        </button>
                        <button onClick={() => fileInputRef.current?.click()} title={text.importProject} className="p-1.5 text-slate-500 hover:bg-white hover:dynamic-primary-text rounded-md transition-all">
                            <Upload size={16} />
                        </button>
                        <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={handleProjectImport} />
                    </div>
                    <button onClick={() => setShowHelp(true)} className="text-slate-400 hover:text-slate-600 transition-colors">
                        <HelpCircle size={20} />
                    </button>
                    <div className="w-8 h-8 rounded-full bg-slate-200 border border-slate-300 flex items-center justify-center">
                        <User size={20} className="text-slate-400" />
                    </div>
                </div>
            </header>
            <main className="flex-1 flex overflow-hidden relative">
                <FileRack
                    files={files}
                    activeFileId={activeFileId}
                    setActiveFileId={setActiveFileId}
                    handleFileUpload={e => e.target.files && handleFileUpload(e.target.files)}
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

                <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
                    <div className="absolute inset-0 flex flex-col transition-opacity" style={{ display: activeTab === 'editor' ? 'flex' : 'none' }}>
                        <StudioTab audioContext={audioContext} activeFile={activeFile} files={files} onUpdateFile={updateFile} onAddToRack={addToRack} setActiveFileId={setActiveFileId} isActive={activeTab === 'editor'} monitorGainValue={monitorGainValue} />
                    </div>
                    <div className="absolute inset-0 flex flex-col transition-opacity" style={{ display: activeTab === 'generator' ? 'flex' : 'none' }}>
                        <ConsonantGeneratorTab audioContext={audioContext} files={files} onAddToRack={addToRack} isActive={activeTab === 'generator'} monitorGainValue={monitorGainValue} />
                    </div>
                    <div className="absolute inset-0 flex flex-col transition-opacity" style={{ display: activeTab === 'consonant' ? 'flex' : 'none' }}>
                        <ConsonantTab audioContext={audioContext} files={files} onAddToRack={addToRack} isActive={activeTab === 'consonant'} monitorGainValue={monitorGainValue} />
                    </div>
                    <div className="absolute inset-0 flex flex-col transition-opacity" style={{ display: activeTab === 'sim' ? 'flex' : 'none' }}>
                        <AdvancedTractTab audioContext={audioContext} files={files} onAddToRack={addToRack} isActive={activeTab === 'sim'} monitorGainValue={monitorGainValue} onSendToStudio={sendSimToStudio} onSendToVocoder={sendSimToVocoder} />
                    </div>
                    <div className="absolute inset-0 flex flex-col transition-opacity" style={{ display: activeTab === 'vocoder' ? 'flex' : 'none' }}>
                        <VocoderTab audioContext={audioContext} files={files} onAddToRack={addToRack} isActive={activeTab === 'vocoder'} monitorGainValue={monitorGainValue} />
                    </div>
                </div>
            </main>
            {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
        </div>
    );
};

const App: React.FC = () => (
    <LanguageProvider>
        <AppContent />
    </LanguageProvider>
);

export default App;
