// src/components/Lynks/LynkPlayer.tsx
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Heart, MessageCircle, Share2, Bookmark, Play } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { metricsQueue } from '../../lib/metricsQueue';
import {
  toggleLynkLike, isLynkLiked,
  toggleLynkSave, isLynkSaved,
  incrementLynkShare,
} from '../../lib/lynkService';
import LynkCommentsSheet from './LynkCommentsSheet';

// Wait for YT API, then call cb
function onYTReady(cb: () => void) {
  if (window.YT && window.YT.Player) { cb(); return; }
  const prev = (window as any).onYouTubeIframeAPIReady;
  (window as any).onYouTubeIframeAPIReady = () => { prev?.(); cb(); };
}

export const LynkPlayer: React.FC<{ lynk: any; isActive: boolean }> = ({ lynk, isActive }) => {
  const { user } = useAuth();

  // Player
  const containerRef       = useRef<HTMLDivElement>(null);
  const playerRef          = useRef<any>(null);
  const [ready, setReady]  = useState(false);
  const [paused, setPaused] = useState(false);
  const isPlayingRef       = useRef(false);

  // Watch time
  const actualWatchSeconds = useRef(0);
  const trackingInterval   = useRef<ReturnType<typeof setInterval> | null>(null);

  // UI state
  const [liked,    setLiked]    = useState(false);
  const [saved,    setSaved]    = useState(false);
  const [likes,    setLikes]    = useState<number>(lynk.likesCount ?? 0);
  const [comments, setComments] = useState(false);
  const [showHeart, setShowHeart] = useState(false);
  const lastTap = useRef(0);
  const likeInFlight = useRef(false);

  // Load like/save state
  useEffect(() => {
    if (!user) return;
    isLynkLiked(lynk.id, user.uid).then(setLiked);
    isLynkSaved(lynk.id, user.uid).then(setSaved);
  }, [lynk.id, user]);

  // Init YouTube player
  useEffect(() => {
    let destroyed = false;
    onYTReady(() => {
      if (destroyed || !containerRef.current) return;
      playerRef.current = new window.YT.Player(containerRef.current, {
        videoId: lynk.videoId,
        playerVars: {
          autoplay: 0, controls: 0, disablekb: 1, fs: 0,
          modestbranding: 1, playsinline: 1, rel: 0,
          loop: 1, playlist: lynk.videoId,
        },
        events: {
          onReady: () => { if (!destroyed) setReady(true); },
          onStateChange: (e: any) => {
            isPlayingRef.current = e.data === window.YT.PlayerState.PLAYING;
            setPaused(e.data === window.YT.PlayerState.PAUSED);
          },
        },
      });
    });
    return () => {
      destroyed = true;
      playerRef.current?.destroy();
      playerRef.current = null;
    };
  }, [lynk.videoId]);

  // Play/pause on active change
  useEffect(() => {
    if (!ready) return;
    if (isActive) {
      playerRef.current?.playVideo();
      setPaused(false);
    } else {
      playerRef.current?.pauseVideo();
      if (actualWatchSeconds.current > 0) {
        const isSkip  = actualWatchSeconds.current <= 2;
        const replays = Math.floor(actualWatchSeconds.current / (lynk.duration || 15));
        metricsQueue.track(lynk.id, actualWatchSeconds.current, isSkip, replays);
        actualWatchSeconds.current = 0;
      }
    }
  }, [isActive, ready]);

  // Watch time tracking
  useEffect(() => {
    if (!ready) return;
    trackingInterval.current = setInterval(() => {
      if (isActive && isPlayingRef.current) actualWatchSeconds.current += 1;
    }, 1000);
    return () => { if (trackingInterval.current) clearInterval(trackingInterval.current); };
  }, [ready, isActive]);

  // Tap to play/pause, double-tap to like
  const handleTap = useCallback(() => {
    const now = Date.now();
    if (now - lastTap.current < 300) {
      // Double tap — like
      handleLike();
      setShowHeart(true);
      setTimeout(() => setShowHeart(false), 900);
    } else {
      // Single tap — toggle play/pause
      if (isPlayingRef.current) {
        playerRef.current?.pauseVideo();
      } else {
        playerRef.current?.playVideo();
      }
    }
    lastTap.current = now;
  }, []);

  const handleLike = async () => {
    if (!user || likeInFlight.current) return;
    likeInFlight.current = true;
    const wasLiked = liked;
    setLiked(!wasLiked);
    setLikes(l => wasLiked ? l - 1 : l + 1);
    try {
      await toggleLynkLike(lynk.id, user.uid, wasLiked);
    } catch {
      // Revert on failure
      setLiked(wasLiked);
      setLikes(l => wasLiked ? l + 1 : l - 1);
    } finally {
      likeInFlight.current = false;
    }
  };

  const handleSave = async () => {
    if (!user) return;
    const wasSaved = saved;
    setSaved(!wasSaved);
    await toggleLynkSave(lynk.id, user.uid, wasSaved);
  };

  const handleShare = async () => {
    const url = `${window.location.origin}/lynk/${lynk.id}`;
    if (navigator.share) {
      await navigator.share({ title: lynk.caption || 'Check this Lynk!', url });
    } else {
      await navigator.clipboard.writeText(url);
    }
    await incrementLynkShare(lynk.id);
  };

  const fmt = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);

  return (
    <div className="relative w-full h-full bg-black overflow-hidden" onClick={handleTap}>

      {/* ── YouTube iframe fills entire screen ── */}
      <div
        ref={containerRef}
        className="absolute inset-0 w-full h-full pointer-events-none"
        style={{ transform: 'scale(1.35)' }}
      />
      {/* Hide YouTube logo (bottom-left) and info button (top-right) */}
      <div className="absolute bottom-0 left-0 w-32 h-10 z-10 pointer-events-none" style={{background:'transparent'}} />
      <div className="absolute top-0 right-0 w-16 h-10 z-10 pointer-events-none bg-black/1" />
      <div className="absolute bottom-0 right-0 w-32 h-12 z-10 pointer-events-none bg-black" />
      <div className="absolute top-0 left-0 w-32 h-10 z-10 pointer-events-none bg-black/1" />

      {/* ── Loading spinner ── */}
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <div className="w-10 h-10 border-2 border-white border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* ── Pause indicator ── */}
      {paused && ready && (
        <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
          <div className="bg-black/40 rounded-full p-4">
            <Play className="w-10 h-10 text-white fill-white" />
          </div>
        </div>
      )}

      {/* ── Double-tap heart animation ── */}
      {showHeart && (
        <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
          <Heart className="w-24 h-24 text-white fill-white animate-ping" />
        </div>
      )}

      {/* ── Bottom gradient + caption ── */}
      <div className="absolute bottom-0 left-0 right-0 z-10 px-4 pb-6 pt-20
                      bg-gradient-to-t from-black/80 via-black/30 to-transparent
                      pointer-events-none">
        {/* Creator info */}
        <div className="flex items-center gap-2 mb-2">
          <img
            src={lynk.userProfileImage || `https://api.dicebear.com/7.x/avataaars/svg?seed=${lynk.username}`}
            className="w-9 h-9 rounded-full object-cover border border-white/30"
            alt={lynk.username}
          />
          <span className="text-white font-semibold text-sm">@{lynk.username}</span>
        </div>
        {/* Caption */}
        {lynk.caption && (
          <p className="text-white text-sm leading-snug line-clamp-2">{lynk.caption}</p>
        )}
        {/* Hashtags */}
        {lynk.hashtags?.length > 0 && (
          <p className="text-blue-300 text-xs mt-1">
            {lynk.hashtags.map((t: string) => `#${t}`).join(' ')}
          </p>
        )}
      </div>

      {/* ── Right-side action buttons ── */}
      <div
        className="absolute right-3 bottom-24 z-20 flex flex-col items-center gap-5"
        onClick={e => e.stopPropagation()}
      >
        {/* Like */}
        <button className="flex flex-col items-center gap-1" onClick={handleLike}>
          <div className={`w-11 h-11 rounded-full flex items-center justify-center
                          backdrop-blur-sm transition-all
                          ${liked ? 'bg-red-500/80' : 'bg-black/40'}`}>
            <Heart className={`w-6 h-6 ${liked ? 'fill-white text-white' : 'text-white'}`} />
          </div>
          <span className="text-white text-xs font-medium drop-shadow">{fmt(likes)}</span>
        </button>

        {/* Comment */}
        <button className="flex flex-col items-center gap-1" onClick={() => setComments(true)}>
          <div className="w-11 h-11 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center">
            <MessageCircle className="w-6 h-6 text-white" />
          </div>
          <span className="text-white text-xs font-medium drop-shadow">{fmt(lynk.commentsCount ?? 0)}</span>
        </button>

        {/* Save */}
        <button className="flex flex-col items-center gap-1" onClick={handleSave}>
          <div className={`w-11 h-11 rounded-full flex items-center justify-center
                          backdrop-blur-sm transition-all
                          ${saved ? 'bg-yellow-500/80' : 'bg-black/40'}`}>
            <Bookmark className={`w-6 h-6 ${saved ? 'fill-white text-white' : 'text-white'}`} />
          </div>
          <span className="text-white text-xs font-medium drop-shadow">{fmt(lynk.savesCount ?? 0)}</span>
        </button>

        {/* Share */}
        <button className="flex flex-col items-center gap-1" onClick={handleShare}>
          <div className="w-11 h-11 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center">
            <Share2 className="w-6 h-6 text-white" />
          </div>
          <span className="text-white text-xs font-medium drop-shadow">{fmt(lynk.sharesCount ?? 0)}</span>
        </button>
      </div>

      {/* ── Comments sheet ── */}
      {comments && (
        <LynkCommentsSheet
          lynkId={lynk.id}
          open={comments}
          onClose={() => setComments(false)}
        />
      )}
    </div>
  );
};
