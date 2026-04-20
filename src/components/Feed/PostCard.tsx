import React, { useState, useEffect, useCallback, memo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Heart, MessageCircle, Share2, Bookmark, MoreHorizontal, 
  Trash2, Loader2, AlertCircle, ImageOff 
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Post } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { cn } from '../../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { 
  doc, deleteDoc, setDoc, getDoc, serverTimestamp 
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { toast } from 'sonner';
import { getMoodIconByLabel } from './CreatePost'; 

interface PostCardProps {
  post: Post;
}

// 1. Memory-Safe Global Cache (Max 1000 entries)
const interactionCache = new Map<string, boolean>();
const setCache = (key: string, value: boolean) => {
  if (interactionCache.size > 1000) interactionCache.clear(); // Prevent memory leaks
  interactionCache.set(key, value);
};

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

  // 2. Fetch Interactions (With Safe Cache)
  useEffect(() => {
    isMounted.current = true;
    if (!user?.uid || !post.id) return;

    const likeKey = `${user.uid}:${post.id}:like`;
    const saveKey = `${user.uid}:${post.id}:save`;

    const fetchInteractions = async () => {
      try {
        if (interactionCache.has(likeKey) && interactionCache.has(saveKey)) {
          setIsLiked(interactionCache.get(likeKey)!);
          setIsSaved(interactionCache.get(saveKey)!);
          return;
        }

        const [likeSnap, saveSnap] = await Promise.all([
          getDoc(doc(db, `posts/${post.id}/likes/${user.uid}`)),
          getDoc(doc(db, `users/${user.uid}/savedPosts/${post.id}`))
        ]);
        
        if (isMounted.current) {
          const liked = likeSnap.exists();
          const saved = saveSnap.exists();
          
          setCache(likeKey, liked);
          setCache(saveKey, saved);
          
          setIsLiked(liked);
          setIsSaved(saved);
        }
      } catch (err) {
        console.error("Failed to fetch interactions:", err);
      }
    };

    fetchInteractions();
    return () => { isMounted.current = false; };
  }, [user?.uid, post.id]);

  // 3. Sync server likesCount safely (Time-based lock for optimistic UI)
  useEffect(() => {
    if (!syncLock.current && isMounted.current) {
      setLocalLikesCount(post.likesCount || 0);
    }
  }, [post.likesCount]);

  // 4. Click-away listener for Menu
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
    
    // Optimistic Update
    setIsLiked(!wasLiked);
    setLocalLikesCount(prev => Math.max(0, wasLiked ? prev - 1 : prev + 1));
    setCache(likeKey, !wasLiked);
    setIsLiking(true);

    // Apply Sync Lock
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
      console.error("Like error:", err);
      if (isMounted.current) {
        setIsLiked(wasLiked); // Rollback
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
    const saveKey = `${user.uid}:${post.id}:save`;

    setIsSaved(!wasSaved);
    setCache(saveKey, !wasSaved);
    setIsSaving(true);

    try {
      const saveRef = doc(db, `users/${user.uid}/savedPosts/${post.id}`);
      if (wasSaved) {
        await deleteDoc(saveRef);
        toast.success("Removed from bookmarks");
      } else {
        await setDoc(saveRef, { postId: post.id, savedAt: serverTimestamp() });
        toast.success("Saved to bookmarks");
      }
    } catch (err) {
      console.error("Save error:", err);
      if (isMounted.current) {
        setIsSaved(wasSaved); // Rollback
        setCache(saveKey, wasSaved);
      }
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
      console.error("Delete error:", err);
      if (isMounted.current) setIsDeleting(false);
      toast.error("Failed to delete post");
    }
  }, [isDeleting, post.id]);

  const handleShare = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Post by @${post.username}`,
          text: post.text?.slice(0, 100) || 'Check out this post on NetoLynk',
          url: `${window.location.origin}/post/${post.id}`,
        });
      } catch (err) {
        // User cancelled share, silently ignore
      }
    } else {
      // 5. Silent Fallback to custom sheet
      setShowShareSheet(true); 
    }
  }, [post]);

  const navigateToPost = () => {
    if (!isDeleting) navigate(`/post/${post.id}`);
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

          {post.text && (
            <p className="mt-2 text-[15px] leading-relaxed break-words whitespace-pre-wrap text-foreground/90">
              {post.text}
            </p>
          )}

          {post.mediaUrls?.length > 0 && (
            <div className={cn(
              "mt-3 rounded-2xl overflow-hidden border border-border grid gap-0.5 bg-accent/20",
              post.mediaUrls.length === 1 ? "grid-cols-1" : "grid-cols-2"
            )}>
              {post.mediaUrls.map((url) => {
                if (failedImages.has(url)) {
                  return (
                    <div key={url} className="flex flex-col items-center justify-center bg-accent/30 h-48 text-muted-foreground gap-2">
                      <ImageOff className="w-6 h-6" />
                      <span className="text-xs font-medium">Image unavailable</span>
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
                    className="w-full h-full object-cover max-h-[500px] hover:opacity-95 transition-opacity" 
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
                {localLikesCount}
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
                {post.commentsCount || 0}
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
      
      {/* 
        <AnimatePresence>
          {showShareSheet && <ShareSheet post={post} onClose={() => setShowShareSheet(false)} />}
        </AnimatePresence> 
      */}
    </article>
  );
});

PostCard.displayName = 'PostCard';
