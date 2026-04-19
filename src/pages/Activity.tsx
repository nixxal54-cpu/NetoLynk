import { usePageTitle } from '../hooks/usePageTitle';
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { ChevronLeft, Heart, MessageCircle, Bookmark, Share2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { db } from '../lib/firebase';
import { collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { Post } from '../types';
import { formatDistanceToNow } from 'date-fns';

export const Activity: React.FC = () => {
  usePageTitle('Activity');
  const navigate = useNavigate();
  const { user } = useAuth();
  const [activities, setActivities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchActivity = async () => {
      if (!user) return;
      
      try {
        // In a real app, you'd have an 'activities' collection.
        // For now, we'll just fetch posts the user has interacted with.
        const postsRef = collection(db, 'posts');
        const q = query(postsRef, where('likedBy', 'array-contains', user.uid), limit(20));
        const snapshot = await getDocs(q);
        
        const likedPosts = snapshot.docs.map(doc => ({
          id: doc.id,
          type: 'like',
          post: { id: doc.id, ...doc.data() } as Post,
          timestamp: doc.data().createdAt
        }));

        setActivities(likedPosts.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
      } catch (error) {
        console.error("Error fetching activity:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchActivity();
  }, [user]);

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="flex-1 max-w-2xl border-x border-border min-h-screen bg-background"
    >
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-md border-b border-border p-4 flex items-center gap-4">
        <button onClick={() => navigate(-1)} className="p-2 hover:bg-accent rounded-full transition-colors">
          <ChevronLeft className="w-6 h-6" />
        </button>
        <h2 className="text-xl font-bold">Your Activity</h2>
      </header>

      <div className="p-4">
        {loading ? (
          <div className="flex justify-center p-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : activities.length === 0 ? (
          <div className="text-center p-8 text-muted-foreground">
            <p>No recent activity found.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {activities.map((activity, index) => (
              <div key={index} className="flex items-start gap-4 p-4 bg-accent/10 rounded-2xl border border-border/50">
                <div className="p-2 bg-pink-500/10 text-pink-500 rounded-full flex-shrink-0">
                  <Heart className="w-5 h-5 fill-current" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm">
                    You liked a post by <span className="font-bold cursor-pointer hover:underline" onClick={() => navigate(`/profile/${activity.post.username}`)}>{activity.post.username}</span>
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {formatDistanceToNow(new Date(activity.timestamp), { addSuffix: true })}
                  </p>
                  <div 
                    onClick={() => navigate(`/post/${activity.post.id}`)}
                    className="mt-2 p-3 bg-background rounded-xl border border-border text-sm text-muted-foreground truncate cursor-pointer hover:border-primary/50 transition-colors"
                  >
                    {activity.post.text || 'View post'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
};
