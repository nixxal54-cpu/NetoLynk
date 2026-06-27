// src/components/Lynks/LynkPlayer.tsx
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Heart, MessageCircle, Share2, Bookmark } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { metricsQueue } from '../../lib/metricsQueue';
import {
  toggleLynkLike, isLynkLiked,
  toggleLynkSave, isLynkSaved,
  incrementLynkShare,
} from '../../lib/lynkService';
import LynkCommentsSheet from './LynkCommentsSheet';

export const LynkPlayer: React.FC<{ lynk: any; isActive: boolean }> = ({ lynk, isActive }) => {
  const { user } = useAuth();

  const videoRef              = useRef<HTMLVideoElement>(null);
  const [ready,  setReady]    = useState(false);
  const [playing, setPlaying] = useState(false);
  const [showPauseAnim, setShowPauseAnim] = useState(false);
  const [showHeart,     setShowHeart]     = useState(false);

  const actualWatchSeconds = useRef(0);
  const trackingInterval   = useRef<ReturnType<typeof setInterval> | null>(null);
  const likeInFlight       = useRef(false);
  const lastTap            = useRef(0);
  const tappingButtons     = useRef(false);

  const [liked, setLiked]       = useState(false);
  const [saved, setSaved]       = useState(false);
  const [likes, setLikes]       = useState<number>(lynk.likesCount ?? 0);
  const [showComments, setShowComments] = useState(false);

  // ── Load like/save state ───────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    isLynkLiked(lynk.id, user.uid).then(setLiked);
    isLynkSaved(lynk.id, user.uid).then(setSaved);
  }, [lynk.id, user?.uid]);

  // ── Play / pause based on isActive ────────────────────────────────────────
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !ready) return;

    if (isActive) {
      video.currentTime = 0;
      video.muted = false;
      video.play().catch(() => {
        // Autoplay blocked — try muted first (browser policy)
        video.muted = true;
        video.play().catch(() => {});
      });
    } else {
      video.pause();
      video.muted = true;

      // Flush watch-time metrics when scrolling away
      if (actualWatchSeconds.current > 0) {
        const isSkip  = actualWatchSeconds.current <= 2;
        const replays = Math.floor(actualWatchSeconds.current / (lynk.duration || 15));
        metricsQueue.track(lynk.id, actualWatchSeconds.current, isSkip, replays);
        actualWatchSeconds.current = 0;
      }
    }
  }, [isActive, ready]);

  // ── Watch-time tracking ───────────────────────────────────────────────────
  useEffect(() => {
    if (!ready || !isActive) return;
    trackingInterval.current = setInterval(() => {
      if (playing) actualWatchSeconds.current += 1;
    }, 1000);
    return () => { if (trackingInterval.current) clearInterval(trackingInterval.current); };
  }, [ready, isActive, playing]);

  // ── Tap handler ───────────────────────────────────────────────────────────
  const handleVideoTap = useCallback(() => {
    if (tappingButtons.current) return;

    const now = Date.now();
    if (now - lastTap.current < 300) {
      // Double-tap → like
      doLike();
      setShowHeart(true);
      setTimeout(() => setShowHeart(false), 800);
    } else {
      // Single-tap → play / pause toggle
      const video = videoRef.current;
      if (!video) return;
      if (video.paused) {
        video.play().catch(() => {});
      } else {
        video.pause();
        setShowPauseAnim(true);
        setTimeout(() => setShowPauseAnim(false), 600);
      }
    }
    lastTap.current = now;
  }, [playing]);

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
    const url = `${window.location.origin}/lynks/${lynk.id}`;
    try {
      if (navigator.share) await navigator.share({ title: lynk.caption || 'Check this Lynk!', url });
      else await navigator.clipboard.writeText(url);
      await incrementLynkShare(lynk.id);
    } catch {}
  };

  const fmt = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n ?? 0);

  return (
    <div className="relative w-full h-full bg-black overflow-hidden select-none">

      {/* ── Native video element — full bleed, no logo, no iframe ── */}
      <div
        className="absolute inset-0 z-0"
        onPointerDown={handleVideoTap}
      >
        <video
          ref={videoRef}
          src={lynk.videoUrl}
          poster={lynk.thumbnailUrl || undefined}
          loop
          playsInline
          muted                         // start muted; unmuted in the isActive effect
          preload="metadata"            // load enough to show poster + duration
          className="w-full h-full object-cover"
          onCanPlay={() => setReady(true)}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => {
            // loop is set, but just in case
            videoRef.current?.play().catch(() => {});
          }}
          // Prevent native controls from appearing on long-press (iOS)
          controlsList="nodownload nofullscreen noremoteplayback"
          disablePictureInPicture
        />
      </div>

      {/* ── Loading spinner ── */}
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center z-20">
          {lynk.thumbnailUrl && (
            <img
              src={lynk.thumbnailUrl}
              alt=""
              className="absolute inset-0 w-full h-full object-cover opacity-60"
            />
          )}
          <div className="w-10 h-10 border-2 border-white/70 border-t-transparent rounded-full animate-spin relative z-10" />
        </div>
      )}

      {/* ── Custom pause animation ── */}
      {showPauseAnim && (
        <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
          <div
            className="w-20 h-20 rounded-full bg-black/50 flex items-center justify-center"
            style={{ animation: 'fadeOutScale 0.6s ease-out forwards' }}
          >
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
                          ${liked ? 'bg-red-500 border-red-400' : 'bg-black/50 border-white/20'}`}>
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
                          ${saved ? 'bg-yellow-500 border-yellow-400' : 'bg-black/50 border-white/20'}`}>
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
