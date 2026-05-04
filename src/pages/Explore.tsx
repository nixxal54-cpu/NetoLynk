import { usePageTitle } from '../hooks/usePageTitle';
import React, { useState, useEffect } from 'react';
import {
  collection,
  query,
  limit,
  getDocs,
  orderBy
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { User, Post as PostType } from '../types';
import { Lynk } from '../types/lynk';
import { PostCard } from '../components/Feed/PostCard';
import { Search, Loader2, UserPlus, Film, Heart, Eye } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useCollection } from '../hooks/useFirestore';
import { fetchTrendingFeed } from '../lib/lynkService';

export const Explore: React.FC = () => {
  usePageTitle('Explore');
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
  const [trendingLynks, setTrendingLynks] = useState<Lynk[]>([]);
  const [lynksLoading, setLynksLoading] = useState(true);

  const { data: posts, loading: postsLoading } = useCollection<PostType>('posts', [
    orderBy('likesCount', 'desc'),
    limit(10)
  ]);

  // Fetch trending Lynks
  useEffect(() => {
    fetchTrendingFeed(undefined, 6)
      .then(res => setTrendingLynks(res.lynks))
      .catch(console.error)
      .finally(() => setLynksLoading(false));
  }, []);

  // Fetch users for search
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const userQuery = query(collection(db, 'users'), limit(50));
        const snapshot = await getDocs(userQuery);
        setAllUsers(snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() })) as User[]);
      } catch (error) {
        console.error("Error fetching users:", error);
      }
    };
    fetchUsers();
  }, []);

  useEffect(() => {
    if (!searchTerm.trim()) { setFilteredUsers([]); return; }
    const term = searchTerm.toLowerCase();
    const results = allUsers.filter(user =>
      user.username.toLowerCase().includes(term) ||
      user.displayName.toLowerCase().includes(term)
    ).slice(0, 5);
    setFilteredUsers(results);
  }, [searchTerm, allUsers]);

  const isSearching = searchTerm.trim().length > 0;

  return (
    <div className="flex-1 max-w-2xl border-x border-border min-h-screen pb-20 md:pb-0">
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-md border-b border-border p-4">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search Netolynk"
            className="w-full bg-accent/50 border border-border rounded-full py-3 pl-12 pr-4 focus:border-primary outline-none transition-all text-base"
          />
        </div>
      </header>

      {/* Search Results */}
      {isSearching && (
        <div className="divide-y divide-border">
          {filteredUsers.length > 0 ? (
            <div className="p-4 space-y-4">
              <h3 className="font-bold text-lg">Users</h3>
              {filteredUsers.map(user => (
                <Link
                  key={user.uid}
                  to={`/profile/${user.username}`}
                  className="flex items-center justify-between group hover:bg-accent/50 p-2 rounded-xl transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <img
                      src={user.profileImage || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.username}`}
                      alt={user.username}
                      className="w-12 h-12 rounded-full object-cover"
                    />
                    <div>
                      <p className="font-bold group-hover:underline">{user.displayName}</p>
                      <p className="text-sm text-muted-foreground">@{user.username}</p>
                    </div>
                  </div>
                  <button className="p-2 bg-foreground text-background rounded-full hover:opacity-90 transition-opacity">
                    <UserPlus className="w-5 h-5" />
                  </button>
                </Link>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center text-muted-foreground">
              No users found for "{searchTerm}"
            </div>
          )}
        </div>
      )}

      {/* Discovery Content (when not searching) */}
      {!isSearching && (
        <div className="divide-y divide-border">

          {/* ── Trending Lynks ── */}
          <div className="p-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Film className="w-5 h-5 text-primary" />
                <h3 className="font-bold text-lg">Trending Lynks</h3>
              </div>
              <button
                onClick={() => navigate('/lynks')}
                className="text-sm text-primary font-semibold hover:underline"
              >
                See all
              </button>
            </div>

            {lynksLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : trendingLynks.length > 0 ? (
              <div className="grid grid-cols-3 gap-1.5">
                {trendingLynks.map(lynk => (
                  <button
                    key={lynk.id}
                    onClick={() => navigate('/lynks')}
                    className="relative aspect-[9/16] rounded-xl overflow-hidden bg-muted group"
                  >
                    {lynk.thumbnailUrl ? (
                      <img
                        src={lynk.thumbnailUrl}
                        alt={lynk.caption}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-accent">
                        <Film className="w-8 h-8 text-muted-foreground" />
                      </div>
                    )}
                    {/* Overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                    <div className="absolute bottom-0 left-0 right-0 p-2 translate-y-full group-hover:translate-y-0 transition-transform duration-200">
                      <div className="flex items-center gap-2 text-white text-xs">
                        <Heart className="w-3 h-3" />
                        <span>{lynk.likesCount ?? 0}</span>
                        <Eye className="w-3 h-3 ml-1" />
                        <span>{lynk.viewsCount ?? 0}</span>
                      </div>
                    </div>
                    {/* Play icon badge */}
                    <div className="absolute top-1.5 right-1.5 bg-black/50 rounded-full p-1">
                      <Film className="w-3 h-3 text-white" />
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-center py-8 text-sm">No trending Lynks right now.</p>
            )}
          </div>

          {/* ── Trending Posts ── */}
          <div className="p-4">
            <h3 className="font-bold text-lg mb-4">Trending Posts</h3>
            {postsLoading ? (
              <div className="flex justify-center p-8">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : posts.length > 0 ? (
              <div className="space-y-0 -mx-4">
                {posts.map(post => <PostCard key={post.id} post={post} />)}
              </div>
            ) : (
              <p className="text-muted-foreground text-center py-8">No trending posts right now.</p>
            )}
          </div>

        </div>
      )}
    </div>
  );
};
