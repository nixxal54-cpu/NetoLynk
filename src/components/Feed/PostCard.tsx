import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Heart,
  MessageCircle,
  Share2,
  Bookmark,
  MoreHorizontal,
  Trash2,
  Edit3,
  Angry,
  Leaf,
  Skull,
  Flame,
  Sparkles,
  Coffee,
  CloudRain,
  Rocket,
  Smile,
  Send,
  X,
  Check,
  Loader2,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Post, User } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { cn } from '../../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import {
  doc,
  updateDoc,
  arrayUnion,
  arrayRemove,
  increment,
  deleteDoc,
  addDoc,
  collection,
  getDoc,
  getDocs,
  query,
  where,
  setDoc,
  runTransaction,
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { toast } from 'sonner';

interface PostCardProps {
  post: Post;
}

// ── Mood icon helper ──────────────────────────────────────────────────────────
export const getMoodIconByLabel = (label: string) => {
  switch (label) {
    case 'Frustrated':   return <Angry      className="w-4 h-4" />;
    case 'Peaceful':     return <Leaf       className="w-4 h-4" />;
    case 'Dead inside':  return <Skull      className="w-4 h-4" />;
    case 'Hyped':        return <Flame      className="w-4 h-4 text-orange-500" />;
    case 'Feeling cute': return <Sparkles   className="w-4 h-4 text-yellow-500" />;
    case 'Need coffee':  return <Coffee     className="w-4 h-4 text-amber-700" />;
    case 'Crying':       return <CloudRain  className="w-4 h-4 text-blue-500" />;
    case 'Productive':   return <Rocket     className="w-4 h-4 text-purple-500" />;
    default:             return <Smile      className="w-4 h-4" />;
  }
};

// ── ShareSheet ────────────────────────────────────────────────────────────────
interface ShareSheetProps {
  post: Post;
  onClose: () => void;
}

const ShareSheet: React.FC<ShareSheetProps> = ({ post, onClose }) => {
  const { user } = useAuth();
  const [followingUsers, setFollowingUsers] = useState<User[]>([]);
  const [loadingFollowing, setLoadingFollowing] = useState(true);
  const [sending, setSending] = useState<string | null>(null);
  const [sent, setSent] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const fetchFollowing = async () => {
      try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (cancelled) return;
        const followingIds: string[] = userDoc.data()?.following || [];
        if (followingIds.length === 0) {
          setFollowingUsers([]);
          return;
        }
        // Firestore 'in' queries support max 10 items per query
        const chunks: string[][] = [];
        for (let i = 0; i < followingIds.length; i += 10) {
          chunks.push(followingIds.slice(i, i + 10));
        }
        const results = await Promise.all(
          chunks.map(chunk =>
            getDocs(query(collection(db, 'users'), where('uid', 'in', chunk)))
          )
        );
        if (cancelled) return;
        const users = results.flatMap(snap =>
          snap.docs.map(d => ({ ...d.data(), uid: d.id } as User))
        );
        setFollowingUsers(users);
      } catch (e) {
        console.error('Failed to fetch following:', e);
      } finally {
        if (!cancelled) setLoadingFollowing(false);
      }
    };
    fetchFollowing();
    return () => { cancelled = true; };
  }, [user]);

  const handleSendToUser = async (recipient: User) => {
    if (!user || sending) return;
    setSending(recipient.uid);
    try {
      const chatId = [user.uid, recipient.uid].sort().join('_');
      const chatRef = doc(db, 'chats', chatId);
      await setDoc(chatRef, {
        participants: [user.uid, recipient.uid],
        participantDetails: {
          [user.uid]: {
            username: user.username,
            displayName: user.displayName,
            profileImage: user.profileImage || '',
          },
          [recipient.uid]: {
            username: recipient.username,
            displayName: recipient.displayName,
            profileImage: recipient.profileImage || '',
          },
        },
        lastMessage: 'Shared a post',
        lastMessageAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }, { merge: true });

      await addDoc(collection(db, 'chats', chatId, 'messages'), {
        chatId,
        senderId: user.uid,
        text: `📎 Shared a post: "${post.text?.slice(0, 50) || 'media'}"`,
        type: 'text',
        createdAt: new Date().toISOString(),
      });

      // sharesCount is in the allowed update fields per Firestore rules
      await updateDoc(doc(db, 'posts', post.id), {
        sharesCount: increment(1),
      });

      setSent(prev => new Set(prev).add(recipient.uid));
      toast.success(`Sent to @${recipient.username}`);
    } catch {
      toast.error('Failed to send');
    } finally {
      setSending(null);
    }
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/60 z-[60]"
        onClick={onClose}
      />
      <motion.div
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        className="fixed bottom-0 left-0 right-0 z-[70] bg-card rounded-t-3xl p-5 border-t border-border max-h-[70vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-lg">Send to</h3>
          <button onClick={onClose} className="p-2 hover:bg-accent rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {loadingFollowing ? (
          <div className="flex justify-center py-6">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : followingUsers.length === 0 ? (
          <p className="text-center text-muted-foreground text-sm py-6">
            You're not following anyone yet.
          </p>
        ) : (
          <div className="space-y-3">
            {followingUsers.map(u => (
              <div key={u.uid} className="flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <img
                    src={u.profileImage || `https://api.dicebear.com/7.x/avataaars/svg?seed=${u.uid}`}
                    className="w-10 h-10 rounded-full object-cover flex-shrink-0"
                    alt={u.displayName}
                  />
                  <div className="min-w-0">
                    <p className="font-bold truncate">{u.displayName}</p>
                    <p className="text-sm text-muted-foreground truncate">@{u.username}</p>
                  </div>
                </div>
                <button
                  onClick={() => handleSendToUser(u)}
                  disabled={sent.has(u.uid) || sending === u.uid}
                  className={cn(
                    'flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-bold transition-all flex-shrink-0 ml-3',
                    sent.has(u.uid)
                      ? 'bg-accent text-muted-foreground'
                      : 'bg-primary text-primary-foreground hover:opacity-90'
                  )}
                >
                  {sending === u.uid ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : sent.has(u.uid) ? (
                    <><Check className="w-3.5 h-3.5" /> Sent</>
                  ) : (
                    'Send'
                  )}
                </button>
              </div>
            ))}
          </div>
        )}
      </motion.div>
    </>
  );
};

