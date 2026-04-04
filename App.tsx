import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { Activity, Download, Globe, HelpCircle, Redo2, Undo2, Upload, User, Volume2 } from 'lucide-react';
import JSZip from 'jszip';
import FileRack from './components/FileRack';
import HelpModal from './components/HelpModal';
import StudioTab from './components/StudioTab';
import ConsonantTab from './components/ConsonantTab';
import AdvancedTractTab from './components/AdvancedTractTab';
import ConsonantGeneratorTab from './components/ConsonantGeneratorTab';
import VocoderTab from './components/VocoderTab';
import MiscTab from './components/MiscTab';
import FrqTab from './components/FrqTab';
import { LanguageProvider, useLanguage } from './contexts/LanguageContext';
import { AudioFile, UIConfig } from './types';
import { AudioUtils } from './utils/audioUtils';
import { LANGUAGE_LABELS } from './utils/translations';

type TabId = 'editor' | 'generator' | 'consonant' | 'sim' | 'vowel' | 'vocoder' | 'misc' | 'frq';
type HistoryState = {
    files: AudioFile[];
    activeFileId: string | null;
};
type TabHistory = {
    undo: HistoryState[];
    redo: HistoryState[];
};
type LegacyProjectFileData = {
    id: string;
    name: string;
    data: string;
};
type LegacySerializedProjectData = {
    version: string;
    timestamp?: number;
    files: LegacyProjectFileData[];
    ui: UIConfig;
    activeFileId?: string | null;
    activeTab?: TabId;
    fileCounter?: number;
};
type PackedProjectFileData = {
    id: string;
    name: string;
    path: string;
};
type PackedSerializedProjectData = {
    version: string;
    format: 'otz';
    timestamp?: number;
    files: PackedProjectFileData[];
    ui: UIConfig;
    activeFileId?: string | null;
    activeTab?: TabId;
    fileCounter?: number;
};

const AUTOSAVE_KEY = 'otonashi_autosave_v1';
const AUTOSAVE_DB = 'otonashi_autosave_db';
const AUTOSAVE_STORE = 'sessions';
const AUTOSAVE_RECORD_ID = 'latest';
const AUTOSAVE_INTERVAL_MS = 10000;
const AUTOSAVE_OTZ_PREFIX = 'OTZB64:';
const MAX_UPLOAD_FILES = 50;
const MAX_FILE_BYTES = 100 * 1024 * 1024;
const MAX_TOTAL_UPLOAD_BYTES = 500 * 1024 * 1024;
const MAX_PROJECT_BYTES = 500 * 1024 * 1024;
const MAX_ZIP_ENTRIES = 200;
const MAX_ZIP_ENTRY_BYTES = 150 * 1024 * 1024;
const MAX_ZIP_TOTAL_BYTES = 700 * 1024 * 1024;
type AutosavePayload = string | Blob | ArrayBuffer;

const createEmptyTabHistories = (): Record<TabId, TabHistory> => ({
    editor: { undo: [], redo: [] },
    generator: { undo: [], redo: [] },
    consonant: { undo: [], redo: [] },
    sim: { undo: [], redo: [] },
    vowel: { undo: [], redo: [] },
    vocoder: { undo: [], redo: [] },
    misc: { undo: [], redo: [] },
    frq: { undo: [], redo: [] },
});

const openAutosaveDb = (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(AUTOSAVE_DB, 1);
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(AUTOSAVE_STORE)) {
                db.createObjectStore(AUTOSAVE_STORE);
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
};

const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
        const chunk = bytes.subarray(i, i + chunkSize);
        let piece = '';
        for (let j = 0; j < chunk.length; j++) piece += String.fromCharCode(chunk[j]);
        binary += piece;
    }
    return btoa(binary);
};

const base64ToArrayBuffer = (base64: string): ArrayBuffer => {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
};

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
const isHexColor = (value: string) => /^#(?:[0-9a-fA-F]{3}){1,2}$/.test(value);
const isLengthUnit = (value: string, min: number, max: number) => {
    const matched = value.match(/^(\d+(?:\.\d+)?)rem$/);
    if (!matched) return false;
    const parsed = Number(matched[1]);
    return Number.isFinite(parsed) && parsed >= min && parsed <= max;
};

