/**
 * LynkFeed.tsx
 * Full-screen vertical snapping feed.
 * Uses IntersectionObserver to activate the visible Lynk.
 * Preloads the next video.
 */
import React, { useRef, useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { Lynk, FeedType } from '../../types/lynk';
import { useLynkFeed } from '../../hooks/useLynkFeed';
import LynkPlayer, { LynkPlayerHandle } from './LynkPlayer';
import LynkReportModal from './LynkReportModal';
import { cn } from '../../lib/utils';

interface Props {
  feedType: FeedType;
}

export default function LynkFeed({ feedType }: Props) {
  const { lynks, loading, hasMore, loadMore } = useLynkFeed(feedType);
  const navigate = useNavigate();

  const [activeIndex, setActiveIndex]         = useState(0);
  const [reportTarget, setReportTarget]       = useState<string | null>(null);
  const playerRefs = useRef<Map<number, LynkPlayerHandle>>(new Map());
  const itemRefs   = useRef<Map<number, HTMLDivElement>>(new Map());
  const observerRef = useRef<IntersectionObserver | null>(null);

  // IntersectionObserver — activate whichever item is ≥ 60% visible
  useEffect(() => {
    observerRef.current?.disconnect();

    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const idx = Number(entry.target.getAttribute('data-index'));
          if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
            setActiveIndex(idx);
          }
        });
      },
      { threshold: 0.6 }
    );

    itemRefs.current.forEach((el) => observerRef.current!.observe(el));
    return () => observerRef.current?.disconnect();
  }, [lynks.length]);

  // Pause all players except active
  useEffect(() => {
    playerRefs.current.forEach((player, idx) => {
      if (idx === activeIndex) player.play();
      else player.pause();
    });
  }, [activeIndex]);

  // Load more when near end
  useEffect(() => {
    if (activeIndex >= lynks.length - 3 && hasMore && !loading) {
      loadMore();
    }
  }, [activeIndex, lynks.length, hasMore, loading, loadMore]);

  const setItemRef = useCallback((idx: number) => (el: HTMLDivElement | null) => {
    if (el) {
      itemRefs.current.set(idx, el);
      observerRef.current?.observe(el);
    } else {
      itemRefs.current.delete(idx);
    }
  }, []);

  const setPlayerRef = useCallback(
    (idx: number) => (handle: LynkPlayerHandle | null) => {
      if (handle) playerRefs.current.set(idx, handle);
      else playerRefs.current.delete(idx);
    },
    []
  );

  if (!loading && lynks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3 py-20">
        <span className="text-4xl">🎬</span>
        <p className="text-lg font-semibold">No Lynks yet</p>
        <p className="text-sm">Be the first to post a Lynk!</p>
      </div>
    );
  }

  return (
    <>
      <div
        className="h-full overflow-y-scroll snap-y snap-mandatory"
        style={{ scrollbarWidth: 'none' }}
      >
        {lynks.map((lynk, idx) => (
          <div
            key={lynk.id}
            ref={setItemRef(idx)}
            data-index={idx}
            className="w-full h-full snap-start snap-always flex-shrink-0 relative"
            style={{ height: '100%' }}
          >
            {/* Preload adjacent videos */}
            {Math.abs(idx - activeIndex) <= 1 && (
              <LynkPlayer
                ref={setPlayerRef(idx)}
                lynk={lynk}
                active={idx === activeIndex}
                onUserClick={(username) => navigate(`/profile/${username}`)}
                onHashtagClick={(tag) => navigate(`/lynks/tag/${tag}`)}
                onReportClick={setReportTarget}
              />
            )}

            {/* Skeleton for far-off cards */}
            {Math.abs(idx - activeIndex) > 1 && (
              <div className="w-full h-full bg-black">
                {lynk.thumbnailUrl && (
                  <img
                    src={lynk.thumbnailUrl}
                    className="w-full h-full object-cover opacity-60"
                    alt=""
                  />
                )}
              </div>
            )}
          </div>
        ))}

        {/* Loading sentinel */}
        {loading && (
          <div className="w-full h-24 flex items-center justify-center snap-start">
            <Loader2 className="w-7 h-7 animate-spin text-white" />
          </div>
        )}

        {!hasMore && lynks.length > 0 && (
          <div className="w-full h-24 flex items-center justify-center snap-start text-white/50 text-sm">
            You've seen all Lynks 🎉
          </div>
        )}
      </div>

      {reportTarget && (
        <LynkReportModal
          lynkId={reportTarget}
          onClose={() => setReportTarget(null)}
        />
      )}
    </>
  );
}
