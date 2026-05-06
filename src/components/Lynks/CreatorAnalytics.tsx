// src/components/Lynks/CreatorAnalytics.tsx
import React from 'react';
import { Activity, FastForward, Repeat } from 'lucide-react';

export const CreatorAnalytics: React.FC<{ lynk: any }> = ({ lynk }) => {
  const m = lynk.metrics;
  const completionRate = m.duration > 0 ? Math.min((m.totalWatchTime / m.duration) * 100, 100) : 0;
  const skipRate = m.views > 0 ? (m.skips / m.views) * 100 : 0;

  return (
    <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-800 text-white mt-4">
      <h4 className="text-sm font-bold mb-3 flex items-center gap-2">
        <Activity className="w-4 h-4 text-primary" /> Performance Insights
      </h4>
      
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="bg-black/30 p-2 rounded-lg">
          <p className="text-xs text-zinc-400">Completion</p>
          <p className={`font-bold ${completionRate > 50 ? 'text-green-400' : 'text-zinc-200'}`}>
            {completionRate.toFixed(1)}%
          </p>
        </div>
        
        <div className="bg-black/30 p-2 rounded-lg">
          <p className="text-xs text-zinc-400 flex justify-center items-center gap-1"><FastForward className="w-3 h-3"/> Skips</p>
          <p className={`font-bold ${skipRate > 40 ? 'text-red-400' : 'text-zinc-200'}`}>
            {skipRate.toFixed(1)}%
          </p>
        </div>

        <div className="bg-black/30 p-2 rounded-lg">
          <p className="text-xs text-zinc-400 flex justify-center items-center gap-1"><Repeat className="w-3 h-3"/> Replays</p>
          <p className="font-bold text-zinc-200">{m.replays}</p>
        </div>
      </div>
      
      {skipRate > 50 && (
        <p className="text-xs text-red-400/80 mt-3 italic">
          Tip: High skip rate! Try adding a stronger hook in the first 3 seconds.
        </p>
      )}
    </div>
  );
};
