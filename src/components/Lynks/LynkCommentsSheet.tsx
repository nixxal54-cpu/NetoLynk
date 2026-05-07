/**
 * LynkCommentsSheet.tsx — Instagram-style comments UI
 */
import React, { useState, useEffect, useRef } from 'react';
import { Send, Heart, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { subscribeToLynkComments, addLynkComment } from '../../lib/lynkService';
import { LynkComment } from '../../types/lynk';
import { useAuth } from '../../context/AuthContext';
import { formatDistanceToNow } from 'date-fns';

interface Props { lynkId: string; open: boolean; onClose: () => void; }

const REACTIONS = ['❤️', '😢', '🔥', '💜', '😍', '😮', '🤣', '🙌'];

export default function LynkCommentsSheet({ lynkId, open, onClose }: Props) {
  const { user } = useAuth();
  const [comments, setComments] = useState<LynkComment[]>([]);
  const [text, setText]         = useState('');
  const [sending, setSending]   = useState(false);
  const [likedComments, setLikedComments] = useState<Set<string>>(new Set());
  const listRef  = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const unsub = subscribeToLynkComments(lynkId, setComments);
    return unsub;
  }, [open, lynkId]);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [comments]);

  const handleSend = async () => {
    if (!user || !text.trim() || sending) return;
    setSending(true);
    await addLynkComment(lynkId, user.uid, user.username, user.profileImage, text.trim());
    setText('');
    setSending(false);
    inputRef.current?.focus();
  };

  const toggleCommentLike = (id: string) => {
    setLikedComments(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const addReaction = (emoji: string) => {
    setText(prev => prev + emoji);
    inputRef.current?.focus();
  };

  const fmt = (d: string) => {
    try { return formatDistanceToNow(new Date(d), { addSuffix: true }); }
    catch { return ''; }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-black/60 z-20"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Sheet */}
          <motion.div
            className="absolute bottom-0 left-0 right-0 z-30 flex flex-col"
            style={{ height: '72%', background: '#1a1a1a', borderRadius: '16px 16px 0 0' }}
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 32, stiffness: 320 }}
            onClick={e => e.stopPropagation()}
          >
            {/* Handle bar */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-white/20" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-4 py-2">
              <span className="text-white font-bold text-base">
                Comments {comments.length > 0 && <span className="text-white/50 font-normal text-sm">{comments.length}</span>}
              </span>
              <button onClick={onClose} className="text-white/60 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Comments list */}
            <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-2 space-y-4">
              {comments.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full gap-3 text-white/40">
                  <span className="text-4xl">💬</span>
                  <p className="text-sm">No comments yet. Be the first!</p>
                </div>
              )}

              {comments.map((c) => (
                <div key={c.id} className="flex gap-3 items-start group">
                  {/* Avatar */}
                  <img
                    src={c.userProfileImage || `https://api.dicebear.com/7.x/avataaars/svg?seed=${c.username}`}
                    className="w-8 h-8 rounded-full object-cover flex-shrink-0 mt-0.5"
                    alt={c.username}
                  />

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="text-white font-semibold text-sm">@{c.username}</span>
                      <span className="text-white/40 text-xs">{fmt(c.createdAt)}</span>
                    </div>
                    <p className="text-white/90 text-sm mt-0.5 leading-snug">{c.text}</p>

                    {/* Reply row */}
                    <div className="flex items-center gap-4 mt-1">
                      <button className="text-white/40 text-xs hover:text-white/70 transition-colors">
                        Reply
                      </button>
                    </div>
                  </div>

                  {/* Like comment */}
                  <button
                    className="flex flex-col items-center gap-0.5 ml-2 flex-shrink-0"
                    onClick={() => toggleCommentLike(c.id)}
                  >
                    <Heart
                      className={`w-4 h-4 transition-all ${
                        likedComments.has(c.id)
                          ? 'fill-red-500 text-red-500 scale-110'
                          : 'text-white/40'
                      }`}
                    />
                  </button>
                </div>
              ))}
            </div>

            {/* Reaction bar */}
            <div className="px-4 py-2 flex gap-3 border-t border-white/10">
              {REACTIONS.map(emoji => (
                <button
                  key={emoji}
                  onClick={() => addReaction(emoji)}
                  className="text-xl hover:scale-125 transition-transform active:scale-95"
                >
                  {emoji}
                </button>
              ))}
            </div>

            {/* Input bar */}
            <div
              className="flex items-center gap-3 px-4 py-3 border-t border-white/10"
              style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}
            >
              <img
                src={user?.profileImage || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user?.username}`}
                className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                alt={user?.username}
              />
              <div className="flex-1 flex items-center bg-white/10 rounded-full px-4 py-2 gap-2">
                <input
                  ref={inputRef}
                  className="flex-1 bg-transparent text-white text-sm outline-none placeholder-white/40"
                  placeholder="Add a comment…"
                  value={text}
                  onChange={e => setText(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleSend(); }}
                />
                <AnimatePresence>
                  {text.trim() && (
                    <motion.button
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0, opacity: 0 }}
                      onClick={handleSend}
                      disabled={sending}
                      className="text-blue-400 disabled:opacity-40"
                    >
                      <Send className="w-4 h-4" />
                    </motion.button>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
