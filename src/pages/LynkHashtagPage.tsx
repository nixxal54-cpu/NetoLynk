import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, Loader2 } from 'lucide-react';
import { Lynk } from '../types/lynk';
import { fetchByHashtag } from '../lib/lynkService';

export default function LynkHashtagPage() {
  const { tag } = useParams<{ tag: string }>();
  const navigate = useNavigate();
  const [lynks, setLynks] = useState<Lynk[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tag) return;
    fetchByHashtag(tag).then((res) => {
      setLynks(res);
      setLoading(false);
    });
  }, [tag]);

  return (
    <div className="flex flex-col min-h-screen">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
        <button onClick={() => navigate(-1)}><ChevronLeft className="w-6 h-6" /></button>
        <h1 className="font-bold text-lg">#{tag}</h1>
        <span className="text-muted-foreground text-sm ml-auto">{lynks.length} Lynks</span>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-7 h-7 animate-spin text-primary" />
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-0.5 p-0.5">
          {lynks.map((lynk) => (
            <button
              key={lynk.id}
              onClick={() => navigate(`/lynks/${lynk.id}`)}
              className="relative aspect-[9/16] bg-black overflow-hidden"
            >
              <img src={lynk.thumbnailUrl} alt="" className="w-full h-full object-cover" />
              <div className="absolute bottom-1 left-1 text-white text-xs font-semibold drop-shadow">
                👁 {formatCount(lynk.viewsCount)}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function formatCount(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}
