import React, { useState, useEffect, useCallback, memo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Heart, MessageCircle, Share2, Bookmark, MoreHorizontal, 
  Trash2, Loader2, AlertCircle, ImageOff, Check, X, Link2, 
  Send, Twitter, MessageSquare,
  Angry, Leaf, Skull, Flame, Sparkles, Coffee, CloudRain, Rocket, Smile
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Post, User } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { cn } from '../../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { 
  doc, deleteDoc, setDoc, getDoc, serverTimestamp, 
  updateDoc, increment, collection, query, where, getDocs, addDoc,
  arrayUnion, arrayRemove
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { toast } from 'sonner';

// ----------------------------------------------------------------------------
// 1. MOOD ICON HELPER
// ----------------------------------------------------------------------------
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

// ----------------------------------------------------------------------------
// 2. MEMORY CACHE (Prevents N+1 Reads)
// ----------------------------------------------------------------------------
const interactionCache = new Map<string, boolean>();
const setCache = (key: string, value: boolean) => {
  if (interactionCache.size > 1000) interactionCache.clear();
  interactionCache.set(key, value);
};

// ----------------------------------------------------------------------------
// 3. SHARE SHEET
// ----------------------------------------------------------------------------
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
        
        const results = await Promise.all(
          chunks.map(chunk => getDocs(query(collection(db, 'users'), where('uid', 'in', chunk))))
        );
        if (cancelled) return;
        setFollowingUsers(results.flatMap(snap => snap.docs.map(d => ({ ...d.data(), uid: d.id } as User))));
      } catch (e) { 
        console.error("SHARE SHEET FETCH ERROR:", e); 
      } finally { 
        if (!cancelled) setLoadingFollowing(false); 
      }
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
    setCopied(true); 
    toast.success('Link copied!');
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
      
      await updateDoc(doc(db, 'posts', post.id), { sharesCount: increment(1) }).catch(() => {});
      setSent(prev => new Set(prev).add(recipient.uid));
      toast.success(`Sent to @${recipient.username}`);
    } catch (err) { 
      console.error("SEND TO USER ERROR:", err);
      toast.error('Failed to send. Try again.'); 
    } finally { 
      setSending(null); 
    }
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

// ----------------------------------------------------------------------------
// 4. MAIN POSTCARD COMPONENT
// ----------------------------------------------------------------------------
interface PostCardProps {
  post: Post;
}

