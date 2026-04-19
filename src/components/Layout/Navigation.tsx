import React, { useRef, useCallback, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { Home, Search, Bell, Mail, User, PlusSquare, LogOut, Sun, Moon } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { auth, db } from '../../lib/firebase';
import { cn } from '../../lib/utils';
import { useAccountSwitcher } from '../../context/AccountSwitcherContext';
import { collection, query, where, onSnapshot, limit } from 'firebase/firestore';
import { useState } from 'react';

// Long-press duration in ms
const LONG_PRESS_MS = 500;

function useLongPress(onLongPress: () => void, onClick?: () => void) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didFire = useRef(false);

  const start = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    didFire.current = false;
    timerRef.current = setTimeout(() => {
      didFire.current = true;
      onLongPress();
    }, LONG_PRESS_MS);
  }, [onLongPress]);

  const cancel = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const handleClick = useCallback(() => {
    if (!didFire.current && onClick) onClick();
  }, [onClick]);

  return {
    onMouseDown: start,
    onMouseUp: cancel,
    onMouseLeave: cancel,
    onTouchStart: start,
    onTouchEnd: (e: React.TouchEvent) => {
      cancel();
      if (didFire.current) e.preventDefault();
    },
    onClick: handleClick,
  };
}

function useUnreadCounts() {
  const { user } = useAuth();
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [unreadNotifications, setUnreadNotifications] = useState(0);

  useEffect(() => {
    if (!user) return;

    // Unread messages: sum unreadCount across active chats (capped at 100)
    const chatsQ = query(
      collection(db, 'chats'),
      where('participants', 'array-contains', user.uid),
      limit(100)
    );
    const unsubChats = onSnapshot(chatsQ, (snap) => {
      let total = 0;
      snap.docs.forEach((d) => {
        const cnt = d.data()?.unreadCount?.[user.uid] ?? 0;
        total += cnt;
      });
      setUnreadMessages(total);
    });

    // Unread notifications: user-specific + system, not read
    const notifUserQ = query(
      collection(db, 'notifications'),
      where('recipientId', '==', user.uid),
      where('read', '==', false)
    );
    const notifSystemQ = query(
      collection(db, 'notifications'),
      where('recipientId', '==', 'all'),
      where('read', '==', false)
    );

    const unsubNotifUser = onSnapshot(notifUserQ, (snap) => {
      setUnreadNotifications((prev) => {
        // We'll combine both in the system snap
        return snap.size;
      });
    });

    // Note: system notifications can't easily be marked per-user as read,
    // so we just count them and show total personal unread only
    return () => {
      unsubChats();
      unsubNotifUser();
    };
  }, [user?.uid]);

  return { unreadMessages, unreadNotifications };
}

function Badge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1 leading-none shadow-sm">
      {count > 99 ? '99+' : count}
    </span>
  );
}

