import React, { useRef, useCallback, useEffect, useState } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { Home, Search, Bell, Mail, User, PlusSquare, LogOut, Sun, Moon, Film, FileText, Zap } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { auth, db } from '../../lib/firebase';
import { cn } from '../../lib/utils';
import { useAccountSwitcher } from '../../context/AccountSwitcherContext';
import { collection, query, where, onSnapshot, limit } from 'firebase/firestore';

const LONG_PRESS_MS = 500;

function useLongPress(onLongPress: () => void, onClick?: () => void) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didFire  = useRef(false);

  const start = useCallback(() => {
    didFire.current = false;
    timerRef.current = setTimeout(() => { didFire.current = true; onLongPress(); }, LONG_PRESS_MS);
  }, [onLongPress]);

  const cancel = useCallback(() => { if (timerRef.current) clearTimeout(timerRef.current); }, []);
  const handleClick = useCallback(() => { if (!didFire.current && onClick) onClick(); }, [onClick]);

  return {
    onMouseDown: start, onMouseUp: cancel, onMouseLeave: cancel,
    onTouchStart: start,
    onTouchEnd: (e: React.TouchEvent) => { cancel(); if (didFire.current) e.preventDefault(); },
    onClick: handleClick,
  };
}

function useUnreadCounts() {
  const { user } = useAuth();
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [unreadNotifications, setUnreadNotifications] = useState(0);

  useEffect(() => {
    if (!user) return;
    const chatsQ = query(collection(db, 'chats'), where('participants', 'array-contains', user.uid), limit(100));
    const unsubChats = onSnapshot(chatsQ, (snap) => {
      let total = 0;
      snap.docs.forEach((d) => { total += d.data()?.unreadCount?.[user.uid] ?? 0; });
      setUnreadMessages(total);
    });
    const notifQ = query(collection(db, 'notifications'), where('recipientId', '==', user.uid), where('read', '==', false));
    const unsubNotif = onSnapshot(notifQ, (snap) => setUnreadNotifications(snap.size));
    return () => { unsubChats(); unsubNotif(); };
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

// ─── Create Dropdown ──────────────────────────────────────────────────────────
function CreateDropdown({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();

  const go = (path: string) => {
    onClose();
    navigate(path);
  };

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40" onClick={onClose} />
      {/* Menu */}
      <div className="absolute top-full left-0 mt-2 z-50 bg-card border border-border rounded-2xl shadow-xl overflow-hidden min-w-[180px] animate-in fade-in slide-in-from-top-2 duration-150">
        <button
          onClick={() => go('/create-blink')}
          className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-accent transition-colors text-left"
        >
          <Zap className="w-5 h-5 text-primary" />
          <div>
            <p className="font-semibold text-sm">Add Blink</p>
            <p className="text-xs text-muted-foreground">Disappears in 24 hours</p>
          </div>
        </button>
        <div className="h-px bg-border mx-3" />
        <button
          onClick={() => go('/create')}
          className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-accent transition-colors text-left"
        >
          <FileText className="w-5 h-5 text-primary" />
          <div>
            <p className="font-semibold text-sm">Create Post</p>
            <p className="text-xs text-muted-foreground">Share text, images or GIFs</p>
          </div>
        </button>
        <div className="h-px bg-border mx-3" />
        <button
          onClick={() => go('/create-lynk')}
          className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-accent transition-colors text-left"
        >
          <Film className="w-5 h-5 text-primary" />
          <div>
            <p className="font-semibold text-sm">Create Lynk</p>
            <p className="text-xs text-muted-foreground">Upload a short video</p>
          </div>
        </button>
      </div>
    </>
  );
}

// ─── Top Header Bar ────────────────────────────────────────────────────────────
export const TopHeader: React.FC = () => {
  const navigate = useNavigate();
  const { unreadNotifications } = useUnreadCounts();
  const [showCreate, setShowCreate] = useState(false);

  return (
    <header className="md:hidden fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 py-3 bg-background/90 backdrop-blur-lg border-b border-border h-14">
      {/* Left: Create */}
      <div className="relative">
        <button
          onClick={() => setShowCreate(v => !v)}
          className="flex items-center gap-1 text-sm font-semibold text-primary"
        >
          <PlusSquare className="w-5 h-5" />
          <span>Create</span>
        </button>
        {showCreate && <CreateDropdown onClose={() => setShowCreate(false)} />}
      </div>

      {/* Center: Brand name */}
      <span
        className="absolute left-1/2 -translate-x-1/2 text-foreground uppercase tracking-widest font-bold text-sm"
        style={{ fontFamily: "'Syne', 'Inter', sans-serif", letterSpacing: '0.18em' }}
      >
        NETOLYNK
      </span>

      {/* Right: Notifications */}
      <NavLink to="/notifications" className="relative p-1">
        <Bell className="w-6 h-6" />
        <Badge count={unreadNotifications} />
      </NavLink>
    </header>
  );
};

// ─── Sidebar (desktop) ─────────────────────────────────────────────────────────
export const Sidebar: React.FC = () => {
  const { user } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const { openSwitcher, addCurrentAccount, currentUid } = useAccountSwitcher();
  const { unreadMessages, unreadNotifications } = useUnreadCounts();

  useEffect(() => { if (currentUid) addCurrentAccount(currentUid); }, [currentUid, addCurrentAccount]);

  const navItems = [
    { icon: Home,  label: 'Home',          path: '/',                           badge: 0 },
    { icon: Search,label: 'Search',         path: '/explore',                    badge: 0 },
    { icon: Film,  label: 'Lynks',          path: '/lynks',                      badge: 0 },
    { icon: Mail,  label: 'Messages',       path: '/messages',                   badge: unreadMessages },
    { icon: User,  label: 'Profile',        path: `/profile/${user?.username}`,  badge: 0 },
  ];

  const avatarLongPress = useLongPress(openSwitcher, () => navigate(`/profile/${user?.username}`));

  return (
    <aside className="hidden md:flex flex-col w-64 h-screen sticky top-0 border-r border-border p-4 bg-background">
      <div className="mb-8 px-4">
        <img src="/netolynk-logo.png" alt="NetoLynk" className="h-10 w-auto object-contain" />
      </div>

      <nav className="flex-1 space-y-1">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-4 px-4 py-3 rounded-xl transition-all hover:bg-accent group',
                isActive ? 'bg-accent text-primary font-bold' : 'text-foreground/70'
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

        <button
          onClick={() => navigate('/create-lynk')}
          className="w-full mt-2 flex items-center justify-center gap-2 border border-primary text-primary py-3 rounded-full font-bold hover:bg-primary/5 transition-colors"
        >
          <Film className="w-6 h-6" />
          <span>Create Lynk</span>
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
          <button {...avatarLongPress} className="relative flex-shrink-0 select-none" title="Hold to switch account">
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

// ─── Bottom Nav (mobile) ──────────────────────────────────────────────────────
export const BottomNav: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { openSwitcher, addCurrentAccount, currentUid } = useAccountSwitcher();
  const { unreadMessages } = useUnreadCounts();

  useEffect(() => { if (currentUid) addCurrentAccount(currentUid); }, [currentUid, addCurrentAccount]);

  const profileLongPress = useLongPress(openSwitcher, () => navigate(`/profile/${user?.username}`));
  const isActive = (path: string) => location.pathname === path || location.pathname.startsWith(path + '/');

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur-lg border-t border-border flex items-center justify-around px-1 z-50 pb-[env(safe-area-inset-bottom)] h-[60px]">

      {/* Home */}
      <NavLink to="/" end className={({ isActive }) => cn('p-2 transition-colors', isActive ? 'text-primary' : 'text-foreground/60')}>
        <Home className="w-6 h-6" />
      </NavLink>

      {/* Search */}
      <NavLink to="/explore" className={({ isActive }) => cn('p-2 transition-colors', isActive ? 'text-primary' : 'text-foreground/60')}>
        <Search className="w-6 h-6" />
      </NavLink>

      {/* Lynks — normal nav item */}
      <NavLink to="/lynks" className={({ isActive }) => cn('p-2 transition-colors', isActive ? 'text-primary' : 'text-foreground/60')}>
        <Film className="w-6 h-6" />
      </NavLink>

      {/* Messages */}
      <NavLink to="/messages" className={({ isActive }) => cn('relative p-2 transition-colors', isActive ? 'text-primary' : 'text-foreground/60')}>
        <Mail className="w-6 h-6" />
        {unreadMessages > 0 && <Badge count={unreadMessages} />}
      </NavLink>

      {/* Profile */}
      <button
        {...profileLongPress}
        className={cn('p-1.5 transition-colors select-none rounded-full', isActive(`/profile/${user?.username}`) ? 'text-primary' : 'text-foreground/60')}
      >
        {user?.profileImage
          ? <img src={user.profileImage} alt="Profile" className="w-7 h-7 rounded-full object-cover" draggable={false} />
          : <User className="w-6 h-6" />
        }
      </button>
    </nav>
  );
};
