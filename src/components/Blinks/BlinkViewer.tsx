/**
 * BlinkViewer.tsx
 * Full-screen Blink viewer with:
 *  - Progress bars per blink
 *  - Auto-advance
 *  - Tap left/right to skip
 *  - Emoji reaction picker
 *  - Reply input
 *  - Swipe-up to close
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { X, ChevronLeft, Send, Trash2, Music2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '../../context/AuthContext';
import { UserBlinks, Blink } from '../../types/blink';
import { useBlinks } from '../../hooks/useBlinks';
import { cn } from '../../lib/utils';
import { formatDate } from '../../lib/utils';

const IMAGE_DURATION = 5000; // ms per image blink
const QUICK_REACTIONS = ['❤️', '🔥', '😂', '😮', '😢', '👏'];

interface BlinkViewerProps {
  userBlinks: UserBlinks;
  startIndex?: number;
  onClose: () => void;
  onPrevUser?: () => void;
  onNextUser?: () => void;
}

function ProgressBars({ total, current, progress }: { total: number; current: number; progress: number }) {
  return (
    <div className="flex gap-1 px-3 pt-2">
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} className="flex-1 h-0.5 rounded-full bg-white/30 overflow-hidden">
          <div
            className="h-full bg-white rounded-full transition-none"
            style={{
              width: i < current ? '100%' : i === current ? `${progress}%` : '0%',
            }}
          />
        </div>
      ))}
    </div>
  );
}

export const BlinkViewer: React.FC<BlinkViewerProps> = ({
  userBlinks,
  startIndex = 0,
  onClose,
  onPrevUser,
  onNextUser,
}) => {
  const { user } = useAuth();
  const { markViewed, sendReaction, sendReply, deleteBlink } = useBlinks();

  const [currentIdx, setCurrentIdx] = useState(startIndex);
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reply, setReply] = useState('');
  const [showReactions, setShowReactions] = useState(false);
  const [reactionSent, setReactionSent] = useState<string | null>(null);
  const [showReply, setShowReply] = useState(false);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const progressRef = useRef(0);
  const startTimeRef = useRef<number>(Date.now());

  const blink: Blink = userBlinks.blinks[currentIdx];
  const isOwn = blink?.userId === user?.uid;
  const totalBlinks = userBlinks.blinks.length;

  const stopTimer = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
  }, []);

  const goNext = useCallback(() => {
    if (currentIdx < totalBlinks - 1) {
      setCurrentIdx(i => i + 1);
      setProgress(0);
      progressRef.current = 0;
    } else {
      onNextUser?.() ?? onClose();
    }
  }, [currentIdx, totalBlinks, onNextUser, onClose]);

  const goPrev = useCallback(() => {
    if (currentIdx > 0) {
      setCurrentIdx(i => i - 1);
      setProgress(0);
      progressRef.current = 0;
    } else {
      onPrevUser?.();
    }
  }, [currentIdx, onPrevUser]);

  // Mark viewed & start timer for images
  useEffect(() => {
    if (!blink) return;
    markViewed(blink.id);
    setProgress(0);
    progressRef.current = 0;
    startTimeRef.current = Date.now();

    // Play blink music if present
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    if (blink.musicUrl) {
      const audio = new Audio(blink.musicUrl);
      audio.loop = true;
      audio.volume = 0.6;
      audio.play().catch(() => {});
      audioRef.current = audio;
    }

    if (blink.type === 'image') {
      stopTimer();
      const TICK = 50;
      intervalRef.current = setInterval(() => {
        if (paused) return;
        const elapsed = Date.now() - startTimeRef.current;
        const pct = Math.min((elapsed / IMAGE_DURATION) * 100, 100);
        setProgress(pct);
        progressRef.current = pct;
        if (pct >= 100) { stopTimer(); goNext(); }
      }, TICK);
    }

    return () => { stopTimer(); audioRef.current?.pause(); };
  }, [blink?.id, paused]);

  // For video: drive progress bar from video timeupdate
  const handleVideoTimeUpdate = useCallback(() => {
    const vid = videoRef.current;
    if (!vid || !vid.duration) return;
    setProgress((vid.currentTime / vid.duration) * 100);
  }, []);

  const handleVideoEnded = useCallback(() => {
    goNext();
  }, [goNext]);

  // Pause/resume
  const handlePause = () => {
    setPaused(true);
    if (videoRef.current) videoRef.current.pause();
    if (audioRef.current) audioRef.current.pause();
  };
  const handleResume = () => {
    setPaused(false);
    startTimeRef.current = Date.now() - (progressRef.current / 100) * IMAGE_DURATION;
    if (videoRef.current) videoRef.current.play();
    if (audioRef.current) audioRef.current.play().catch(() => {});
  };

  const handleReaction = async (emoji: string) => {
    setReactionSent(emoji);
    setShowReactions(false);
    await sendReaction(blink.id, emoji);
    setTimeout(() => setReactionSent(null), 2000);
  };

  const handleReply = async () => {
    if (!reply.trim()) return;
    await sendReply(blink, reply.trim());
    setReply('');
    setShowReply(false);
  };

  const handleDelete = async () => {
    await deleteBlink(blink.id);
    goNext();
  };

  // Stop music when viewer unmounts
  useEffect(() => () => { audioRef.current?.pause(); }, []);

  if (!blink) return null;

  const timeAgo = (() => {
    const ms = Date.now() - new Date(blink.createdAt).getTime();
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    return h > 0 ? `${h}h ago` : `${m}m ago`;
  })();

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.15, ease: 'easeOut' }}
      className="fixed inset-0 z-[100] bg-black flex flex-col select-none"
      onMouseDown={handlePause}
      onMouseUp={handleResume}
      onTouchStart={handlePause}
      onTouchEnd={handleResume}
    >
      {/* ── Progress bars ── */}
      <ProgressBars total={totalBlinks} current={currentIdx} progress={progress} />

      {/* ── Header ── */}
      <div className="flex items-center gap-3 px-3 py-2.5">
        {/* Tap zones handled below — header is just display */}
        <img
          src={userBlinks.userProfileImage ?? `https://api.dicebear.com/7.x/avataaars/svg?seed=${userBlinks.username}`}
          alt={userBlinks.username}
          className="w-9 h-9 rounded-full object-cover ring-2 ring-white/20"
        />
        <div className="flex-1">
          <p className="font-bold text-white text-sm leading-none">{userBlinks.userDisplayName}</p>
          <p className="text-white/60 text-xs mt-0.5">@{userBlinks.username} · {timeAgo}</p>
        </div>
        {isOwn && (
          <button
            onMouseDown={e => e.stopPropagation()}
            onTouchStart={e => e.stopPropagation()}
            onClick={handleDelete}
            className="p-2 rounded-full hover:bg-white/10 text-white/70 hover:text-red-400 transition-colors"
          >
            <Trash2 className="w-5 h-5" />
          </button>
        )}
        <button
          onMouseDown={e => e.stopPropagation()}
          onTouchStart={e => e.stopPropagation()}
          onClick={onClose}
          className="p-2 rounded-full hover:bg-white/10 text-white transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* ── Media area ── */}
      <div className="relative flex-1 overflow-hidden">
        {/* Tap left to go back */}
        <button
          className="absolute left-0 top-0 bottom-0 w-1/3 z-10"
          onMouseDown={e => e.stopPropagation()}
          onTouchStart={e => e.stopPropagation()}
          onClick={goPrev}
        />
        {/* Tap right to go forward */}
        <button
          className="absolute right-0 top-0 bottom-0 w-1/3 z-10"
          onMouseDown={e => e.stopPropagation()}
          onTouchStart={e => e.stopPropagation()}
          onClick={goNext}
        />

        <AnimatePresence mode="wait">
          <motion.div
            key={blink.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.1 }}
            className="w-full h-full"
          >
            {blink.type === 'image' ? (
              <img
                src={blink.mediaUrl}
                alt="Blink"
                className="w-full h-full object-cover"
                draggable={false}
              />
            ) : (
              <video
                ref={videoRef}
                src={blink.mediaUrl}
                autoPlay
                playsInline
                muted={false}
                className="w-full h-full object-cover"
                onTimeUpdate={handleVideoTimeUpdate}
                onEnded={handleVideoEnded}
              />
            )}
          </motion.div>
        </AnimatePresence>

        {/* Text overlay */}
        {blink.textOverlay && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20 px-6">
            <p className="text-center font-bold text-2xl drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)] leading-tight"
              style={{ color: blink.textOverlayColor ?? '#ffffff' }}>
              {blink.textOverlay}
            </p>
          </div>
        )}

        {/* Music badge */}
        {blink.musicTitle && (
          <div className="absolute top-4 left-4 z-20 flex items-center gap-1.5 bg-black/50 backdrop-blur-md rounded-full px-3 py-1 border border-white/10 pointer-events-none">
            <Music2 className="w-3 h-3 text-white animate-pulse flex-shrink-0" />
            <span className="text-white text-[11px] font-medium truncate max-w-[160px]">{blink.musicTitle}</span>
          </div>
        )}

        {/* Paused indicator */}
        {paused && (
          <div className="absolute inset-0 bg-black/20 flex items-center justify-center pointer-events-none z-30">
            <div className="w-14 h-14 rounded-full bg-black/50 flex items-center justify-center">
              <div className="flex gap-1.5">
                <div className="w-1.5 h-6 bg-white rounded-full" />
                <div className="w-1.5 h-6 bg-white rounded-full" />
              </div>
            </div>
          </div>
        )}

        {/* Reaction sent animation */}
        <AnimatePresence>
          {reactionSent && (
            <motion.div
              key={reactionSent}
              initial={{ scale: 0.5, opacity: 0, y: 0 }}
              animate={{ scale: 1.5, opacity: 1, y: -40 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
              className="absolute bottom-24 left-1/2 -translate-x-1/2 text-5xl pointer-events-none z-40"
            >
              {reactionSent}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Caption ── */}
      {blink.caption && (
        <div className="px-4 py-2">
          <p className="text-white text-sm">{blink.caption}</p>
        </div>
      )}

      {/* ── Footer: Reactions + Reply ── */}
      <div
        className="flex items-center gap-3 px-4 pb-6 pt-2"
        onMouseDown={e => e.stopPropagation()}
        onTouchStart={e => e.stopPropagation()}
      >
        {!isOwn && (
          <>
            {/* Reply input */}
            {showReply ? (
              <div className="flex-1 flex items-center gap-2">
                <input
                  autoFocus
                  type="text"
                  value={reply}
                  onChange={e => setReply(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleReply()}
                  placeholder="Reply to Blink..."
                  className="flex-1 bg-white/10 border border-white/20 text-white placeholder:text-white/50 rounded-full px-4 py-2 text-sm outline-none focus:border-white/50"
                />
                <button
                  onClick={handleReply}
                  disabled={!reply.trim()}
                  className="p-2 bg-primary text-white rounded-full disabled:opacity-50"
                >
                  <Send className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setShowReply(false)}
                  className="p-2 text-white/60"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <>
                <button
                  onClick={() => setShowReply(true)}
                  className="flex-1 bg-white/10 border border-white/20 text-white/60 rounded-full px-4 py-2 text-sm text-left hover:bg-white/15 transition-colors"
                >
                  Reply to Blink...
                </button>

                {/* Quick reactions */}
                <div className="relative">
                  <button
                    onClick={() => setShowReactions(v => !v)}
                    className="text-2xl hover:scale-110 transition-transform active:scale-95"
                  >
                    ❤️
                  </button>
                  <AnimatePresence>
                    {showReactions && (
                      <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.9 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.9 }}
                        transition={{ duration: 0.15 }}
                        className="absolute bottom-10 right-0 bg-card border border-border rounded-2xl p-2 flex gap-2 shadow-xl"
                      >
                        {QUICK_REACTIONS.map(emoji => (
                          <button
                            key={emoji}
                            onClick={() => handleReaction(emoji)}
                            className="text-2xl hover:scale-125 transition-transform active:scale-95"
                          >
                            {emoji}
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </>
            )}
          </>
        )}

        {isOwn && (
          <div className="flex-1 text-center">
            <p className="text-white/50 text-xs">{blink.viewsCount} views</p>
          </div>
        )}
      </div>
    </motion.div>
  );
};
