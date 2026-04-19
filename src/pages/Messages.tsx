import { usePageTitle } from '../hooks/usePageTitle';
import imageCompression from 'browser-image-compression';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { httpsCallable } from 'firebase/functions';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useAuth } from '../context/AuthContext';
import { useCollection } from '../hooks/useFirestore';
import { Chat, Message, User } from '../types';
import {
  collection,
  query,
  where,
  orderBy,
  addDoc,
  increment,
  serverTimestamp,
  doc,
  updateDoc,
  getDoc,
  deleteDoc,
  setDoc,
  onSnapshot,
  limit,
} from 'firebase/firestore';
import { db, storage, functions } from '../lib/firebase';
import {
  Send,
  Image as ImageIcon,
  Loader2,
  ChevronLeft,
  MoreVertical,
  Plus,
  Search,
  Reply,
  Trash2,
  X,
  Smile,
  Download,
  ZoomIn,
  UserCircle,
  BellOff,
  Flag,
  Trash,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '../lib/utils';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

interface Reaction {
  emoji: string;
  userIds: string[];
}

interface ExtendedMessage extends Message {
  reactions?: Record<string, Reaction>;
  replyTo?: {
    id: string;
    text: string;
    senderId: string;
  } | null;
  deleted?: boolean;
}

const QUICK_REACTIONS = ['❤️', '😂', '😮', '😢', '👏', '🔥'];

function isSameGroup(a: ExtendedMessage, b: ExtendedMessage): boolean {
  if (a.senderId !== b.senderId) return false;
  const diff = Math.abs(
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  return diff < 2 * 60 * 1000;
}

// ── Image Lightbox ────────────────────────────────────────────────────────────

interface ImageLightboxProps {
  src: string;
  onClose: () => void;
}

const ImageLightbox: React.FC<ImageLightboxProps> = ({ src, onClose }) => {
  const handleDownload = async () => {
    try {
      if (src.startsWith('data:')) {
        const link = document.createElement('a');
        link.href = src;
        link.download = `image_${Date.now()}.jpg`;
        link.click();
      } else {
        const response = await fetch(src);
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `image_${Date.now()}.jpg`;
        link.click();
        URL.revokeObjectURL(url);
      }
      toast.success('Image downloaded!');
    } catch {
      window.open(src, '_blank');
      toast.info('Image opened in new tab');
    }
  };

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/90 flex flex-col items-center justify-center"
      onClick={onClose}
    >
      <div
        className="absolute top-0 left-0 right-0 flex items-center justify-between p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="p-2 text-white hover:bg-white/10 rounded-full transition-colors"
        >
          <X className="w-6 h-6" />
        </button>
        <button
          onClick={handleDownload}
          className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors text-sm font-medium"
        >
          <Download className="w-5 h-5" />
          Download
        </button>
      </div>
      <img
        src={src}
        alt="Full size"
        className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
};

// ── Typing Indicator ──────────────────────────────────────────────────────────

const TypingIndicator: React.FC = () => (
  <div className="flex items-center gap-1 px-4 py-2 self-start">
    <div className="flex gap-1 bg-accent rounded-2xl rounded-tl-none px-4 py-3">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </div>
  </div>
);

// ── Reaction Bar ──────────────────────────────────────────────────────────────

interface ReactionBarProps {
  messageId: string;
  chatId: string;
  currentUserId: string;
  reactions: Record<string, Reaction>;
  onClose: () => void;
}

const ReactionBar: React.FC<ReactionBarProps> = ({
  messageId, chatId, currentUserId, reactions, onClose,
}) => {
  const handleReact = async (emoji: string) => {
    const reactionRef = doc(db, `chats/${chatId}/messages/${messageId}/reactions`, emoji);
    const existing = reactions[emoji];
    const alreadyReacted = existing?.userIds?.includes(currentUserId);

    if (alreadyReacted) {
      const updated = existing.userIds.filter((id) => id !== currentUserId);
      if (updated.length === 0) {
        await deleteDoc(reactionRef);
      } else {
        await updateDoc(reactionRef, { userIds: updated });
      }
    } else {
      await setDoc(
        reactionRef,
        { emoji, userIds: [...(existing?.userIds ?? []), currentUserId] },
        { merge: true }
      );
    }
    onClose();
  };

  return (
    <div className="flex items-center gap-1 bg-background border border-border rounded-full px-2 py-1 shadow-md">
      {QUICK_REACTIONS.map((emoji) => (
        <button key={emoji} onClick={() => handleReact(emoji)} className="text-xl hover:scale-125 transition-transform">
          {emoji}
        </button>
      ))}
    </div>
  );
};

// ── Message Bubble ────────────────────────────────────────────────────────────

interface MessageBubbleProps {
  msg: ExtendedMessage;
  isOwn: boolean;
  isGrouped: boolean;
  chatId: string;
  currentUserId: string;
  partnerName: string;
  onReply: (msg: ExtendedMessage) => void;
  onImageClick: (src: string) => void;
}

const MessageBubble: React.FC<MessageBubbleProps> = ({
  msg, isOwn, isGrouped, chatId, currentUserId, partnerName, onReply, onImageClick,
}) => {
  const [showActions, setShowActions] = useState(false);
  const [showReactionBar, setShowReactionBar] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleTouchStart = () => {
    longPressTimer.current = setTimeout(() => setShowActions(true), 500);
  };

  const handleTouchEnd = () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
  };

  const handleUnsend = async () => {
    if (!isOwn) return;
    await updateDoc(doc(db, `chats/${chatId}/messages`, msg.id), {
      deleted: true, text: '', imageUrl: null,
    });
    setShowActions(false);
  };

  const reactionEntries = Object.values(msg.reactions ?? {}).filter((r) => r.userIds.length > 0);

  if (msg.deleted) {
    return (
      <div className={cn('text-xs text-muted-foreground italic px-1', isOwn ? 'self-end' : 'self-start')}>
        {isOwn ? 'You unsent a message.' : 'Message was unsent.'}
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col relative', isOwn ? 'items-end' : 'items-start', isGrouped ? 'mt-0.5' : 'mt-3')}>
      {msg.replyTo && (
        <div className={cn('text-xs text-muted-foreground border-l-2 border-primary/40 pl-2 mb-1 max-w-[70%] truncate', isOwn ? 'text-right border-l-0 border-r-2 pr-2 pl-0' : '')}>
          <span className="font-medium">{msg.replyTo.senderId === currentUserId ? 'You' : partnerName}</span>{' '}
          · {msg.replyTo.text}
        </div>
      )}

      <div
        className={cn('relative max-w-[78%] group', isOwn ? 'flex flex-row-reverse items-end gap-1' : 'flex items-end gap-1')}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onMouseLeave={() => setShowActions(false)}
      >
        {/* Desktop action buttons */}
        <div className={cn('hidden md:flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity', isOwn ? 'mr-1' : 'ml-1')}>
          <button onClick={() => setShowReactionBar((v) => !v)} className="p-1 hover:bg-accent rounded-full text-muted-foreground">
            <Smile className="w-4 h-4" />
          </button>
          <button onClick={() => onReply(msg)} className="p-1 hover:bg-accent rounded-full text-muted-foreground">
            <Reply className="w-4 h-4" />
          </button>
          {msg.imageUrl && (
            <button onClick={() => onImageClick(msg.imageUrl!)} className="p-1 hover:bg-accent rounded-full text-muted-foreground" title="View full image">
              <ZoomIn className="w-4 h-4" />
            </button>
          )}
          {isOwn && (
            <button onClick={handleUnsend} className="p-1 hover:bg-accent rounded-full text-muted-foreground">
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className={cn('px-3 py-2 rounded-2xl text-[14px] leading-relaxed', isOwn ? 'bg-primary text-primary-foreground rounded-tr-sm' : 'bg-accent text-foreground rounded-tl-sm')}>
          {msg.imageUrl && (
            <div className="relative group/img">
              <img
                src={msg.imageUrl}
                alt="Attachment"
                className="max-w-full rounded-xl mb-1 max-h-64 object-cover cursor-pointer hover:opacity-90 transition-opacity"
                onClick={() => onImageClick(msg.imageUrl!)}
              />
              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity pointer-events-none rounded-xl">
                <div className="bg-black/40 rounded-full p-2">
                  <ZoomIn className="w-5 h-5 text-white" />
                </div>
              </div>
            </div>
          )}
          {msg.text && <p className="break-words">{msg.text}</p>}
        </div>

        {showReactionBar && (
          <div className={cn('absolute bottom-full mb-1 z-10', isOwn ? 'right-0' : 'left-0')}>
            <ReactionBar
              messageId={msg.id} chatId={chatId} currentUserId={currentUserId}
              reactions={msg.reactions ?? {}} onClose={() => setShowReactionBar(false)}
            />
          </div>
        )}
      </div>

      {reactionEntries.length > 0 && (
        <div className={cn('flex flex-wrap gap-1 mt-0.5', isOwn ? 'justify-end' : 'justify-start')}>
          {reactionEntries.map((r) => (
            <span key={r.emoji} className="text-xs bg-accent border border-border rounded-full px-2 py-0.5 flex items-center gap-0.5">
              {r.emoji}
              {r.userIds.length > 1 && <span className="text-muted-foreground">{r.userIds.length}</span>}
            </span>
          ))}
        </div>
      )}

      {!isGrouped && (
        <p className="text-[10px] text-muted-foreground mt-0.5 px-1">
          {formatDistanceToNow(new Date(msg.createdAt), { addSuffix: true })}
        </p>
      )}

      {/* Mobile long-press sheet */}
      {showActions && (
        <div className={cn('absolute bottom-full mb-1 z-20 bg-background border border-border rounded-xl shadow-lg p-1 flex gap-1', isOwn ? 'right-0' : 'left-0')}>
          <button onClick={() => { setShowReactionBar(true); setShowActions(false); }} className="p-2 hover:bg-accent rounded-lg text-sm flex items-center gap-1">
            <Smile className="w-4 h-4" /> React
          </button>
          <button onClick={() => { onReply(msg); setShowActions(false); }} className="p-2 hover:bg-accent rounded-lg text-sm flex items-center gap-1">
            <Reply className="w-4 h-4" /> Reply
          </button>
          {msg.imageUrl && (
            <button onClick={() => { onImageClick(msg.imageUrl!); setShowActions(false); }} className="p-2 hover:bg-accent rounded-lg text-sm flex items-center gap-1">
              <ZoomIn className="w-4 h-4" /> View
            </button>
          )}
          {isOwn && (
            <button onClick={handleUnsend} className="p-2 hover:bg-accent rounded-lg text-sm text-destructive flex items-center gap-1">
              <Trash2 className="w-4 h-4" /> Unsend
            </button>
          )}
          <button onClick={() => setShowActions(false)} className="p-2 hover:bg-accent rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
};

// ── Chat Options Menu ─────────────────────────────────────────────────────────

interface ChatOptionsMenuProps {
  chatPartner: User | null;
  onClose: () => void;
  onDeleteChat: () => void;
  onViewProfile: () => void;
}

const ChatOptionsMenu: React.FC<ChatOptionsMenuProps> = ({ chatPartner, onClose, onDeleteChat, onViewProfile }) => {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  return (
    <div ref={menuRef} className="absolute top-full right-0 mt-1 z-50 bg-background border border-border rounded-xl shadow-xl py-1 min-w-[190px]">
      <button onClick={() => { onViewProfile(); onClose(); }} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-accent transition-colors text-sm text-left">
        <UserCircle className="w-4 h-4 text-muted-foreground" /> View Profile
      </button>
      <button onClick={() => { toast.info('Notifications muted'); onClose(); }} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-accent transition-colors text-sm text-left">
        <BellOff className="w-4 h-4 text-muted-foreground" /> Mute Notifications
      </button>
      <button onClick={() => { toast.info('User reported'); onClose(); }} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-accent transition-colors text-sm text-left">
        <Flag className="w-4 h-4 text-muted-foreground" /> Report User
      </button>
      <div className="border-t border-border my-1" />
      <button onClick={() => { onDeleteChat(); onClose(); }} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-accent transition-colors text-sm text-left text-destructive">
        <Trash className="w-4 h-4" /> Delete Conversation
      </button>
    </div>
  );
};

// ── Main ──────────────────────────────────────────────────────────────────────

export const Messages: React.FC = () => {
  usePageTitle('Messages');
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const [selectedChat, setSelectedChat] = useState<Chat | null>(null);
  const [chatPartner, setChatPartner] = useState<User | null>(null);
  const [messageText, setMessageText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [replyTo, setReplyTo] = useState<ExtendedMessage | null>(null);
  const [partnerTyping, setPartnerTyping] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [showChatOptions, setShowChatOptions] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevMessagesLengthRef = useRef(0);

  const { data: chats, loading: chatsLoading } = useCollection<Chat>(
    'chats',
    [where('participants', 'array-contains', user?.uid || ''), orderBy('updatedAt', 'desc'), limit(50)],
    [user?.uid]
  );

  const { data: messages, loading: messagesLoading } = useCollection<ExtendedMessage>(
    selectedChat ? `chats/${selectedChat.id}/messages` : '',
    [orderBy('createdAt', 'asc'), limit(100)],
    [selectedChat?.id]
  );

  useEffect(() => {
    if (!selectedChat || !user) return;
    const partnerId = selectedChat.participants.find((p) => p !== user.uid);
    if (!partnerId) return;
    const typingRef = doc(db, `chats/${selectedChat.id}/typing`, partnerId);
    const unsub = onSnapshot(typingRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setPartnerTyping(data.isTyping && Date.now() - data.updatedAt < 5000);
      } else {
        setPartnerTyping(false);
      }
    });
    return () => unsub();
  }, [selectedChat, user]);

  const updateTypingStatus = useCallback(async (isTyping: boolean) => {
    if (!selectedChat || !user) return;
    const typingRef = doc(db, `chats/${selectedChat.id}/typing`, user.uid);
    await setDoc(typingRef, { isTyping, updatedAt: Date.now() });
  }, [selectedChat, user]);

  const handleTyping = (e: React.ChangeEvent<HTMLInputElement>) => {
    setMessageText(e.target.value);
    updateTypingStatus(true);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => updateTypingStatus(false), 3000);
  };

  useEffect(() => {
    if (!selectedChat || !user || messages.length === 0) return;
    const lastMsg = messages[messages.length - 1];
    if (lastMsg.senderId !== user.uid) {
      updateDoc(doc(db, 'chats', selectedChat.id), {
        [`readBy.${user.uid}`]: new Date().toISOString(),
        [`unreadCount.${user.uid}`]: 0,
      });
    }
  }, [messages, selectedChat, user]);

  useEffect(() => {
    if (location.state?.selectedChatId && chats.length > 0) {
      const chatToSelect = chats.find((c) => c.id === location.state.selectedChatId);
      if (chatToSelect) {
        setSelectedChat(chatToSelect);
        navigate(location.pathname, { replace: true, state: {} });
      }
    }
  }, [location.state, chats, navigate, location.pathname]);

  useEffect(() => {
    if (selectedChat && user) {
      const partnerId = selectedChat.participants.find((p) => p !== user.uid);
      if (partnerId) {
        if (selectedChat.participantDetails?.[partnerId]) {
          const d = selectedChat.participantDetails[partnerId];
          setChatPartner({ id: partnerId, uid: partnerId, username: d.username, displayName: d.displayName, profileImage: d.profileImage } as User);
        } else {
          getDoc(doc(db, 'users', partnerId)).then((snap) => {
            if (snap.exists()) setChatPartner(snap.data() as User);
          });
        }
      }
    } else {
      setChatPartner(null);
    }
  }, [selectedChat, user]);

  useEffect(() => {
    const isNewMessage = messages.length > prevMessagesLengthRef.current;
    if (isNewMessage) messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    prevMessagesLengthRef.current = messages.length;
  }, [messages]);

  const sendMessage = async (text: string, imageUrl?: string) => {
    if ((!text.trim() && !imageUrl) || !selectedChat || !user) return;
    setIsSending(true);
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    try {
      await addDoc(collection(db, `chats/${selectedChat.id}/messages`), {
        chatId: selectedChat.id,
        senderId: user.uid,
        text: text.trim(),
        imageUrl: imageUrl || null,
        type: imageUrl ? 'image' : 'text',
        createdAt: new Date().toISOString(),
        serverCreatedAt: serverTimestamp(),
        deleted: false,
        replyTo: replyTo ? { id: replyTo.id, text: replyTo.text || 'Image', senderId: replyTo.senderId } : null,
      });
      const partnerId = selectedChat.participants.find((p) => p !== user.uid) ?? '';
      await updateDoc(doc(db, 'chats', selectedChat.id), {
        lastMessage: imageUrl ? 'Sent an image' : text.trim(),
        lastMessageAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        [`unreadCount.${partnerId}`]: increment(1),
        [`readBy.${partnerId}`]: null,
      });
      setMessageText('');
      setReplyTo(null);
      updateTypingStatus(false);
    } catch (error) {
      console.error('Error sending message:', error);
      toast.error('Failed to send message');
    } finally {
      setIsSending(false);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error('Image must be less than 5MB'); return; }
    if (!selectedChat) return;
    try {
      const compressed = await imageCompression(file, {
        maxSizeMB: 0.5,
        maxWidthOrHeight: 1280,
        useWebWorker: true,
      });
      const storageRef = ref(storage, `chats/${selectedChat.id}/${Date.now()}_${file.name}`);
      await uploadBytes(storageRef, compressed);
      const url = await getDownloadURL(storageRef);
      await sendMessage('', url);
    } catch {
      toast.error('Failed to upload image');
    }
    e.target.value = '';
  };

  const handleDeleteChat = async () => {
    if (!selectedChat || !user) return;
    try {
      // Delegates to the deleteChat Cloud Function which uses Admin SDK
      // recursiveDelete — handles chats of any size without the 500-op batch limit.
      const deleteChatFn = httpsCallable(functions, 'deleteChat');
      await deleteChatFn({ chatId: selectedChat.id });
      setSelectedChat(null);
      toast.success('Conversation deleted');
    } catch (err) {
      console.error('Failed to delete conversation:', err);
      toast.error('Failed to delete conversation');
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageText.trim()) return;
    await sendMessage(messageText);
  };

  const filteredChats = chats.filter((chat) => {
    if (!searchQuery) return true;
    const partnerId = chat.participants.find((p) => p !== user?.uid);
    const details = chat.participantDetails?.[partnerId ?? ''];
    return (
      details?.displayName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      details?.username?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  return (
    <>
      {lightboxSrc && <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />}

      <div className="flex-1 flex h-[100dvh] overflow-hidden border-x border-border pb-[68px] md:pb-0">
        {/* Chat List */}
        <div className={cn('w-full md:w-80 border-r border-border flex flex-col bg-background', selectedChat ? 'hidden md:flex' : 'flex')}>
          <header className="p-4 border-b border-border flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold">Messages</h2>
              <div className="flex gap-1">
                <button onClick={() => setShowSearch((v) => !v)} className="p-2 hover:bg-accent rounded-full transition-colors text-muted-foreground hover:text-foreground">
                  <Search className="w-5 h-5" />
                </button>
                <button className="p-2 hover:bg-accent rounded-full transition-colors text-muted-foreground hover:text-foreground">
                  <Plus className="w-5 h-5" />
                </button>
              </div>
            </div>
            {showSearch && (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input type="text" placeholder="Search conversations…" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full bg-accent rounded-full pl-9 pr-4 py-2 text-sm outline-none focus:ring-1 ring-primary" autoFocus />
              </div>
            )}
          </header>

          <div className="flex-1 overflow-y-auto">
            {chatsLoading ? (
              <div className="flex justify-center p-8"><Loader2 className="animate-spin text-primary" /></div>
            ) : filteredChats.length > 0 ? (
              filteredChats.map((chat) => {
                const partnerId = chat.participants.find((p) => p !== user?.uid);
                const details = chat.participantDetails?.[partnerId ?? ''];
                const displayName = details?.displayName || 'User';
                const profileImage = details?.profileImage || `https://api.dicebear.com/7.x/avataaars/svg?seed=${partnerId}`;
                const unread = (chat as any).unreadCount?.[user?.uid ?? ''] ?? 0;
                return (
                  <button key={chat.id} onClick={() => setSelectedChat(chat)} className={cn('w-full p-4 flex gap-3 hover:bg-accent transition-colors text-left', selectedChat?.id === chat.id && 'bg-accent')}>
                    <img src={profileImage} alt="Chat" className="w-12 h-12 rounded-full object-cover flex-shrink-0" />
                    <div className="flex-1 min-w-0 flex flex-col justify-center">
                      <div className="flex justify-between items-baseline gap-2">
                        <p className={cn('font-bold truncate', unread > 0 && 'text-foreground')}>{displayName}</p>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <span className="text-xs text-muted-foreground">{chat.lastMessageAt && formatDistanceToNow(new Date(chat.lastMessageAt), { addSuffix: false })}</span>
                          {unread > 0 && <span className="w-5 h-5 bg-primary text-primary-foreground text-[10px] font-bold rounded-full flex items-center justify-center">{unread > 9 ? '9+' : unread}</span>}
                        </div>
                      </div>
                      <p className={cn('text-sm truncate', unread > 0 ? 'text-foreground font-medium' : 'text-muted-foreground')}>{chat.lastMessage || 'No messages yet'}</p>
                    </div>
                  </button>
                );
              })
            ) : (
              <div className="p-8 text-center text-muted-foreground">
                {searchQuery ? 'No conversations match your search.' : 'No conversations yet.'}
              </div>
            )}
          </div>
        </div>

        {/* Chat Window */}
        <div className={cn('flex-1 flex flex-col bg-background', !selectedChat ? 'hidden md:flex items-center justify-center p-8 text-center' : 'flex')}>
          {!selectedChat ? (
            <div className="max-w-xs">
              <h3 className="text-2xl font-bold mb-2">Your messages</h3>
              <p className="text-muted-foreground">Select a conversation or message a user to get started.</p>
            </div>
          ) : (
            <>
              <header className="p-4 border-b border-border flex items-center justify-between bg-background/80 backdrop-blur-[10px]">
                <div className="flex items-center gap-3">
                  <button onClick={() => setSelectedChat(null)} className="md:hidden p-2 hover:bg-accent rounded-full">
                    <ChevronLeft className="w-6 h-6" />
                  </button>
                  <div className="relative cursor-pointer" onClick={() => navigate(`/profile/${chatPartner?.username}`)}>
                    <img src={chatPartner?.profileImage || `https://api.dicebear.com/7.x/avataaars/svg?seed=${chatPartner?.username}`} className="w-10 h-10 rounded-full object-cover" alt="Partner" />
                  </div>
                  <div className="cursor-pointer" onClick={() => navigate(`/profile/${chatPartner?.username}`)}>
                    <p className="font-bold leading-tight hover:underline">{chatPartner?.displayName || 'Loading…'}</p>
                    <p className="text-xs text-muted-foreground">{partnerTyping ? 'typing…' : `@${chatPartner?.username || ''}`}</p>
                  </div>
                </div>

                {/* ✅ Working 3-dot menu */}
                <div className="relative">
                  <button onClick={() => setShowChatOptions((v) => !v)} className="p-2 hover:bg-accent rounded-full transition-colors">
                    <MoreVertical className="w-5 h-5" />
                  </button>
                  {showChatOptions && (
                    <ChatOptionsMenu
                      chatPartner={chatPartner}
                      onClose={() => setShowChatOptions(false)}
                      onDeleteChat={handleDeleteChat}
                      onViewProfile={() => navigate(`/profile/${chatPartner?.username}`)}
                    />
                  )}
                </div>
              </header>

              <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col">
                {messagesLoading ? (
                  <div className="flex-1 flex items-center justify-center"><Loader2 className="animate-spin text-primary" /></div>
                ) : (
                  messages.map((msg, i) => {
                    const isOwn = msg.senderId === user?.uid;
                    const nextMsg = messages[i + 1];
                    const isGrouped = nextMsg ? isSameGroup(msg, nextMsg) : false;
                    return (
                      <MessageBubble
                        key={msg.id} msg={msg} isOwn={isOwn} isGrouped={isGrouped}
                        chatId={selectedChat.id} currentUserId={user?.uid ?? ''}
                        partnerName={chatPartner?.displayName || 'Them'}
                        onReply={setReplyTo} onImageClick={setLightboxSrc}
                      />
                    );
                  })
                )}

                {partnerTyping && <TypingIndicator />}

                {messages.length > 0 && messages[messages.length - 1].senderId === user?.uid && (() => {
                  const lastMsg = messages[messages.length - 1];
                  const partnerId = selectedChat.participants.find((p) => p !== user?.uid) ?? '';
                  const readAt = (selectedChat as any).readBy?.[partnerId];
                  const isSeen = readAt && new Date(readAt) > new Date(lastMsg.createdAt);
                  return <p className="text-[10px] text-muted-foreground self-end pr-1 mt-0.5">{isSeen ? 'Seen' : 'Delivered'}</p>;
                })()}

                <div ref={messagesEndRef} />
              </div>

              {replyTo && (
                <div className="px-4 py-2 border-t border-border flex items-center gap-2 bg-accent/50">
                  <div className="flex-1 border-l-2 border-primary pl-2 text-sm text-muted-foreground truncate">
                    <span className="font-medium text-foreground">{replyTo.senderId === user?.uid ? 'You' : chatPartner?.displayName}</span>{' '}
                    · {replyTo.text || 'Image'}
                  </div>
                  <button onClick={() => setReplyTo(null)} className="p-1 hover:bg-accent rounded-full"><X className="w-4 h-4" /></button>
                </div>
              )}

              <form onSubmit={handleSendMessage} className="p-4 border-t border-border flex items-center gap-2 bg-background">
                <label className="p-2 text-primary hover:bg-primary/10 rounded-full opacity-60 hover:opacity-100 transition-opacity cursor-pointer">
                  <ImageIcon className="w-6 h-6" />
                  <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                </label>
                <input type="text" value={messageText} onChange={handleTyping} placeholder="Message…" className="flex-1 bg-accent border border-border rounded-full py-3 px-5 focus:border-primary outline-none text-foreground placeholder:text-muted-foreground text-sm" />
                <button type="submit" disabled={isSending || !messageText.trim()} className="p-3 bg-primary text-primary-foreground rounded-full disabled:opacity-40 hover:opacity-90 transition-all">
                  {isSending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </>
  );
};
