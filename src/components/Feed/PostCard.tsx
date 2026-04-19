import React, { useState, useEffect } from 'react';
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
  Search
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Post, User } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { cn } from '../../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { doc, updateDoc, arrayUnion, arrayRemove, increment, deleteDoc, addDoc, setDoc, collection, getDoc, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { toast } from 'sonner';

interface PostCardProps {
  post: Post;
}

export const getMoodIconByLabel = (label: string) => {
  switch (label) {
    case 'Frustrated': return <Angry className="w-4 h-4" />;
    case 'Peaceful': return <Leaf className="w-4 h-4" />;
    case 'Dead inside': return <Skull className="w-4 h-4" />;
    case 'Hyped': return <Flame className="w-4 h-4 text-orange-500" />;
    case 'Feeling cute': return <Sparkles className="w-4 h-4 text-yellow-500" />;
    case 'Need coffee': return <Coffee className="w-4 h-4 text-amber-700" />;
    case 'Crying': return <CloudRain className="w-4 h-4 text-blue-500" />;
    case 'Productive': return <Rocket className="w-4 h-4 text-purple-500" />;
    default: return <Smile className="w-4 h-4" />;
  }
};

// ── Instagram-style Share Sheet ───────────────────────────────────────────────

interface ShareSheetProps {
  post: Post;
  onClose: () => void;
}