const sanitizeUiConfig = (ui?: UIConfig): UIConfig | undefined => {
    if (!ui) return undefined;
    return {
        primaryColor: isHexColor(ui.primaryColor) ? ui.primaryColor : '#209ad6',
        accentColor: isHexColor(ui.accentColor) ? ui.accentColor : '#ec4899',
        bgColor: isHexColor(ui.bgColor) ? ui.bgColor : '#f8f8f6',
        panelRadius: isLengthUnit(ui.panelRadius, 0.25, 4) ? ui.panelRadius : '1.5rem',
        headerHeight: isLengthUnit(ui.headerHeight, 2.5, 6) ? ui.headerHeight : '3.5rem',
        sidebarWidth: clamp(Math.round(ui.sidebarWidth), 200, 600),
    };
};

const readAutosavePayload = async (): Promise<AutosavePayload | null> => {
    try {
        const db = await openAutosaveDb();
        return await new Promise((resolve, reject) => {
            const tx = db.transaction(AUTOSAVE_STORE, 'readonly');
            const store = tx.objectStore(AUTOSAVE_STORE);
            const req = store.get(AUTOSAVE_RECORD_ID);
            req.onsuccess = () => resolve((req.result as AutosavePayload | undefined) ?? null);
            req.onerror = () => reject(req.error);
        });
    } catch {
        return localStorage.getItem(AUTOSAVE_KEY);
    }
};

