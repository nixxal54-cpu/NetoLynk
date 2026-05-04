/**
 * LynkCommentsSheet.tsx
 * Slide-up sheet showing & adding comments for a Lynk.
 */
import React, { useState, useEffect, useRef } from 'react';
import { X, Send } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { subscribeToLynkComments, addLynkComment } from '../../lib/lynkService';
import { LynkComment } from '../../types/lynk';
import { useAuth } from '../../context/AuthContext';
import { formatDistanceToNow } from 'date-fns';

interface Props {
  lynkId: string;
  open: boolean;
  onClose: () => void;
}

export default function LynkCommentsSheet({ lynkId, open, onClose }: Props) {
  const { user } = useAuth();
  const [comments, setComments] = useState<LynkComment[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

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
    if (!user || !text.trim()) return;
    setSending(true);
    await addLynkComment(lynkId, user.uid, user.username, user.profileImage, text.trim());
    setText('');
    setSending(false);
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-black/50 z-20"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Sheet */}
          <motion.div
            className="absolute bottom-0 left-0 right-0 z-30 bg-background rounded-t-2xl flex flex-col max-h-[70%]"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Handle */}
            <div className="flex items-center justify-between px-4 pt-4 pb-2 border-b border-border">
              <h3 className="font-bold text-base">Comments ({comments.length})</h3>
              <button onClick={onClose}><X className="w-5 h-5" /></button>
            </div>

            {/* List */}
            <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
              {comments.length === 0 && (
                <p className="text-center text-muted-foreground text-sm py-8">
                  Be the first to comment!
                </p>
              )}
              {comments.map((c) => (
                <div key={c.id} className="flex gap-2">
                  <img
                    src={c.userProfileImage || `https://api.dicebear.com/7.x/avataaars/svg?seed=${c.username}`}
                    className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                    alt={c.username}
                  />
                  <div>
                    <span className="font-semibold text-sm">@{c.username}</span>
                    <span className="text-xs text-muted-foreground ml-2">
                      {formatDistanceToNow(new Date(c.createdAt), { addSuffix: true })}
                    </span>
                    <p className="text-sm">{c.text}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Input */}
            {user && (
              <div className="flex items-center gap-2 px-4 py-3 border-t border-border pb-[max(12px,env(safe-area-inset-bottom))]">
                <img
                  src={user.profileImage || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.username}`}
                  className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                  alt={user.username}
                />
                <input
                  className="flex-1 bg-muted rounded-full px-4 py-2 text-sm outline-none"
                  placeholder="Add a comment…"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSend(); }}
                />
                <button
                  onClick={handleSend}
                  disabled={sending || !text.trim()}
                  className="p-2 text-primary disabled:opacity-40"
                >
                  <Send className="w-5 h-5" />
                </button>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
