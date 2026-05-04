/**
 * LynkPlayer.tsx
 * Full-screen 9:16 video player with:
 * - Autoplay / pause on visibility
 * - Double-tap to like
 * - Right-side action bar (like, comment, share, save)
 * - Bottom caption + hashtags
 * - Watch-time tracking on unmount
 */
import React, {
  useRef,
  useState,
  useEffect,
  useCallback,
  forwardRef,
  useImperativeHandle,
} from 'react';
import { Heart, MessageCircle, Share2, Bookmark, Flag, Volume2, VolumeX } from 'lucide-react';
import { Lynk } from '../../types/lynk';
import {
  toggleLynkLike,
  isLynkLiked,
  isLynkSaved,
  toggleLynkSave,
  incrementLynkShare,
  recordLynkView,
} from '../../lib/lynkService';
import { sessionHistory } from '../../lib/lynkRecommendation';
import { useAuth } from '../../context/AuthContext';
import { cn } from '../../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import LynkCommentsSheet from './LynkCommentsSheet';

export interface LynkPlayerHandle {
  play: () => void;
  pause: () => void;
}

interface Props {
  lynk: Lynk;
  active: boolean;      // true when this card is the visible one
  onUserClick: (username: string) => void;
  onHashtagClick: (tag: string) => void;
  onReportClick: (lynkId: string) => void;
}