const writeAutosavePayload = async (payload: AutosavePayload): Promise<void> => {
    try {
        const db = await openAutosaveDb();
        await new Promise<void>((resolve, reject) => {
            const tx = db.transaction(AUTOSAVE_STORE, 'readwrite');
            tx.objectStore(AUTOSAVE_STORE).put(payload, AUTOSAVE_RECORD_ID);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    } catch {
        if (typeof payload === 'string') {
            localStorage.setItem(AUTOSAVE_KEY, payload);
            return;
        }
        const arr = payload instanceof Blob ? await payload.arrayBuffer() : payload;
        localStorage.setItem(AUTOSAVE_KEY, `${AUTOSAVE_OTZ_PREFIX}${arrayBufferToBase64(arr)}`);
    }
};

const clearAutosavePayload = async (): Promise<void> => {
    try {
        const db = await openAutosaveDb();
        await new Promise<void>((resolve, reject) => {
            const tx = db.transaction(AUTOSAVE_STORE, 'readwrite');
            tx.objectStore(AUTOSAVE_STORE).delete(AUTOSAVE_RECORD_ID);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    } finally {
        localStorage.removeItem(AUTOSAVE_KEY);
    }
};

const APP_TEXT = {
    ko: {
        subtitle: 'Augmented Vocal-Tract & Nasal Simulator',
        monitor: '모니터',
        tabs: {
            editor: '스튜디오',
            generator: '자음 생성기',
            consonant: '자모음 합성기',
            sim: '성도 시뮬레이터',
            vowel: '성도 자음/모음 생성',
            vocoder: '보코더',
            misc: '기타',
            frq: 'FRQ',
        },
        undo: '현재 탭 작업 되돌리기',
        redo: '현재 탭 작업 다시 실행',
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
            vowel: 'Tract C/V',
            vocoder: 'Vocoder',
            misc: 'Misc',
            frq: 'FRQ',
        },
        undo: 'Undo current tab',
        redo: 'Redo current tab',
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
            vowel: '声道 子音/母音 生成',
            vocoder: 'ボコーダー',
            misc: 'その他',
            frq: 'FRQ',
        },
        undo: '現在のタブを元に戻す',
        redo: '現在のタブをやり直す',
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
    const [tabHistories, setTabHistories] = useState<Record<TabId, TabHistory>>(createEmptyTabHistories);
    const [pendingRecoveryTs, setPendingRecoveryTs] = useState<number | null>(null);
    const [isRecovering, setIsRecovering] = useState(false);
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
    const autosaveTimerRef = useRef<number | null>(null);
    const autosaveInFlightRef = useRef(false);
    const lastAutosaveSignatureRef = useRef('');

    const monitorGainValue = monitorVolume / 100;
    const activeFile = useMemo(() => files.find(f => f.id === activeFileId), [files, activeFileId]);
    const tabConfig: Array<{ id: TabId; label: string }> = [
        { id: 'editor', label: text.tabs.editor },
        { id: 'generator', label: text.tabs.generator },
        { id: 'consonant', label: text.tabs.consonant },
        { id: 'sim', label: text.tabs.sim },
        { id: 'vowel', label: text.tabs.vowel },
        { id: 'vocoder', label: text.tabs.vocoder },
        { id: 'misc', label: text.tabs.misc },
        { id: 'frq', label: text.tabs.frq },
    ];
    const activeTabHistory = tabHistories[activeTab];

    const commitHistory = useCallback((currentFiles: AudioFile[], currentActiveFileId: string | null, targetTab: TabId = activeTab) => {
        setTabHistories(prev => {
            const tabHistory = prev[targetTab];
            const nextUndo = [...tabHistory.undo.slice(-29), { files: [...currentFiles], activeFileId: currentActiveFileId }];
            return {
                ...prev,
                [targetTab]: {
                    undo: nextUndo,
                    redo: [],
                },
            };
        });
    }, [activeTab]);

    const handleGlobalUndo = useCallback(() => {
        const currentHistory = tabHistories[activeTab];
        if (!currentHistory || currentHistory.undo.length === 0) return;
        const prevState = currentHistory.undo[currentHistory.undo.length - 1];

        setTabHistories(prev => {
            const history = prev[activeTab];
            return {
                ...prev,
                [activeTab]: {
                    undo: history.undo.slice(0, -1),
                    redo: [...history.redo, { files: [...files], activeFileId }],
                },
            };
        });
        setFiles(prevState.files);
        setActiveFileId(prevState.activeFileId);
    }, [tabHistories, activeTab, files, activeFileId]);

    const handleGlobalRedo = useCallback(() => {
        const currentHistory = tabHistories[activeTab];
        if (!currentHistory || currentHistory.redo.length === 0) return;
        const nextState = currentHistory.redo[currentHistory.redo.length - 1];

        setTabHistories(prev => {
            const history = prev[activeTab];
            return {
                ...prev,
                [activeTab]: {
                    undo: [...history.undo, { files: [...files], activeFileId }],
                    redo: history.redo.slice(0, -1),
                },
            };
        });
        setFiles(nextState.files);
        setActiveFileId(nextState.activeFileId);
    }, [tabHistories, activeTab, files, activeFileId]);

    useEffect(() => {
        const rootStyle = document.documentElement.style;
        const safeUi = sanitizeUiConfig(uiConfig)!;
        rootStyle.setProperty('--primary', safeUi.primaryColor);
        rootStyle.setProperty('--accent', safeUi.accentColor);
        rootStyle.setProperty('--app-bg', safeUi.bgColor);
        rootStyle.setProperty('--radius', safeUi.panelRadius);
        rootStyle.setProperty('--header-h', safeUi.headerHeight);
        rootStyle.setProperty('--sidebar-w', `${isRackOpen ? safeUi.sidebarWidth : 48}px`);
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

    const decodeAudioBuffer = useCallback(async (arrayBuffer: ArrayBuffer): Promise<AudioBuffer> => {
        const safeBuffer = arrayBuffer.slice(0);
        const decode = audioContext.decodeAudioData.bind(audioContext) as any;
        if (decode.length <= 1) {
            return await audioContext.decodeAudioData(safeBuffer);
        }
        return await new Promise<AudioBuffer>((resolve, reject) => {
            decode(safeBuffer, resolve, reject);
        });
    }, [audioContext]);

    const applyImportedProject = useCallback((importedFiles: AudioFile[], data: {
        ui?: UIConfig;
        activeFileId?: string | null;
        activeTab?: TabId;
        fileCounter?: number;
    }) => {
        const safeUi = sanitizeUiConfig(data.ui);
        if (safeUi) setUiConfig(safeUi);
        setFiles(importedFiles);
        setActiveFileId(data.activeFileId ?? importedFiles[0]?.id ?? null);
        setActiveTab(data.activeTab ?? 'editor');
        setFileCounter(typeof data.fileCounter === 'number' ? data.fileCounter : Math.max(1, importedFiles.length + 1));
        setTabHistories(createEmptyTabHistories());
    }, []);

    const buildSerializableProject = useCallback(async (): Promise<LegacySerializedProjectData> => {
        const fileData: LegacyProjectFileData[] = [];
        for (const file of files) {
            const blob = AudioUtils.bufferToWavBlob(file.buffer);
            const base64 = await AudioUtils.blobToBase64(blob);
            fileData.push({ id: file.id, name: file.name, data: base64 });
        }
        return {
            version: '1.6',
            timestamp: Date.now(),
            files: fileData,
            ui: uiConfig,
            activeFileId,
            activeTab,
            fileCounter,
        };
    }, [files, uiConfig, activeFileId, activeTab, fileCounter]);

    const applyLegacyProjectData = useCallback(async (data: LegacySerializedProjectData) => {
        const importedFiles: AudioFile[] = [];
        for (const item of data.files || []) {
            if (!item?.data || !item.data.startsWith('data:audio/')) {
                throw new Error('invalid legacy audio payload');
            }
            const response = await fetch(item.data);
            const buffer = await decodeAudioBuffer(await response.arrayBuffer());
            importedFiles.push({ id: item.id, name: item.name, buffer });
        }
        applyImportedProject(importedFiles, data);
    }, [applyImportedProject, decodeAudioBuffer]);

    const buildPackedProjectManifest = useCallback((): PackedSerializedProjectData => {
        const packedFiles: PackedProjectFileData[] = files.map(file => ({
            id: file.id,
            name: file.name,
            path: `audio/${file.id}.wav`,
        }));
        return {
            version: '1.7',
            format: 'otz',
            timestamp: Date.now(),
            files: packedFiles,
            ui: uiConfig,
            activeFileId,
            activeTab,
            fileCounter,
        };
    }, [files, uiConfig, activeFileId, activeTab, fileCounter]);

    const buildPackedProjectBlob = useCallback(async (): Promise<Blob> => {
        const manifest = buildPackedProjectManifest();
        const zip = new JSZip();
        zip.file('project.json', JSON.stringify(manifest));
        for (const item of manifest.files) {
            const src = files.find(f => f.id === item.id);
            if (!src) continue;
            const wavBlob = AudioUtils.bufferToWavBlob(src.buffer);
            zip.file(item.path, await wavBlob.arrayBuffer());
        }
        return await zip.generateAsync({
            type: 'blob',
            compression: 'DEFLATE',
            compressionOptions: { level: 6 },
        });
    }, [buildPackedProjectManifest, files]);

    const applyPackedProjectData = useCallback(async (manifest: PackedSerializedProjectData, zip: JSZip) => {
        const importedFiles: AudioFile[] = [];
        for (const item of manifest.files || []) {
            const entry = zip.file(item.path);
            if (!entry) continue;
            const arrayBuffer = await entry.async('arraybuffer');
            const buffer = await decodeAudioBuffer(arrayBuffer);
            importedFiles.push({ id: item.id, name: item.name, buffer });
        }
        applyImportedProject(importedFiles, manifest);
    }, [applyImportedProject, decodeAudioBuffer]);

    const readPackedManifestFromBinary = useCallback(async (binary: Blob | ArrayBuffer) => {
        const zip = await JSZip.loadAsync(binary);
        const entries = Object.values(zip.files).filter(entry => !entry.dir);
        if (entries.length > MAX_ZIP_ENTRIES) throw new Error('too many zip entries');
        let totalUncompressed = 0;
        for (const entry of entries) {
            const bytes = await entry.async('uint8array');
            if (bytes.byteLength > MAX_ZIP_ENTRY_BYTES) throw new Error('zip entry too large');
            totalUncompressed += bytes.byteLength;
            if (totalUncompressed > MAX_ZIP_TOTAL_BYTES) throw new Error('zip exceeds total limit');
        }
        const manifestEntry = zip.file('project.json');
        if (!manifestEntry) throw new Error('missing manifest');
        const manifest = JSON.parse(await manifestEntry.async('text')) as PackedSerializedProjectData;
        if (manifest?.format !== 'otz') throw new Error('invalid otz manifest');
        return { manifest, zip };
    }, []);

    const getAutosaveTimestamp = useCallback(async (raw: AutosavePayload): Promise<number> => {
        if (typeof raw === 'string') {
            if (raw.startsWith(AUTOSAVE_OTZ_PREFIX)) {
                const packed = raw.slice(AUTOSAVE_OTZ_PREFIX.length);
                const { manifest } = await readPackedManifestFromBinary(base64ToArrayBuffer(packed));
                return typeof manifest.timestamp === 'number' ? manifest.timestamp : Date.now();
            }
            const parsed = JSON.parse(raw) as LegacySerializedProjectData;
            return typeof parsed.timestamp === 'number' ? parsed.timestamp : Date.now();
        }
        const { manifest } = await readPackedManifestFromBinary(raw);
        return typeof manifest.timestamp === 'number' ? manifest.timestamp : Date.now();
    }, [readPackedManifestFromBinary]);

    const applyAutosavePayload = useCallback(async (raw: AutosavePayload) => {
        if (typeof raw === 'string') {
            if (raw.startsWith(AUTOSAVE_OTZ_PREFIX)) {
                const packed = raw.slice(AUTOSAVE_OTZ_PREFIX.length);
                const { manifest, zip } = await readPackedManifestFromBinary(base64ToArrayBuffer(packed));
                await applyPackedProjectData(manifest, zip);
                return;
            }
            const parsed = JSON.parse(raw) as LegacySerializedProjectData;
            await applyLegacyProjectData(parsed);
            return;
        }
        const { manifest, zip } = await readPackedManifestFromBinary(raw);
        await applyPackedProjectData(manifest, zip);
    }, [applyLegacyProjectData, applyPackedProjectData, readPackedManifestFromBinary]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (!(e.ctrlKey || e.metaKey)) return;
            const target = e.target as HTMLElement | null;
            const tagName = target?.tagName?.toLowerCase();
            const isTextInput = !!target && (target.isContentEditable || tagName === 'input' || tagName === 'textarea' || tagName === 'select');
            if (isTextInput) return;
            if (e.key.toLowerCase() !== 'z') return;
            e.preventDefault();
            if (e.shiftKey) handleGlobalRedo();
            else handleGlobalUndo();
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleGlobalUndo, handleGlobalRedo]);

    useEffect(() => {
        let mounted = true;
        const loadRecovery = async () => {
            try {
                const raw = await readAutosavePayload();
                if (!raw || !mounted) return;
                const ts = await getAutosaveTimestamp(raw);
                if (mounted) setPendingRecoveryTs(ts);
            } catch (err) {
                console.warn('Failed to read autosave', err);
            }
        };
        void loadRecovery();
        return () => { mounted = false; };
    }, [getAutosaveTimestamp]);

    const autosaveSignature = useMemo(() => {
        const fileSig = files.map(f => `${f.id}:${f.name}:${f.buffer.length}:${f.buffer.sampleRate}`).join('|');
        return `${activeTab}::${activeFileId ?? ''}::${fileCounter}::${JSON.stringify(uiConfig)}::${fileSig}`;
    }, [files, activeTab, activeFileId, fileCounter, uiConfig]);

    const saveAutosaveNow = useCallback(async () => {
        if (autosaveInFlightRef.current) return;
        autosaveInFlightRef.current = true;
        try {
            const packed = await buildPackedProjectBlob();
            await writeAutosavePayload(packed);
            lastAutosaveSignatureRef.current = autosaveSignature;
        } catch (err) {
            console.warn('Autosave failed', err);
        } finally {
            autosaveInFlightRef.current = false;
        }
    }, [buildPackedProjectBlob, autosaveSignature]);

    useEffect(() => {
        if (lastAutosaveSignatureRef.current === autosaveSignature) return;
        if (autosaveTimerRef.current) {
            window.clearTimeout(autosaveTimerRef.current);
        }
        autosaveTimerRef.current = window.setTimeout(() => {
            void saveAutosaveNow();
        }, AUTOSAVE_INTERVAL_MS);
        return () => {
            if (autosaveTimerRef.current) {
                window.clearTimeout(autosaveTimerRef.current);
                autosaveTimerRef.current = null;
            }
        };
    }, [autosaveSignature, saveAutosaveNow]);

    useEffect(() => {
        const onBeforeUnload = () => {
            if (lastAutosaveSignatureRef.current !== autosaveSignature) {
                void saveAutosaveNow();
            }
        };
        window.addEventListener('beforeunload', onBeforeUnload);
        return () => window.removeEventListener('beforeunload', onBeforeUnload);
    }, [autosaveSignature, saveAutosaveNow]);

    const handleRecoverAutosave = useCallback(async () => {
        try {
            setIsRecovering(true);
            const raw = await readAutosavePayload();
            if (!raw) return;
            await applyAutosavePayload(raw);
            await clearAutosavePayload();
            setPendingRecoveryTs(null);
        } catch (err) {
            alert(text.projectLoadError);
        } finally {
            setIsRecovering(false);
        }
    }, [applyAutosavePayload, text.projectLoadError]);

    const handleDiscardAutosave = useCallback(() => {
        void clearAutosavePayload();
        setPendingRecoveryTs(null);
    }, []);

    const handleFileUpload = async (filesToUpload: FileList | File[]) => {
        await ensureAudioContext();
        commitHistory(files, activeFileId);
        const nextFiles = [...files];
        const incoming = Array.from(filesToUpload);
        if (incoming.length > MAX_UPLOAD_FILES) {
            alert(`Too many files. Please upload up to ${MAX_UPLOAD_FILES} files at once.`);
            return;
        }

        const totalBytes = incoming.reduce((sum, f) => sum + (f?.size ?? 0), 0);
        if (totalBytes > MAX_TOTAL_UPLOAD_BYTES) {
            alert('Upload size is too large. Please reduce the total file size.');
            return;
        }

        for (const file of incoming) {
            if (file.size === 0) continue;
            if (file.size > MAX_FILE_BYTES) {
                console.warn('Skipping oversized file', file.name);
                continue;
            }
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
        const blob = await buildPackedProjectBlob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `otonashi_project_${Date.now()}.otz`;
        link.click();
        URL.revokeObjectURL(url);
    };

    const handleProjectImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.size > MAX_PROJECT_BYTES) {
            alert('Project file is too large to import safely.');
            e.target.value = '';
            return;
        }

        try {
            if (file.name.toLowerCase().endsWith('.otz')) {
                const { manifest, zip } = await readPackedManifestFromBinary(await file.arrayBuffer());
                await applyPackedProjectData(manifest, zip);
            } else {
                const data = JSON.parse(await file.text()) as LegacySerializedProjectData;
                await applyLegacyProjectData(data);
            }
        } catch (err) {
            alert(text.projectLoadError);
        } finally {
            e.target.value = '';
        }
    };

    const addToRack = (buffer: AudioBuffer, name: string) => {
        commitHistory(files, activeFileId);
        const suggested = `${name}_${fileCounter.toString().padStart(3, '0')}`;
        const input = window.prompt(language === 'ko'
            ? '보관함에 저장할 파일 이름을 입력하세요.'
            : language === 'ja'
                ? 'ラックに保存するファイル名を入力してください。'
                : 'Enter a file name to save in the rack.', suggested);
        if (input === null) return null;
        const finalName = input.trim() || suggested;
        const newFile = {
            id: Math.random().toString(36).substr(2, 9),
            name: finalName,
            buffer,
        };
        setFiles(prev => [...prev, newFile]);
        setActiveFileId(newFile.id);
        setFileCounter(prev => prev + 1);
        return newFile.id;
    };

    const sendSimToStudio = (buffer: AudioBuffer, name: string) => {
        const id = addToRack(buffer, name);
        if (!id) return;
        setActiveFileId(id);
        setActiveTab('editor');
    };

    const sendSimToVocoder = (buffer: AudioBuffer, name: string) => {
        const id = addToRack(buffer, name);
        if (!id) return;
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
                        <button onClick={handleGlobalUndo} disabled={activeTabHistory.undo.length === 0} title={text.undo} className="p-1.5 text-slate-500 hover:bg-white hover:text-indigo-600 rounded-md transition-all disabled:opacity-30">
                            <Undo2 size={16} />
                        </button>
                        <button onClick={handleGlobalRedo} disabled={activeTabHistory.redo.length === 0} title={text.redo} className="p-1.5 text-slate-500 hover:bg-white hover:text-indigo-600 rounded-md transition-all disabled:opacity-30">
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
                        <input ref={fileInputRef} type="file" accept=".json,.otz" className="hidden" onChange={handleProjectImport} />
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
                    <div className="absolute inset-0 flex flex-col transition-opacity" style={{ display: activeTab === 'sim' || activeTab === 'vowel' ? 'flex' : 'none' }}>
                        <AdvancedTractTab
                            audioContext={audioContext}
                            files={files}
                            onAddToRack={addToRack}
                            isActive={activeTab === 'sim' || activeTab === 'vowel'}
                            monitorGainValue={monitorGainValue}
                            onSendToStudio={sendSimToStudio}
                            onSendToVocoder={sendSimToVocoder}
                            preferredSidebarTab={activeTab === 'vowel' ? 'vowel' : undefined}
                        />
                    </div>
                    <div className="absolute inset-0 flex flex-col transition-opacity" style={{ display: activeTab === 'vocoder' ? 'flex' : 'none' }}>
                        <VocoderTab audioContext={audioContext} files={files} onAddToRack={addToRack} isActive={activeTab === 'vocoder'} monitorGainValue={monitorGainValue} />
                    </div>
                    <div className="absolute inset-0 flex flex-col transition-opacity" style={{ display: activeTab === 'misc' ? 'flex' : 'none' }}>
                        <MiscTab audioContext={audioContext} files={files} onAddToRack={addToRack} isActive={activeTab === 'misc'} monitorGainValue={monitorGainValue} />
                    </div>
                    <div className="absolute inset-0 flex flex-col transition-opacity" style={{ display: activeTab === 'frq' ? 'flex' : 'none' }}>
                        <FrqTab audioContext={audioContext} files={files} isActive={activeTab === 'frq'} />
                    </div>
                </div>
            </main>
            {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
            {pendingRecoveryTs !== null && (
                <div className="fixed inset-0 z-[60] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-2xl p-5 space-y-4">
                        <h3 className="text-base font-black text-slate-800">
                            {language === 'ko' ? '자동 저장된 작업을 발견했습니다' : language === 'ja' ? '自動保存された作業が見つかりました' : 'Autosaved session found'}
                        </h3>
                        <p className="text-xs font-bold text-slate-500 leading-relaxed">
                            {language === 'ko'
                                ? `저장 시각: ${new Date(pendingRecoveryTs).toLocaleString()}`
                                : language === 'ja'
                                    ? `保存時刻: ${new Date(pendingRecoveryTs).toLocaleString()}`
                                    : `Saved at: ${new Date(pendingRecoveryTs).toLocaleString()}`}
                        </p>
                        <div className="flex items-center justify-end gap-2 pt-2">
                            <button
                                onClick={handleDiscardAutosave}
                                className="px-3 py-2 rounded-lg border border-slate-300 text-slate-600 text-xs font-black hover:bg-slate-50"
                            >
                                {language === 'ko' ? '폐기' : language === 'ja' ? '破棄' : 'Discard'}
                            </button>
                            <button
                                onClick={handleRecoverAutosave}
                                disabled={isRecovering}
                                className="px-3 py-2 rounded-lg bg-indigo-500 hover:bg-indigo-600 disabled:bg-slate-300 text-white text-xs font-black"
                            >
                                {isRecovering
                                    ? (language === 'ko' ? '복구 중...' : language === 'ja' ? '復元中...' : 'Recovering...')
                                    : (language === 'ko' ? '복구' : language === 'ja' ? '復元' : 'Recover')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

const App: React.FC = () => (
    <LanguageProvider>
        <AppContent />
    </LanguageProvider>
);

export default App;
