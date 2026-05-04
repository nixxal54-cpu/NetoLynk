/**
 * LynksGrid.tsx
 * Compact grid of a user's Lynks for the Profile page.
 */
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Play } from 'lucide-react';
import { Lynk } from '../../types/lynk';
import { fetchUserLynks } from '../../lib/lynkService';

interface Props {
  userId: string;
}

function formatCount(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export default function LynksGrid({ userId }: Props) {
  const [lynks, setLynks] = useState<Lynk[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    fetchUserLynks(userId).then((res) => {
      setLynks(res);
      setLoading(false);
    });
  }, [userId]);

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (lynks.length === 0) {
    return (
      <div className="flex flex-col items-center py-12 text-muted-foreground">
        <span className="text-4xl mb-3">🎬</span>
        <p className="font-semibold">No Lynks yet</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-0.5">
      {lynks.map((lynk) => (
        <button
          key={lynk.id}
          onClick={() => navigate(`/lynks/${lynk.id}`)}
          className="relative aspect-[9/16] bg-black overflow-hidden group"
        >
          <img
            src={lynk.thumbnailUrl}
            alt={lynk.caption}
            className="w-full h-full object-cover group-hover:opacity-80 transition-opacity"
          />
          <div className="absolute inset-0 flex flex-col justify-between p-1.5 opacity-0 group-hover:opacity-100 transition-opacity bg-black/30">
            <Play className="w-5 h-5 text-white self-end" />
            <div className="flex items-center gap-1 text-white text-xs font-semibold">
              <span>👁</span>
              <span>{formatCount(lynk.viewsCount)}</span>
            </div>
          </div>

          {/* Always-visible view count overlay */}
          <div className="absolute bottom-1 left-1 right-1 flex items-center gap-1">
            <span className="text-white text-[10px] font-bold drop-shadow">
              ▶ {formatCount(lynk.viewsCount)}
            </span>
          </div>
        </button>
      ))}
    </div>
  );
}
