
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Video, UserInteractions } from './types';
import { getDeterministicStats, formatBigNumber } from './MainContent';

interface ShortsPlayerOverlayProps {
  initialVideo: Video;
  videoList: Video[];
  interactions: UserInteractions;
  onClose: () => void;
  onLike: (id: string) => void;
  onDislike: (id: string) => void;
  onSave: (id: string) => void;
  onProgress: (id: string, progress: number) => void;
}

const ShortsPlayerOverlay: React.FC<ShortsPlayerOverlayProps> = ({ 
  initialVideo, videoList, interactions, onClose, onLike, onDislike, onSave, onProgress
}) => {
  const [currentIndex, setCurrentIndex] = useState(() => {
    const idx = videoList.findIndex(v => v.id === initialVideo.id);
    return idx >= 0 ? idx : 0;
  });
  
  // التشغيل التلقائي يبدأ مفعل (أخضر) كحالة افتراضية
  const [isAutoPlay, setIsAutoPlay] = useState(true); 
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRefs = useRef<{ [key: number]: HTMLVideoElement | null }>({});
  const [isBuffering, setIsBuffering] = useState(true);

  useEffect(() => {
    if (containerRef.current) {
      const height = containerRef.current.clientHeight;
      containerRef.current.scrollTop = currentIndex * height;
    }
  }, []);

  useEffect(() => {
    const vid = videoRefs.current[currentIndex];
    if (vid) {
      setIsBuffering(true);
      vid.preload = "auto";
      const playPromise = vid.play();
      if (playPromise !== undefined) {
        playPromise.catch(() => {
          vid.muted = true;
          vid.play().catch(() => {});
        });
      }
    }
    
    // تحميل مسبق للفيديو التالي في الخلفية
    Object.keys(videoRefs.current).forEach((key) => {
      const idx = parseInt(key);
      const otherVid = videoRefs.current[idx];
      if (otherVid && idx !== currentIndex) {
        otherVid.pause();
        if (Math.abs(idx - currentIndex) <= 1) {
          otherVid.preload = "auto";
        }
      }
    });
  }, [currentIndex]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const height = e.currentTarget.clientHeight;
    if (height === 0) return;
    const index = Math.round(e.currentTarget.scrollTop / height);
    if (index !== currentIndex && index >= 0 && index < videoList.length) {
      setCurrentIndex(index);
    }
  };

  const handleAction = (type: string, id: string) => {
    if (navigator.vibrate) navigator.vibrate(50);
    if (type === 'like') onLike(id);
    if (type === 'dislike') onDislike(id);
    if (type === 'save') onSave(id);
  };

  const playNextSmartly = useCallback(() => {
    if (videoList.length <= 1) return;
    const pool: number[] = [];
    videoList.forEach((v, idx) => {
      if (idx === currentIndex) return;
      pool.push(idx);
      if (interactions.likedIds.includes(v.id)) {
        pool.push(idx, idx, idx); 
      }
    });
    const randomIdx = pool[Math.floor(Math.random() * pool.length)];
    if (containerRef.current) {
      const height = containerRef.current.clientHeight;
      containerRef.current.scrollTo({
        top: randomIdx * height,
        behavior: 'smooth'
      });
    }
  }, [currentIndex, videoList, interactions.likedIds]);

  const handleVideoEnd = () => {
    if (isAutoPlay) {
      playNextSmartly();
    } else {
      const vid = videoRefs.current[currentIndex];
      if (vid) {
        vid.currentTime = 0;
        vid.play().catch(() => {});
      }
    }
  };

  return (
    <div className="fixed inset-0 bg-black z-[500] flex flex-col overflow-hidden">
      {/* وحدة التحكم العلوية اليسرى */}
      <div className="absolute top-10 left-6 z-[600] flex flex-col gap-4">
        <button onClick={onClose} className="p-4 rounded-2xl bg-black/40 backdrop-blur-md text-red-600 border border-red-600 shadow-[0_0_20px_red] active:scale-75 transition-all">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="4"><path d="M6 18L18 6M6 6l12 12"/></svg>
        </button>

        <button 
          onClick={() => {
            setIsAutoPlay(!isAutoPlay);
            if (navigator.vibrate) navigator.vibrate(70);
          }}
          className={`px-3 py-2 rounded-xl text-[10px] font-black transition-all duration-500 border-2 uppercase tracking-tighter ${
            isAutoPlay 
            ? 'bg-green-600/20 border-green-500 text-green-500 shadow-[0_0_25px_green] animate-pulse' 
            : 'bg-blue-600/20 border-blue-500 text-blue-500 shadow-[0_0_20px_blue]'
          }`}
        >
          {isAutoPlay ? 'Auto ON' : 'Auto OFF'}
        </button>
      </div>

      <div 
        ref={containerRef}
        onScroll={handleScroll} 
        className="flex-grow overflow-y-scroll snap-y snap-mandatory scrollbar-hide h-full w-full"
      >
        {videoList.map((video, idx) => {
          const stats = getDeterministicStats(video.video_url);
          const isLiked = interactions.likedIds.includes(video.id);
          const isDisliked = interactions.dislikedIds.includes(video.id);
          const isSaved = interactions.savedIds.includes(video.id);
          const isActive = idx === currentIndex;

          return (
            <div key={`${video.id}-${idx}`} className="h-full w-full snap-start relative bg-black">
              {isActive && isBuffering && (
                <div className="absolute inset-0 z-50 bg-black/20 backdrop-blur-[2px] pointer-events-none flex items-center justify-center">
                   <div className="w-10 h-10 border-4 border-red-600/20 border-t-red-600 rounded-full animate-spin"></div>
                </div>
              )}
              
              <video 
                  ref={el => { videoRefs.current[idx] = el; }}
                  src={video.video_url} 
                  poster={video.poster_url}
                  className={`h-full w-full object-cover relative z-10 transition-opacity duration-500 ${isActive && isBuffering ? 'opacity-50' : 'opacity-100'}`}
                  playsInline loop={false} 
                  preload={isActive ? "auto" : "metadata"}
                  onWaiting={() => isActive && setIsBuffering(true)}
                  onPlaying={() => isActive && setIsBuffering(false)}
                  onCanPlay={() => isActive && setIsBuffering(false)}
                  onEnded={handleVideoEnd}
                  onTimeUpdate={(e) => isActive && onProgress(video.id, e.currentTarget.currentTime / e.currentTarget.duration)}
              />
              
              <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/90 pointer-events-none z-20" />

              <div className="absolute bottom-28 left-6 flex flex-col items-center gap-6 z-40">
                <button onClick={() => handleAction('like', video.id)} className="flex flex-col items-center group">
                  <div className={`p-4 rounded-full transition-all duration-300 border-2 active:scale-150 ${isLiked ? 'bg-red-600 border-red-400 text-white shadow-[0_0_30px_red]' : 'bg-red-600/10 border-red-600 text-red-600 shadow-[0_0_15px_red]'}`}>
                    <svg className="w-6 h-6" fill={isLiked ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3zM7 22H4a2 2 0 01-2-2v-7a2 2 0 012-2h3"/></svg>
                  </div>
                  <span className="text-[10px] font-black text-white mt-1.5">{formatBigNumber(stats.likes)}</span>
                </button>

                <button onClick={() => handleAction('dislike', video.id)} className="flex flex-col items-center group">
                  <div className={`p-4 rounded-full transition-all duration-300 border-2 active:scale-150 ${isDisliked ? 'bg-blue-600 border-blue-400 text-white shadow-[0_0_30px_blue]' : 'bg-blue-600/10 border-blue-600 text-blue-600 shadow-[0_0_15px_blue]'}`}>
                    <svg className="w-6 h-6 rotate-180" fill={isDisliked ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3zM7 22H4a2 2 0 01-2-2v-7a2 2 0 012-2h3"/></svg>
                  </div>
                  <span className="text-[10px] font-black text-white mt-1.5">استبعاد</span>
                </button>
                
                <button onClick={() => handleAction('save', video.id)} className="flex flex-col items-center group">
                   <div className={`p-4 rounded-full transition-all duration-300 border-2 active:scale-150 ${isSaved ? 'bg-yellow-500 border-yellow-300 text-white shadow-[0_0_30px_yellow]' : 'bg-yellow-500/10 border-yellow-500 text-yellow-500 shadow-[0_0_15px_yellow]'}`}>
                     <svg className="w-6 h-6" fill={isSaved ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"/></svg>
                   </div>
                   <span className="text-[10px] font-black text-white mt-1.5">حفظ</span>
                </button>
              </div>

              <div className="absolute bottom-32 right-8 left-24 z-40 text-right">
                <div className="inline-block bg-red-600/40 backdrop-blur-md px-3 py-1 rounded-lg border border-red-600 mb-3">
                  <span className="text-[10px] font-black text-white tracking-widest uppercase">{video.category}</span>
                </div>
                <h3 className="text-white text-xl font-black drop-shadow-[0_2px_10px_black] line-clamp-2 leading-tight">{video.title}</h3>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ShortsPlayerOverlay;
