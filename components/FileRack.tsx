import React, { useState } from 'react';
import { Plus, FileAudio, Edit2, X } from 'lucide-react';
import { AudioFile } from '../types';

interface FileRackProps {
  files: AudioFile[];
  activeFileId: string | null;
  setActiveFileId: (id: string) => void;
  handleFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  removeFile: (id: string) => void;
  renameFile: (id: string, newName: string) => void;
}

const FileRack: React.FC<FileRackProps> = ({ files, activeFileId, setActiveFileId, handleFileUpload, removeFile, renameFile }) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [tempName, setTempName] = useState("");

  const submitRename = (id: string) => { 
    if(tempName.trim()) renameFile(id, tempName.trim()); 
    setEditingId(null); 
  };

  const handleDelete = (e: React.MouseEvent, id: string) => { 
    e.stopPropagation(); 
    if(window.confirm("파일을 삭제하시겠습니까?")) removeFile(id); 
  };

  return (
    <aside className="w-64 bg-white/40 border-r border-slate-300 flex flex-col shrink-0 font-sans">
      <div className="p-4 border-b border-slate-300 flex justify-between items-center bg-slate-200/50">
        <span className="text-xs font-bold text-slate-600 uppercase tracking-wider font-black">파일 보관함</span>
        <label className="cursor-pointer hover:bg-slate-300 p-1 rounded transition text-[#209ad6]">
          <Plus className="w-4 h-4"/>
          <input type="file" multiple accept=".wav,.mp3,audio/*" className="hidden" onChange={handleFileUpload}/>
        </label>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1 font-sans custom-scrollbar">
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
              <button onClick={() => { setEditingId(f.id); setTempName(f.name); }} className="p-1 hover:text-[#209ad6]"><Edit2 size={12}/></button>
              <button onClick={(e) => handleDelete(e, f.id)} className="p-1 hover:text-red-500"><X size={12}/></button>
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
};

export default FileRack;