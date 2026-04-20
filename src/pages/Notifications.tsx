import { usePageTitle } from '../hooks/usePageTitle';
import React, { useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useCollection } from '../hooks/useFirestore';
import { where, orderBy, limit, doc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Bell, Loader2, Heart, MessageCircle, UserPlus, Sparkles, Image as ImageIcon } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { motion } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import { cn } from '../lib/utils';

interface Notification {
  id: string;
  recipientId: string;
  senderId: string;
  senderUsername: string;
  senderProfileImage: string;
  type: 'like' | 'comment' | 'follow' | 'message' | 'post_alert' | 'system';
  postId?: string;
  text?: string;
  read: boolean;
  createdAt: string;
}

export const Notifications: React.FC = () => {
  usePageTitle('Notifications');
  const { user } = useAuth();
  const navigate = useNavigate();

  const { data: userNotifications, loading: userLoading } = useCollection<Notification>(
    'notifications',
    user ? [where('recipientId', '==', user.uid), orderBy('createdAt', 'desc'), limit(50)] : [],
    [user?.uid]
  );

  const { data: systemNotifications, loading: systemLoading } = useCollection<Notification>(
    'notifications',
    [where('recipientId', '==', 'all'), orderBy('createdAt', 'desc'), limit(20)]
  );

  const loading = userLoading || systemLoading;
  const allNotifications = [...userNotifications, ...systemNotifications].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  const markAsRead = useCallback(async (notification: Notification) => {
    if (notification.recipientId === 'all' || notification.read) return;
    try {
      await updateDoc(doc(db, 'notifications', notification.id), { read: true });
    } catch (err) { console.error("Error marking read:", err); }
  }, []);

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'like':        return <Heart className="w-5 h-5 text-pink-500 fill-pink-500" />;
      case 'comment':     return <MessageCircle className="w-5 h-5 text-primary" />;
      case 'follow':      return <UserPlus className="w-5 h-5 text-green-500" />;
      case 'post_alert':  return <Sparkles className="w-5 h-5 text-yellow-500" />;
      case 'system':      return <Sparkles className="w-5 h-5 text-primary" />;
      default:            return <Bell className="w-5 h-5 text-muted-foreground" />;
    }
  };

  const getNotificationText = (n: Notification) => {
    if (n.type === 'system') return n.text || 'System Update';
    if (n.type === 'post_alert') return n.text || 'just shared a new post!';
    switch (n.type) {
      case 'like':    return 'liked your post.';
      case 'comment': return 'commented on your post.';
      case 'follow':  return 'started following you.';
      case 'message': return 'sent you a message.';
      default:        return 'interacted with you.';
    }
  };

  const handleNotificationClick = (n: Notification) => {
    markAsRead(n);
    if (n.postId) navigate(`/post/${n.postId}`);
    else if (n.senderUsername && n.type !== 'system') navigate(`/profile/${n.senderUsername}`);
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex-1 max-w-2xl border-x border-border min-h-screen pb-20 md:pb-0 bg-background">
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-md border-b border-border p-4 flex items-center justify-between">
        <h2 className="text-xl font-bold tracking-tight">Notifications</h2>
        {userNotifications.some(n => !n.read) && (
          <button onClick={async () => {
              const unread = userNotifications.filter(n => !n.read);
              await Promise.all(unread.map(n => updateDoc(doc(db, 'notifications', n.id), { read: true })));
            }} className="text-sm text-primary hover:underline">Mark all as read</button>
        )}
      </header>

      {loading ? (
        <div className="flex justify-center p-12"><Loader2 className="w-10 h-10 animate-spin text-primary" /></div>
      ) : allNotifications.length > 0 ? (
        <div className="divide-y divide-border">
          {allNotifications.map((n) => (
            <div key={n.id} onClick={() => handleNotificationClick(n)} className={cn("p-4 hover:bg-accent/5 transition-colors cursor-pointer flex gap-4", !n.read && n.recipientId !== 'all' && "bg-primary/5 border-l-2 border-l-primary")}>
              <div className="pt-1 flex-shrink-0">{getNotificationIcon(n.type)}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <img src={n.senderProfileImage || `https://api.dicebear.com/7.x/avataaars/svg?seed=${n.senderUsername}`} alt={n.senderUsername} className="w-8 h-8 rounded-full object-cover bg-accent" />
                  <span className="font-bold hover:underline">{n.senderUsername}</span>
                </div>
                <p className="text-[15px] text-foreground/90">{getNotificationText(n)}</p>
                {n.type === 'post_alert' && (
                  <div className="mt-2 flex items-center gap-2 text-xs text-primary font-medium"><ImageIcon className="w-4 h-4" /> Tap to view post</div>
                )}
                <p className="text-xs text-muted-foreground mt-2">{formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}</p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="p-12 text-center text-muted-foreground"><Bell className="w-12 h-12 mx-auto mb-4 opacity-20" /><p className="text-lg font-medium">No notifications yet</p></div>
      )}
    </motion.div>
  );
};
