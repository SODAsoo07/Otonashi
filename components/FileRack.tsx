import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, Download, Edit2, FileAudio, FolderOpen, Plus, X } from 'lucide-react';
import JSZip from 'jszip';
import { useLanguage } from '../contexts/LanguageContext';
import { AudioFile } from '../types';
import { AudioUtils } from '../utils/audioUtils';

interface FileRackProps {
  files: AudioFile[];
  activeFileId: string | null;
  setActiveFileId: (id: string) => void;
  handleFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleFilesDrop: (files: File[]) => void;
  removeFile: (id: string) => void;
  renameFile: (id: string, newName: string) => void;
  isOpen: boolean;
  toggleOpen: () => void;
  width: number;
}

const FILE_RACK_TEXT = {
  ko: {
    confirmDelete: '파일을 삭제하시겠습니까?',
    expand: '보관함 펼치기',
    collapse: '보관함 접기',
    upload: '파일 업로드',
    title: '파일 보관함',
    emptyLine1: '파일을 여기로 드래그하거나',
    emptyLine2: '상단의 + 버튼으로 추가하세요',
    download: 'WAV 다운로드',
    rename: '이름 변경',
    delete: '삭제',
    dropOverlay: '파일을 놓아서 업로드',
  },
  en: {
    confirmDelete: 'Delete this file?',
    expand: 'Expand rack',
    collapse: 'Collapse rack',
    upload: 'Upload file',
    title: 'File Rack',
    emptyLine1: 'Drag files here',
    emptyLine2: 'or use the + button above',
    download: 'Download WAV',
    rename: 'Rename',
    delete: 'Delete',
    dropOverlay: 'Drop files to upload',
  },
  ja: {
    confirmDelete: 'このファイルを削除しますか？',
    expand: 'ラックを開く',
    collapse: 'ラックを閉じる',
    upload: 'ファイルをアップロード',
    title: 'ファイルラック',
    emptyLine1: 'ここにファイルをドラッグするか',
    emptyLine2: '上の + ボタンで追加してください',
    download: 'WAV を保存',
    rename: '名前を変更',
    delete: '削除',
    dropOverlay: 'ドロップしてアップロード',
  },
} as const;

