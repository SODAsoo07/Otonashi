import React, { useState } from 'react';
import { Plus, RefreshCw, FileAudio, Download, Edit2, Trash2, X, Check } from 'lucide-react';
import * as AudioUtils from '../utils/AudioUtils'; // 이 부분이 수정되었습니다.

export default function FileRack({ files, activeFileId, onSelectFile, onDeleteFile, onUpload }) {
  const [editingId, setEditingId] = useState(null);
  const [newName, setNewName] = useState("");

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const arrayBuffer = await file.arrayBuffer();
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

    onUpload({
      id: `file_${Date.now()}`,
      name: file.name,
      buffer: audioBuffer,
      lastModified: Date.now()
    });
  };

  return (
    <div className="flex flex-col h-full bg-slate-900/50 text-slate-300">
      <div className="p-4 border-b border-slate-800 flex justify-between items-center">
        <span className="text-xs font-bold tracking-widest text-slate-500">LIBRARY</span>
        <label className="cursor-pointer p-1 hover:bg-blue-500/20 rounded-full transition-colors">
          <Plus size={18} className="text-blue-400" />
          <input type="file" className="hidden" accept="audio/*" onChange={handleFileChange} />
        </label>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {files.length === 0 && (
          <div className="text-center py-10 text-slate-600 text-xs">
            파일을 업로드하세요.
          </div>
        )}
        {files.map((file) => (
          <div
            key={file.id}
            onClick={() => onSelectFile(file.id)}
            className={`group relative p-3 rounded-lg cursor-pointer transition-all ${
              activeFileId === file.id 
                ? 'bg-blue-600/20 border border-blue-500/50 text-white' 
                : 'hover:bg-slate-800/50 border border-transparent'
            }`}
          >
            <div className="flex items-center gap-3">
              <FileAudio size={16} className={activeFileId === file.id ? "text-blue-400" : "text-slate-500"} />
              <div className="flex-1 min-w-0">
                {editingId === file.id ? (
                  <input
                    autoFocus
                    className="bg-slate-800 text-xs w-full px-1 outline-none border-b border-blue-500"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onBlur={() => setEditingId(null)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        file.name = newName; // 실제로는 handleFileEdit을 통해야 하지만 우선 반영
                        setEditingId(null);
                      }
                    }}
                  />
                ) : (
                  <p className="text-xs truncate font-medium">{file.name}</p>
                )}
                <p className="text-[10px] text-slate-500 mt-0.5">
                  {(file.buffer.duration).toFixed(2)}s | {file.buffer.sampleRate}Hz
                </p>
              </div>
            </div>

            {/* 호버 시 나타나는 액션 버튼들 */}
            <div className="absolute right-2 top-1/2 -translate-y-1/2 hidden group-hover:flex items-center gap-1">
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  AudioUtils.downloadWav(file.buffer, file.name);
                }}
                className="p-1 hover:bg-slate-700 rounded"
              >
                <Download size={14} />
              </button>
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteFile(file.id);
                }}
                className="p-1 hover:bg-red-900/40 text-red-400 rounded"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
