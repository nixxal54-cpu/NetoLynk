import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Heart, MessageCircle, Share2, Bookmark, MoreHorizontal, Trash2, Edit3,
  Angry, Leaf, Skull, Flame, Sparkles, Coffee, CloudRain, Rocket, Smile,
  X, Check, Loader2, Link2, Send, Twitter, MessageSquare,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Post, User } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { cn } from '../../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import {
  doc, updateDoc, arrayUnion, arrayRemove, increment, deleteDoc,
  addDoc, collection, getDoc, getDocs, query, where, setDoc,
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { toast } from 'sonner';

interface PostCardProps { post: Post; }

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

// ── Share Sheet ───────────────────────────────────────────────────────────────
const ShareSheet: React.FC<{ post: Post; onClose: () => void }> = ({ post, onClose }) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [followingUsers, setFollowingUsers] = useState<User[]>([]);
  const [loadingFollowing, setLoadingFollowing] = useState(true);
  const [sending, setSending] = useState<string | null>(null);
  const [sent, setSent] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [copied, setCopied] = useState(false);

  const postUrl = `${window.location.origin}/post/${post.id}`;
  const postText = post.text?.slice(0, 100) || 'Check this out on NetoLynk';

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const fetchFollowing = async () => {
      try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (cancelled) return;
        const followingIds: string[] = userDoc.data()?.following || [];
        if (!followingIds.length) { setFollowingUsers([]); setLoadingFollowing(false); return; }
        const chunks: string[][] = [];
        for (let i = 0; i < followingIds.length; i += 10) chunks.push(followingIds.slice(i, i + 10));
        const results = await Promise.all(chunks.map(chunk => getDocs(query(collection(db, 'users'), where('uid', 'in', chunk)))));
        if (cancelled) return;
        setFollowingUsers(results.flatMap(snap => snap.docs.map(d => ({ ...d.data(), uid: d.id } as User))));
      } catch (e) { console.error(e); } finally { if (!cancelled) setLoadingFollowing(false); }
    };
    fetchFollowing();
    return () => { cancelled = true; };
  }, [user]);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(postUrl);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = postUrl; document.body.appendChild(ta); ta.select();
      document.execCommand('copy'); document.body.removeChild(ta);
    }
    setCopied(true); toast.success('Link copied!');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShareExternal = (platform: 'twitter' | 'facebook' | 'whatsapp' | 'telegram') => {
    const eu = encodeURIComponent(postUrl), et = encodeURIComponent(postText);
    const urls: Record<string, string> = {
      twitter:  `https://twitter.com/intent/tweet?text=${et}&url=${eu}`,
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${eu}`,
      whatsapp: `https://wa.me/?text=${et}%20${eu}`,
      telegram: `https://t.me/share/url?url=${eu}&text=${et}`,
    };
    window.open(urls[platform], '_blank', 'noopener,noreferrer,width=600,height=400');
    updateDoc(doc(db, 'posts', post.id), { sharesCount: increment(1) }).catch(() => {});
    onClose();
  };

  const handleSendToUser = async (recipient: User) => {
    if (!user || sending) return;
    setSending(recipient.uid);
    try {
      const chatId = [user.uid, recipient.uid].sort().join('_');
      await setDoc(doc(db, 'chats', chatId), {
        participants: [user.uid, recipient.uid],
        participantDetails: {
          [user.uid]: { username: user.username, displayName: user.displayName, profileImage: user.profileImage || '' },
          [recipient.uid]: { username: recipient.username, displayName: recipient.displayName, profileImage: recipient.profileImage || '' },
        },
        lastMessage: '📎 Shared a post',
        lastMessageAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }, { merge: true });
      await addDoc(collection(db, 'chats', chatId, 'messages'), {
        chatId, senderId: user.uid, postId: post.id, deleted: false,
        text: `📎 Shared a post: "${post.text?.slice(0, 60) || 'media'}"`,
        type: 'text', createdAt: new Date().toISOString(),
      });
      await updateDoc(doc(db, 'posts', post.id), { sharesCount: increment(1) });
      setSent(prev => new Set(prev).add(recipient.uid));
      toast.success(`Sent to @${recipient.username}`);
    } catch { toast.error('Failed to send. Try again.'); } finally { setSending(null); }
  };

  const filteredUsers = followingUsers.filter(u =>
    !searchQuery ||
    u.displayName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.username?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 z-[60]" onClick={onClose} />
      <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 30, stiffness: 300 }} className="fixed bottom-0 left-0 right-0 z-[70] bg-background rounded-t-3xl border-t border-border max-h-[85vh] flex flex-col">
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0"><div className="w-10 h-1 bg-border rounded-full" /></div>
        <div className="flex items-center justify-between px-5 py-3 flex-shrink-0">
          <h3 className="font-bold text-lg">Share post</h3>
          <button onClick={onClose} className="p-2 hover:bg-accent rounded-full transition-colors"><X className="w-5 h-5" /></button>
        </div>
        <div className="overflow-y-auto flex-1 px-5 pb-8">
          {post.text && (
            <div className="bg-accent/40 rounded-2xl p-3 mb-5 border border-border">
              <p className="text-sm text-muted-foreground line-clamp-2">{post.text}</p>
              <p className="text-xs text-primary mt-1">@{post.username}</p>
            </div>
          )}

          {/* Quick actions row */}
          <div className="grid grid-cols-4 gap-3 mb-6">
            <button onClick={handleCopyLink} className="flex flex-col items-center gap-2">
              <div className={cn("w-12 h-12 rounded-full flex items-center justify-center transition-colors", copied ? "bg-green-500/20" : "bg-accent hover:bg-accent/80")}>
                {copied ? <Check className="w-5 h-5 text-green-500" /> : <Link2 className="w-5 h-5" />}
              </div>
              <span className="text-xs text-muted-foreground">{copied ? 'Copied!' : 'Copy link'}</span>
            </button>
            <button onClick={() => handleShareExternal('twitter')} className="flex flex-col items-center gap-2">
              <div className="w-12 h-12 rounded-full bg-[#1DA1F2]/10 hover:bg-[#1DA1F2]/20 flex items-center justify-center transition-colors">
                <Twitter className="w-5 h-5 text-[#1DA1F2]" />
              </div>
              <span className="text-xs text-muted-foreground">Twitter</span>
            </button>
            <button onClick={() => handleShareExternal('whatsapp')} className="flex flex-col items-center gap-2">
              <div className="w-12 h-12 rounded-full bg-[#25D366]/10 hover:bg-[#25D366]/20 flex items-center justify-center transition-colors">
                <MessageSquare className="w-5 h-5 text-[#25D366]" />
              </div>
              <span className="text-xs text-muted-foreground">WhatsApp</span>
            </button>
            <button onClick={() => handleShareExternal('telegram')} className="flex flex-col items-center gap-2">
              <div className="w-12 h-12 rounded-full bg-[#229ED9]/10 hover:bg-[#229ED9]/20 flex items-center justify-center transition-colors">
                <Send className="w-5 h-5 text-[#229ED9]" />
              </div>
              <span className="text-xs text-muted-foreground">Telegram</span>
            </button>
          </div>

          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1 h-px bg-border" /><span className="text-xs text-muted-foreground">Send to someone</span><div className="flex-1 h-px bg-border" />
          </div>

          {followingUsers.length > 5 && (
            <input type="text" placeholder="Search people you follow…" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              className="w-full bg-accent/40 border border-border rounded-full px-4 py-2.5 text-sm outline-none focus:border-primary transition-colors mb-4" />
          )}

          {loadingFollowing ? (
            <div className="flex justify-center py-6"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : filteredUsers.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-6">
              {followingUsers.length === 0 ? 'Follow people to send posts directly.' : 'No results.'}
            </p>
          ) : (
            <div className="space-y-1">
              {filteredUsers.map(u => (
                <div key={u.uid} className="flex items-center gap-3 p-2 rounded-xl hover:bg-accent/50 transition-colors">
                  <img src={u.profileImage || `https://api.dicebear.com/7.x/avataaars/svg?seed=${u.uid}`} className="w-11 h-11 rounded-full object-cover flex-shrink-0 cursor-pointer" alt={u.displayName} onClick={() => { navigate(`/profile/${u.username}`); onClose(); }} />
                  <div className="flex-1 min-w-0 cursor-pointer" onClick={() => { navigate(`/profile/${u.username}`); onClose(); }}>
                    <p className="font-bold text-sm truncate">{u.displayName}</p>
                    <p className="text-xs text-muted-foreground truncate">@{u.username}</p>
                  </div>
                  <button onClick={() => handleSendToUser(u)} disabled={sent.has(u.uid) || sending === u.uid}
                    className={cn('flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-bold transition-all flex-shrink-0',
                      sent.has(u.uid) ? 'bg-green-500/10 text-green-600' : 'bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50')}>
                    {sending === u.uid ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : sent.has(u.uid) ? <><Check className="w-3.5 h-3.5" /> Sent</> : 'Send'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </>
  );
};

// ── PostCard ──────────────────────────────────────────────────────────────────
export const PostCard: React.FC<PostCardProps> = ({ post }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const menuRef = useRef<HTMLDivElement>(null);

  const isLiked = user ? (post.likedBy ?? []).includes(user.uid) : false;
  const isSaved = user ? (post.savedBy ?? []).includes(user.uid) : false;
  const isOwnPost = user?.uid === post.userId;

  // Optimistic state — null means "use server value"
  const [optimisticLiked, setOptimisticLiked] = useState<boolean | null>(null);
  const [optimisticLikesCount, setOptimisticLikesCount] = useState<number | null>(null);
  const [optimisticSaved, setOptimisticSaved] = useState<boolean | null>(null);

  const [isLiking, setIsLiking] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(post.text || '');
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [showShareSheet, setShowShareSheet] = useState(false);

  // Clear optimistic state once server value arrives after write
  useEffect(() => { if (!isLiking) { setOptimisticLiked(null); setOptimisticLikesCount(null); } }, [post.likedBy, post.likesCount, isLiking]);
  useEffect(() => { if (!isSaving) setOptimisticSaved(null); }, [post.savedBy, isSaving]);

  useEffect(() => {
    if (!showMenu) return;
    const handler = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowMenu(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showMenu]);

  // FIX: like now writes likesCount (allowed in updated firestore.rules) + optimistic UI
  const handleLike = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user || isLiking) return;
    const wasLiked = optimisticLiked ?? isLiked;
    const curCount = optimisticLikesCount ?? (post.likesCount ?? 0);
    setOptimisticLiked(!wasLiked);
    setOptimisticLikesCount(wasLiked ? curCount - 1 : curCount + 1);
    setIsLiking(true);
    try {
      const postRef = doc(db, 'posts', post.id);
      if (wasLiked) {
        await updateDoc(postRef, { likedBy: arrayRemove(user.uid), likesCount: increment(-1) });
      } else {
        await updateDoc(postRef, { likedBy: arrayUnion(user.uid), likesCount: increment(1) });
        if (post.userId !== user.uid) {
          addDoc(collection(db, 'notifications'), { recipientId: post.userId, senderId: user.uid, senderUsername: user.username, senderProfileImage: user.profileImage || '', type: 'like', postId: post.id, read: false, createdAt: new Date().toISOString() }).catch(() => {});
        }
      }
    } catch (err) {
      setOptimisticLiked(wasLiked); setOptimisticLikesCount(curCount);
      toast.error('Failed to like. Try again.'); console.error(err);
    } finally { setIsLiking(false); }
  }, [user, isLiking, isLiked, optimisticLiked, optimisticLikesCount, post]);

  // FIX: save uses optimistic state so bookmark colour sticks instantly
  const handleSave = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user || isSaving) return;
    const wasSaved = optimisticSaved ?? isSaved;
    setOptimisticSaved(!wasSaved);
    setIsSaving(true);
    try {
      const postRef = doc(db, 'posts', post.id);
      if (wasSaved) { await updateDoc(postRef, { savedBy: arrayRemove(user.uid) }); toast.success('Removed from saved'); }
      else { await updateDoc(postRef, { savedBy: arrayUnion(user.uid) }); toast.success('Post saved'); }
    } catch (err) {
      setOptimisticSaved(wasSaved);
      toast.error('Failed to save. Try again.'); console.error(err);
    } finally { setIsSaving(false); }
  }, [user, isSaving, isSaved, optimisticSaved, post.id]);

  const handleDelete = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user || !isOwnPost || isDeleting) return;
    setIsDeleting(true);
    try { await deleteDoc(doc(db, 'posts', post.id)); toast.success('Post deleted'); }
    catch (err) { toast.error('Failed to delete. Try again.'); console.error(err); setIsDeleting(false); }
    setShowMenu(false);
  }, [user, isOwnPost, isDeleting, post.id]);

  const handleSaveEdit = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!editContent.trim() || isSavingEdit) return;
    setIsSavingEdit(true);
    try { await updateDoc(doc(db, 'posts', post.id), { text: editContent.trim() }); toast.success('Post updated'); setIsEditing(false); }
    catch (err) { toast.error('Failed to update. Try again.'); console.error(err); } finally { setIsSavingEdit(false); }
  }, [editContent, isSavingEdit, post.id]);

  const displayLiked  = optimisticLiked  ?? isLiked;
  const displaySaved  = optimisticSaved  ?? isSaved;
  const likesCount    = optimisticLikesCount ?? (post.likesCount ?? 0);
  const commentsCount = post.commentsCount ?? 0;
  const sharesCount   = post.sharesCount ?? 0;

  return (
    <>
      <motion.article onClick={() => !isEditing && navigate(`/post/${post.id}`)} className="border-b border-border p-4 hover:bg-accent/5 transition-all cursor-pointer relative">
        <div className="flex gap-3">
          <img src={post.userProfileImage || `https://api.dicebear.com/7.x/avataaars/svg?seed=${post.username}`} className="w-12 h-12 rounded-full object-cover shrink-0 cursor-pointer" alt={post.username} onClick={(e) => { e.stopPropagation(); navigate(`/profile/${post.username}`); }} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1 min-w-0 truncate">
                <span className="font-bold hover:underline cursor-pointer truncate" onClick={(e) => { e.stopPropagation(); navigate(`/profile/${post.username}`); }}>{post.username}</span>
                <span className="text-muted-foreground text-sm">·</span>
                <span className="text-muted-foreground text-sm flex-shrink-0">{formatDistanceToNow(new Date(post.createdAt), { addSuffix: true })}</span>
              </div>
              {isOwnPost && (
                <div className="relative flex-shrink-0" ref={menuRef}>
                  <button onClick={(e) => { e.stopPropagation(); setShowMenu(v => !v); }} className="p-1.5 hover:bg-accent rounded-full text-muted-foreground transition-colors"><MoreHorizontal className="w-5 h-5" /></button>
                  <AnimatePresence>
                    {showMenu && (
                      <motion.div initial={{ opacity: 0, scale: 0.95, y: -4 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: -4 }} transition={{ duration: 0.12 }} onClick={(e) => e.stopPropagation()} className="absolute right-0 top-full mt-1 z-30 bg-background border border-border rounded-xl shadow-xl py-1 w-40">
                        <button onClick={(e) => { e.stopPropagation(); setIsEditing(true); setShowMenu(false); }} className="w-full flex items-center gap-2.5 px-4 py-2.5 hover:bg-accent transition-colors text-sm"><Edit3 className="w-4 h-4" /> Edit</button>
                        <button onClick={handleDelete} disabled={isDeleting} className="w-full flex items-center gap-2.5 px-4 py-2.5 hover:bg-accent transition-colors text-sm text-destructive">{isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />} Delete</button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}
            </div>

            {post.mood && (
              <div className="mt-1.5 inline-flex items-center gap-1.5 bg-accent/30 px-2.5 py-1 rounded-full text-xs text-muted-foreground border border-border/50">
                {getMoodIconByLabel(post.mood.label)}<span>Feeling {post.mood.label.toLowerCase()}</span>
              </div>
            )}

            {isEditing ? (
              <div onClick={(e) => e.stopPropagation()} className="mt-2 space-y-2">
                <textarea value={editContent} onChange={(e) => setEditContent(e.target.value)} className="w-full bg-accent/30 border border-border rounded-xl px-3 py-2 text-[15px] outline-none focus:border-primary transition-colors resize-none min-h-[80px]" autoFocus maxLength={2200} />
                <div className="flex gap-2">
                  <button onClick={handleSaveEdit} disabled={!editContent.trim() || isSavingEdit} className="flex items-center gap-1.5 px-4 py-1.5 bg-primary text-primary-foreground rounded-full text-sm font-bold disabled:opacity-50 hover:opacity-90 transition-opacity">{isSavingEdit ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Save</button>
                  <button onClick={(e) => { e.stopPropagation(); setIsEditing(false); setEditContent(post.text || ''); }} className="flex items-center gap-1.5 px-4 py-1.5 bg-accent text-foreground rounded-full text-sm font-bold hover:opacity-80 transition-opacity"><X className="w-3.5 h-3.5" /> Cancel</button>
                </div>
              </div>
            ) : post.text && <p className="mt-2 text-[15px] leading-normal whitespace-pre-wrap break-words">{post.text}</p>}

            {post.mediaUrls?.length > 0 && (
              <div className={cn('mt-3 rounded-2xl overflow-hidden border border-border', post.mediaUrls.length > 1 && 'grid grid-cols-2 gap-0.5')}>
                {post.mediaUrls.map((url, idx) => <img key={idx} src={url} className={cn('w-full object-cover', post.mediaUrls.length === 1 ? 'max-h-[512px]' : 'h-48')} loading="lazy" alt="" />)}
              </div>
            )}

            {post.tags?.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {post.tags.map(tag => <span key={tag} onClick={(e) => e.stopPropagation()} className="text-xs text-primary font-medium hover:underline cursor-pointer">#{tag}</span>)}
              </div>
            )}

            {/* Action bar */}
            <div className="mt-4 flex items-center justify-between max-w-xs text-muted-foreground">

              {/* Like — instant fill via optimistic state */}
              <button onClick={handleLike} disabled={!user} aria-label={displayLiked ? 'Unlike' : 'Like'}
                className={cn('flex items-center gap-1.5 transition-all hover:text-pink-500 disabled:opacity-40', displayLiked && 'text-pink-500')}>
                <motion.div animate={displayLiked ? { scale: [1, 1.3, 1] } : { scale: 1 }} transition={{ duration: 0.2 }}>
                  <Heart className={cn('w-5 h-5 transition-all', displayLiked && 'fill-current')} />
                </motion.div>
                <span className="text-sm tabular-nums min-w-[1ch]">{likesCount > 0 ? likesCount : ''}</span>
              </button>

              {/* Comment */}
              <button onClick={(e) => { e.stopPropagation(); navigate(`/post/${post.id}?focus=comment`); }} aria-label="Comment" className="flex items-center gap-1.5 transition-colors hover:text-blue-500">
                <MessageCircle className="w-5 h-5" />
                <span className="text-sm tabular-nums min-w-[1ch]">{commentsCount > 0 ? commentsCount : ''}</span>
              </button>

              {/* Share */}
              <button onClick={(e) => { e.stopPropagation(); setShowShareSheet(true); }} aria-label="Share" className="flex items-center gap-1.5 transition-colors hover:text-green-500">
                <Share2 className="w-5 h-5" />
                {sharesCount > 0 && <span className="text-sm tabular-nums">{sharesCount}</span>}
              </button>

              {/* Save — instant fill via optimistic state */}
              <button onClick={handleSave} disabled={!user} aria-label={displaySaved ? 'Unsave' : 'Save'}
                className={cn('flex items-center gap-1.5 transition-all hover:text-primary disabled:opacity-40', displaySaved && 'text-primary')}>
                <motion.div animate={displaySaved ? { scale: [1, 1.2, 1] } : { scale: 1 }} transition={{ duration: 0.2 }}>
                  <Bookmark className={cn('w-5 h-5 transition-all', displaySaved && 'fill-current')} />
                </motion.div>
              </button>

            </div>
          </div>
        </div>
      </motion.article>

      <AnimatePresence>
        {showShareSheet && <ShareSheet post={post} onClose={() => setShowShareSheet(false)} />}
      </AnimatePresence>
    </>
  );
};