export const Sidebar: React.FC = () => {
  const { user } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const { openSwitcher, addCurrentAccount, currentUid } = useAccountSwitcher();
  const { unreadMessages, unreadNotifications } = useUnreadCounts();

  useEffect(() => {
    if (currentUid) addCurrentAccount(currentUid);
  }, [currentUid, addCurrentAccount]);

  const navItems = [
    { icon: Home, label: 'Home', path: '/', badge: 0 },
    { icon: Search, label: 'Explore', path: '/explore', badge: 0 },
    { icon: Bell, label: 'Notifications', path: '/notifications', badge: unreadNotifications },
    { icon: Mail, label: 'Messages', path: '/messages', badge: unreadMessages },
    { icon: User, label: 'Profile', path: `/profile/${user?.username}`, badge: 0 },
  ];

  const avatarLongPress = useLongPress(
    openSwitcher,
    () => navigate(`/profile/${user?.username}`)
  );

  return (
    <aside className="hidden md:flex flex-col w-64 h-screen sticky top-0 border-r border-border p-4 bg-background">
      <div className="mb-8 px-4">
        <img src="/netolynk-logo.png" alt="NetoLynk" className="h-10 w-auto object-contain" />
      </div>

      <nav className="flex-1 space-y-2">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-4 px-4 py-3 rounded-xl transition-all hover:bg-accent group",
                isActive ? "bg-accent text-primary font-bold" : "text-foreground/70"
              )
            }
          >
            <span className="relative">
              <item.icon className="w-6 h-6 group-hover:scale-110 transition-transform" />
              <Badge count={item.badge} />
            </span>
            <span className="text-lg">{item.label}</span>
          </NavLink>
        ))}

        <button
          onClick={() => navigate('/create')}
          className="w-full mt-4 flex items-center justify-center gap-2 bg-primary text-primary-foreground py-3 rounded-full font-bold hover:opacity-90 transition-opacity shadow-lg shadow-primary/20"
        >
          <PlusSquare className="w-6 h-6" />
          <span>Post</span>
        </button>
      </nav>

      <div className="mt-auto space-y-4">
        <button
          onClick={toggleTheme}
          className="flex items-center gap-4 px-4 py-3 w-full text-foreground/70 hover:bg-accent rounded-xl transition-all"
        >
          {theme === 'light' ? <Moon className="w-6 h-6" /> : <Sun className="w-6 h-6" />}
          <span>{theme === 'light' ? 'Dark Mode' : 'Light Mode'}</span>
        </button>

        <div className="flex items-center gap-3 px-4 py-3 border-t border-border pt-4">
          <button
            {...avatarLongPress}
            className="relative flex-shrink-0 select-none"
            title="Hold to switch account"
          >
            <img
              src={user?.profileImage || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user?.username}`}
              alt="Profile"
              className="w-10 h-10 rounded-full object-cover ring-2 ring-transparent hover:ring-primary transition-all"
              draggable={false}
            />
          </button>
          <div className="flex-1 min-w-0">
            <p className="font-bold truncate">{user?.displayName}</p>
            <p className="text-sm text-muted-foreground truncate">@{user?.username}</p>
          </div>
          <button onClick={() => auth.signOut()} className="text-muted-foreground hover:text-destructive transition-colors">
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </div>
    </aside>
  );
};

export const BottomNav: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { openSwitcher, addCurrentAccount, currentUid } = useAccountSwitcher();
  const { unreadMessages, unreadNotifications } = useUnreadCounts();

  useEffect(() => {
    if (currentUid) addCurrentAccount(currentUid);
  }, [currentUid, addCurrentAccount]);

  const profileLongPress = useLongPress(
    openSwitcher,
    () => navigate(`/profile/${user?.username}`)
  );

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-background/90 backdrop-blur-lg border-t border-border flex items-center justify-around px-1 z-50 pb-[env(safe-area-inset-bottom)] h-[68px]">
      <NavLink to="/" className={({ isActive }) => cn("p-2 transition-colors", isActive ? "text-primary" : "text-foreground/60")}>
        <Home className="w-6 h-6" />
      </NavLink>
      <NavLink to="/explore" className={({ isActive }) => cn("p-2 transition-colors", isActive ? "text-primary" : "text-foreground/60")}>
        <Search className="w-6 h-6" />
      </NavLink>

      <div className="relative -top-5">
        <button
          onClick={() => navigate('/create')}
          className="p-3 bg-primary text-primary-foreground rounded-full shadow-xl active:scale-95 transition-transform flex items-center justify-center"
        >
          <PlusSquare className="w-6 h-6" />
        </button>
      </div>

      <NavLink to="/messages" className={({ isActive }) => cn("relative p-2 transition-colors", isActive ? "text-primary" : "text-foreground/60")}>
        <Mail className="w-6 h-6" />
        <Badge count={unreadMessages} />
      </NavLink>

      <NavLink to="/notifications" className={({ isActive }) => cn("relative p-2 transition-colors hidden sm:block", isActive ? "text-primary" : "text-foreground/60")}>
        <Bell className="w-6 h-6" />
        <Badge count={unreadNotifications} />
      </NavLink>

      <button
        {...profileLongPress}
        className={cn(
          "p-1.5 transition-colors select-none rounded-full",
          window.location.pathname.includes(user?.username ?? '__')
            ? "text-primary"
            : "text-foreground/60"
        )}
      >
        {user?.profileImage ? (
          <img
            src={user.profileImage}
            alt="Profile"
            className="w-7 h-7 rounded-full object-cover"
            draggable={false}
          />
        ) : (
          <User className="w-6 h-6" />
        )}
      </button>
    </nav>
  );
};
