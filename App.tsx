
import React, { useState, useEffect, useCallback, useMemo, Suspense, lazy } from 'react';
import { Video, AppView, UserInteractions } from './types.ts';
import { fetchCloudinaryVideos } from './cloudinaryClient.ts';
import { getRecommendedFeed } from './geminiService.ts';
import AppBar from './AppBar.tsx';
import MainContent from './MainContent.tsx';

const ShortsPlayerOverlay = lazy(() => import('./ShortsPlayerOverlay.tsx'));
const LongPlayerOverlay = lazy(() => import('./LongPlayerOverlay.tsx'));
const AdminDashboard = lazy(() => import('./AdminDashboard.tsx'));
const AIOracle = lazy(() => import('./AIOracle.tsx'));
const TrendPage = lazy(() => import('./TrendPage.tsx'));
const SavedPage = lazy(() => import('./SavedPage.tsx'));
const UnwatchedPage = lazy(() => import('./UnwatchedPage.tsx'));
const PrivacyPage = lazy(() => import('./PrivacyPage.tsx'));
const HiddenVideosPage = lazy(() => import('./HiddenVideosPage.tsx'));

const DEFAULT_CATEGORIES = ['رعب حقيقي', 'قصص رعب', 'غموض', 'ما وراء الطبيعة', 'أرشيف المطور'];

