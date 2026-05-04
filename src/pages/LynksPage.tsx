/**
 * LynksPage.tsx
 * Main Lynks experience: full-screen feed with For You / Following / Trending tabs.
 */
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { FeedType } from '../types/lynk';
import LynkFeed from '../components/Lynks/LynkFeed';
import { cn } from '../lib/utils';

const TABS: { label: string; value: FeedType }[] = [
  { label: 'For You',   value: 'forYou'    },
  { label: 'Following', value: 'following' },
  { label: 'Trending',  value: 'trending'  },
];

export default function LynksPage() {
  const [feedType, setFeedType] = useState<FeedType>('forYou');
  const navigate = useNavigate();

  return (
    // This page fills the entire available content area — black background for immersion
    <div className="relative w-full bg-black overflow-hidden" style={{ height: 'calc(100dvh - 68px)' }}>

      {/* Feed type toggle — pinned at top */}
      <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-center gap-1 pt-safe pt-3 pointer-events-none">
        <div className="flex bg-black/50 backdrop-blur-sm rounded-full px-1 py-1 pointer-events-auto">
          {TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setFeedType(tab.value)}
              className={cn(
                'px-4 py-1.5 rounded-full text-sm font-semibold transition-all',
                feedType === tab.value
                  ? 'bg-white text-black'
                  : 'text-white/70 hover:text-white'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Full-screen feed */}
      <LynkFeed feedType={feedType} />

      {/* Create Lynk FAB */}
      <button
        onClick={() => navigate('/create-lynk')}
        className="absolute bottom-6 right-4 z-20 w-12 h-12 bg-primary text-primary-foreground rounded-full shadow-lg shadow-primary/40 flex items-center justify-center active:scale-95 transition-transform"
        title="Create a Lynk"
      >
        <Plus className="w-6 h-6" />
      </button>
    </div>
  );
}
