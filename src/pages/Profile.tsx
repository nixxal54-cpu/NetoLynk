import { usePageTitle } from '../hooks/usePageTitle';
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  getDocs, 
  getDoc,
  doc, 
  onSnapshot,
  addDoc,
  serverTimestamp,
  limit,
  updateDoc,
  setDoc,
  deleteDoc,
  arrayUnion,
  arrayRemove,
  increment,
  writeBatch
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { User, Post as PostType } from '../types';
import { PostCard } from '../components/Feed/PostCard';
import { useAuth } from '../context/AuthContext';
import { 
  Calendar, 
  Link as LinkIcon, 
  MapPin, 
  Loader2, 
  Edit3,
  Grid,
  Heart,
  Bookmark,
  ChevronLeft,
  Settings as SettingsIcon,
  MessageCircle
} from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { useCollection } from '../hooks/useFirestore';
import { toast } from 'sonner';

export const Profile: React.FC = () => {
  const { username } = useParams<{ username: string }>();
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  const [profileUser, setProfileUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'posts' | 'likes' | 'saved'>('posts');
  const [isMessaging, setIsMessaging] = useState(false);

  usePageTitle(profileUser ? `@${profileUser.username}` : 'Profile');

  useEffect(() => {
    if (!username) return;

    setLoading(true);
    // Find user by username
    const q = query(collection(db, 'users'), where('username', '==', username));
    
    const unsubscribe = onSnapshot(q, async (snapshot) => {
      if (!snapshot.empty) {
        const userData = { ...snapshot.docs[0].data(), uid: snapshot.docs[0].id } as User;
        setProfileUser(userData);
        setLoading(false);
      } else {
        // Fallback: find a post by this username and use the userId to look up their real doc
        const postsQ = query(collection(db, 'posts'), where('username', '==', username), limit(1));
        const postsSnap = await getDocs(postsQ);
        if (!postsSnap.empty) {
          const postData = postsSnap.docs[0].data();
          // Try to fetch the real user document first
          const userDocSnap = await getDoc(doc(db, 'users', postData.userId));
          if (userDocSnap.exists()) {
            setProfileUser({ ...userDocSnap.data(), uid: userDocSnap.id } as User);
          } else {
            // User doc missing — create a minimal stub so follow/unfollow works
            const stub = {
              uid: postData.userId,
              username: postData.username,
              displayName: postData.username,
              email: '',
              profileImage: postData.userProfileImage || '',
              coverImage: '',
              bio: '',
              followers: [],
              followersCount: 0,
              following: [],
              followingCount: 0,
              postsCount: 0,
              createdAt: postData.createdAt
            };
            await setDoc(doc(db, 'users', postData.userId), stub, { merge: true });
            setProfileUser(stub as User);
          }
        } else {
          setProfileUser(null);
        }
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [username]);

  // Use real-time collection for posts
  const { data: posts, loading: postsLoading } = useCollection<PostType>('posts', 
    profileUser ? [
      where('userId', '==', profileUser.uid),
      orderBy('createdAt', 'desc'),
      limit(30),
    ] : [],
    [profileUser?.uid]
  );

  const isOwnProfile = currentUser?.uid === profileUser?.uid;
  const isFollowing = currentUser && profileUser ? profileUser.followers?.includes(currentUser.uid) : false;

  const handleFollow = async () => {
    if (!currentUser || !profileUser) return;

    // Write to the followers/following subcollections.
    // onFollowerWrite and onFollowingWrite Cloud Functions will recount
    // followersCount and followingCount authoritatively on the server.
    // The followers/following arrays on the user docs are kept for optimistic
    // UI checks (isFollowing) and are updated atomically in the same batch.
    const profileRef = doc(db, 'users', profileUser.uid);
    const currentRef = doc(db, 'users', currentUser.uid);
    const followerRef = doc(db, 'users', profileUser.uid, 'followers', currentUser.uid);
    const followingRef = doc(db, 'users', currentUser.uid, 'following', profileUser.uid);
    const batch = writeBatch(db);

    try {
      if (isFollowing) {
        // Unfollow — delete from both subcollections + remove from arrays
        batch.delete(followerRef);
        batch.delete(followingRef);
        batch.update(profileRef, { followers: arrayRemove(currentUser.uid) });
        batch.update(currentRef, { following: arrayRemove(profileUser.uid) });
        await batch.commit();
      } else {
        // Follow — write to both subcollections + add to arrays
        const now = new Date().toISOString();
        batch.set(followerRef, { uid: currentUser.uid, createdAt: now });
        batch.set(followingRef, { uid: profileUser.uid, createdAt: now });
        batch.update(profileRef, { followers: arrayUnion(currentUser.uid) });
        batch.update(currentRef, { following: arrayUnion(profileUser.uid) });
        await batch.commit();

        // Send notification (non-critical, outside batch)
        addDoc(collection(db, 'notifications'), {
          recipientId: profileUser.uid,
          senderId: currentUser.uid,
          senderUsername: currentUser.username,
          senderProfileImage: currentUser.profileImage || '',
          type: 'follow',
          read: false,
          createdAt: new Date().toISOString()
        }).catch(err => console.warn('Notification failed (non-critical):', err));
      }
    } catch (error: unknown) {
      console.error("Error following user:", error);
      const code = (error as { code?: string })?.code;
      if (code === 'permission-denied') {
        toast.error("Permission denied — check your Firestore security rules.");
      } else {
        toast.error("Failed to update follow status");
      }
    }
  };

  const handleMessageClick = async () => {
    if (!currentUser || !profileUser) return;
    
    setIsMessaging(true);
    try {
      // Check if chat already exists
      const chatsRef = collection(db, 'chats');
      const q = query(chatsRef, where('participants', 'array-contains', currentUser.uid));
      const querySnapshot = await getDocs(q);
      
      let existingChatId = null;
      querySnapshot.forEach((doc) => {
        const chatData = doc.data();
        if (chatData.participants.includes(profileUser.uid)) {
          existingChatId = doc.id;
        }
      });

      if (existingChatId) {
        // Navigate to existing chat
        navigate('/messages', { state: { selectedChatId: existingChatId } });
      } else {
        // Create new chat
        const newChatRef = await addDoc(collection(db, 'chats'), {
          participants: [currentUser.uid, profileUser.uid],
          participantDetails: {
            [currentUser.uid]: {
              username: currentUser.username,
              displayName: currentUser.displayName,
              profileImage: currentUser.profileImage || ''
            },
            [profileUser.uid]: {
              username: profileUser.username,
              displayName: profileUser.displayName,
              profileImage: profileUser.profileImage || ''
            }
          },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          lastMessage: '',
          type: 'direct'
        });
        navigate('/messages', { state: { selectedChatId: newChatRef.id } });
      }
    } catch (error) {
      console.error("Error initiating chat:", error);
    } finally {
      setIsMessaging(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <motion.div 
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center"
        >
          <Loader2 className="w-10 h-10 animate-spin text-primary mx-auto" />
          <p className="mt-4 text-muted-foreground font-medium">Loading profile...</p>
        </motion.div>
      </div>
    );
  }

  if (!profileUser) {
    return (
      <div className="flex-1 p-8 text-center">
        <h2 className="text-2xl font-bold">User not found</h2>
        <p className="text-muted-foreground">The account you're looking for doesn't exist.</p>
        <button 
          onClick={() => navigate('/')}
          className="mt-4 text-primary font-bold hover:underline"
        >
          Go back home
        </button>
      </div>
    );
  }

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex-1 max-w-2xl border-x border-border min-h-screen pb-20 md:pb-0"
    >
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-[10px] border-b border-border p-4 flex items-center gap-6">
        <button onClick={() => navigate(-1)} className="p-2 hover:bg-accent rounded-full transition-colors">
          <ChevronLeft className="w-6 h-6" />
        </button>
        <div>
          <h2 className="text-xl font-bold">{profileUser.displayName}</h2>
          <p className="text-xs text-muted-foreground">{profileUser.postsCount || posts.length} posts</p>
        </div>
      </header>

      <div className="px-4">
        <div className="relative h-32 md:h-48 w-full bg-accent/50 overflow-hidden rounded-b-2xl">
          {profileUser.coverImage && (
            <motion.img 
              initial={{ scale: 1.1 }}
              animate={{ scale: 1 }}
              transition={{ duration: 0.8 }}
              src={profileUser.coverImage} 
              alt="Cover" 
              className="w-full h-full object-cover" 
            />
          )}
        </div>
        
        <div className="flex justify-between items-start mt-[-48px] px-2">
          <motion.div 
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="relative border-4 border-background rounded-full overflow-hidden w-24 h-24 md:w-32 md:h-32 bg-background shadow-xl shrink-0"
          >
            <img 
              src={profileUser.profileImage || `https://api.dicebear.com/7.x/avataaars/svg?seed=${profileUser.username}`} 
              alt={profileUser.username} 
              className="w-full h-full object-cover"
            />
          </motion.div>
          
          <div className="flex gap-2 pt-14 flex-wrap justify-end">
            {isOwnProfile ? (
              <>
                <button 
                  onClick={() => navigate('/activity')}
                  className="p-2 border border-border rounded-full hover:bg-accent transition-all active:scale-95 text-muted-foreground hover:text-foreground"
                  title="Activity"
                >
                  <Heart className="w-5 h-5" />
                </button>
                <button 
                  onClick={() => navigate('/settings')}
                  className="p-2 border border-border rounded-full hover:bg-accent transition-all active:scale-95 text-muted-foreground hover:text-foreground"
                  title="Settings"
                >
                  <SettingsIcon className="w-5 h-5" />
                </button>
                <button 
                  onClick={() => navigate('/edit-profile')}
                  className="px-4 py-2 border border-border rounded-full font-bold hover:bg-accent transition-all active:scale-95 flex items-center gap-2 text-sm md:text-base"
                >
                  <Edit3 className="w-4 h-4" />
                  <span className="hidden sm:inline">Edit profile</span>
                </button>
              </>
            ) : (
              <>
                <button 
                  onClick={handleMessageClick}
                  disabled={isMessaging}
                  className="p-2 border border-border rounded-full hover:bg-accent transition-all active:scale-95 text-muted-foreground hover:text-foreground disabled:opacity-50"
                  title="Message"
                >
                  {isMessaging ? <Loader2 className="w-5 h-5 animate-spin" /> : <MessageCircle className="w-5 h-5" />}
                </button>
                <button 
                  onClick={handleFollow}
                  className={cn(
                    "px-6 py-2 rounded-full font-bold transition-all active:scale-95 text-sm md:text-base",
                    isFollowing ? "border border-border hover:bg-destructive/10 hover:text-destructive hover:border-destructive/50" : "bg-foreground text-background hover:opacity-90"
                  )}
                >
                  {isFollowing ? 'Following' : 'Follow'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="mt-4 px-4 space-y-4"
      >
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{profileUser.displayName}</h1>
          <p className="text-muted-foreground">@{profileUser.username}</p>
        </div>

        {profileUser.bio && <p className="text-[15px] leading-relaxed text-foreground/90">{profileUser.bio}</p>}

        <div className="flex flex-wrap gap-y-2 gap-x-4 text-muted-foreground text-sm">
          <div className="flex items-center gap-1">
            <MapPin className="w-4 h-4" />
            <span>Global</span>
          </div>
          <div className="flex items-center gap-1">
            <LinkIcon className="w-4 h-4" />
            <a href="#" className="text-primary hover:underline">netolynk.com</a>
          </div>
          <div className="flex items-center gap-1">
            <Calendar className="w-4 h-4" />
            <span>Joined {format(new Date(profileUser.createdAt), 'MMMM yyyy')}</span>
          </div>
        </div>

        <div className="flex gap-6 pt-2">
          <button className="hover:underline group">
            <span className="font-bold">{profileUser.followingCount || 0}</span>
            <span className="text-muted-foreground ml-1 group-hover:text-foreground transition-colors">Following</span>
          </button>
          <button className="hover:underline group">
            <span className="font-bold">{profileUser.followersCount || 0}</span>
            <span className="text-muted-foreground ml-1 group-hover:text-foreground transition-colors">Followers</span>
          </button>
        </div>
      </motion.div>

      <div className="mt-6 border-b border-border flex sticky top-[73px] bg-background/80 backdrop-blur-md z-30">
        {[
          { id: 'posts', label: 'Posts', icon: Grid },
          { id: 'likes', label: 'Likes', icon: Heart },
          { id: 'saved', label: 'Saved', icon: Bookmark },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={cn(
              "flex-1 py-4 flex items-center justify-center gap-2 font-medium transition-colors relative",
              activeTab === tab.id ? "text-primary" : "text-muted-foreground hover:bg-accent/50"
            )}
          >
            <tab.icon className="w-4 h-4" />
            <span className="hidden sm:inline">{tab.label}</span>
            {activeTab === tab.id && (
              <motion.div 
                layoutId="activeTab"
                className="absolute bottom-0 left-0 right-0 h-1 bg-primary rounded-t-full" 
              />
            )}
          </button>
        ))}
      </div>

      <div className="divide-y divide-border">
        {postsLoading ? (
          <div className="flex justify-center p-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <AnimatePresence mode="popLayout">
            {posts.length > 0 ? (
              posts.map((post, idx) => (
                <motion.div
                  key={post.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 * idx }}
                >
                  <PostCard post={post} />
                </motion.div>
              ))
            ) : (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="p-12 text-center text-muted-foreground"
              >
                <p className="text-lg font-medium">No posts yet</p>
                <p>When they post, their content will show up here.</p>
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </div>
    </motion.div>
  );
};