const ShareSheet: React.FC<ShareSheetProps> = ({ post, onClose }) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [followingUsers, setFollowingUsers] = useState<User[]>([]);
  const [loadingFollowing, setLoadingFollowing] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [sending, setSending] = useState<string | null>(null);
  const [sent, setSent] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user) return;
    const fetchFollowing = async () => {
      try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        const followingIds: string[] = userDoc.data()?.following || [];
        if (followingIds.length === 0) {
          setFollowingUsers([]);
          setLoadingFollowing(false);
          return;
        }
        // Batch fetch — Firestore allows up to 30 in array-contains, split if needed
        const chunks: string[][] = [];
        for (let i = 0; i < followingIds.length; i += 10) {
          chunks.push(followingIds.slice(i, i + 10));
        }
        const results: User[] = [];
        for (const chunk of chunks) {
          const q = query(collection(db, 'users'), where('uid', 'in', chunk));
          const snap = await getDocs(q);
          snap.docs.forEach(d => results.push({ ...d.data(), uid: d.id } as User));
        }
        setFollowingUsers(results);
      } catch (e) {
        console.error('Error fetching following:', e);
      } finally {
        setLoadingFollowing(false);
      }
    };
    fetchFollowing();
  }, [user?.uid]);

  const handleSendToUser = async (recipient: User) => {
    if (!user || sending) return;
    setSending(recipient.uid);
    try {
      // Find or create chat
      const chatId = [user.uid, recipient.uid].sort().join('_');
      const chatRef = doc(db, 'chats', chatId);
      const chatSnap = await getDoc(chatRef);
      if (!chatSnap.exists()) {
        await updateDoc(chatRef, {}).catch(() => {});
        const { setDoc } = await import('firebase/firestore');
        await setDoc(chatRef, {
          participants: [user.uid, recipient.uid],
          participantDetails: {
            [user.uid]: { username: user.username, displayName: user.displayName, profileImage: user.profileImage || '' },
            [recipient.uid]: { username: recipient.username, displayName: recipient.displayName, profileImage: recipient.profileImage || '' },
          },
          lastMessage: `Shared a post`,
          lastMessageAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          [`unreadCount.${recipient.uid}`]: 1,
          [`unreadCount.${user.uid}`]: 0,
        });
      } else {
        await updateDoc(chatRef, {
          lastMessage: `Shared a post`,
          lastMessageAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          [`unreadCount.${recipient.uid}`]: increment(1),
        });
      }
      // Send message with post reference
      await addDoc(collection(db, 'chats', chatId, 'messages'), {
        chatId,
        senderId: user.uid,
        text: `📎 Shared a post: "${post.text?.slice(0, 60) || 'media post'}${(post.text?.length || 0) > 60 ? '…' : ''}"`,
        sharedPostId: post.id,
        type: 'text',
        createdAt: new Date().toISOString(),
      });
      // Increment sharesCount
      await updateDoc(doc(db, 'posts', post.id), {
        sharesCount: increment(1),
      }).catch(() => {});

      setSent(prev => new Set(prev).add(recipient.uid));
      toast.success(`Sent to @${recipient.username}`);
    } catch (e) {
      console.error('Error sending post:', e);
      toast.error('Failed to send');
    } finally {
      setSending(null);
    }
  };

  const filtered = followingUsers.filter(u =>
    u.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.displayName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/60 z-[60]"
        onClick={onClose}
      />
      {/* Sheet */}
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 300 }}
        className="fixed bottom-0 left-0 right-0 z-[70] bg-card rounded-t-3xl shadow-2xl max-h-[75vh] flex flex-col overflow-hidden border-t border-border"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1.5 rounded-full bg-border" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border flex-shrink-0">
          <h3 className="font-bold text-lg">Send to</h3>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-accent transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search */}
        <div className="px-4 py-3 flex-shrink-0">
          <div className="flex items-center gap-2 bg-accent/50 rounded-xl px-3 py-2.5 border border-border/50">
            <Search className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            <input
              type="text"
              placeholder="Search people you follow..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-transparent flex-1 outline-none text-sm placeholder:text-muted-foreground"
            />
          </div>
        </div>

        {/* Post preview */}
        <div className="px-4 pb-3 flex-shrink-0">
          <div className="bg-accent/30 rounded-xl p-3 border border-border/50">
            <p className="text-sm text-muted-foreground line-clamp-2">{post.text || '📷 Media post'}</p>
          </div>
        </div>

        {/* Following list */}
        <div className="flex-1 overflow-y-auto">
          {loadingFollowing ? (
            <div className="flex justify-center py-8">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-10 px-4 text-muted-foreground">
              <p className="font-medium">{searchQuery ? 'No results' : 'No one to send to'}</p>
              <p className="text-sm mt-1">{searchQuery ? 'Try a different name' : 'Follow people to share posts with them'}</p>
            </div>
          ) : (
            <div className="pb-6">
              {filtered.map((u) => {
                const isSent = sent.has(u.uid);
                const isSending = sending === u.uid;
                return (
                  <div key={u.uid} className="flex items-center justify-between px-5 py-3 hover:bg-accent/30 transition-colors">
                    <div
                      className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer"
                      onClick={() => { onClose(); navigate(`/profile/${u.username}`); }}
                    >
                      <img
                        src={u.profileImage || `https://api.dicebear.com/7.x/avataaars/svg?seed=${u.username}`}
                        alt={u.username}
                        className="w-11 h-11 rounded-full object-cover flex-shrink-0"
                      />
                      <div className="min-w-0">
                        <p className="font-semibold truncate">{u.displayName}</p>
                        <p className="text-sm text-muted-foreground truncate">@{u.username}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => !isSent && handleSendToUser(u)}
                      disabled={isSending || isSent}
                      className={cn(
                        "ml-3 px-4 py-1.5 rounded-full text-sm font-bold transition-all flex items-center gap-1.5 flex-shrink-0",
                        isSent
                          ? "bg-accent text-muted-foreground"
                          : "bg-primary text-primary-foreground hover:opacity-90 active:scale-95"
                      )}
                    >
                      {isSending ? (
                        <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      ) : isSent ? (
                        'Sent ✓'
                      ) : (
                        <>
                          <Send className="w-3.5 h-3.5" />
                          Send
                        </>
                      )}
                    </button>
                  </div>
                );
              })}
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
  
  const isLiked = user ? post.likedBy?.includes(user.uid) : false;
  const isSaved = user ? post.savedBy?.includes(user.uid) : false;
  const isOwnPost = user?.uid === post.userId;
  
  const [isLiking, setIsLiking] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(post.text || '');
  const [showShareSheet, setShowShareSheet] = useState(false);

  const handleLike = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user || isLiking) return;
    setIsLiking(true);

    try {
      const postRef = doc(db, 'posts', post.id);
      const likeRef = doc(db, 'posts', post.id, 'likes', user.uid);

      if (isLiked) {
        // Remove from likes subcollection — onLikeWrite Cloud Function
        // will decrement likesCount authoritatively on the server.
        // Update likedBy array for optimistic UI only.
        await Promise.all([
          deleteDoc(likeRef),
          updateDoc(postRef, { likedBy: arrayRemove(user.uid) }),
        ]);
      } else {
        // Write to likes subcollection — onLikeWrite Cloud Function
        // will increment likesCount authoritatively on the server.
        await Promise.all([
          setDoc(likeRef, { userId: user.uid, createdAt: new Date().toISOString() }),
          updateDoc(postRef, { likedBy: arrayUnion(user.uid) }),
        ]);
        if (post.userId !== user.uid) {
          addDoc(collection(db, 'notifications'), {
            recipientId: post.userId,
            senderId: user.uid,
            senderUsername: user.username,
            senderProfileImage: user.profileImage || '',
            type: 'like',
            postId: post.id,
            read: false,
            createdAt: new Date().toISOString()
          }).catch(() => {});
        }
      }
    } catch (error) {
      console.error("Error liking post:", error);
      toast.error("Failed to like post");
    } finally {
      setIsLiking(false);
    }
  };

  const handleSave = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user || isSaving) return;
    setIsSaving(true);

    try {
      const postRef = doc(db, 'posts', post.id);
      if (isSaved) {
        await updateDoc(postRef, {
          savedBy: arrayRemove(user.uid)
        });
        toast.success("Removed from saved");
      } else {
        await updateDoc(postRef, {
          savedBy: arrayUnion(user.uid)
        });
        toast.success("Post saved");
      }
    } catch (error: unknown) {
      console.error("Error saving post:", error);
      const code = (error as { code?: string })?.code;
      const msg = error instanceof Error ? error.message : '';
      // If the field doesn't exist yet, initialize it then retry
      if (code === 'not-found' || msg.includes('savedBy')) {
        try {
          await updateDoc(doc(db, 'posts', post.id), {
            savedBy: [user.uid]
          });
          toast.success("Post saved");
        } catch (retryErr) {
          toast.error("Failed to save post");
        }
      } else {
        toast.error("Failed to save post");
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleShare = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowShareSheet(true);
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm("Are you sure you want to delete this post?")) {
      try {
        await deleteDoc(doc(db, 'posts', post.id));
        toast.success("Post deleted");
      } catch (error) {
        console.error("Error deleting post:", error);
        toast.error("Failed to delete post");
      }
    }
    setShowMenu(false);
  };

  const handleEditSubmit = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await updateDoc(doc(db, 'posts', post.id), {
        text: editContent
      });
      toast.success("Post updated");
      setIsEditing(false);
    } catch (error) {
      console.error("Error updating post:", error);
      toast.error("Failed to update post");
    }
  };

  return (
    <>
      <motion.article 
        initial={{ opacity: 0, scale: 0.98, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        whileHover={{ scale: 1.005, transition: { duration: 0.2 } }}
        onClick={() => !isEditing && navigate(`/post/${post.id}`)}
        className="border-b border-border p-4 hover:bg-accent/5 transition-all cursor-pointer relative"
      >
        <div className="flex gap-3">
          <img 
            src={post.userProfileImage || `https://api.dicebear.com/7.x/avataaars/svg?seed=${post.username}`} 
            alt={post.username} 
            onClick={(e) => { e.stopPropagation(); navigate(`/profile/${post.username}`); }}
            className="w-12 h-12 rounded-full object-cover flex-shrink-0 cursor-pointer hover:opacity-80 transition-opacity"
            loading="lazy"
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between relative gap-2">
              <div className="flex items-center flex-wrap gap-1 group min-w-0 flex-1">
                <span 
                  className="font-bold hover:underline truncate max-w-[120px] sm:max-w-[200px] cursor-pointer"
                  onClick={(e) => { e.stopPropagation(); navigate(`/profile/${post.username}`); }}
                >
                  {post.username}
                </span>
                <span className="text-muted-foreground text-sm truncate max-w-[100px] sm:max-w-[150px]">@{post.username}</span>
                <span className="text-muted-foreground text-sm flex-shrink-0">·</span>
                <span className="text-muted-foreground text-sm hover:underline flex-shrink-0 whitespace-nowrap">
                  {formatDistanceToNow(new Date(post.createdAt), { addSuffix: true }).replace('about ', '')}
                </span>
              </div>
              
              {isOwnPost && (
                <div className="relative">
                  <button 
                    onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu); }}
                    className="text-muted-foreground hover:text-primary p-1 rounded-full hover:bg-primary/10 transition-colors"
                  >
                    <MoreHorizontal className="w-5 h-5" />
                  </button>
                  
                  <AnimatePresence>
                    {showMenu && (
                      <motion.div 
                        initial={{ opacity: 0, scale: 0.95, y: -10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: -10 }}
                        className="absolute right-0 top-8 w-48 bg-card border border-border rounded-xl shadow-xl z-50 overflow-hidden"
                      >
                        <button 
                          onClick={(e) => { e.stopPropagation(); setIsEditing(true); setShowMenu(false); }}
                          className="w-full flex items-center gap-2 px-4 py-3 hover:bg-accent transition-colors text-left"
                        >
                          <Edit3 className="w-4 h-4" />
                          <span>Edit Post</span>
                        </button>
                        <button 
                          onClick={handleDelete}
                          className="w-full flex items-center gap-2 px-4 py-3 hover:bg-destructive/10 text-destructive transition-colors text-left"
                        >
                          <Trash2 className="w-4 h-4" />
                          <span>Delete Post</span>
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}
            </div>

            {post.mood && (
              <div className="mt-1 inline-flex items-center gap-1.5 bg-accent/30 px-2.5 py-1 rounded-full text-xs font-medium text-muted-foreground border border-border/50">
                {getMoodIconByLabel(post.mood.label)}
                <span>Feeling {post.mood.label.toLowerCase()}</span>
              </div>
            )}

            {isEditing ? (
              <div className="mt-2" onClick={(e) => e.stopPropagation()}>
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  className="w-full bg-accent/30 border border-border rounded-xl p-3 outline-none focus:border-primary resize-none min-h-[100px] text-base md:text-sm"
                  autoFocus
                />
                <div className="flex justify-end gap-2 mt-2">
                  <button 
                    onClick={(e) => { e.stopPropagation(); setIsEditing(false); }}
                    className="px-4 py-1.5 rounded-full font-medium hover:bg-accent transition-colors"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={handleEditSubmit}
                    className="px-4 py-1.5 bg-primary text-primary-foreground rounded-full font-bold hover:opacity-90 transition-opacity"
                  >
                    Save
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-2 text-[15px] leading-normal whitespace-pre-wrap">
                {post.text}
              </div>
            )}

            {post.mediaUrls.length > 0 && (
              <div className={cn(
                "mt-3 rounded-2xl overflow-hidden border border-border grid gap-1",
                post.mediaUrls.length > 1 ? "grid-cols-2" : "grid-cols-1"
              )}>
                {post.mediaUrls.map((url, idx) => (
                  <img 
                    key={idx} 
                    src={url} 
                    alt="Post content" 
                    className="w-full h-full object-cover max-h-[512px]"
                    loading="lazy"
                  />
                ))}
              </div>
            )}

            <div className="mt-4 flex items-center justify-between max-w-md text-muted-foreground">
              <button 
                onClick={(e) => { e.preventDefault(); handleLike(e); }}
                disabled={isLiking}
                className={cn(
                  "flex items-center gap-2 group transition-colors cursor-pointer",
                  isLiked ? "text-pink-500" : "hover:text-pink-500"
                )}
              >
                <div className="p-2 rounded-full group-hover:bg-pink-500/10 transition-colors pointer-events-none">
                  <Heart className={cn("w-5 h-5", isLiked && "fill-current")} />
                </div>
                <span className="text-sm pointer-events-none">{post.likesCount || 0}</span>
              </button>

              <button 
                onClick={(e) => { 
                  e.preventDefault();
                  e.stopPropagation(); 
                  navigate(`/post/${post.id}?focus=comment`);
                }}
                className="flex items-center gap-2 group hover:text-primary transition-colors cursor-pointer"
              >
                <div className="p-2 rounded-full group-hover:bg-primary/10 transition-colors pointer-events-none">
                  <MessageCircle className="w-5 h-5" />
                </div>
                <span className="text-sm pointer-events-none">{post.commentsCount || 0}</span>
              </button>

              <button 
                onClick={(e) => { e.preventDefault(); handleShare(e); }}
                className="flex items-center gap-2 group hover:text-green-500 transition-colors cursor-pointer"
              >
                <div className="p-2 rounded-full group-hover:bg-green-500/10 transition-colors pointer-events-none">
                  <Share2 className="w-5 h-5" />
                </div>
                <span className="text-sm pointer-events-none">{post.sharesCount || 0}</span>
              </button>

              <button 
                onClick={(e) => { e.preventDefault(); handleSave(e); }}
                disabled={isSaving}
                className={cn(
                  "flex items-center gap-2 group transition-colors cursor-pointer",
                  isSaved ? "text-primary" : "hover:text-primary"
                )}
              >
                <div className="p-2 rounded-full group-hover:bg-primary/10 transition-colors pointer-events-none">
                  <Bookmark className={cn("w-5 h-5", isSaved && "fill-current")} />
                </div>
              </button>
            </div>
          </div>
        </div>
      </motion.article>

      {/* Instagram-style Share Sheet */}
      <AnimatePresence>
        {showShareSheet && (
          <ShareSheet post={post} onClose={() => setShowShareSheet(false)} />
        )}
      </AnimatePresence>
    </>
  );
};
