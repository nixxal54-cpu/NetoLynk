// src/components/Lynks/LynkPlayer.tsx
import React, { useEffect, useRef, useState } from 'react';
import { metricsQueue } from '../../lib/metricsQueue';

// Ensure YT API is loaded and call back when ready
function onYTReady(cb: () => void) {
  if (window.YT && window.YT.Player) {
    cb();
    return;
  }
  const prev = (window as any).onYouTubeIframeAPIReady;
  (window as any).onYouTubeIframeAPIReady = () => {
    prev?.();
    cb();
  };
}

export const LynkPlayer: React.FC<{ lynk: any; isActive: boolean }> = ({ lynk, isActive }) => {
  const containerRef        = useRef<HTMLDivElement>(null);
  const playerRef           = useRef<any>(null);
  const [ready, setReady]   = useState(false);
  const isPlayingRef        = useRef(false);
  const actualWatchSeconds  = useRef(0);
  const trackingInterval    = useRef<ReturnType<typeof setInterval> | null>(null);

  // Init player once YT API is available
  useEffect(() => {
    let destroyed = false;

    onYTReady(() => {
      if (destroyed || !containerRef.current) return;

      playerRef.current = new window.YT.Player(containerRef.current, {
        videoId: lynk.videoId,
        playerVars: {
          autoplay:       0,
          controls:       0,
          disablekb:      1,
          fs:             0,
          modestbranding: 1,
          playsinline:    1,
          rel:            0,
          loop:           1,
          playlist:       lynk.videoId,
        },
        events: {
          onReady: () => {
            if (!destroyed) setReady(true);
          },
          onStateChange: (event: any) => {
            isPlayingRef.current = event.data === window.YT.PlayerState.PLAYING;
          },
        },
      });
    });

    return () => {
      destroyed = true;
      playerRef.current?.destroy();
      playerRef.current = null;
    };
  }, [lynk.videoId]);

  // Play / pause when active state changes
  useEffect(() => {
    if (!ready) return;
    if (isActive) {
      playerRef.current?.playVideo();
    } else {
      playerRef.current?.pauseVideo();
      if (actualWatchSeconds.current > 0) {
        const isSkip  = actualWatchSeconds.current <= 2;
        const replays = Math.floor(actualWatchSeconds.current / (lynk.duration || 15));
        metricsQueue.track(lynk.id, actualWatchSeconds.current, isSkip, replays);
        actualWatchSeconds.current = 0;
      }
    }
  }, [isActive, ready]);

  // Watch time tracking
  useEffect(() => {
    if (!ready) return;
    trackingInterval.current = setInterval(() => {
      if (isActive && isPlayingRef.current) {
        actualWatchSeconds.current += 1;
      }
    }, 1000);
    return () => {
      if (trackingInterval.current) clearInterval(trackingInterval.current);
    };
  }, [ready, isActive]);

  return (
    <div className="relative w-full h-full bg-black flex items-center justify-center">
      <div
        ref={containerRef}
        className="w-full h-[140%] -translate-y-[15%] pointer-events-none"
      />
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-10 h-10 border-2 border-white border-t-transparent rounded-full animate-spin" />
        </div>
      )}
    </div>
  );
};
