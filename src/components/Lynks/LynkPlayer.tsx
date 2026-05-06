// src/components/Lynks/LynkPlayer.tsx
import React, { useEffect, useRef, useState } from 'react';
import { metricsQueue } from '../../lib/metricsQueue';

export const LynkPlayer: React.FC<{ lynk: any, isActive: boolean }> = ({ lynk, isActive }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null); // YT.Player instance
  const[isPlaying, setIsPlaying] = useState(false);
  const actualWatchSeconds = useRef(0);
  const trackingInterval = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Initialize YouTube Player properly to bind events
    if (!window.YT) return; // Assume YT script is loaded in index.html

    playerRef.current = new window.YT.Player(containerRef.current, {
      videoId: lynk.videoId,
      playerVars: {
        autoplay: 0, controls: 0, disablekb: 1, fs: 0,
        modestbranding: 1, playsinline: 1, rel: 0, loop: 1, playlist: lynk.videoId
      },
      events: {
        onStateChange: (event: any) => {
          if (event.data === window.YT.PlayerState.PLAYING) {
            setIsPlaying(true);
          } else {
            setIsPlaying(false);
          }
        }
      }
    });

    return () => playerRef.current?.destroy();
  }, [lynk.videoId]);

  // Track active time ONLY when video is actually playing
  useEffect(() => {
    if (isPlaying && isActive) {
      trackingInterval.current = setInterval(() => {
        actualWatchSeconds.current += 1;
      }, 1000);
    } else {
      if (trackingInterval.current) clearInterval(trackingInterval.current);
    }

    return () => {
      if (trackingInterval.current) clearInterval(trackingInterval.current);
    };
  }, [isPlaying, isActive]);

  // Handle Scroll Away (Report to Batch Queue)
  useEffect(() => {
    if (!isActive && playerRef.current?.pauseVideo) {
      playerRef.current.pauseVideo();
      
      if (actualWatchSeconds.current > 0) {
        const isSkip = actualWatchSeconds.current <= 2;
        const replays = Math.floor(actualWatchSeconds.current / (lynk.duration || 15));
        
        metricsQueue.track(lynk.id, actualWatchSeconds.current, isSkip, replays);
        actualWatchSeconds.current = 0; // Reset for next loop
      }
    } else if (isActive && playerRef.current?.playVideo) {
      playerRef.current.playVideo();
    }
  }, [isActive]);

  return <div ref={containerRef} className="w-full h-[140%] -translate-y-[15%] pointer-events-none" />;
};
