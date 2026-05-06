// src/components/Lynks/LynkPlayer.tsx
import React, { useEffect, useRef, useState } from 'react';
import { doc, increment, updateDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { interactionTracker } from '../../lib/lynkRecommendation';

export const LynkPlayer: React.FC<{ lynk: any, isActive: boolean }> = ({ lynk, isActive }) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const watchStartTime = useRef<number>(0);
  const accumulatedWatchTime = useRef<number>(0);

  // 1. Hardened YouTube IFrame Params
  // disablekb=1 (no keyboard), fs=0 (no fullscreen), playsinline=1 (no iOS takeover), iv_load_policy=3 (no annotations)
  const ytUrl = `https://www.youtube.com/embed/${lynk.videoId}?enablejsapi=1&autoplay=0&mute=1&controls=0&showinfo=0&rel=0&modestbranding=1&playsinline=1&disablekb=1&fs=0&iv_load_policy=3&loop=1&playlist=${lynk.videoId}`;

  useEffect(() => {
    const cw = iframeRef.current?.contentWindow;
    if (!cw) return;

    if (isActive) {
      cw.postMessage('{"event":"command","func":"playVideo","args":""}', '*');
      watchStartTime.current = Date.now();
      
      // Implicit preference tracking: if they see it, track category exposure
      interactionTracker.trackCategory(lynk.category, 0.5); // passive view
    } else {
      cw.postMessage('{"event":"command","func":"pauseVideo","args":""}', '*');
      
      // 2. Behavioral Tracking on scroll away
      if (watchStartTime.current > 0) {
        const sessionSeconds = (Date.now() - watchStartTime.current) / 1000;
        accumulatedWatchTime.current += sessionSeconds;
        watchStartTime.current = 0;

        reportWatchBehavior(sessionSeconds);
      }
    }
  }, [isActive]);

  const reportWatchBehavior = async (seconds: number) => {
    const isSkip = seconds < 2;
    const isReplay = seconds > lynk.duration && lynk.duration > 0;
    
    // Explicit preference tracking
    if (!isSkip) interactionTracker.trackCategory(lynk.category, 2); // Active watch
    if (isSkip) interactionTracker.trackCategory(lynk.category, -1); // Penalize

    // Update Firestore metrics
    const lynkRef = doc(db, 'lynks', lynk.id);
    await updateDoc(lynkRef, {
      'metrics.totalWatchTime': increment(seconds),
      'metrics.skips': increment(isSkip ? 1 : 0),
      'metrics.replays': increment(isReplay ? Math.floor(seconds / lynk.duration) : 0)
    });
  };

  return (
    <div className="relative w-full h-full bg-black snap-start">
      {/* YT Iframe stays hidden until interacted/active to save resources */}
      <iframe
        ref={iframeRef}
        className="w-full h-[140%] -translate-y-[15%] pointer-events-none"
        src={ytUrl}
        allow="autoplay; encrypted-media"
      />
      {/* ... Overlays ... */}
    </div>
  );
};
