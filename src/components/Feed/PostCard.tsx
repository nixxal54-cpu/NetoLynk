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
import { doc, updateDoc, arrayUnion, arrayRemove, increment, deleteDoc, addDoc, collection, getDoc, getDocs, query, where, setDoc } from 'firebase/firestore';
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
        const followingIds = userDoc.data()?.following || [];
        if (followingIds.length === 0) {
          setFollowingUsers([]);
          setLoadingFollowing(false);
          return;
        }
        const q = query(collection(db, 'users'), where('uid', 'in', followingIds.slice(0, 10)));
        const snap = await getDocs(q);
        setFollowingUsers(snap.docs.map(d => ({ ...d.data(), uid: d.id } as User)));
      } catch (e) { console.error(e); } finally { setLoadingFollowing(false); }
    };
    fetchFollowing();
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
          [user.uid]: { username: user.username, displayName: user.displayName, profileImage: user.profileImage || '' },
          [recipient.uid]: { username: recipient.username, displayName: recipient.displayName, profileImage: recipient.profileImage || '' },
        },
        lastMessage: `Shared a post`,
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

      await updateDoc(doc(db, 'posts', post.id), { sharesCount: increment(1) });
      setSent(prev => new Set(prev).add(recipient.uid));
      toast.success(`Sent to @${recipient.username}`);
    } catch (e) { toast.error('Failed to send'); } finally { setSending(null); }
  };

  return (
    <>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 z-[60]" onClick={onClose} />
      <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} className="fixed bottom-0 left-0 right-0 z-[70] bg-card rounded-t-3xl p-5 border-t border-border max-h-[70vh] overflow-y-auto">
        <h3 className="font-bold text-lg mb-4">Send to</h3>
        <div className="space-y-3">
          {followingUsers.map(u => (
            <div key={u.uid} className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <img src={u.profileImage} className="w-10 h-10 rounded-full object-cover" />
                <div><p className="font-bold">{u.displayName}</p><p className="text-sm text-muted-foreground">@{u.username}</p></div>
              </div>
              <button onClick={() => handleSendToUser(u)} disabled={sent.has(u.uid)} className="bg-primary text-white px-4 py-1.5 rounded-full text-sm font-bold">
                {sent.has(u.uid) ? 'Sent' : 'Send'}
              </button>
            </div>
          ))}
        </div>
      </motion.div>
    </>
  );
};

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
      if (isLiked) {
        await updateDoc(postRef, { likedBy: arrayRemove(user.uid), likesCount: increment(-1) });
      } else {
        await updateDoc(postRef, { likedBy: arrayUnion(user.uid), likesCount: increment(1) });
      }
    } catch (error) { toast.error("Failed to like"); } finally { setIsLiking(false); }
  };

  const handleSave = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user || isSaving) return;
    setIsSaving(true);
    try {
      const postRef = doc(db, 'posts', post.id);
      if (isSaved) {
        await updateDoc(postRef, { savedBy: arrayRemove(user.uid) });
        toast.success("Removed from saved");
      } else {
        await updateDoc(postRef, { savedBy: arrayUnion(user.uid) });
        toast.success("Post saved");
      }
    } catch (error) { toast.error("Failed to save"); } finally { setIsSaving(false); }
  };

  return (
    <>
      <motion.article onClick={() => !isEditing && navigate(`/post/${post.id}`)} className="border-b border-border p-4 hover:bg-accent/5 transition-all cursor-pointer relative">
        <div className="flex gap-3">
          <img src={post.userProfileImage || `https://api.dicebear.com/7.x/avataaars/svg?seed=${post.username}`} className="w-12 h-12 rounded-full object-cover shrink-0" onClick={(e) => { e.stopPropagation(); navigate(`/profile/${post.username}`); }} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1 group truncate">
                <span className="font-bold hover:underline" onClick={(e) => { e.stopPropagation(); navigate(`/profile/${post.username}`); }}>{post.username}</span>
                <span className="text-muted-foreground text-sm">@{post.username}</span>
              </div>
              {isOwnPost && (
                <button onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu); }} className="text-muted-foreground"><MoreHorizontal className="w-5 h-5" /></button>
              )}
            </div>
            {post.mood && (
              <div className="mt-1 inline-flex items-center gap-1.5 bg-accent/30 px-2.5 py-1 rounded-full text-xs text-muted-foreground border border-border/50">
                {getMoodIconByLabel(post.mood.label)}
                <span>Feeling {post.mood.label.toLowerCase()}</span>
              </div>
            )}
            <div className="mt-2 text-[15px] leading-normal whitespace-pre-wrap">{post.text}</div>
            {post.mediaUrls?.length > 0 && (
              <div className="mt-3 rounded-2xl overflow-hidden border border-border">
                {post.mediaUrls.map((url, idx) => <img key={idx} src={url} className="w-full object-cover max-h-[512px]" />)}
              </div>
            )}
            <div className="mt-4 flex items-center justify-between max-w-md text-muted-foreground">
              <button onClick={handleLike} className={cn("flex items-center gap-2", isLiked && "text-pink-500")}><Heart className={cn("w-5 h-5", isLiked && "fill-current")} /><span>{post.likesCount || 0}</span></button>
              <button onClick={(e) => { e.stopPropagation(); navigate(`/post/${post.id}?focus=comment`); }} className="flex items-center gap-2"><MessageCircle className="w-5 h-5" /><span>{post.commentsCount || 0}</span></button>
              <button onClick={(e) => { e.stopPropagation(); setShowShareSheet(true); }} className="flex items-center gap-2"><Share2 className="w-5 h-5" /></button>
              <button onClick={handleSave} className={cn("flex items-center gap-2", isSaved && "text-primary")}><Bookmark className={cn("w-5 h-5", isSaved && "fill-current")} /></button>
            </div>
          </div>
        </div>
      </motion.article>
      <AnimatePresence>{showShareSheet && <ShareSheet post={post} onClose={() => setShowShareSheet(false)} />}</AnimatePresence>
    </>
  );
};
