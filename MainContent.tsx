
import React, { useMemo, useState, useRef, useEffect } from 'react';
import { Video, UserInteractions } from './types.ts';
import { DownloadStatus } from './App';

const LOGO_URL = "https://i.top4top.io/p_3643ksmii1.jpg";

export const getDeterministicStats = (seed: string) => {
  let hash = 0;
  if (!seed) return { views: 0, likes: 0 };
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash) + seed.charCodeAt(i);
    hash |= 0;
  }
  const views = Math.abs(hash % 10000) + 500;
  const likes = Math.abs(Math.floor(views * 0.15 + (hash % 100)));
  return { views, likes };
};

export const formatBigNumber = (num: number) => {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toString();
};

const VideoCardThumbnail: React.FC<{ video: Video, isOverlayActive: boolean, progress?: number }> = ({ video, isOverlayActive, progress }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;

    if (isOverlayActive) {
      v.pause();
      if (observerRef.current) observerRef.current.disconnect();
      return;
    }

    observerRef.current = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        v.play().catch(() => {});
      } else {
        v.pause();
      }
    }, { threshold: 0.1 });

    observerRef.current.observe(v);

    return () => {
      if (observerRef.current) observerRef.current.disconnect();
    };
  }, [video.video_url, isOverlayActive]);

  return (
    <div className="w-full h-full relative bg-neutral-900 overflow-hidden group">
      <video 
        ref={videoRef}
        src={video.video_url} 
        poster={video.poster_url}
        muted loop playsInline 
        className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity"
      />
      {progress !== undefined && progress > 0 && (
        <div className="absolute bottom-0 left-0 w-full h-1 bg-white/10 z-20">
          <div className="h-full bg-yellow-500 shadow-[0_0_8px_#eab308]" style={{ width: `${progress * 100}%` }}></div>
        </div>
      )}
    </div>
  );
};

interface MainContentProps {
  videos: Video[];
  categoriesList: string[];
  interactions: UserInteractions;
  onPlayShort: (v: Video, list: Video[]) => void;
  onPlayLong: (v: Video, list: Video[]) => void;
  onResetHistory: () => void;
  onHardRefresh: () => void;
  loading: boolean;
  onShowToast?: (msg: string) => void;
  downloadStatus?: DownloadStatus;
  onDownloadAll?: () => void;
  onSearchToggle?: () => void;
  isOverlayActive: boolean;
}

