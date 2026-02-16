
import React, { useState, useEffect } from 'react';
import { Lock, ArrowRight, Fingerprint, AlertCircle } from 'lucide-react';

// 환경 변수에서 액세스 코드를 가져옵니다.
// 소스 코드에 비밀번호를 노출하지 않으려면 Vercel 등의 배포 환경 설정에서
// 'VITE_ACCESS_CODE' 또는 'REACT_APP_ACCESS_CODE' 환경 변수를 설정하세요.
const getAccessCode = () => {
    try {
        // 1. Vite 환경 (import.meta.env)
        // @ts-ignore
        if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_ACCESS_CODE) {
            // @ts-ignore
            return import.meta.env.VITE_ACCESS_CODE;
        }
        // 2. CRA / Webpack / Next.js 환경 (process.env)
        if (typeof process !== 'undefined' && process.env) {
            return process.env.REACT_APP_ACCESS_CODE || process.env.NEXT_PUBLIC_ACCESS_CODE;
        }
    } catch (e) {
        // 환경 변수 접근 오류 무시
    }
    // 기본값 (환경 변수 미설정 시)
    return "otonashi-beta";
};

const ACCESS_CODE = getAccessCode();
const STORAGE_KEY = "otonashi_global_access";

const AuthOverlay: React.FC = () => {
    const [isLocked, setIsLocked] = useState(true);
    const [inputVal, setInputVal] = useState("");
    const [error, setError] = useState(false);
    const [shake, setShake] = useState(false);

    useEffect(() => {
        // 세션 스토리지 확인 (브라우저 닫기 전까지 유지)
        const hasAccess = sessionStorage.getItem(STORAGE_KEY);
        if (hasAccess === "true") {
            setIsLocked(false);
        }
    }, []);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (inputVal === ACCESS_CODE) {
            sessionStorage.setItem(STORAGE_KEY, "true");
            setIsLocked(false);
        } else {
            setError(true);
            setShake(true);
            setTimeout(() => setShake(false), 500);
            setInputVal("");
        }
    };

    if (!isLocked) return null;

    return (
        <div className="fixed inset-0 z-[9999] bg-[#1a1a1a] flex flex-col items-center justify-center font-sans select-none cursor-default">
            <div className={`w-full max-w-md px-8 py-10 flex flex-col items-center gap-6 transition-transform ${shake ? 'translate-x-[-5px]' : ''}`} style={shake ? { animation: 'shake 0.4s cubic-bezier(.36,.07,.19,.97) both' } : {}}>
                
                {/* Icon & Title */}
                <div className="flex flex-col items-center gap-4 text-center">
                    <div className="w-16 h-16 bg-[#262626] rounded-2xl flex items-center justify-center shadow-2xl border border-[#333]">
                        <Lock size={32} className="text-slate-400" />
                    </div>
                    <div className="space-y-2">
                        <h1 className="text-2xl font-black text-white tracking-tight">OTONASHI BETA</h1>
                        <p className="text-sm text-slate-400 font-medium leading-relaxed">
                            이 애플리케이션은 현재 비공개 테스트 중입니다.<br/>
                            전달받은 액세스 코드를 입력해주세요.
                        </p>
                    </div>
                </div>

                {/* Input Form */}
                <form onSubmit={handleSubmit} className="w-full flex flex-col gap-4 mt-4">
                    <div className="relative group">
                        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 transition-colors group-focus-within:text-blue-400">
                            <Fingerprint size={20} />
                        </div>
                        <input
                            type="password"
                            autoFocus
                            placeholder="Access Code"
                            value={inputVal}
                            onChange={(e) => { setInputVal(e.target.value); setError(false); }}
                            className={`w-full bg-[#0f0f0f] border-2 text-white px-12 py-4 rounded-xl outline-none font-bold text-lg placeholder:text-slate-600 transition-all
                                ${error 
                                    ? 'border-red-500/50 focus:border-red-500 shadow-[0_0_20px_rgba(239,68,68,0.2)]' 
                                    : 'border-[#333] focus:border-blue-500 shadow-inner focus:shadow-[0_0_20px_rgba(59,130,246,0.2)]'
                                }`}
                        />
                        <button 
                            type="submit"
                            className="absolute right-3 top-1/2 -translate-y-1/2 p-2 bg-[#333] hover:bg-blue-600 text-slate-300 hover:text-white rounded-lg transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                            disabled={!inputVal}
                        >
                            <ArrowRight size={20} />
                        </button>
                    </div>

                    {error && (
                        <div className="flex items-center justify-center gap-2 text-red-500 text-xs font-bold animate-in fade-in slide-in-from-top-1">
                            <AlertCircle size={14} />
                            올바르지 않은 코드입니다. 다시 시도해주세요.
                        </div>
                    )}
                </form>
            </div>

            {/* Background Style for Shake Animation */}
            <style>{`
                @keyframes shake {
                    10%, 90% { transform: translate3d(-1px, 0, 0); }
                    20%, 80% { transform: translate3d(2px, 0, 0); }
                    30%, 50%, 70% { transform: translate3d(-4px, 0, 0); }
                    40%, 60% { transform: translate3d(4px, 0, 0); }
                }
            `}</style>
        </div>
    );
};

export default AuthOverlay;
