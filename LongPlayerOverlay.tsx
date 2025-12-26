
import React, { useRef, useEffect, useState, useMemo } from 'react';
import { Video } from '../types.ts';
import { incrementViewsInDB } from '../supabaseClient.ts';
import { getDeterministicStats, formatBigNumber } from './MainContent.tsx';

interface LongPlayerOverlayProps {
  video: Video;
  allLongVideos: Video[];
  onClose: () => void;
  onLike: () => void;
  onDislike: () => void;
  onSave: () => void;
  onSwitchVideo: (v: Video) => void;
  isLiked: boolean;
  isDisliked: boolean;
  isSaved: boolean;
  onProgress: (p: number) => void;
}

const LongPlayerOverlay: React.FC<LongPlayerOverlayProps> = ({ 
  video, allLongVideos, onClose, onLike, onDislike, onSave, onSwitchVideo, isLiked, isDisliked, isSaved, onProgress 
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [isBuffering, setIsBuffering] = useState(true);
  const [isAutoPlay, setIsAutoPlay] = useState(true); 
  
  const stats = useMemo(() => getDeterministicStats(video.video_url), [video.video_url]);
  
  const suggestions = useMemo(() => {
    return allLongVideos.filter(v => (v.id || v.video_url) !== (video.id || video.video_url));
  }, [allLongVideos, video]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    
    setIsBuffering(true);
    v.preload = "auto";
    incrementViewsInDB(video.id || video.video_url);
    v.muted = isMuted;
    v.play().catch(() => { v.muted = true; v.play().catch(() => {}); });

    const handleEnd = () => { 
      if (isAutoPlay && suggestions.length > 0) {
        onSwitchVideo(suggestions[0]);
      } else {
        v.currentTime = 0;
        v.play().catch(() => {});
      }
    };

    v.addEventListener('ended', handleEnd);
    v.addEventListener('waiting', () => setIsBuffering(true));
    v.addEventListener('playing', () => setIsBuffering(false));
    v.addEventListener('timeupdate', () => {
      if (v.duration) onProgress(v.currentTime / v.duration);
    });

    return () => v.removeEventListener('ended', handleEnd);
  }, [video, suggestions, onSwitchVideo, isMuted, isAutoPlay, onProgress]);

  const handleStop = () => {
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
      setIsPaused(true);
      if (navigator.vibrate) navigator.vibrate(100);
    }
  };

  const handleTogglePlay = () => {
    if (videoRef.current) {
      if (videoRef.current.paused) {
        videoRef.current.play();
        setIsPaused(false);
      } else {
        videoRef.current.pause();
        setIsPaused(true);
      }
    }
  };

  return (
    <div className={`fixed inset-0 bg-black z-[500] flex flex-col overflow-hidden transition-all duration-700`} dir="rtl">
      
      <div 
        className={`relative bg-black flex flex-col transition-all duration-700 ease-in-out ${
          isFullScreen 
          ? 'h-full w-full fixed inset-0 z-[600] flex items-center justify-center' 
          : 'h-[35dvh]'
        }`}
      >
        <div className={`w-full h-full transition-transform duration-700 ${isFullScreen && video.type === 'long' ? 'rotate-90 scale-[1.3] md:rotate-0 md:scale-100' : ''}`}>
          <video 
            ref={videoRef} src={video.video_url}
            className={`w-full h-full object-contain pointer-events-auto`}
            playsInline autoPlay
            onClick={handleTogglePlay}
          />
        </div>

        <div className="absolute top-6 left-6 z-[700]">
          <button onClick={onClose} className="p-3 bg-black/50 backdrop-blur-xl rounded-2xl border-2 border-red-500 text-red-500 shadow-[0_0_20px_red] active:scale-75 transition-all">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3"><path d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {isBuffering && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/20 z-[650]">
             <div className="w-14 h-14 border-4 border-red-600/20 border-t-red-600 rounded-full animate-spin shadow-[0_0_20px_red]"></div>
          </div>
        )}
      </div>

      {!isFullScreen && (
        <div className="flex-1 overflow-y-auto bg-[#020202] animate-in slide-in-from-bottom-5 duration-700 flex flex-col">
          
          <div className="flex items-center justify-around py-6 border-b border-white/5 bg-neutral-900/40 backdrop-blur-xl shrink-0">
            {!isDisliked && (
              <button onClick={onLike} className={`flex flex-col items-center gap-1 transition-all active:scale-150 ${isLiked ? 'text-pink-500 drop-shadow-[0_0_20px_#ec4899]' : 'text-gray-600 hover:text-pink-400'}`}>
                <div className={`p-4 rounded-2xl border-2 transition-all duration-300 ${isLiked ? 'bg-pink-500/20 border-pink-500 shadow-[0_0_30px_rgba(236,72,153,0.6)]' : 'border-transparent bg-white/5'}`}>
                  <svg className="w-7 h-7" fill={isLiked ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3zM7 22H4a2 2 0 01-2-2v-7a2 2 0 012-2h3"/></svg>
                </div>
                <span className="text-[10px] font-black uppercase tracking-widest mt-1">Like</span>
              </button>
            )}

            {!isLiked && (
              <button onClick={onDislike} className={`flex flex-col items-center gap-1 transition-all active:scale-150 ${isDisliked ? 'text-cyan-500 drop-shadow-[0_0_20px_#06b6d4]' : 'text-gray-600 hover:text-cyan-400'}`}>
                <div className={`p-4 rounded-2xl border-2 transition-all duration-300 ${isDisliked ? 'bg-cyan-500/20 border-cyan-500 shadow-[0_0_30px_rgba(6,182,212,0.6)]' : 'border-transparent bg-white/5'}`}>
                  <svg className="w-7 h-7 rotate-180" fill={isDisliked ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3zM7 22H4a2 2 0 01-2-2v-7a2 2 0 012-2h3"/></svg>
                </div>
                <span className="text-[10px] font-black uppercase tracking-widest mt-1">Ignore</span>
              </button>
            )}

            <button onClick={handleStop} className="flex flex-col items-center gap-1 transition-all active:scale-150 text-orange-500 drop-shadow-[0_0_25px_#f97316] hover:text-orange-400">
              <div className="p-4 rounded-2xl border-2 border-orange-500 bg-orange-500/20 shadow-[0_0_35px_rgba(249,115,22,0.7)]">
                <svg className="w-7 h-7" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
              </div>
              <span className="text-[10px] font-black uppercase tracking-widest mt-1">Stop</span>
            </button>

            <button onClick={() => setIsAutoPlay(!isAutoPlay)} className={`flex flex-col items-center gap-1 transition-all active:scale-150 ${isAutoPlay ? 'text-green-500 drop-shadow-[0_0_30px_green]' : 'text-blue-500 drop-shadow-[0_0_20px_blue]'}`}>
              <div className={`p-4 rounded-2xl border-2 transition-all duration-300 ${isAutoPlay ? 'bg-green-500/20 border-green-500 shadow-[0_0_35px_green] animate-pulse' : 'bg-blue-500/20 border-blue-500 shadow-[0_0_25px_blue]'}`}>
                <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3"><path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
              </div>
              <span className="text-[10px] font-black uppercase tracking-widest mt-1">Auto</span>
            </button>

            <button onClick={onSave} className={`flex flex-col items-center gap-1 transition-all active:scale-150 ${isSaved ? 'text-yellow-400 drop-shadow-[0_0_20px_#facc15]' : 'text-gray-600 hover:text-yellow-300'}`}>
              <div className={`p-4 rounded-2xl border-2 transition-all duration-300 ${isSaved ? 'bg-yellow-400/20 border-yellow-400 shadow-[0_0_30px_rgba(250,204,21,0.6)]' : 'border-transparent bg-white/5'}`}>
                <svg className="w-7 h-7" fill={isSaved ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"/></svg>
              </div>
              <span className="text-[10px] font-black uppercase tracking-widest mt-1">Save</span>
            </button>

            <button onClick={() => setIsFullScreen(true)} className="flex flex-col items-center gap-1 transition-all active:scale-150 text-purple-500 drop-shadow-[0_0_20px_#a855f7] hover:text-purple-400">
              <div className="p-4 rounded-2xl border-2 border-purple-500 bg-purple-500/20 shadow-[0_0_30px_rgba(168,85,247,0.5)]">
                <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3"><path d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5"/></svg>
              </div>
              <span className="text-[10px] font-black uppercase tracking-widest mt-1">Full</span>
            </button>
          </div>

          <div className="bg-black/80 border-y border-white/5 py-4 overflow-hidden relative group shrink-0">
             <div className="absolute left-0 top-0 bottom-0 w-20 bg-gradient-to-r from-black to-transparent z-10 pointer-events-none"></div>
             <div className="absolute right-0 top-0 bottom-0 w-20 bg-gradient-to-l from-black to-transparent z-10 pointer-events-none"></div>
             
             <div className="flex animate-marquee-r-to-l whitespace-nowrap gap-6 px-4">
                {(suggestions.length > 3 ? [...suggestions, ...suggestions] : suggestions).map((s, idx) => (
                   <div 
                    key={`${s.id}-${idx}`} 
                    onClick={() => onSwitchVideo(s)}
                    className="inline-flex flex-col gap-2 w-48 shrink-0 cursor-pointer active:scale-95 transition-all group/item"
                   >
                      <div className="aspect-video rounded-2xl overflow-hidden border-2 border-white/5 group-hover/item:border-red-600/50 transition-all shadow-lg">
                        <video src={s.video_url} className="w-full h-full object-cover opacity-60 group-hover/item:opacity-100 transition-opacity" />
                      </div>
                      <p className="text-[10px] font-black text-gray-400 group-hover/item:text-white truncate text-center uppercase tracking-tighter">
                        {s.title}
                      </p>
                   </div>
                ))}
             </div>
          </div>

          <div className="p-8 space-y-6 flex-grow">
            <div className="flex flex-col gap-4">
              <div className="bg-gradient-to-r from-red-600 to-pink-600 text-white text-[11px] font-black px-6 py-2 rounded-full self-start uppercase shadow-[0_0_20px_rgba(220,38,38,0.7)] animate-pulse">
                {video.category}
              </div>
              <h1 className="text-3xl font-black text-white leading-tight drop-shadow-[0_4px_8px_black]">
                {video.title}
              </h1>
              <div className="flex items-center gap-8 text-gray-500 text-[14px] font-black">
                 <span className="flex items-center gap-2 text-cyan-400 drop-shadow-[0_0_5px_rgba(6,182,212,0.5)]">
                   <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg> 
                   {formatBigNumber(stats.views)} شاهدوا هذا
                 </span>
              </div>
            </div>

            <div className="h-[2px] bg-gradient-to-r from-transparent via-white/10 to-transparent"></div>

            <div className="space-y-6 pt-4">
               <h3 className="text-sm font-black text-white uppercase tracking-[0.3em] flex items-center gap-4">
                 <span className="w-3 h-3 bg-pink-500 rounded-full shadow-[0_0_15px_#ec4899] animate-ping"></span> 
                 Coming Horrors
               </h3>
               <div className="flex flex-col gap-6">
                 {suggestions.slice(0, 5).map(s => (
                   <div key={s.id} onClick={() => onSwitchVideo(s)} className="flex gap-5 group cursor-pointer active:scale-95 transition-all">
                      <div className="w-32 h-20 rounded-2xl overflow-hidden bg-neutral-900 shrink-0 border-2 border-white/5 relative shadow-2xl group-hover:border-pink-500/50 transition-all duration-500">
                         <video src={s.video_url} className="w-full h-full object-cover opacity-50 group-hover:opacity-100 scale-110 group-hover:scale-100 transition-transform duration-700" />
                         <div className="absolute inset-0 bg-gradient-to-t from-black/90 to-transparent"></div>
                      </div>
                      <div className="flex flex-col justify-center gap-1">
                         <h4 className="text-[15px] font-black text-white line-clamp-2 leading-snug group-hover:text-pink-400 transition-colors">{s.title}</h4>
                         <span className="text-[10px] font-bold text-cyan-500 uppercase tracking-widest">{s.category}</span>
                      </div>
                   </div>
                 ))}
               </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LongPlayerOverlay;