export type DownloadStatus = 'idle' | 'downloading' | 'completed';

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<AppView>(AppView.HOME);
  const [rawVideos, setRawVideos] = useState<Video[]>([]); 
  const [loading, setLoading] = useState(true);
  const [downloadStatus, setDownloadStatus] = useState<DownloadStatus>('idle');
  const [selectedShort, setSelectedShort] = useState<{ video: Video, list: Video[] } | null>(null);
  const [selectedLong, setSelectedLong] = useState<{ video: Video, list: Video[] } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const isOverlayActive = useMemo(() => !!selectedShort || !!selectedLong, [selectedShort, selectedLong]);

  const [deletedByAdmin, setDeletedByAdmin] = useState<string[]>(() => {
    const saved = localStorage.getItem('al-hadiqa-deleted-ids');
    return saved ? JSON.parse(saved) : [];
  });

  const [interactions, setInteractions] = useState<UserInteractions>(() => {
    try {
      const saved = localStorage.getItem('al-hadiqa-interactions');
      return saved ? JSON.parse(saved) : { likedIds: [], dislikedIds: [], savedIds: [], watchHistory: [] };
    } catch (e) {
      return { likedIds: [], dislikedIds: [], savedIds: [], watchHistory: [] };
    }
  });

  const categories = useMemo(() => DEFAULT_CATEGORIES, []);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }, []);

  const handleDeleteVideo = useCallback((id: string) => {
    setDeletedByAdmin(prev => {
      const newList = [...prev, id];
      localStorage.setItem('al-hadiqa-deleted-ids', JSON.stringify(newList));
      return newList;
    });
    setRawVideos(prev => prev.filter(v => v.id !== id && v.public_id !== id));
    showToast("تم طرد الكابوس نهائياً!");
  }, [showToast]);

  const loadData = useCallback(async (isHardRefresh = false) => {
    if (isHardRefresh) setLoading(true);
    try {
      if (isHardRefresh && 'caches' in window) {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map(name => caches.delete(name)));
        localStorage.removeItem('app_videos_cache');
      }

      const data = await fetchCloudinaryVideos();
      const filtered = data.filter(v => 
        !deletedByAdmin.includes(v.id) && 
        !deletedByAdmin.includes(v.public_id) && 
        !deletedByAdmin.includes(v.video_url)
      );
      
      const recommendedOrder = await getRecommendedFeed(filtered, interactions);
      const orderedVideos = recommendedOrder
        .map(id => filtered.find(v => v.id === id))
        .filter((v): v is Video => !!v);

      const remaining = filtered.filter(v => !recommendedOrder.includes(v.id));
      setRawVideos([...orderedVideos, ...remaining]);
      
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [deletedByAdmin, interactions]);

  useEffect(() => { 
    loadData(true); 
    // محرك المزامنة التلقائية كل 5 دقائق لسحب المحتوى الجديد دورياً
    const syncInterval = setInterval(() => {
      loadData(false);
    }, 5 * 60 * 1000);
    return () => clearInterval(syncInterval);
  }, []);
  
  useEffect(() => { 
    localStorage.setItem('al-hadiqa-interactions', JSON.stringify(interactions)); 
  }, [interactions]);

  const updateWatchHistory = useCallback((id: string, progress: number) => {
    setInteractions(prev => {
      const history = [...prev.watchHistory];
      const index = history.findIndex(h => h.id === id);
      if (index > -1) { if (progress > history[index].progress) history[index].progress = progress; }
      else { history.push({ id, progress }); }
      return { ...prev, watchHistory: history };
    });
  }, []);

  // منطق التفاعل الحصري: إعجاب يخفي تجاهل والعكس
  const handleLikeToggle = (id: string) => {
    setInteractions(p => {
      const isAlreadyLiked = p.likedIds.includes(id);
      if (isAlreadyLiked) return p;
      return {
        ...p,
        likedIds: [...p.likedIds, id],
        dislikedIds: p.dislikedIds.filter(x => x !== id) // حذف من التجاهل
      };
    });
    showToast("تمت الإضافة للمفضلة نيون ✨");
  };

  const handleDislikeToggle = (id: string) => {
    setInteractions(p => {
      const isAlreadyDisliked = p.dislikedIds.includes(id);
      if (isAlreadyDisliked) return p;
      return {
        ...p,
        dislikedIds: [...p.dislikedIds, id],
        likedIds: p.likedIds.filter(x => x !== id) // حذف من الإعجاب
      };
    });
    showToast("تم استبعاد الكابوس 💀");
  };

  const renderContent = () => {
    switch(currentView) {
      case AppView.ADMIN:
        return (
          <Suspense fallback={<div className="flex h-screen items-center justify-center text-red-600 font-black animate-pulse">تحديث السجلات...</div>}>
            <AdminDashboard 
              onClose={() => setCurrentView(AppView.HOME)} 
              categories={categories} 
              initialVideos={rawVideos} 
              onDeleteVideo={handleDeleteVideo}
            />
          </Suspense>
        );
      case AppView.TREND:
        return (
          <Suspense fallback={null}>
            <div className="px-4"><TrendPage onPlayShort={(v, l) => setSelectedShort({video:v, list:l})} onPlayLong={(v) => setSelectedLong({video:v, list:rawVideos})} excludedIds={interactions.dislikedIds} /></div>
          </Suspense>
        );
      case AppView.LIKES:
        return (
          <Suspense fallback={null}>
            <div className="px-4"><SavedPage savedIds={interactions.likedIds} allVideos={rawVideos} onPlayShort={(v, l) => setSelectedShort({video:v, list:l})} onPlayLong={(v) => setSelectedLong({video:v, list:rawVideos})} title="الإعجابات" /></div>
          </Suspense>
        );
      case AppView.SAVED:
        return (
          <Suspense fallback={null}>
            <div className="px-4"><SavedPage savedIds={interactions.savedIds} allVideos={rawVideos} onPlayShort={(v, l) => setSelectedShort({video:v, list:l})} onPlayLong={(v) => setSelectedLong({video:v, list:rawVideos})} title="المحفوظات" /></div>
          </Suspense>
        );
      case AppView.HIDDEN:
        return (
          <Suspense fallback={null}>
            <div className="px-4"><HiddenVideosPage interactions={interactions} allVideos={rawVideos} onRestore={(id) => setInteractions(prev => ({...prev, dislikedIds: prev.dislikedIds.filter(x => x !== id)}))} onPlayShort={(v, l) => setSelectedShort({video:v, list:l})} onPlayLong={(v) => setSelectedLong({video:v, list:rawVideos})} /></div>
          </Suspense>
        );
      case AppView.PRIVACY:
        return (
          <Suspense fallback={null}>
            <div className="px-4"><PrivacyPage onOpenAdmin={() => setCurrentView(AppView.ADMIN)} /></div>
          </Suspense>
        );
      default:
        return (
          <MainContent 
            videos={rawVideos} 
            categoriesList={categories} 
            interactions={interactions}
            onPlayShort={(v, l) => setSelectedShort({video:v, list:l})}
            onPlayLong={(v, l) => setSelectedLong({video:v, list:l})}
            onResetHistory={() => loadData(false)}
            onHardRefresh={() => loadData(true)}
            loading={loading}
            onShowToast={showToast}
            onDownloadAll={() => showToast("بدأ سحب المحتوى...")}
            onSearchToggle={() => setIsSearchOpen(true)}
            isOverlayActive={isOverlayActive}
          />
        );
    }
  };

  return (
    <div className="min-h-screen bg-black text-white">
      <AppBar onViewChange={setCurrentView} onRefresh={() => loadData(false)} currentView={currentView} />
      <main className="pt-20 max-w-lg mx-auto overflow-x-hidden">{renderContent()}</main>

      {isSearchOpen && (
        <div className="fixed inset-0 z-[1200] bg-black/98 backdrop-blur-3xl flex flex-col p-6 animate-in fade-in zoom-in duration-300">
           <div className="flex items-center gap-4 mb-8">
              <input 
                type="text" autoFocus placeholder="ابحث عن كابوس..." 
                value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1 bg-white/5 border border-white/10 rounded-2xl py-4 px-6 text-white outline-none focus:border-red-600"
              />
              <button onClick={() => { setIsSearchOpen(false); setSearchQuery(''); }} className="text-red-600 font-black">إغلاق</button>
           </div>
           <div className="overflow-y-auto flex-1 space-y-4">
              {rawVideos.filter(v => v.title.includes(searchQuery)).slice(0, 10).map(v => (
                <div key={v.id} onClick={() => { v.type === 'short' ? setSelectedShort({video:v, list:rawVideos}) : setSelectedLong({video:v, list:rawVideos}); setIsSearchOpen(false); }} className="flex items-center gap-4 bg-white/5 p-4 rounded-3xl border border-transparent hover:border-red-600/20">
                   <div className="w-16 h-16 rounded-2xl overflow-hidden bg-black shrink-0 border border-white/10">
                      <video src={v.video_url} className="w-full h-full object-cover opacity-60" />
                   </div>
                   <p className="text-sm font-bold text-white line-clamp-1">{v.title}</p>
                </div>
              ))}
           </div>
        </div>
      )}

      <Suspense fallback={null}><AIOracle /></Suspense>
      {toast && <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[1100] bg-red-600 px-6 py-2 rounded-full font-bold shadow-lg shadow-red-600/40 text-xs">{toast}</div>}
      
      {selectedShort && (
        <Suspense fallback={null}>
          <ShortsPlayerOverlay 
            initialVideo={selectedShort.video} 
            videoList={selectedShort.list} 
            interactions={interactions} 
            onClose={() => setSelectedShort(null)} 
            onLike={handleLikeToggle} 
            onDislike={handleDislikeToggle} 
            onSave={(id) => setInteractions(p => p.savedIds.includes(id) ? p : ({...p, savedIds: [...p.savedIds, id]}))} 
            onProgress={updateWatchHistory} 
          />
        </Suspense>
      )}
      
      {selectedLong && (
        <Suspense fallback={null}>
          <LongPlayerOverlay 
            video={selectedLong.video} 
            allLongVideos={selectedLong.list} 
            onClose={() => setSelectedLong(null)} 
            onLike={() => handleLikeToggle(selectedLong.video.id)} 
            onDislike={() => handleDislikeToggle(selectedLong.video.id)} 
            onSave={() => setInteractions(p => p.savedIds.includes(selectedLong.video.id) ? p : ({...p, savedIds: [...p.savedIds, selectedLong.video.id]}))} 
            onSwitchVideo={(v) => setSelectedLong({video:v, list:selectedLong.list})} 
            isLiked={interactions.likedIds.includes(selectedLong.video.id)} 
            isDisliked={interactions.dislikedIds.includes(selectedLong.video.id)} 
            isSaved={interactions.savedIds.includes(selectedLong.video.id)} 
            onProgress={(p) => updateWatchHistory(selectedLong.video.id, p)} 
          />
        </Suspense>
      )}
    </div>
  );
};

export default App;
