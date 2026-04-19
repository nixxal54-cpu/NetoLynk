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
import { PostCard } from '../components/Feed/PostCard';
import { Search, Loader2, UserPlus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useCollection } from '../hooks/useFirestore';

export const Explore: React.FC = () => {
  usePageTitle('Explore');
  const [searchTerm, setSearchTerm] = useState('');
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  const { data: posts, loading: postsLoading } = useCollection<PostType>('posts', [
    orderBy('likesCount', 'desc'),
    limit(10)
  ]);

  // Fetch some users initially for quick filtering
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
    if (!searchTerm.trim()) {
      setFilteredUsers([]);
      return;
    }

    const term = searchTerm.toLowerCase();
    const results = allUsers.filter(user => 
      user.username.toLowerCase().includes(term) || 
      user.displayName.toLowerCase().includes(term)
    ).slice(0, 5);
    
    setFilteredUsers(results);
  }, [searchTerm, allUsers]);

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

      {postsLoading ? (
        <div className="flex justify-center p-12">
          <Loader2 className="w-10 h-10 animate-spin text-primary" />
        </div>
      ) : (
        <div className="divide-y divide-border">
          {filteredUsers.length > 0 && (
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
          )}

          {searchTerm.trim() && filteredUsers.length === 0 && (
            <div className="p-8 text-center text-muted-foreground">
              No users found for "{searchTerm}"
            </div>
          )}

          <div className="p-4">
            <h3 className="font-bold text-lg mb-4">Trending Posts</h3>
            {posts.length > 0 ? (
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