export const PostCard: React.FC<PostCardProps> = memo(({ post }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  
  // --- Refs ---
  const isMounted = useRef(true);
  const menuRef = useRef<HTMLDivElement>(null);
  const syncLock = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // --- UI State ---
  const [showMenu, setShowMenu] = useState(false);
  const [showShareSheet, setShowShareSheet] = useState(false);
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set());
  const [avatarFailed, setAvatarFailed] = useState(false);
  
  // --- Locks ---
  const [isLiking, setIsLiking] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // --- Autonomous State ---
  const [isLiked, setIsLiked] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [localLikesCount, setLocalLikesCount] = useState(post.likesCount || 0);

  // Initial Fetch logic
  useEffect(() => {
    isMounted.current = true;
    if (!user?.uid || !post.id) return;

    const likeKey = `${user.uid}:${post.id}:like`;
    
    // For 'Saved', we read directly from the post prop to avoid permission denied errors
    setIsSaved((post.savedBy ?? []).includes(user.uid));

    const fetchInteractions = async () => {
      try {
        if (interactionCache.has(likeKey)) {
          setIsLiked(interactionCache.get(likeKey)!);
          return;
        }

        const likeSnap = await getDoc(doc(db, `posts/${post.id}/likes/${user.uid}`));
        
        if (isMounted.current) {
          const liked = likeSnap.exists();
          setCache(likeKey, liked);
          setIsLiked(liked);
        }
      } catch (err) {
        console.error("LIKE FETCH ERROR:", err);
      }
    };

    fetchInteractions();
    return () => { isMounted.current = false; };
  }, [user?.uid, post.id, post.savedBy]);

  // Sync server likesCount safely
  useEffect(() => {
    if (!syncLock.current && isMounted.current) {
      setLocalLikesCount(post.likesCount || 0);
    }
  }, [post.likesCount]);

  // Click-away listener for Menu
  useEffect(() => {
    if (!showMenu) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [showMenu]);

  // --- Handlers ---

  const handleLike = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) return toast.error("Sign in to like posts");
    if (isLiking) return; 

    const wasLiked = isLiked;
    const likeKey = `${user.uid}:${post.id}:like`;
    
    setIsLiked(!wasLiked);
    setLocalLikesCount(prev => Math.max(0, wasLiked ? prev - 1 : prev + 1));
    setCache(likeKey, !wasLiked);
    setIsLiking(true);

    if (syncLock.current) clearTimeout(syncLock.current);
    syncLock.current = setTimeout(() => { syncLock.current = null; }, 3000);

    try {
      const likeRef = doc(db, `posts/${post.id}/likes/${user.uid}`);
      if (wasLiked) {
        await deleteDoc(likeRef);
      } else {
        await setDoc(likeRef, { userId: user.uid, createdAt: serverTimestamp() });
      }
    } catch (err) {
      console.error("FULL LIKE ERROR:", err);
      if (isMounted.current) {
        setIsLiked(wasLiked);
        setLocalLikesCount(prev => Math.max(0, wasLiked ? prev + 1 : prev - 1));
        setCache(likeKey, wasLiked);
      }
      toast.error("Couldn't update like");
    } finally {
      if (isMounted.current) setIsLiking(false);
    }
  }, [user, isLiking, isLiked, post.id]);

  const handleSave = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) return toast.error("Sign in to save posts");
    if (isSaving) return;

    const wasSaved = isSaved;
    setIsSaved(!wasSaved);
    setIsSaving(true);

    try {
      const postRef = doc(db, 'posts', post.id);
      await updateDoc(postRef, {
        savedBy: wasSaved ? arrayRemove(user.uid) : arrayUnion(user.uid)
      });
      toast.success(wasSaved ? "Removed from bookmarks" : "Saved to bookmarks");
    } catch (err) {
      console.error("FULL SAVE ERROR:", err);
      if (isMounted.current) setIsSaved(wasSaved); 
      toast.error("Failed to save post");
    } finally {
      if (isMounted.current) setIsSaving(false);
    }
  }, [user, isSaving, isSaved, post.id]);

  const handleDelete = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowMenu(false);
    if (isDeleting || !window.confirm("Delete this post permanently?")) return;

    setIsDeleting(true);
    try {
      await deleteDoc(doc(db, 'posts', post.id));
      toast.success("Post deleted successfully");
    } catch (err) {
      console.error("FULL DELETE ERROR:", err);
      if (isMounted.current) setIsDeleting(false);
      toast.error("Failed to delete post");
    }
  }, [isDeleting, post.id]);

  const handleShare = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowShareSheet(true); // Always open the custom slide-up Share Sheet
  }, []);

  const navigateToPost = () => {
    if (!isDeleting) navigate(`/post/${post.id}`);
  };

  // --- RICH TEXT PARSER (Turns #hashtags and @mentions into colored text) ---
  const renderFormattedText = (text: string) => {
    // Regex splits text into an array, keeping the hashtags/mentions intact
    const parts = text.split(/(#[a-zA-Z0-9_]+|@[a-zA-Z0-9_]+)/g);
    
    return parts.map((part, index) => {
      // Handle Hashtag
      if (part.match(/^#[a-zA-Z0-9_]+$/)) {
        return (
          <span 
            key={index} 
            className="text-primary hover:underline cursor-pointer font-medium"
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/explore`); // You can customize this later to filter by tag
            }}
          >
            {part}
          </span>
        );
      }
      // Handle Mention
      if (part.match(/^@[a-zA-Z0-9_]+$/)) {
        return (
          <span 
            key={index} 
            className="text-primary hover:underline cursor-pointer font-medium"
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/profile/${part.slice(1)}`);
            }}
          >
            {part}
          </span>
        );
      }
      // Return normal text
      return part;
    });
  };

  // Safe Data Parsing
  const parsedDate = post.createdAt?.toDate?.() || new Date(post.createdAt);
  const fallbackAvatar = `https://api.dicebear.com/7.x/avataaars/svg?seed=${post.username}`;
  const avatarSrc = avatarFailed || !post.userProfileImage ? fallbackAvatar : post.userProfileImage;

  return (
    <article 
      onClick={navigateToPost}
      onKeyDown={(e) => e.key === 'Enter' && navigateToPost()}
      role="button"
      tabIndex={0}
      aria-label={`Post by ${post.username}`}
      className={cn(
        "relative border-b border-border p-4 transition-colors cursor-pointer group/card outline-none focus-visible:ring-2 focus-visible:ring-primary",
        isDeleting ? "opacity-50 pointer-events-none" : "hover:bg-accent/5"
      )}
    >
      <AnimatePresence>
        {isDeleting && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 z-10 flex items-center justify-center bg-background/30 backdrop-blur-[2px]"
          >
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex gap-3">
        <div className="shrink-0">
          <img 
            src={avatarSrc} 
            className="w-12 h-12 rounded-full object-cover bg-accent"
            alt={post.username}
            loading="lazy"
            onError={() => setAvatarFailed(true)}
            onClick={(e) => { e.stopPropagation(); navigate(`/profile/${post.username}`); }}
          />
        </div>

        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1 truncate">
              <span 
                onClick={(e) => { e.stopPropagation(); navigate(`/profile/${post.username}`); }}
                className="font-bold hover:underline truncate"
              >
                {post.username}
              </span>
              <span className="text-muted-foreground text-sm">·</span>
              <span className="text-muted-foreground text-sm shrink-0">
                {formatDistanceToNow(parsedDate, { addSuffix: true })}
              </span>
            </div>
            
            {user?.uid === post.userId && (
              <div className="relative" ref={menuRef}>
                <button 
                  onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu); }}
                  aria-label="More options"
                  aria-expanded={showMenu}
                  className="p-1.5 hover:bg-accent rounded-full transition-colors"
                >
                  <MoreHorizontal className="w-5 h-5 text-muted-foreground" />
                </button>
                
                <AnimatePresence>
                  {showMenu && (
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.95, y: -5 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95, y: -5 }}
                      transition={{ duration: 0.15 }}
                      className="absolute right-0 top-full mt-1 z-20 bg-background border border-border rounded-xl shadow-xl py-1 w-36"
                    >
                      <button 
                        onClick={handleDelete}
                        disabled={isDeleting}
                        className="w-full flex items-center gap-2 px-4 py-2 text-sm text-destructive hover:bg-destructive/10 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" /> Delete
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </div>

          {post.mood && (
            <div className="mt-1 flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground bg-accent/40 w-fit px-2 py-0.5 rounded-full border border-border/50">
              {getMoodIconByLabel(post.mood.label)}
              <span>Feeling {post.mood.label}</span>
            </div>
          )}

          {/* Text Content WITH RICH TEXT PARSING */}
          {post.text && (
            <p className="mt-2 text-[15px] leading-relaxed break-words whitespace-pre-wrap text-foreground/90">
              {renderFormattedText(post.text)}
            </p>
          )}

          {/* Media Grid */}
          {post.mediaUrls?.length > 0 && (
            <div className={cn(
              "mt-3 rounded-2xl overflow-hidden border border-border grid gap-0.5 bg-accent/20",
              post.mediaUrls.length === 1 ? "grid-cols-1" : "grid-cols-2"
            )}>
              {post.mediaUrls.map((url) => {
                if (failedImages.has(url)) {
                  return (
                    <div key={url} className={cn("flex flex-col items-center justify-center bg-accent/30 text-muted-foreground gap-2", post.mediaUrls.length === 1 ? "aspect-square max-h-[500px]" : "aspect-square")}>
                      <ImageOff className="w-6 h-6" />
                      <span className="text-xs font-medium">Unavailable</span>
                    </div>
                  );
                }

                return (
                  <img 
                    key={url} 
                    src={url} 
                    onError={() => setFailedImages(prev => {
                      const next = new Set(prev);
                      next.add(url);
                      return next;
                    })}
                    className={cn(
                      "w-full object-cover hover:opacity-95 transition-opacity",
                      post.mediaUrls.length === 1 ? "max-h-[500px]" : "aspect-square"
                    )} 
                    alt="Post content" 
                    loading="lazy"
                  />
                );
              })}
            </div>
          )}

          {/* Action Bar */}
          <div className="mt-4 flex items-center justify-between max-w-sm -ml-2 text-muted-foreground">
            <button 
              onClick={handleLike}
              disabled={isLiking}
              aria-label={isLiked ? "Unlike post" : "Like post"}
              className={cn(
                "group flex items-center gap-1 transition-colors disabled:opacity-50",
                isLiked ? "text-pink-500" : "hover:text-pink-500"
              )}
            >
              <div className="p-2 group-hover:bg-pink-500/10 rounded-full transition-colors">
                <Heart className={cn("w-5 h-5 transition-transform duration-150", isLiked && "fill-current text-pink-500", isLiking && "scale-110")} />
              </div>
              <span className="text-xs font-medium tabular-nums min-w-[2ch]">
                {localLikesCount > 0 ? localLikesCount : ''}
              </span>
            </button>

            <button 
              onClick={(e) => { e.stopPropagation(); navigate(`/post/${post.id}?focus=comment`); }}
              aria-label="Comment on post"
              className="group flex items-center gap-1 hover:text-blue-500 transition-colors"
            >
              <div className="p-2 group-hover:bg-blue-500/10 rounded-full transition-colors">
                <MessageCircle className="w-5 h-5 transition-transform duration-150 group-active:scale-95" />
              </div>
              <span className="text-xs font-medium tabular-nums min-w-[2ch]">
                {post.commentsCount > 0 ? post.commentsCount : ''}
              </span>
            </button>

            <button 
              onClick={handleShare}
              aria-label="Share post"
              className="group flex items-center gap-1 hover:text-green-500 transition-colors"
            >
              <div className="p-2 group-hover:bg-green-500/10 rounded-full transition-colors">
                <Share2 className="w-5 h-5 transition-transform duration-150 group-active:scale-95" />
              </div>
            </button>

            <button 
              onClick={handleSave}
              disabled={isSaving}
              aria-label={isSaved ? "Remove bookmark" : "Bookmark post"}
              className={cn(
                "group flex items-center gap-1 transition-colors disabled:opacity-50",
                isSaved ? "text-primary" : "hover:text-primary"
              )}
            >
              <div className="p-2 group-hover:bg-primary/10 rounded-full transition-colors">
                <Bookmark className={cn("w-5 h-5 transition-transform duration-150", isSaved && "fill-current", isSaving && "scale-110")} />
              </div>
            </button>
          </div>
        </div>
      </div>
      
      <AnimatePresence>
        {showShareSheet && <ShareSheet post={post} onClose={() => setShowShareSheet(false)} />}
      </AnimatePresence>
    </article>
  );
});

PostCard.displayName = 'PostCard';