const MainContent: React.FC<MainContentProps> = ({ 
  videos, interactions, onPlayShort, onPlayLong, onHardRefresh, loading, onShowToast,
  downloadStatus = 'idle', onDownloadAll, onSearchToggle, isOverlayActive
}) => {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [startY, setStartY] = useState(0);
  const [pullOffset, setPullOffset] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const filteredVideos = useMemo(() => {
    const excludedIds = [...interactions.dislikedIds, ...interactions.likedIds];
    const watchedIds = interactions.watchHistory.map(h => h.id);
    
    return videos
      .filter(v => !excludedIds.includes(v.id || v.video_url))
      .sort((a, b) => {
        const aWatched = watchedIds.includes(a.id) ? 1 : 0;
        const bWatched = watchedIds.includes(b.id) ? 1 : 0;
        return aWatched - bWatched;
      });
  }, [videos, interactions]);

  // فيديوهات لم تكتمل (قطار 1)
  const unwatchedData = useMemo(() => {
    return interactions.watchHistory
      .filter(h => h.progress > 0.05 && h.progress < 0.95)
      .map(h => {
        const video = videos.find(v => v.id === h.id || v.video_url === h.id);
        return video ? { video, progress: h.progress } : null;
      })
      .filter((item): item is { video: Video, progress: number } => item !== null);
  }, [interactions.watchHistory, videos]);

  // فيديوهات مقترحة بناءً على الإعجابات (قطار 2 الذكي)
  const aiRecommendedData = useMemo(() => {
    const likedVideos = videos.filter(v => interactions.likedIds.includes(v.id || v.video_url));
    const likedCategories = Array.from(new Set(likedVideos.map(v => v.category)));
    
    // اختيار فيديوهات من نفس التصنيفات لم يتم التفاعل معها بعد
    return videos.filter(v => 
      likedCategories.includes(v.category) && 
      !interactions.likedIds.includes(v.id || v.video_url) &&
      !interactions.dislikedIds.includes(v.id || v.video_url)
    ).sort(() => Math.random() - 0.5);
  }, [videos, interactions]);

  const shorts = useMemo(() => filteredVideos.filter(v => v.type === 'short'), [filteredVideos]);
  const longs = useMemo(() => filteredVideos.filter(v => v.type === 'long'), [filteredVideos]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await onHardRefresh();
    setTimeout(() => setIsRefreshing(false), 800);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (window.scrollY === 0) setStartY(e.touches[0].pageY);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (startY === 0) return;
    const currentY = e.touches[0].pageY;
    const diff = currentY - startY;
    if (diff > 0 && diff < 150) setPullOffset(diff);
  };

  const handleTouchEnd = () => {
    if (pullOffset > 80) handleRefresh();
    setPullOffset(0);
    setStartY(0);
  };

  // وظيفة لإنشاء قائمة لا نهائية (تكرار العناصر)
  const renderInfiniteTrack = (data: any[], type: 'unwatched' | 'ai') => {
    if (data.length === 0) return null;
    // تكرار البيانات 5 مرات لضمان طول الشريط وعدم انتهائه
    const repeatedData = [...data, ...data, ...data, ...data, ...data];
    
    return (
      <div className="relative w-full overflow-x-auto snap-x snap-mandatory scrollbar-hide py-4 bg-neutral-900/10 border-y border-white/5">
        <div className="flex gap-4 px-4 min-w-max animate-marquee-l-to-r hover:[animation-play-state:paused] transition-all">
          {repeatedData.map((item, idx) => {
            const video = item.video || item;
            const progress = item.progress;
            return (
              <div 
                key={`${video.id}-${idx}`} 
                onClick={() => video.type === 'short' ? onPlayShort(video, shorts) : onPlayLong(video, longs)}
                className="inline-flex flex-col gap-2 w-48 shrink-0 snap-center cursor-pointer active:scale-95 transition-all group/item"
              >
                <div className="aspect-video rounded-2xl overflow-hidden border-2 border-white/5 group-hover/item:border-cyan-500/50 transition-all shadow-xl relative">
                  <VideoCardThumbnail video={video} isOverlayActive={isOverlayActive} progress={progress} />
                </div>
                <p className="text-[9px] font-black text-gray-500 truncate text-center uppercase tracking-tighter group-hover/item:text-white transition-colors">
                  {video.title}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div 
      ref={containerRef}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className="flex flex-col pb-40 pt-0 px-4 w-full bg-black min-h-screen relative transition-transform duration-200"
      style={{ transform: `translateY(${pullOffset / 2}px)` }}
      dir="rtl"
    >
      {(pullOffset > 20 || isRefreshing) && (
        <div className="absolute top-0 left-0 w-full flex justify-center py-4 z-50 pointer-events-none">
           <span className="text-red-600 font-black text-xs italic tracking-widest animate-pulse drop-shadow-[0_0_8px_rgba(220,38,38,0.8)]">
             تحديث...
           </span>
        </div>
      )}
      
      {loading && !isRefreshing && (
        <div className="fixed top-0 left-0 w-full h-[1px] bg-red-600 z-[110] animate-pulse"></div>
      )}

      <section className="flex items-center justify-between py-1 border-b border-white/5 bg-black sticky top-0 z-40">
        <div className="flex items-center gap-2">
          <div className="relative shrink-0">
             <div className="absolute inset-0 bg-red-600/20 rounded-full blur-lg"></div>
             <img src={LOGO_URL} className="w-8 h-8 rounded-full border border-red-600/50 relative z-10" alt="Logo" />
          </div>
          <div className="flex flex-col text-right">
            <h1 onClick={handleRefresh} className="text-base font-black italic cursor-pointer text-red-600 drop-shadow-[0_0_10px_red]">
              الحديقة المرعبة
            </h1>
            <p className="text-[5px] text-blue-400 font-black tracking-widest uppercase -mt-0.5 opacity-60">AI DISCOVERY ACTIVE</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
           <button onClick={onSearchToggle} className="w-9 h-9 rounded-xl bg-blue-500/5 border border-blue-500/30 flex items-center justify-center text-blue-500 active:scale-90 transition-all">
             <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
           </button>
           <button onClick={onDownloadAll} className="w-9 h-9 rounded-xl border border-green-500/30 text-green-500 active:scale-90 transition-all">
             <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3"><path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
           </button>
        </div>
      </section>

      {/* 1. فيديوهات الشورتس الـ 4 */}
      <section className="mt-2">
        <div className="grid grid-cols-2 gap-2">
          {shorts.slice(0, 4).map(v => (
            <div key={v.id} onClick={() => onPlayShort(v, shorts)} className="aspect-[9/16] rounded-2xl overflow-hidden border border-white/5 relative active:scale-95 transition-all shadow-xl bg-neutral-950 group">
              <VideoCardThumbnail video={v} isOverlayActive={isOverlayActive} />
              <div className="absolute bottom-3 right-0 left-0 text-center z-20 px-2">
                <p className="text-white text-[9px] font-black drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] line-clamp-1 italic">{v.title}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 2. قطار نواصل الحكاية (من الشمال لليمين) */}
      {unwatchedData.length > 0 && (
        <section className="mt-6 mb-2 overflow-hidden">
          <div className="flex items-center gap-2 mb-3 px-2">
            <span className="w-2 h-2 bg-yellow-500 rounded-full animate-ping"></span>
            <h2 className="text-xs font-black text-yellow-500 uppercase tracking-[0.2em] italic">نواصل الحكاية</h2>
          </div>
          {renderInfiniteTrack(unwatchedData, 'unwatched')}
        </section>
      )}

      {/* 3. الفيديوهات الطويلة (أول 4) */}
      <section className="mt-4">
        <div className="flex flex-col gap-4">
          {longs.slice(0, 4).map(video => (
            <div key={video.id} onClick={() => onPlayLong(video, longs)} className="relative aspect-video rounded-[1.5rem] overflow-hidden border border-white/5 active:scale-[0.98] transition-all shadow-2xl group bg-neutral-950">
              <VideoCardThumbnail video={video} isOverlayActive={isOverlayActive} />
              <div className="absolute bottom-4 right-5 left-5 z-20 text-right">
                <h3 className="text-white font-black text-sm group-hover:text-red-500 transition-colors line-clamp-1">{video.title}</h3>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 4. قطار توصيات الحديقة الذكية (تظهر بعد أول 4 فيديوهات طويلة) */}
      {aiRecommendedData.length > 0 && (
        <section className="mt-8 mb-4 overflow-hidden">
          <div className="flex items-center gap-2 mb-3 px-2">
            <span className="w-2 h-2 bg-cyan-500 rounded-full shadow-[0_0_10px_cyan]"></span>
            <h2 className="text-xs font-black text-cyan-500 uppercase tracking-[0.2em] italic">اختيارات الحديقة لك</h2>
          </div>
          {renderInfiniteTrack(aiRecommendedData, 'ai')}
        </section>
      )}

      {/* 5. بقية الفيديوهات الطويلة */}
      <section className="mt-2">
        <div className="flex flex-col gap-4">
          {longs.slice(4).map(video => (
            <div key={video.id} onClick={() => onPlayLong(video, longs)} className="relative aspect-video rounded-[1.5rem] overflow-hidden border border-white/5 active:scale-[0.98] transition-all group bg-neutral-950">
              <VideoCardThumbnail video={video} isOverlayActive={isOverlayActive} />
              <div className="absolute bottom-4 right-5 left-5 z-20 text-right">
                <h3 className="text-white font-black text-sm group-hover:text-red-500 transition-colors line-clamp-1">{video.title}</h3>
              </div>
            </div>
          ))}
        </div>
      </section>

      {filteredVideos.length === 0 && !loading && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
           <p className="text-neutral-600 text-xs font-bold italic">أنهيت جميع الكوابيس الحالية..</p>
           <button onClick={handleRefresh} className="mt-4 text-red-600 text-[10px] font-black underline uppercase tracking-widest">تحديث</button>
        </div>
      )}
    </div>
  );
};

export default MainContent;
