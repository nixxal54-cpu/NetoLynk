/**
 * BlinkBar.tsx
 * Horizontal scrollable bar shown at the top of the Home feed.
 * Shows the current user's "Add Blink" button, then grouped blinks from others.
 */
import React, { useRef } from 'react';
import { Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { UserBlinks } from '../../types/blink';
import { cn } from '../../lib/utils';

interface BlinkBarProps {
  grouped: UserBlinks[];
  loading: boolean;
  onOpen: (userBlinks: UserBlinks, startIndex?: number) => void;
}

function Avatar({ src, username }: { src?: string; username: string }) {
  return src ? (
    <img src={src} alt={username} className="w-full h-full object-cover rounded-full" />
  ) : (
    <div className="w-full h-full rounded-full bg-accent flex items-center justify-center text-base font-bold text-foreground">
      {username[0]?.toUpperCase()}
    </div>
  );
}

export const BlinkBar: React.FC<BlinkBarProps> = ({ grouped, loading, onOpen }) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const scrollRef = useRef<HTMLDivElement>(null);

  const myBlinks = grouped.find(g => g.userId === user?.uid);
  const others = grouped.filter(g => g.userId !== user?.uid);

  if (loading) {
    return (
      <div className="flex gap-4 px-4 py-3 overflow-hidden">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex flex-col items-center gap-1.5 flex-shrink-0">
            <div className="w-[62px] h-[62px] rounded-full bg-accent animate-pulse" />
            <div className="w-10 h-2 rounded bg-accent animate-pulse" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      className="flex gap-4 px-4 py-3 overflow-x-auto scrollbar-hide border-b border-border"
    >
      {/* ── Add Blink (always first) ── */}
      <button
        onClick={() => {
          if (myBlinks) {
            onOpen(myBlinks, 0);
          } else {
            navigate('/create-blink');
          }
        }}
        className="flex flex-col items-center gap-1.5 flex-shrink-0 group"
      >
        <div className="relative">
          {/* Ring: gradient if has blinks, plain add icon if not */}
          {myBlinks ? (
            <div className={cn(
              'w-[66px] h-[66px] rounded-full p-[2.5px]',
              myBlinks.hasUnseen
                ? 'bg-gradient-to-tr from-primary via-orange-400 to-yellow-400'
                : 'bg-muted'
            )}>
              <div className="w-full h-full rounded-full bg-background p-[2px]">
                <Avatar src={user?.profileImage} username={user?.username ?? 'me'} />
              </div>
            </div>
          ) : (
            <div className="w-[66px] h-[66px] rounded-full bg-accent flex items-center justify-center border-2 border-dashed border-border group-hover:border-primary transition-colors">
              <Avatar src={user?.profileImage} username={user?.username ?? 'me'} />
            </div>
          )}

          {/* Plus badge */}
          <button
            onClick={e => { e.stopPropagation(); navigate('/create-blink'); }}
            className="absolute -bottom-0.5 -right-0.5 w-5 h-5 bg-primary text-primary-foreground rounded-full flex items-center justify-center shadow-md hover:scale-110 transition-transform"
          >
            <Plus className="w-3 h-3" />
          </button>
        </div>
        <span className="text-[11px] font-medium text-muted-foreground truncate max-w-[66px] text-center">
          {myBlinks ? 'Your Blink' : 'Add Blink'}
        </span>
      </button>

      {/* ── Other users' Blinks ── */}
      {others.map(entry => (
        <button
          key={entry.userId}
          onClick={() => onOpen(entry, 0)}
          className="flex flex-col items-center gap-1.5 flex-shrink-0"
        >
          <div className={cn(
            'w-[66px] h-[66px] rounded-full p-[2.5px] transition-transform active:scale-95',
            entry.hasUnseen
              ? 'bg-gradient-to-tr from-primary via-orange-400 to-yellow-400'
              : 'bg-muted'
          )}>
            <div className="w-full h-full rounded-full bg-background p-[2px]">
              <Avatar src={entry.userProfileImage} username={entry.username} />
            </div>
          </div>
          <span className="text-[11px] font-medium text-muted-foreground truncate max-w-[66px] text-center">
            {entry.userDisplayName.split(' ')[0]}
          </span>
        </button>
      ))}
    </div>
  );
};