const FileRack: React.FC<FileRackProps> = ({
  files,
  activeFileId,
  setActiveFileId,
  handleFileUpload,
  handleFilesDrop,
  removeFile,
  renameFile,
  isOpen,
  toggleOpen,
  width,
}) => {
  const { language } = useLanguage();
  const text = FILE_RACK_TEXT[language];
  const zipDownloadLabel = language === 'ko' ? 'ZIP 일괄 다운로드' : language === 'ja' ? 'ZIP 一括保存' : 'Download ZIP';
  const zipPreparingLabel = language === 'ko' ? 'ZIP 생성 중...' : language === 'ja' ? 'ZIP を生成中...' : 'Preparing ZIP...';
  const [editingId, setEditingId] = useState<string | null>(null);
  const [tempName, setTempName] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [isZipExporting, setIsZipExporting] = useState(false);

  const submitRename = (id: string) => {
    if (tempName.trim()) {
      renameFile(id, tempName.trim());
    }
    setEditingId(null);
  };

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (window.confirm(text.confirmDelete)) {
      removeFile(id);
    }
  };

  const handleDownload = (e: React.MouseEvent, file: AudioFile) => {
    e.stopPropagation();
    const fileName = file.name.endsWith('.wav') ? file.name : `${file.name}.wav`;
    AudioUtils.downloadWav(file.buffer, fileName);
  };

  const handleDownloadAllZip = async () => {
    if (files.length === 0 || isZipExporting) return;
    setIsZipExporting(true);
    try {
      const zip = new JSZip();
      const usedNames = new Set<string>();
      const makeUniqueName = (rawName: string) => {
        let candidate = rawName;
        let index = 1;
        while (usedNames.has(candidate)) {
          const dot = rawName.lastIndexOf('.');
          if (dot > 0) candidate = `${rawName.slice(0, dot)}_${index}${rawName.slice(dot)}`;
          else candidate = `${rawName}_${index}`;
          index += 1;
        }
        usedNames.add(candidate);
        return candidate;
      };

      for (const file of files) {
        const wavName = makeUniqueName(file.name.endsWith('.wav') ? file.name : `${file.name}.wav`);
        const wavBlob = AudioUtils.bufferToWavBlob(file.buffer);
        zip.file(wavName, await wavBlob.arrayBuffer());
      }

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `otonashi_rack_${Date.now()}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setIsZipExporting(false);
    }
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = () => {
    setIsDragging(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFilesDrop(Array.from(e.dataTransfer.files));
    }
  };

  if (!isOpen) {
    return (
      <aside className="bg-white/60 border-r border-slate-300 flex flex-col shrink-0 items-center py-4 gap-4 transition-all duration-300 ease-in-out font-sans overflow-hidden" style={{ width: '48px' }}>
        <button onClick={toggleOpen} className="p-1.5 hover:bg-slate-200 rounded-lg text-slate-400 transition-colors mb-2" title={text.expand}>
          <ChevronRight size={20} />
        </button>
        <button
          onClick={handleDownloadAllZip}
          disabled={files.length === 0 || isZipExporting}
          className="p-2 hover:bg-slate-200 rounded-lg transition text-slate-500 disabled:opacity-40"
          title={isZipExporting ? zipPreparingLabel : zipDownloadLabel}
        >
          <Download size={20} />
        </button>
        <label className="cursor-pointer hover:bg-slate-200 p-2 rounded-lg transition text-[#209ad6]" title={text.upload}>
          <Plus size={20} />
          <input type="file" multiple accept=".wav,.mp3,audio/*" className="hidden" onChange={handleFileUpload} />
        </label>
        <div className="w-px h-full bg-slate-200" />
        <FolderOpen className="text-slate-300" size={20} />
        <div className="flex-1 flex flex-col items-center gap-2 overflow-y-auto custom-scrollbar px-1">
          {files.map(file => (
            <button key={file.id} onClick={() => setActiveFileId(file.id)} className={`p-2 rounded-lg transition-all ${activeFileId === file.id ? 'bg-blue-100 text-blue-600 shadow-sm' : 'text-slate-400 hover:bg-slate-100'}`} title={file.name}>
              <FileAudio size={18} />
            </button>
          ))}
        </div>
      </aside>
    );
  }

  return (
    <aside
      className={`bg-white/40 border-r border-slate-300 flex flex-col shrink-0 transition-none font-sans relative overflow-hidden ${isDragging ? 'bg-blue-50/80 border-dashed border-2 border-blue-400' : ''}`}
      style={{ width: `${width}px` }}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <div className="p-4 border-b border-slate-300 flex justify-between items-center bg-slate-200/50 shrink-0">
        <div className="flex items-center gap-2">
          <button
            onClick={handleDownloadAllZip}
            disabled={files.length === 0 || isZipExporting}
            className="p-1 hover:bg-slate-300 rounded transition text-slate-500 disabled:opacity-40"
            title={isZipExporting ? zipPreparingLabel : zipDownloadLabel}
          >
            <Download size={16} />
          </button>
          <button onClick={toggleOpen} className="p-1 hover:bg-slate-300 rounded transition text-slate-500" title={text.collapse}>
            <ChevronLeft size={16} />
          </button>
          <span className="text-xs font-bold text-slate-600 uppercase tracking-wider font-black truncate">{text.title}</span>
        </div>
        <label className="cursor-pointer hover:bg-slate-300 p-1 rounded transition text-[#209ad6]" title={text.upload}>
          <Plus className="w-4 h-4" />
          <input type="file" multiple accept=".wav,.mp3,audio/*" className="hidden" onChange={handleFileUpload} />
        </label>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1 font-sans custom-scrollbar">
        {files.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-3 p-4 text-center">
            <FolderOpen size={32} className="opacity-20" />
            <p className="text-[10px] font-bold leading-relaxed">
              {text.emptyLine1}
              <br />
              {text.emptyLine2}
            </p>
          </div>
        )}
        {files.map(file => (
          <div
            key={file.id}
            draggable
            onDragStart={e => e.dataTransfer.setData('fileId', file.id)}
            className={`p-2.5 rounded-lg cursor-grab active:cursor-grabbing text-xs flex items-center gap-2 transition border group ${activeFileId === file.id ? 'bg-[#a3cef0]/30 border-[#209ad6]/40 text-[#1f1e1d]' : 'bg-transparent border-transparent text-slate-500 hover:bg-slate-200'}`}
          >
            <div className="flex-1 flex flex-col overflow-hidden" onClick={() => setActiveFileId(file.id)}>
              <div className="flex items-center gap-2">
                <FileAudio className={`w-4 h-4 flex-shrink-0 ${activeFileId === file.id ? 'text-[#209ad6]' : 'text-slate-400'}`} />
                {editingId === file.id ? (
                  <input
                    autoFocus
                    className="bg-white border border-blue-400 rounded px-1 w-full outline-none font-sans"
                    value={tempName}
                    onChange={e => setTempName(e.target.value)}
                    onBlur={() => submitRename(file.id)}
                    onKeyDown={e => e.key === 'Enter' && submitRename(file.id)}
                  />
                ) : (
                  <span className="truncate font-medium">{file.name}</span>
                )}
              </div>
              <span className="text-[9px] text-slate-400 pl-6">{file.buffer.duration.toFixed(2)}s | {file.buffer.sampleRate}Hz</span>
            </div>
            <div className="flex opacity-0 group-hover:opacity-100 transition-opacity gap-1 shrink-0">
              <button onClick={e => handleDownload(e, file)} className="p-1 hover:text-green-600" title={text.download}>
                <Download size={12} />
              </button>
              <button onClick={() => { setEditingId(file.id); setTempName(file.name); }} className="p-1 hover:text-[#209ad6]" title={text.rename}>
                <Edit2 size={12} />
              </button>
              <button onClick={e => handleDelete(e, file.id)} className="p-1 hover:text-red-500" title={text.delete}>
                <X size={12} />
              </button>
            </div>
          </div>
        ))}
      </div>
      {isDragging && (
        <div className="absolute inset-0 z-50 pointer-events-none flex items-center justify-center bg-[#209ad6]/10 backdrop-blur-[1px]">
          <div className="bg-white px-4 py-2 rounded-full shadow-lg border border-blue-200 flex items-center gap-2 text-blue-600 font-bold text-xs animate-bounce">
            <Plus size={16} /> {text.dropOverlay}
          </div>
        </div>
      )}
    </aside>
  );
};

export default FileRack;
