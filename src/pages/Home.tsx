import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { PostCard, getMoodIconByLabel } from '../components/Feed/PostCard';
import { CreatePost } from '../components/Feed/CreatePost';
import { Post } from '../types';
import { usePageTitle } from '../hooks/usePageTitle';
import { Loader2, Sparkles, Flame, Bell } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { useInfiniteFeed } from '../hooks/useInfiniteScroll';
import { useAuth } from '../context/AuthContext';

export const Home: React.FC = () => {
  usePageTitle('Home');
  const navigate = useNavigate();
  const { user } = useAuth();
  const [activeFeed, setActiveFeed] = useState<'for-you' | 'following' | 'vibes'>('for-you');
  const { data: posts, loading, loadingMore, hasMore, fetchMore } = useInfiniteFeed<Post>('posts');
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Infinite scroll observer
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      entries => { if (entries[0].isIntersecting && hasMore && !loadingMore) fetchMore(); },
      { rootMargin: '300px' }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, fetchMore]);

  const displayedPosts = activeFeed === 'vibes'
    ? posts.filter(p => p.mood)
    : activeFeed === 'following'
    ? posts.filter(p => user?.following?.includes(p.userId))
    : posts;

  const vibeRooms = ['Hyped', 'Peaceful', 'Frustrated', 'Dead inside'];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      className="flex-1 max-w-2xl border-x border-border min-h-screen pb-20 md:pb-0">
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="p-4 flex items-center justify-between">
          <span style={{ fontFamily: "'Inter', 'SF Pro Display', -apple-system, sans-serif", fontWeight: 700, letterSpacing: "0.18em", fontSize: "1.0rem" }} className="text-foreground uppercase">NETOLYNK</span>
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/notifications')}
              className="md:hidden p-2 hover:bg-accent rounded-full text-muted-foreground hover:text-foreground transition-colors">
              <Bell className="w-6 h-6" />
            </button>
            <Sparkles className="w-5 h-5 text-primary animate-pulse" />
          </div>
        </div>
        <div className="flex w-full overflow-x-auto scrollbar-hide">
          {(['for-you', 'following', 'vibes'] as const).map(tab => (
            <button key={tab} onClick={() => setActiveFeed(tab)}
              className="flex-1 min-w-[100px] py-4 font-bold transition-colors relative hover:bg-accent/50 text-sm md:text-base whitespace-nowrap">
              <span className={cn('transition-colors flex items-center justify-center gap-1',
                activeFeed === tab ? 'text-foreground' : 'text-muted-foreground')}>
                {tab === 'vibes' && <Flame className="w-4 h-4 text-orange-500" />}
                {tab === 'for-you' ? 'For You' : tab === 'following' ? 'Following' : 'Vibes'}
              </span>
              {activeFeed === tab && (
                <motion.div layoutId="feedTab"
                  className="absolute bottom-0 left-1/2 -translate-x-1/2 w-16 h-1 bg-primary rounded-full" />
              )}
            </button>
          ))}
        </div>
      </header>

      <div className="p-4 border-b border-border hidden md:block">
        <CreatePost />
      </div>

      <div>
        {activeFeed === 'vibes' && (
          <div className="p-4 border-b border-border bg-accent/10">
            <h3 className="font-bold text-sm text-muted-foreground mb-3 uppercase tracking-wider">Active Vibe Rooms</h3>
            <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
              {vibeRooms.map(room => (
                <button key={room} className="flex-shrink-0 bg-card border border-border px-4 py-2.5 rounded-2xl flex items-center gap-2 hover:bg-accent hover:scale-105 transition-all shadow-sm">
                  <div className="transform scale-125">{getMoodIconByLabel(room)}</div>
                  <span className="font-medium text-sm whitespace-nowrap">{room}</span>
                  <div className="w-2 h-2 rounded-full bg-green-500 ml-1 animate-pulse" />
                </button>
              ))}
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center p-20 gap-4">
            <Loader2 className="w-10 h-10 animate-spin text-primary" />
            <p className="text-muted-foreground font-medium animate-pulse">Curating your feed...</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            <AnimatePresence mode="popLayout">
              {displayedPosts.length > 0 ? (
                displayedPosts.map((post, idx) => (
                  <motion.div key={post.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(idx * 0.03, 0.3), duration: 0.35, ease: 'easeOut' }}>
                    <PostCard post={post} />
                  </motion.div>
                ))
              ) : (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  className="p-12 text-center text-muted-foreground">
                  <p className="text-lg font-medium">No posts yet</p>
                  <p>{activeFeed === 'vibes' ? 'No one has shared their vibe yet.' : 'Be the first to share something!'}</p>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Infinite scroll sentinel */}
            <div ref={sentinelRef} className="py-4 flex justify-center">
              {loadingMore && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span className="text-sm">Loading more posts...</span>
                </div>
              )}
              {!hasMore && displayedPosts.length > 0 && (
                <p className="text-sm text-muted-foreground py-4">You've seen all posts ✨</p>
              )}
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
};
