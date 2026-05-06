// src/components/Lynks/LynkPlayer.tsx
import React, { useEffect, useRef, useState } from 'react';
import { Heart, MessageCircle } from 'lucide-react';
import { Lynk } from '../../types/lynk';

interface Props {
  lynk: Lynk;
  isActive: boolean; // Managed by intersection observer
}

export const LynkPlayer: React.FC<Props> = ({ lynk, isActive }) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [showThumbnail, setShowThumbnail] = useState(true);
  const[isMuted, setIsMuted] = useState(true);

  // Smart Play/Pause via YouTube IFrame API messages
  useEffect(() => {
    if (!iframeRef.current) return;
    const cw = iframeRef.current.contentWindow;
    if (!cw) return;

    if (isActive) {
      setShowThumbnail(false);
      cw.postMessage('{"event":"command","func":"playVideo","args":""}', '*');
    } else {
      cw.postMessage('{"event":"command","func":"pauseVideo","args":""}', '*');
      setShowThumbnail(true); // Revert to thumbnail to save memory
    }
  }, [isActive]);

  const toggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    const cw = iframeRef.current?.contentWindow;
    if (!cw) return;
    
    if (isMuted) {
      cw.postMessage('{"event":"command","func":"unMute","args":""}', '*');
    } else {
      cw.postMessage('{"event":"command","func":"mute","args":""}', '*');
    }
    setIsMuted(!isMuted);
  };

  return (
    <div className="relative w-full h-full bg-black flex items-center justify-center snap-start">
      
      {/* 1. Preload Thumbnail */}
      {showThumbnail && (
        <img 
          src={lynk.thumbnail} 
          alt="Thumbnail" 
          className="absolute inset-0 w-full h-full object-cover z-10"
        />
      )}

      {/* 2. YouTube IFrame (Rendered behind thumbnail until active) */}
      <iframe
        ref={iframeRef}
        className="w-full h-[140%] -translate-y-[15%] pointer-events-none" // 140% height hides YT logo and titles naturally
        src={`https://www.youtube.com/embed/${lynk.videoId}?enablejsapi=1&autoplay=0&mute=1&controls=0&showinfo=0&rel=0&modestbranding=1&loop=1&playlist=${lynk.videoId}`}
        allow="autoplay; encrypted-media"
        frameBorder="0"
      />

      {/* 3. Overlay UI */}
      <div 
        className="absolute inset-0 z-20 flex flex-col justify-end p-4 bg-gradient-to-t from-black/80 via-transparent to-transparent"
        onClick={toggleMute}
      >
        <div className="flex justify-between items-end">
          <div className="text-white">
            <h3 className="font-bold text-lg">@{lynk.username}</h3>
            <p className="text-sm mt-1 mb-2 w-4/5 line-clamp-2">{lynk.caption}</p>
            <div className="flex gap-2">
              {lynk.tags.map(tag => (
                <span key={tag} className="text-xs bg-white/20 px-2 py-1 rounded-full">#{tag}</span>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-6 text-white pb-6">
            <button className="flex flex-col items-center">
              <Heart className="w-8 h-8 drop-shadow-lg" />
              <span className="text-xs font-bold mt-1">{lynk.likesCount}</span>
            </button>
            <button className="flex flex-col items-center">
              <MessageCircle className="w-8 h-8 drop-shadow-lg" />
              <span className="text-xs font-bold mt-1">{lynk.commentsCount}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
