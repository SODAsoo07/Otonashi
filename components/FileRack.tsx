
import React, { useState } from 'react';
import { Plus, FileAudio, Edit2, X, FolderOpen, ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { AudioFile } from '../types';
import { AudioUtils } from '../utils/audioUtils';
import { useLanguage } from '../contexts/LanguageContext';

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
}

const FileRack: React.FC<FileRackProps> = ({ 
  files, 
  activeFileId, 
  setActiveFileId, 
  handleFileUpload, 
  handleFilesDrop,
  removeFile, 
  renameFile, 
  isOpen, 
  toggleOpen 
}) => {
  const { t } = useLanguage();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [tempName, setTempName] = useState("");
  const [isDragging, setIsDragging] = useState(false);

  const submitRename = (id: string) => { 
    if(tempName.trim()) renameFile(id, tempName.trim()); 
    setEditingId(null); 
  };

  const handleDelete = (e: React.MouseEvent, id: string) => { 
    e.stopPropagation(); 
    if(window.confirm(t.common.delete + "?")) removeFile(id); 
  };

  const handleDownload = (e: React.MouseEvent, file: AudioFile) => {
    e.stopPropagation();
    AudioUtils.downloadWav(file.buffer, file.name);
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
        <aside className="w-12 bg-white/60 border-r border-slate-300 flex flex-col shrink-0 items-center py-4 gap-4 transition-all duration-300 ease-in-out font-sans">
            <button 
                onClick={toggleOpen}
                className="p-1.5 hover:bg-slate-200 rounded-lg text-slate-400 transition-colors mb-2"
                title={t.fileRack.expand}
            >
                <ChevronRight size={20}/>
            </button>
            <label className="cursor-pointer hover:bg-slate-200 p-2 rounded-lg transition text-[#209ad6]" title={t.fileRack.uploadTip}>
                <Plus size={20}/>
                <input type="file" multiple accept=".wav,.mp3,audio/*" className="hidden" onChange={handleFileUpload}/>
            </label>
            <div className="w-px h-full bg-slate-200"></div>
            <FolderOpen className="text-slate-300" size={20}/>
            <div className="flex-1 flex flex-col items-center gap-2 overflow-y-auto custom-scrollbar px-1">
                {files.map(f => (
                    <button 
                        key={f.id} 
                        onClick={() => setActiveFileId(f.id)}
                        className={`p-2 rounded-lg transition-all ${activeFileId === f.id ? 'bg-blue-100 text-blue-600 shadow-sm' : 'text-slate-400 hover:bg-slate-100'}`}
                        title={f.name}
                    >
                        <FileAudio size={18}/>
                    </button>
                ))}
            </div>
        </aside>
    );
  }

  return (
    <aside 
      className={`w-64 bg-white/40 border-r border-slate-300 flex flex-col shrink-0 transition-all duration-300 ease-in-out font-sans relative ${isDragging ? 'bg-blue-50/80 border-dashed border-2 border-blue-400' : ''}`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <div className="p-4 border-b border-slate-300 flex justify-between items-center bg-slate-200/50">
        <div className="flex items-center gap-2">
            <button 
                onClick={toggleOpen}
                className="p-1 hover:bg-slate-300 rounded transition text-slate-500"
                title={t.fileRack.collapse}
            >
                <ChevronLeft size={16}/>
            </button>
            <span className="text-xs font-bold text-slate-600 uppercase tracking-wider font-black">{t.fileRack.title}</span>
        </div>
        <label className="cursor-pointer hover:bg-slate-300 p-1 rounded transition text-[#209ad6]">
          <Plus className="w-4 h-4"/>
          <input type="file" multiple accept=".wav,.mp3,audio/*" className="hidden" onChange={handleFileUpload}/>
        </label>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1 font-sans custom-scrollbar">
        {files.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-3 p-4 text-center">
            <FolderOpen size={32} className="opacity-20"/>
            <p className="text-[10px] font-bold leading-relaxed whitespace-pre-line">{t.fileRack.dropHint}</p>
          </div>
        )}
        {files.map(f => (
          <div 
            key={f.id} 
            draggable 
            onDragStart={(e) => e.dataTransfer.setData("fileId", f.id)} 
            className={`p-2.5 rounded-lg cursor-grab active:cursor-grabbing text-xs flex items-center gap-2 transition border group ${activeFileId === f.id ? 'bg-[#a3cef0]/30 border-[#209ad6]/40 text-[#1f1e1d]' : 'bg-transparent border-transparent text-slate-500 hover:bg-slate-200'}`}
          >
            <div className="flex-1 flex flex-col overflow-hidden" onClick={() => setActiveFileId(f.id)}>
               <div className="flex items-center gap-2">
                  <FileAudio className={`w-4 h-4 flex-shrink-0 ${activeFileId===f.id?'text-[#209ad6]':'text-slate-400'}`}/> 
                  {editingId === f.id ? ( 
                    <input 
                      autoFocus 
                      className="bg-white border border-blue-400 rounded px-1 w-full outline-none font-sans" 
                      value={tempName} 
                      onChange={e => setTempName(e.target.value)} 
                      onBlur={() => submitRename(f.id)} 
                      onKeyDown={e => e.key === 'Enter' && submitRename(f.id)} 
                    /> 
                  ) : ( 
                    <span className="truncate font-medium">{f.name}</span> 
                  )}
               </div>
               <span className="text-[9px] text-slate-400 pl-6">{f.buffer.duration.toFixed(2)}s | {f.buffer.sampleRate}Hz</span>
            </div>
            <div className="flex opacity-0 group-hover:opacity-100 transition-opacity gap-1">
              <button onClick={(e) => handleDownload(e, f)} title={t.common.download} className="p-1 hover:text-green-600"><Download size={12}/></button>
              <button onClick={() => { setEditingId(f.id); setTempName(f.name); }} className="p-1 hover:text-[#209ad6]"><Edit2 size={12}/></button>
              <button onClick={(e) => handleDelete(e, f.id)} className="p-1 hover:text-red-500"><X size={12}/></button>
            </div>
          </div>
        ))}
      </div>
      {isDragging && (
        <div className="absolute inset-0 z-50 pointer-events-none flex items-center justify-center bg-[#209ad6]/10 backdrop-blur-[1px]">
          <div className="bg-white px-4 py-2 rounded-full shadow-lg border border-blue-200 flex items-center gap-2 text-blue-600 font-bold text-xs animate-bounce">
            <Plus size={16}/> {t.fileRack.uploadTip}
          </div>
        </div>
      )}
    </aside>
  );
};

export default FileRack;
