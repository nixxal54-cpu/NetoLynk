// src/components/Lynks/LynkPlayer.tsx
import React, { useEffect, useRef, useState } from 'react';
import { Heart, MessageCircle, Share2, Bookmark } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { metricsQueue } from '../../lib/metricsQueue';
import {
  toggleLynkLike, isLynkLiked,
  toggleLynkSave, isLynkSaved,
  incrementLynkShare,
} from '../../lib/lynkService';
import LynkCommentsSheet from './LynkCommentsSheet';

function onYTReady(cb: () => void) {
  if (window.YT && window.YT.Player) { cb(); return; }
  const prev = (window as any).onYouTubeIframeAPIReady;
  (window as any).onYouTubeIframeAPIReady = () => { prev?.(); cb(); };
}

export const LynkPlayer: React.FC<{ lynk: any; isActive: boolean }> = ({ lynk, isActive }) => {
  const { user } = useAuth();

  const iframeContainerRef = useRef<HTMLDivElement>(null);
  const playerRef          = useRef<any>(null);
  const [ready, setReady]  = useState(false);
  const [playing, setPlaying] = useState(false);
  const [showPauseAnim, setShowPauseAnim] = useState(false);
  const [showHeart, setShowHeart]         = useState(false);

  const actualWatchSeconds = useRef(0);
  const trackingInterval   = useRef<ReturnType<typeof setInterval> | null>(null);
  const likeInFlight       = useRef(false);
  const lastTap            = useRef(0);
  const tappingButtons     = useRef(false);

  const [liked,  setLiked]  = useState(false);
  const [saved,  setSaved]  = useState(false);
  const [likes,  setLikes]  = useState<number>(lynk.likesCount ?? 0);
  const [showComments, setShowComments] = useState(false);

  // Load like/save state once
  useEffect(() => {
    if (!user) return;
    isLynkLiked(lynk.id, user.uid).then(setLiked);
    isLynkSaved(lynk.id, user.uid).then(setSaved);
  }, [lynk.id, user?.uid]);

  // ── Init YouTube player ────────────────────────────────────────────────────
  useEffect(() => {
    let destroyed = false;
    onYTReady(() => {
      if (destroyed || !iframeContainerRef.current) return;
      playerRef.current = new window.YT.Player(iframeContainerRef.current, {
        videoId: lynk.videoId,
        playerVars: {
          autoplay:       0,
          controls:       0,   // No YouTube controls
          disablekb:      1,
          fs:             0,
          modestbranding: 1,
          playsinline:    1,
          rel:            0,
          loop:           1,
          playlist:       lynk.videoId,
          iv_load_policy: 3,   // Hide annotations
          cc_load_policy: 0,   // No captions
          vq:             'hd720', // Force 720p quality
        },
        events: {
          onReady: (e: any) => {
            if (destroyed) return;
            // Force quality as soon as player is ready
            e.target.setPlaybackQuality('hd720');
            setReady(true);
          },
          onStateChange: (e: any) => {
            const isPlaying = e.data === window.YT.PlayerState.PLAYING;
            setPlaying(isPlaying);
          },
        },
      });
    });
    return () => {
      destroyed = true;
      if (trackingInterval.current) clearInterval(trackingInterval.current);
      playerRef.current?.destroy();
      playerRef.current = null;
    };
  }, [lynk.videoId]);

  // ── Play / pause based on isActive ────────────────────────────────────────
  useEffect(() => {
    if (!ready) return;
    if (isActive) {
      // Small delay so the DOM is settled before playing
      const t = setTimeout(() => {
        playerRef.current?.playVideo();
        playerRef.current?.setPlaybackQuality('hd720');
      }, 100);
      return () => clearTimeout(t);
    } else {
      // Always mute + pause inactive players — kills background audio
      playerRef.current?.pauseVideo();
      playerRef.current?.mute();

      if (actualWatchSeconds.current > 0) {
        const isSkip  = actualWatchSeconds.current <= 2;
        const replays = Math.floor(actualWatchSeconds.current / (lynk.duration || 15));
        metricsQueue.track(lynk.id, actualWatchSeconds.current, isSkip, replays);
        actualWatchSeconds.current = 0;
      }
    }
  }, [isActive, ready]);

  // Unmute when active + ready
  useEffect(() => {
    if (isActive && ready) {
      playerRef.current?.unMute();
      playerRef.current?.setVolume(100);
    }
  }, [isActive, ready]);

  // ── Watch time tracking ───────────────────────────────────────────────────
  useEffect(() => {
    if (!ready || !isActive) return;
    trackingInterval.current = setInterval(() => {
      if (playing) actualWatchSeconds.current += 1;
    }, 1000);
    return () => { if (trackingInterval.current) clearInterval(trackingInterval.current); };
  }, [ready, isActive, playing]);

  // ── Tap handler (video area only) ─────────────────────────────────────────
  const handleVideoTap = () => {
    if (tappingButtons.current) return; // ignore if buttons intercepted

    const now = Date.now();
    if (now - lastTap.current < 300) {
      // Double tap → like + heart
      doLike();
      setShowHeart(true);
      setTimeout(() => setShowHeart(false), 800);
    } else {
      // Single tap → play/pause toggle
      if (playing) {
        playerRef.current?.pauseVideo();
        setShowPauseAnim(true);
        setTimeout(() => setShowPauseAnim(false), 600);
      } else {
        playerRef.current?.playVideo();
      }
    }
    lastTap.current = now;
  };

  // ── Like ──────────────────────────────────────────────────────────────────
  const doLike = async () => {
    if (!user || likeInFlight.current) return;
    likeInFlight.current = true;
    const wasLiked = liked;
    setLiked(!wasLiked);
    setLikes(l => wasLiked ? Math.max(0, l - 1) : l + 1);
    try {
      await toggleLynkLike(lynk.id, user.uid, wasLiked);
    } catch {
      setLiked(wasLiked);
      setLikes(l => wasLiked ? l + 1 : Math.max(0, l - 1));
    } finally {
      likeInFlight.current = false;
    }
  };

  // ── Save ──────────────────────────────────────────────────────────────────
  const doSave = async () => {
    if (!user) return;
    const wasSaved = saved;
    setSaved(!wasSaved);
    try {
      await toggleLynkSave(lynk.id, user.uid, wasSaved);
    } catch {
      setSaved(wasSaved);
    }
  };

  // ── Share ─────────────────────────────────────────────────────────────────
  const doShare = async () => {
    const url = `${window.location.origin}/lynk/${lynk.id}`;
    try {
      if (navigator.share) await navigator.share({ title: lynk.caption || 'Check this Lynk!', url });
      else await navigator.clipboard.writeText(url);
      await incrementLynkShare(lynk.id);
    } catch {}
  };

  const fmt = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n ?? 0);

  return (
    <div className="relative w-full h-full bg-black overflow-hidden select-none">

      {/* ── Video area — tappable for play/pause/double-like ── */}
      <div
        className="absolute inset-0 z-0"
        onPointerDown={handleVideoTap}
      >
        {/* YouTube iframe container — scaled up to crop out YT chrome */}
        <div
          ref={iframeContainerRef}
          className="w-full h-full"
          style={{
            position: 'absolute',
            top: '-12%', left: '-6%',
            width: '112%', height: '124%',
            pointerEvents: 'none', // CRITICAL: no YT controls clickable
          }}
        />

        {/* Black bars to cover YT logo corners */}
        <div className="absolute bottom-0 left-0 right-0 h-14 bg-black z-10" />
        <div className="absolute top-0 left-0 right-0 h-10 bg-black z-10" />
      </div>

      {/* ── Loading spinner ── */}
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center z-20">
          <div className="w-10 h-10 border-2 border-white/70 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* ── Custom pause animation (replaces YouTube's) ── */}
      {showPauseAnim && (
        <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
          <div
            className="w-20 h-20 rounded-full bg-black/50 flex items-center justify-center"
            style={{ animation: 'fadeOutScale 0.6s ease-out forwards' }}
          >
            {/* Two pause bars */}
            <div className="flex gap-2">
              <div className="w-3 h-8 bg-white rounded-sm" />
              <div className="w-3 h-8 bg-white rounded-sm" />
            </div>
          </div>
          <style>{`
            @keyframes fadeOutScale {
              0%   { opacity: 1; transform: scale(1); }
              60%  { opacity: 1; transform: scale(1.1); }
              100% { opacity: 0; transform: scale(1.3); }
            }
          `}</style>
        </div>
      )}

      {/* ── Double-tap heart ── */}
      {showHeart && (
        <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
          <Heart
            className="w-28 h-28 fill-white text-white"
            style={{ animation: 'heartPop 0.8s ease-out forwards' }}
          />
          <style>{`
            @keyframes heartPop {
              0%   { opacity: 0; transform: scale(0.4); }
              40%  { opacity: 1; transform: scale(1.2); }
              70%  { opacity: 1; transform: scale(1.0); }
              100% { opacity: 0; transform: scale(0.8); }
            }
          `}</style>
        </div>
      )}

      {/* ── Bottom gradient + info ── */}
      <div className="absolute bottom-0 left-0 right-14 z-30 px-4 pb-6 pt-24
                      bg-gradient-to-t from-black/85 via-black/40 to-transparent
                      pointer-events-none">
        <div className="flex items-center gap-2 mb-2">
          <img
            src={lynk.userProfileImage || `https://api.dicebear.com/7.x/avataaars/svg?seed=${lynk.username}`}
            className="w-9 h-9 rounded-full object-cover border-2 border-white/40"
            alt={lynk.username}
          />
          <span className="text-white font-bold text-sm drop-shadow">@{lynk.username}</span>
        </div>
        {lynk.caption && (
          <p className="text-white text-sm leading-snug line-clamp-2 drop-shadow">{lynk.caption}</p>
        )}
        {lynk.hashtags?.length > 0 && (
          <p className="text-blue-300 text-xs mt-1">
            {lynk.hashtags.map((t: string) => `#${t}`).join(' ')}
          </p>
        )}
      </div>

      {/* ── Right action buttons ── */}
      <div
        className="absolute right-3 bottom-20 z-30 flex flex-col items-center gap-5"
        onPointerDown={() => { tappingButtons.current = true; }}
        onPointerUp={() => { setTimeout(() => { tappingButtons.current = false; }, 200); }}
      >
        {/* Like */}
        <button
          className="flex flex-col items-center gap-1 active:scale-90 transition-transform"
          onPointerDown={e => e.stopPropagation()}
          onClick={doLike}
        >
          <div className={`w-12 h-12 rounded-full flex items-center justify-center
                          backdrop-blur-md border transition-all duration-200
                          ${liked
                            ? 'bg-red-500 border-red-400'
                            : 'bg-black/50 border-white/20'}`}>
            <Heart className={`w-6 h-6 transition-all ${liked ? 'fill-white text-white scale-110' : 'text-white'}`} />
          </div>
          <span className="text-white text-xs font-semibold drop-shadow-lg">{fmt(likes)}</span>
        </button>

        {/* Comment */}
        <button
          className="flex flex-col items-center gap-1 active:scale-90 transition-transform"
          onPointerDown={e => e.stopPropagation()}
          onClick={() => setShowComments(true)}
        >
          <div className="w-12 h-12 rounded-full bg-black/50 backdrop-blur-md border border-white/20 flex items-center justify-center">
            <MessageCircle className="w-6 h-6 text-white" />
          </div>
          <span className="text-white text-xs font-semibold drop-shadow-lg">{fmt(lynk.commentsCount)}</span>
        </button>

        {/* Save */}
        <button
          className="flex flex-col items-center gap-1 active:scale-90 transition-transform"
          onPointerDown={e => e.stopPropagation()}
          onClick={doSave}
        >
          <div className={`w-12 h-12 rounded-full flex items-center justify-center
                          backdrop-blur-md border transition-all duration-200
                          ${saved
                            ? 'bg-yellow-500 border-yellow-400'
                            : 'bg-black/50 border-white/20'}`}>
            <Bookmark className={`w-6 h-6 transition-all ${saved ? 'fill-white text-white' : 'text-white'}`} />
          </div>
          <span className="text-white text-xs font-semibold drop-shadow-lg">{fmt(lynk.savesCount)}</span>
        </button>

        {/* Share */}
        <button
          className="flex flex-col items-center gap-1 active:scale-90 transition-transform"
          onPointerDown={e => e.stopPropagation()}
          onClick={doShare}
        >
          <div className="w-12 h-12 rounded-full bg-black/50 backdrop-blur-md border border-white/20 flex items-center justify-center">
            <Share2 className="w-6 h-6 text-white" />
          </div>
          <span className="text-white text-xs font-semibold drop-shadow-lg">{fmt(lynk.sharesCount)}</span>
        </button>
      </div>

      {/* ── Comments sheet ── */}
      {showComments && (
        <LynkCommentsSheet
          lynkId={lynk.id}
          open={showComments}
          onClose={() => setShowComments(false)}
        />
      )}
    </div>
  );
};