// ── PostCard ──────────────────────────────────────────────────────────────────
export const PostCard: React.FC<PostCardProps> = ({ post }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const menuRef = useRef<HTMLDivElement>(null);

  // Derive liked/saved from arrays on every render — never stale local boolean state
  const isLiked = user ? (post.likedBy ?? []).includes(user.uid) : false;
  const isSaved = user ? (post.savedBy ?? []).includes(user.uid) : false;
  const isOwnPost = user?.uid === post.userId;

  // Optimistic counters — mirrors server state, rolls back on error
  const [optimisticLikes, setOptimisticLikes] = useState<number | null>(null);
  const [isLiking, setIsLiking]   = useState(false);
  const [isSaving, setIsSaving]   = useState(false);
  const [showMenu, setShowMenu]   = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(post.text || '');
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [showShareSheet, setShowShareSheet] = useState(false);

  // Keep optimistic counter in sync when real server value changes
  useEffect(() => {
    if (!isLiking) {
      setOptimisticLikes(null);
    }
  }, [post.likesCount, isLiking]);

  // Close menu on outside click
  useEffect(() => {
    if (!showMenu) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showMenu]);

  // ── Like — optimistic UI with rollback ───────────────────────────────────
  // FIX: Only writes to 'likedBy' (allowed by Firestore rules).
  // likesCount is maintained by Cloud Functions — do NOT write it from client.
  const handleLike = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user || isLiking) return;

    const wasLiked = isLiked;
    const prevCount = post.likesCount ?? 0;

    // Optimistic update immediately
    setIsLiking(true);
    setOptimisticLikes(wasLiked ? prevCount - 1 : prevCount + 1);

    try {
      const postRef = doc(db, 'posts', post.id);
      if (wasLiked) {
        // FIX: removed likesCount: increment(-1) — violates Firestore rules
        await updateDoc(postRef, {
          likedBy: arrayRemove(user.uid),
        });
      } else {
        // FIX: removed likesCount: increment(1) — violates Firestore rules
        await updateDoc(postRef, {
          likedBy: arrayUnion(user.uid),
        });
        // Fire-and-forget notification (non-blocking)
        if (post.userId !== user.uid) {
          addDoc(collection(db, 'notifications'), {
            recipientId: post.userId,
            senderId: user.uid,
            senderUsername: user.username,
            senderProfileImage: user.profileImage || '',
            type: 'like',
            postId: post.id,
            read: false,
            createdAt: new Date().toISOString(),
          }).catch(() => {}); // never throw — notification is best-effort
        }
      }
    } catch (err) {
      // Rollback optimistic update on failure
      setOptimisticLikes(prevCount);
      toast.error('Failed to like post. Please try again.');
      console.error('Like error:', err);
    } finally {
      setIsLiking(false);
    }
  }, [user, isLiking, isLiked, post]);

  // ── Save ─────────────────────────────────────────────────────────────────
  const handleSave = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user || isSaving) return;
    setIsSaving(true);
    try {
      const postRef = doc(db, 'posts', post.id);
      if (isSaved) {
        await updateDoc(postRef, { savedBy: arrayRemove(user.uid) });
        toast.success('Removed from saved');
      } else {
        await updateDoc(postRef, { savedBy: arrayUnion(user.uid) });
        toast.success('Post saved');
      }
    } catch (err) {
      toast.error('Failed to save post. Please try again.');
      console.error('Save error:', err);
    } finally {
      setIsSaving(false);
    }
  }, [user, isSaving, isSaved, post.id]);

  // ── Delete ────────────────────────────────────────────────────────────────
  const handleDelete = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user || !isOwnPost || isDeleting) return;
    setIsDeleting(true);
    try {
      await deleteDoc(doc(db, 'posts', post.id));
      toast.success('Post deleted');
    } catch (err) {
      toast.error('Failed to delete post. Please try again.');
      console.error('Delete error:', err);
      setIsDeleting(false);
    }
    setShowMenu(false);
  }, [user, isOwnPost, isDeleting, post.id]);

  // ── Edit ──────────────────────────────────────────────────────────────────
  const handleSaveEdit = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!editContent.trim() || isSavingEdit) return;
    setIsSavingEdit(true);
    try {
      await updateDoc(doc(db, 'posts', post.id), { text: editContent.trim() });
      toast.success('Post updated');
      setIsEditing(false);
    } catch (err) {
      toast.error('Failed to update post. Please try again.');
      console.error('Edit error:', err);
    } finally {
      setIsSavingEdit(false);
    }
  }, [editContent, isSavingEdit, post.id]);

  // Displayed counts — optimistic for likes, real value from Firestore for rest
  const likesCount    = optimisticLikes ?? (post.likesCount ?? 0);
  const commentsCount = post.commentsCount ?? 0;
  const sharesCount   = post.sharesCount ?? 0;

  return (
    <>
      <motion.article
        onClick={() => !isEditing && navigate(`/post/${post.id}`)}
        className="border-b border-border p-4 hover:bg-accent/5 transition-all cursor-pointer relative"
      >
        <div className="flex gap-3">
          {/* Avatar */}
          <img
            src={post.userProfileImage || `https://api.dicebear.com/7.x/avataaars/svg?seed=${post.username}`}
            className="w-12 h-12 rounded-full object-cover shrink-0 cursor-pointer"
            alt={post.username}
            onClick={(e) => { e.stopPropagation(); navigate(`/profile/${post.username}`); }}
          />

          <div className="flex-1 min-w-0">
            {/* Header row */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1 min-w-0 truncate">
                <span
                  className="font-bold hover:underline cursor-pointer truncate"
                  onClick={(e) => { e.stopPropagation(); navigate(`/profile/${post.username}`); }}
                >
                  {post.username}
                </span>
                <span className="text-muted-foreground text-sm truncate">·</span>
                <span className="text-muted-foreground text-sm flex-shrink-0">
                  {formatDistanceToNow(new Date(post.createdAt), { addSuffix: true })}
                </span>
              </div>

              {/* Menu — only for own posts */}
              {isOwnPost && (
                <div className="relative flex-shrink-0" ref={menuRef}>
                  <button
                    onClick={(e) => { e.stopPropagation(); setShowMenu(v => !v); }}
                    className="p-1.5 hover:bg-accent rounded-full text-muted-foreground transition-colors"
                  >
                    <MoreHorizontal className="w-5 h-5" />
                  </button>
                  <AnimatePresence>
                    {showMenu && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: -4 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: -4 }}
                        transition={{ duration: 0.12 }}
                        onClick={(e) => e.stopPropagation()}
                        className="absolute right-0 top-full mt-1 z-30 bg-background border border-border rounded-xl shadow-xl py-1 w-40 overflow-hidden"
                      >
                        <button
                          onClick={(e) => { e.stopPropagation(); setIsEditing(true); setShowMenu(false); }}
                          className="w-full flex items-center gap-2.5 px-4 py-2.5 hover:bg-accent transition-colors text-sm"
                        >
                          <Edit3 className="w-4 h-4" /> Edit
                        </button>
                        <button
                          onClick={handleDelete}
                          disabled={isDeleting}
                          className="w-full flex items-center gap-2.5 px-4 py-2.5 hover:bg-accent transition-colors text-sm text-destructive"
                        >
                          {isDeleting
                            ? <Loader2 className="w-4 h-4 animate-spin" />
                            : <Trash2 className="w-4 h-4" />}
                          Delete
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}
            </div>

            {/* Mood badge */}
            {post.mood && (
              <div className="mt-1.5 inline-flex items-center gap-1.5 bg-accent/30 px-2.5 py-1 rounded-full text-xs text-muted-foreground border border-border/50">
                {getMoodIconByLabel(post.mood.label)}
                <span>Feeling {post.mood.label.toLowerCase()}</span>
              </div>
            )}

            {/* Post text / edit mode */}
            {isEditing ? (
              <div onClick={(e) => e.stopPropagation()} className="mt-2 space-y-2">
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  className="w-full bg-accent/30 border border-border rounded-xl px-3 py-2 text-[15px] outline-none focus:border-primary transition-colors resize-none min-h-[80px]"
                  autoFocus
                  maxLength={2200}
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleSaveEdit}
                    disabled={!editContent.trim() || isSavingEdit}
                    className="flex items-center gap-1.5 px-4 py-1.5 bg-primary text-primary-foreground rounded-full text-sm font-bold disabled:opacity-50 hover:opacity-90 transition-opacity"
                  >
                    {isSavingEdit ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                    Save
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setIsEditing(false); setEditContent(post.text || ''); }}
                    className="flex items-center gap-1.5 px-4 py-1.5 bg-accent text-foreground rounded-full text-sm font-bold hover:opacity-80 transition-opacity"
                  >
                    <X className="w-3.5 h-3.5" /> Cancel
                  </button>
                </div>
              </div>
            ) : (
              post.text && (
                <p className="mt-2 text-[15px] leading-normal whitespace-pre-wrap break-words">
                  {post.text}
                </p>
              )
            )}

            {/* Media */}
            {post.mediaUrls?.length > 0 && (
              <div className={cn(
                'mt-3 rounded-2xl overflow-hidden border border-border',
                post.mediaUrls.length > 1 && 'grid grid-cols-2 gap-0.5'
              )}>
                {post.mediaUrls.map((url, idx) => (
                  <img
                    key={idx}
                    src={url}
                    className={cn(
                      'w-full object-cover',
                      post.mediaUrls.length === 1 ? 'max-h-[512px]' : 'h-48'
                    )}
                    loading="lazy"
                    alt=""
                  />
                ))}
              </div>
            )}

            {/* Tags */}
            {post.tags?.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {post.tags.map(tag => (
                  <span
                    key={tag}
                    onClick={(e) => e.stopPropagation()}
                    className="text-xs text-primary font-medium hover:underline cursor-pointer"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            )}

            {/* Action bar */}
            <div className="mt-4 flex items-center justify-between max-w-xs text-muted-foreground">
              {/* Like */}
              <button
                onClick={handleLike}
                disabled={!user || isLiking}
                aria-label={isLiked ? 'Unlike' : 'Like'}
                className={cn(
                  'flex items-center gap-1.5 transition-colors hover:text-pink-500 disabled:opacity-50 group',
                  isLiked && 'text-pink-500'
                )}
              >
                <Heart
                  className={cn(
                    'w-5 h-5 transition-transform group-active:scale-125',
                    isLiked && 'fill-current'
                  )}
                />
                <span className="text-sm tabular-nums">{likesCount > 0 ? likesCount : ''}</span>
              </button>

              {/* Comment */}
              <button
                onClick={(e) => { e.stopPropagation(); navigate(`/post/${post.id}?focus=comment`); }}
                aria-label="Comment"
                className="flex items-center gap-1.5 transition-colors hover:text-blue-500"
              >
                <MessageCircle className="w-5 h-5" />
                <span className="text-sm tabular-nums">{commentsCount > 0 ? commentsCount : ''}</span>
              </button>

              {/* Share */}
              <button
                onClick={(e) => { e.stopPropagation(); setShowShareSheet(true); }}
                aria-label="Share"
                className="flex items-center gap-1.5 transition-colors hover:text-green-500"
              >
                <Share2 className="w-5 h-5" />
                {sharesCount > 0 && <span className="text-sm tabular-nums">{sharesCount}</span>}
              </button>

              {/* Save */}
              <button
                onClick={handleSave}
                disabled={!user || isSaving}
                aria-label={isSaved ? 'Unsave' : 'Save'}
                className={cn(
                  'flex items-center gap-1.5 transition-colors hover:text-primary disabled:opacity-50 group',
                  isSaved && 'text-primary'
                )}
              >
                <Bookmark
                  className={cn(
                    'w-5 h-5 transition-transform group-active:scale-125',
                    isSaved && 'fill-current'
                  )}
                />
              </button>
            </div>
          </div>
        </div>
      </motion.article>

      <AnimatePresence>
        {showShareSheet && (
          <ShareSheet post={post} onClose={() => setShowShareSheet(false)} />
        )}
      </AnimatePresence>
    </>
  );
};