const LynkPlayer = forwardRef<LynkPlayerHandle, Props>(
  ({ lynk, active, onUserClick, onHashtagClick, onReportClick }, ref) => {
    const { user } = useAuth();
    const videoRef = useRef<HTMLVideoElement>(null);

    const [liked, setLiked]             = useState(false);
    const [saved, setSaved]             = useState(false);
    const [localLikes, setLocalLikes]   = useState(lynk.likesCount);
    const [muted, setMuted]             = useState(true);
    const [showHeart, setShowHeart]     = useState(false);
    const [commentsOpen, setCommentsOpen] = useState(false);
    const [paused, setPaused]           = useState(false);

    const watchStartRef = useRef<number>(0);
    const accumulatedRef = useRef<number>(0);

    // Expose play/pause to parent scroll manager
    useImperativeHandle(ref, () => ({
      play:  () => { videoRef.current?.play();  setPaused(false); },
      pause: () => { videoRef.current?.pause(); setPaused(true);  },
    }));

    // Load liked/saved state
    useEffect(() => {
      if (!user) return;
      isLynkLiked(lynk.id, user.uid).then(setLiked);
      isLynkSaved(lynk.id, user.uid).then(setSaved);
    }, [lynk.id, user?.uid]);

    // Autoplay / pause based on active prop
    useEffect(() => {
      const vid = videoRef.current;
      if (!vid) return;

      if (active) {
        vid.currentTime = 0;
        vid.play().catch(() => {});
        watchStartRef.current = Date.now();
        sessionHistory.markSeen(lynk.id);
        sessionHistory.markHashtags(lynk.hashtags);
      } else {
        vid.pause();
        // Flush accumulated watch time
        if (watchStartRef.current) {
          const elapsed = (Date.now() - watchStartRef.current) / 1000;
          accumulatedRef.current += elapsed;
          watchStartRef.current = 0;
        }
      }
    }, [active]);

    // Flush watch time on unmount
    useEffect(() => {
      return () => {
        if (!user || !active) return;
        const elapsed = watchStartRef.current
          ? (Date.now() - watchStartRef.current) / 1000
          : 0;
        const total = accumulatedRef.current + elapsed;
        if (total > 0.5) {
          recordLynkView(lynk.id, user.uid, total, lynk.duration).catch(() => {});
        }
      };
    }, []); // intentionally empty — runs on unmount only

    // Loop video
    const handleEnded = useCallback(() => {
      if (videoRef.current) {
        videoRef.current.currentTime = 0;
        videoRef.current.play();
      }
    }, []);

    // Double-tap like
    const lastTapRef = useRef(0);
    const handleTap = useCallback(
      (e: React.MouseEvent | React.TouchEvent) => {
        const now = Date.now();
        if (now - lastTapRef.current < 300) {
          // Double tap
          if (!liked && user) {
            setLiked(true);
            setLocalLikes((l) => l + 1);
            toggleLynkLike(lynk.id, user.uid, false).catch(() => {});
            sessionHistory.markLiked(lynk.id);
          }
          setShowHeart(true);
          setTimeout(() => setShowHeart(false), 800);
        } else {
          // Single tap — toggle play/pause
          if (videoRef.current?.paused) {
            videoRef.current.play();
            setPaused(false);
          } else {
            videoRef.current?.pause();
            setPaused(true);
          }
        }
        lastTapRef.current = now;
      },
      [liked, user, lynk.id]
    );

    const handleLikeButton = async () => {
      if (!user) return;
      const wasLiked = liked;
      setLiked(!wasLiked);
      setLocalLikes((l) => l + (wasLiked ? -1 : 1));
      await toggleLynkLike(lynk.id, user.uid, wasLiked);
      if (!wasLiked) sessionHistory.markLiked(lynk.id);
    };

    const handleSave = async () => {
      if (!user) return;
      const wasSaved = saved;
      setSaved(!wasSaved);
      await toggleLynkSave(lynk.id, user.uid, wasSaved);
    };

    const handleShare = async () => {
      const url = `${window.location.origin}/lynks/${lynk.id}`;
      if (navigator.share) {
        await navigator.share({ title: lynk.caption, url });
      } else {
        navigator.clipboard.writeText(url);
      }
      await incrementLynkShare(lynk.id);
    };

    return (
      <div className="relative w-full h-full bg-black overflow-hidden select-none">
        {/* Video */}
        <video
          ref={videoRef}
          src={lynk.videoUrl}
          poster={lynk.thumbnailUrl}
          muted={muted}
          playsInline
          loop={false}
          onEnded={handleEnded}
          onClick={handleTap}
          className="absolute inset-0 w-full h-full object-cover"
          preload="metadata"
        />

        {/* Pause indicator */}
        <AnimatePresence>
          {paused && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 0.7, scale: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 flex items-center justify-center pointer-events-none"
            >
              <div className="w-20 h-20 rounded-full bg-black/50 flex items-center justify-center">
                <svg className="w-10 h-10 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                </svg>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Double-tap heart animation */}
        <AnimatePresence>
          {showHeart && (
            <motion.div
              className="absolute inset-0 flex items-center justify-center pointer-events-none"
              initial={{ opacity: 1, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1.4 }}
              exit={{ opacity: 0, scale: 2 }}
              transition={{ duration: 0.4 }}
            >
              <Heart className="w-24 h-24 text-red-500 fill-red-500 drop-shadow-2xl" />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Mute toggle */}
        <button
          onClick={(e) => { e.stopPropagation(); setMuted((m) => !m); }}
          className="absolute top-4 right-4 w-9 h-9 rounded-full bg-black/40 flex items-center justify-center text-white backdrop-blur-sm z-10"
        >
          {muted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
        </button>

        {/* Right-side action bar */}
        <div className="absolute right-3 bottom-28 flex flex-col items-center gap-5 z-10">
          {/* Like */}
          <button onClick={handleLikeButton} className="flex flex-col items-center gap-1">
            <motion.div whileTap={{ scale: 1.3 }}>
              <Heart
                className={cn(
                  'w-7 h-7 drop-shadow-lg transition-colors',
                  liked ? 'text-red-500 fill-red-500' : 'text-white'
                )}
              />
            </motion.div>
            <span className="text-white text-xs font-semibold drop-shadow">
              {formatCount(localLikes)}
            </span>
          </button>

          {/* Comment */}
          <button
            onClick={(e) => { e.stopPropagation(); setCommentsOpen(true); }}
            className="flex flex-col items-center gap-1"
          >
            <MessageCircle className="w-7 h-7 text-white drop-shadow-lg" />
            <span className="text-white text-xs font-semibold drop-shadow">
              {formatCount(lynk.commentsCount)}
            </span>
          </button>

          {/* Share */}
          <button onClick={handleShare} className="flex flex-col items-center gap-1">
            <Share2 className="w-7 h-7 text-white drop-shadow-lg" />
            <span className="text-white text-xs font-semibold drop-shadow">
              {formatCount(lynk.sharesCount)}
            </span>
          </button>

          {/* Save */}
          <button onClick={handleSave} className="flex flex-col items-center gap-1">
            <Bookmark
              className={cn(
                'w-7 h-7 drop-shadow-lg transition-colors',
                saved ? 'text-yellow-400 fill-yellow-400' : 'text-white'
              )}
            />
            <span className="text-white text-xs font-semibold drop-shadow">Save</span>
          </button>

          {/* Report */}
          <button
            onClick={(e) => { e.stopPropagation(); onReportClick(lynk.id); }}
            className="flex flex-col items-center gap-1 opacity-60"
          >
            <Flag className="w-5 h-5 text-white" />
          </button>
        </div>

        {/* Bottom overlay — user + caption + hashtags */}
        <div className="absolute bottom-0 left-0 right-0 px-4 pb-20 pt-16 bg-gradient-to-t from-black/80 via-black/20 to-transparent pointer-events-none">
          {/* User */}
          <button
            className="flex items-center gap-2 mb-2 pointer-events-auto"
            onClick={(e) => { e.stopPropagation(); onUserClick(lynk.username); }}
          >
            <img
              src={
                lynk.userProfileImage ||
                `https://api.dicebear.com/7.x/avataaars/svg?seed=${lynk.username}`
              }
              alt={lynk.username}
              className="w-9 h-9 rounded-full border-2 border-white object-cover"
            />
            <span className="text-white font-bold text-sm drop-shadow">@{lynk.username}</span>
          </button>

          {/* Caption */}
          <p className="text-white text-sm leading-snug line-clamp-3 drop-shadow mb-1">
            {lynk.caption}
          </p>

          {/* Hashtags */}
          <div className="flex flex-wrap gap-1 pointer-events-auto">
            {lynk.hashtags.slice(0, 5).map((tag) => (
              <button
                key={tag}
                onClick={(e) => { e.stopPropagation(); onHashtagClick(tag); }}
                className="text-sky-300 text-xs font-semibold hover:text-sky-100 transition-colors"
              >
                #{tag}
              </button>
            ))}
          </div>

          {/* Views */}
          <p className="text-white/60 text-xs mt-1 drop-shadow">
            {formatCount(lynk.viewsCount)} views
          </p>
        </div>

        {/* Comments sheet */}
        <LynkCommentsSheet
          lynkId={lynk.id}
          open={commentsOpen}
          onClose={() => setCommentsOpen(false)}
        />
      </div>
    );
  }
);

LynkPlayer.displayName = 'LynkPlayer';
export default LynkPlayer;

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}
