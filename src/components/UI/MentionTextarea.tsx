import React, { useState, useRef, useEffect, useCallback } from 'react';
import { collection, query, where, getDocs, limit, orderBy } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { User } from '../../types';
import { motion, AnimatePresence } from 'motion/react';
import { Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';

interface MentionTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  value: string;
  onChange: (e: any) => void;
  onValueChange: (val: string) => void;
}

export const MentionTextarea: React.FC<MentionTextareaProps> = ({ value, onChange, onValueChange, className, ...props }) => {
  const [showDropdown, setShowDropdown] = useState(false);
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [cursorPosition, setCursorPosition] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Regex to match @ followed by word characters right before the cursor
  const mentionRegex = /@([a-zA-Z0-9_]*)$/;

  const handleKeyUp = () => {
    if (textareaRef.current) setCursorPosition(textareaRef.current.selectionStart);
  };

  const handleClick = () => {
    if (textareaRef.current) setCursorPosition(textareaRef.current.selectionStart);
  };

  // Check for mentions when text or cursor changes
  useEffect(() => {
    const textBeforeCursor = value.slice(0, cursorPosition);
    const match = textBeforeCursor.match(mentionRegex);

    if (match) {
      setMentionQuery(match[1].toLowerCase());
      setShowDropdown(true);
    } else {
      setShowDropdown(false);
      setMentionQuery('');
    }
  }, [value, cursorPosition]);

  // Fetch users from Firestore based on the query
  useEffect(() => {
    if (!showDropdown) return;
    
    const fetchUsers = async () => {
      setLoading(true);
      try {
        const usersRef = collection(db, 'users');
        let q;
        if (mentionQuery) {
          // Firestore prefix search
          q = query(
            usersRef, 
            where('username', '>=', mentionQuery), 
            where('username', '<=', mentionQuery + '\uf8ff'),
            limit(5)
          );
        } else {
          q = query(usersRef, orderBy('followersCount', 'desc'), limit(5));
        }
        
        const snapshot = await getDocs(q);
        setSearchResults(snapshot.docs.map(doc => doc.data() as User));
      } catch (err) {
        console.error("Mention search error:", err);
      } finally {
        setLoading(false);
      }
    };

    const debounce = setTimeout(fetchUsers, 300);
    return () => clearTimeout(debounce);
  }, [mentionQuery, showDropdown]);

  const insertMention = useCallback((username: string) => {
    const textBeforeCursor = value.slice(0, cursorPosition);
    const textAfterCursor = value.slice(cursorPosition);
    
    // Replace the incomplete @mention with the full username
    const newTextBefore = textBeforeCursor.replace(mentionRegex, `@${username} `);
    const newText = newTextBefore + textAfterCursor;
    
    onValueChange(newText);
    setShowDropdown(false);
    
    // Restore focus and cursor position after React re-renders
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.selectionStart = newTextBefore.length;
        textareaRef.current.selectionEnd = newTextBefore.length;
      }
    }, 10);
  }, [value, cursorPosition, onValueChange]);

  return (
    <div className="relative w-full">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={onChange}
        onKeyUp={handleKeyUp}
        onClick={handleClick}
        className={cn("w-full outline-none resize-none", className)}
        {...props}
      />

      {/* Floating Auto-complete Dropdown */}
      <AnimatePresence>
        {showDropdown && (
          <motion.div 
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            className="absolute bottom-full left-0 w-64 mb-2 bg-background border border-border rounded-xl shadow-2xl z-50 overflow-hidden"
          >
            {loading ? (
              <div className="p-4 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
            ) : searchResults.length > 0 ? (
              <div className="max-h-48 overflow-y-auto">
                {searchResults.map(u => (
                  <div 
                    key={u.uid}
                    onClick={() => insertMention(u.username)}
                    className="flex items-center gap-3 p-3 hover:bg-accent cursor-pointer transition-colors"
                  >
                    <img 
                      src={u.profileImage || `https://api.dicebear.com/7.x/avataaars/svg?seed=${u.username}`} 
                      className="w-8 h-8 rounded-full object-cover bg-accent"
                      alt=""
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold truncate">{u.displayName}</p>
                      <p className="text-xs text-muted-foreground truncate">@{u.username}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-3 text-xs text-center text-muted-foreground">No users found</div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
