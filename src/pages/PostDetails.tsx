import { usePageTitle } from '../hooks/usePageTitle';
import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  doc, getDoc, collection, addDoc, query, orderBy,
  onSnapshot, serverTimestamp, updateDoc, increment, deleteDoc,
  limit, startAfter, getDocs, QueryDocumentSnapshot, DocumentData
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { Post as PostType } from '../types';
import { PostCard } from '../components/Feed/PostCard';
import { ChevronLeft, Loader2, Send, Trash2, MoreHorizontal } from 'lucide-react';
import { motion } from 'motion/react';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';

interface Comment {
  id: string;
  postId: string;
  userId: string;
  username: string;
  userProfileImage: string;
  text: string;
  createdAt: string;
}

export const PostDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [post, setPost] = useState<PostType | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [lastCommentDoc, setLastCommentDoc] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMoreComments, setHasMoreComments] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const COMMENTS_PAGE_SIZE = 20;
  const commentInputRef = useRef<HTMLInputElement>(null);
  const { search } = window.location;

  usePageTitle(post ? `${post.username}: ${post.text.slice(0, 50) || 'Post'}` : 'Post');

  useEffect(() => {
    if (search.includes('focus=comment')) {
      setTimeout(() => commentInputRef.current?.focus(), 300);
    }
  }, [search]);

  useEffect(() => {
    if (!id) return;

    const postRef = doc(db, 'posts', id);
    const unsubscribePost = onSnapshot(postRef, (docSnap) => {
      if (docSnap.exists()) {
        setPost({ id: docSnap.id, ...docSnap.data() } as PostType);
      } else {
        setPost(null);
      }
      setLoading(false);
    });

    // Paginated comments — first page only
    const commentsQuery = query(
      collection(db, 'posts', id, 'comments'),
      orderBy('createdAt', 'asc'),
      limit(20)
    );
    const unsubscribeComments = onSnapshot(commentsQuery, (snapshot) => {
      const commentsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Comment[];
      setComments(commentsData);
      setLastCommentDoc(snapshot.docs[snapshot.docs.length - 1] ?? null);
      setHasMoreComments(snapshot.docs.length === 20);
    }, (err) => {
      console.error('Comments query error:', err);
      // Fallback without ordering if index not ready
      const fallbackQuery = query(collection(db, 'posts', id, 'comments'), limit(20));
      onSnapshot(fallbackQuery, (snapshot) => {
        const commentsData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Comment[];
        setComments(commentsData.sort((a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        ));
        setLastCommentDoc(snapshot.docs[snapshot.docs.length - 1] ?? null);
        setHasMoreComments(snapshot.docs.length === 20);
      });
    });

    return () => {
      unsubscribePost();
      unsubscribeComments();
    };
  }, [id]);

  // Close menu when clicking outside
  useEffect(() => {
    if (!menuOpenId) return;
    const handle = () => setMenuOpenId(null);
    document.addEventListener('click', handle);
    return () => document.removeEventListener('click', handle);
  }, [menuOpenId]);

  const loadMoreComments = async () => {
    if (!id || !lastCommentDoc || loadingMore) return;
    setLoadingMore(true);
    try {
      const nextQuery = query(
        collection(db, 'posts', id, 'comments'),
        orderBy('createdAt', 'asc'),
        startAfter(lastCommentDoc),
        limit(20)
      );
      const snapshot = await getDocs(nextQuery);
      const more = snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as Comment[];
      setComments(prev => [...prev, ...more]);
      setLastCommentDoc(snapshot.docs[snapshot.docs.length - 1] ?? null);
      setHasMoreComments(snapshot.docs.length === 20);
    } finally {
      setLoadingMore(false);
    }
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() || !user || !id) return;

    setSubmitting(true);
    try {
      await addDoc(collection(db, 'posts', id, 'comments'), {
        postId: id,
        userId: user.uid,
        username: user.username,
        userProfileImage: user.profileImage || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.username}`,
        text: newComment.trim(),
        createdAt: new Date().toISOString(),
        serverCreatedAt: serverTimestamp()
      });

      await updateDoc(doc(db, 'posts', id), {
        commentsCount: increment(1)
      });

      if (post && post.userId !== user.uid) {
        addDoc(collection(db, 'notifications'), {
          recipientId: post.userId,
          senderId: user.uid,
          senderUsername: user.username,
          senderProfileImage: user.profileImage || '',
          type: 'comment',
          postId: id,
          read: false,
          createdAt: new Date().toISOString()
        }).catch(() => {});
      }

      setNewComment('');
      toast.success('Comment added');
    } catch (error) {
      console.error("Error adding comment:", error);
      toast.error('Failed to add comment');
    } finally {
      setSubmitting(false);
    }
  };

  // ✅ Delete comment — only commenter or post owner can delete
  const handleDeleteComment = async (comment: Comment) => {
    if (!user || !id) return;
    const canDelete = user.uid === comment.userId || user.uid === post?.userId;
    if (!canDelete) return;

    setDeletingId(comment.id);
    try {
      await deleteDoc(doc(db, 'posts', id, 'comments', comment.id));
      await updateDoc(doc(db, 'posts', id), {
        commentsCount: increment(-1)
      });
      toast.success('Comment deleted');
    } catch (error) {
      console.error('Error deleting comment:', error);
      toast.error('Failed to delete comment');
    } finally {
      setDeletingId(null);
      setMenuOpenId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-screen">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
      </div>
    );
  }

  if (!post) {
    return (
      <div className="flex-1 p-8 text-center min-h-screen">
        <h2 className="text-2xl font-bold">Post not found</h2>
        <button onClick={() => navigate('/')} className="mt-4 text-primary hover:underline">Go back home</button>
      </div>
    );
  }

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      className="flex-1 max-w-2xl border-x border-border min-h-screen bg-background flex flex-col"
    >
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-md border-b border-border p-4 flex items-center gap-4">
        <button onClick={() => navigate(-1)} className="p-2 hover:bg-accent rounded-full transition-colors">
          <ChevronLeft className="w-6 h-6" />
        </button>
        <h2 className="text-xl font-bold">Post</h2>
      </header>

      <div className="flex-1 overflow-y-auto pb-[140px] md:pb-4">
        <PostCard post={post} />

        <div className="border-t border-border">
          {comments.length === 0 && (
            <p className="text-center text-muted-foreground text-sm py-8">No comments yet. Be the first!</p>
          )}
          {comments.map(comment => {
            const canDelete = user && (user.uid === comment.userId || user.uid === post.userId);
            const isDeleting = deletingId === comment.id;
            return (
              <div key={comment.id} className="p-4 border-b border-border flex gap-3 hover:bg-accent/5 transition-colors group">
                <img 
                  src={comment.userProfileImage} 
                  alt={comment.username} 
                  className="w-10 h-10 rounded-full object-cover flex-shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span
                        className="font-bold hover:underline cursor-pointer text-sm"
                        onClick={() => navigate(`/profile/${comment.username}`)}
                      >
                        {comment.username}
                      </span>
                      <span className="text-muted-foreground text-xs">
                        {formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })}
                      </span>
                    </div>

                    {/* ✅ Delete button — only shown to comment owner or post owner */}
                    {canDelete && (
                      <div className="relative">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setMenuOpenId(menuOpenId === comment.id ? null : comment.id);
                          }}
                          className="p-1 hover:bg-accent rounded-full text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <MoreHorizontal className="w-4 h-4" />
                        </button>
                        {menuOpenId === comment.id && (
                          <div className="absolute right-0 top-full mt-1 z-30 bg-background border border-border rounded-xl shadow-lg py-1 min-w-[130px]">
                            <button
                              onClick={() => handleDeleteComment(comment)}
                              disabled={isDeleting}
                              className="w-full flex items-center gap-2 px-4 py-2 hover:bg-accent transition-colors text-sm text-destructive"
                            >
                              {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                              Delete
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <p className="mt-1 text-[15px] break-words">{comment.text}</p>
                </div>
              </div>
            );
          })}
          {hasMoreComments && (
            <div className="flex justify-center py-4">
              <button
                onClick={loadMoreComments}
                disabled={loadingMore}
                className="text-sm text-primary hover:underline disabled:opacity-50 flex items-center gap-2"
              >
                {loadingMore ? 'Loading…' : 'Load more comments'}
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="sticky bottom-[68px] md:bottom-0 md:relative border-t border-border bg-background p-4 z-30">
        <form onSubmit={handleAddComment} className="flex gap-3 items-center">
          <img 
            src={user?.profileImage || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user?.username}`} 
            alt="You" 
            className="w-10 h-10 rounded-full object-cover hidden sm:block flex-shrink-0"
          />
          <input
            ref={commentInputRef}
            type="text"
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="Post your reply..."
            className="flex-1 bg-accent/30 border border-border rounded-full px-4 py-3 outline-none focus:border-primary transition-colors text-base md:text-sm"
          />
          <button 
            type="submit"
            disabled={!newComment.trim() || submitting}
            className="p-3 bg-primary text-primary-foreground rounded-full disabled:opacity-50 hover:opacity-90 transition-opacity"
          >
            {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
          </button>
        </form>
      </div>
    </motion.div>
  );
};
