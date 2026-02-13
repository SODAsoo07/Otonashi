import React, { useState } from 'react';
import { Plus, RefreshCw, FileAudio, Download, Edit2, X } from 'lucide-react';
import { AudioUtils } from '../utils/AudioUtils';

export const FileRack = ({ files, activeFileId, setActiveFileId, handleFileUpload, removeFile, renameFile, isSaving }) => {
    const [editingId, setEditingId] = useState(null);
    const [tempName, setTempName] = useState("");
    const submitRename = (id) => { if(tempName.trim()) renameFile(id, tempName.trim()); setEditingId(null); };

    return (
      <aside className="w-64 bg-white/40 border-r border-slate-300 flex flex-col shrink-0 font-sans z-20 h-full">
        <div className="p-4 border-b border-slate-300 flex justify-between items-center bg-slate-200/50 font-bold">
          <span className="text-sm text-slate-600 uppercase tracking-wider flex items-center gap-2">파일 보관함 {isSaving && <RefreshCw size={10} className="animate-spin text-blue-500" />}</span>
          <label className="cursor-pointer hover:bg-slate-300 p-1 rounded transition text-[#209ad6]"><Plus className="w-4 h-4"/><input type="file" multiple accept="audio/*" className="hidden" onChange={handleFileUpload}/></label>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
          {files.map(f => (
            <div key={f.id} draggable onDragStart={(e) => e.dataTransfer.setData("fileId", f.id)}
                 className={`p-2.5 rounded-lg cursor-grab active:cursor-grabbing text-sm flex items-center gap-2 transition border group ${activeFileId === f.id ? 'bg-[#a3cef0]/30 border-[#209ad6]/40 text-[#1f1e1d]' : 'bg-transparent border-transparent text-slate-500 hover:bg-slate-200'}`}>
              <div className="flex-1 flex items-center gap-2 overflow-hidden font-bold" onClick={() => setActiveFileId(f.id)}>
                <FileAudio className={`w-5 h-5 flex-shrink-0 ${activeFileId===f.id?'text-[#209ad6]':'text-slate-400'}`}/> 
                {editingId === f.id ? <input autoFocus className="bg-white border border-blue-400 rounded px-1 w-full outline-none" value={tempName} onChange={e => setTempName(e.target.value)} onBlur={() => submitRename(f.id)} onKeyDown={e => e.key === 'Enter' && submitRename(f.id)} /> : <span className="truncate">{f.name}</span>}
              </div>
              <div className="flex opacity-0 group-hover:opacity-100 transition-opacity gap-1">
                  <button onClick={() => AudioUtils.downloadWav(f.buffer, f.name)} className="p-1 hover:text-[#209ad6]"><Download size={14}/></button>
                  <button onClick={() => { setEditingId(f.id); setTempName(f.name); }} className="p-1 hover:text-[#209ad6]"><Edit2 size={14}/></button>
                  <button onClick={(e) => { e.stopPropagation(); if(window.confirm("정말 삭제하시겠습니까?")) removeFile(f.id); }} className="p-1 hover:text-red-500"><X size={14}/></button>
              </div>
            </div>
          ))}
          {files.length === 0 && <div className="text-center py-10 opacity-30 text-xs font-bold text-slate-400 uppercase">보관함이 비었습니다</div>}
        </div>
      </aside>
    );
};
