import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronLeft, Sparkles, PenSquare, Loader2, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { usePageTitle } from '../hooks/usePageTitle';
import { db } from '../lib/firebase';
import { collection, query, orderBy, onSnapshot, Timestamp } from 'firebase/firestore';

// ── SVG Star ─────────────────────────────────────────────────────────────────
const StarSVG: React.FC<{ filled: boolean; size?: number; color?: string }> = ({
  filled, size = 16, color = '#FF9F0A'
}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <polygon
      points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"
      fill={filled ? color : 'transparent'}
      stroke={color}
      strokeWidth="1.5"
      strokeLinejoin="round"
    />
  </svg>
);

// ── Star row display ──────────────────────────────────────────────────────────
const StarRow: React.FC<{ count: number; size?: number }> = ({ count, size = 16 }) => (
  <div className="flex gap-0.5">
    {[1,2,3,4,5].map(i => <StarSVG key={i} filled={i <= count} size={size} />)}
  </div>
);

// ── Category dot colour ───────────────────────────────────────────────────────
const CATEGORY_COLORS: Record<string, string> = {
  'Bug Report':       '#FF3B30',
  'Feature Request':  '#FF9F0A',
  'General Feedback': '#30D158',
};

const STAR_LABELS = ['', 'Terrible', 'Poor', 'Okay', 'Good', 'Amazing!'];

interface Review {
  id: string;
  uid: string;
  name: string;
  username: string;
  profileImage: string;
  stars: number;
  reviewText: string;
  category: string;
  createdAt: Timestamp | null;
}

// ── Avatar initials fallback ──────────────────────────────────────────────────
const Avatar: React.FC<{ name: string; image?: string; size?: number }> = ({ name, image, size = 40 }) => {
  const [imgErr, setImgErr] = useState(false);
  const initials = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  const hue = name.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % 360;

  if (image && !imgErr) {
    return (
      <img src={image} alt={name} onError={() => setImgErr(true)}
        className="rounded-full object-cover shrink-0"
        style={{ width: size, height: size }} />
    );
  }
  return (
    <div className="rounded-full flex items-center justify-center shrink-0 text-white font-black"
      style={{ width: size, height: size, fontSize: size * 0.35, background: `hsl(${hue}, 65%, 38%)` }}>
      {initials}
    </div>
  );
};

// ── Average stars bar ─────────────────────────────────────────────────────────
const AvgBar: React.FC<{ label: string; count: number; total: number; color: string }> = ({ label, count, total, color }) => (
  <div className="flex items-center gap-2">
    <span className="text-xs text-white/40 w-4 text-right">{label}</span>
    <StarSVG filled size={12} color={color} />
    <div className="flex-1 h-1.5 bg-[#1C1C1E] rounded-full overflow-hidden">
      <motion.div className="h-full rounded-full" style={{ backgroundColor: color }}
        initial={{ width: 0 }} animate={{ width: total > 0 ? `${(count / total) * 100}%` : 0 }}
        transition={{ duration: 0.8, ease: [0.34, 1.56, 0.64, 1] }} />
    </div>
    <span className="text-xs text-white/25 w-4">{count}</span>
  </div>
);

// ── Time ago ──────────────────────────────────────────────────────────────────
function timeAgo(ts: Timestamp | null): string {
  if (!ts) return 'recently';
  const diff = Date.now() - ts.toDate().getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return ts.toDate().toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

// ════════════════════════════════════════════════════════════════════════════
export const ReviewsPage: React.FC = () => {
  usePageTitle('NetoLynk Reviews');
  const navigate = useNavigate();
  const [reviews, setReviews]   = useState<Review[]>([]);
  const [loading, setLoading]   = useState(true);
  const [filter,  setFilter]    = useState<number>(0); // 0 = all

  useEffect(() => {
    const q = query(collection(db, 'reviews'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, snap => {
      setReviews(snap.docs.map(d => ({ id: d.id, ...d.data() } as Review)));
      setLoading(false);
    }, () => setLoading(false));
    return unsub;
  }, []);

  const filtered   = filter === 0 ? reviews : reviews.filter(r => r.stars === filter);
  const avgScore   = reviews.length ? reviews.reduce((a, r) => a + r.stars, 0) / reviews.length : 0;
  const starCounts = [5,4,3,2,1].map(s => reviews.filter(r => r.stars === s).length);

  return (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
      className="flex-1 max-w-2xl border-x border-border min-h-screen bg-[#050505] pb-24 overflow-y-auto">

      {/* Header */}
      <header className="sticky top-0 z-40 bg-[#050505]/90 backdrop-blur-md border-b border-[#1C1C1E] p-4 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-2 hover:bg-white/8 rounded-full transition-colors">
          <ChevronLeft className="w-5 h-5 text-white" />
        </button>
        <div className="flex-1">
          <h2 className="text-base font-bold text-white">NetoLynk Reviews</h2>
          <p className="text-xs text-white/35">{reviews.length} review{reviews.length !== 1 ? 's' : ''} from users</p>
        </div>
        {/* Post a Review CTA */}
        <motion.button whileTap={{ scale: 0.95 }}
          onClick={() => navigate('/support')}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl font-bold text-xs text-white transition-colors"
          style={{ backgroundColor: '#FF3B30' }}>
          <PenSquare className="w-3.5 h-3.5" />
          Post a Review
        </motion.button>
      </header>

      {/* Summary card */}
      {reviews.length > 0 && (
        <div className="m-5 p-5 rounded-2xl bg-[#0D0D0D] border border-[#1C1C1E]">
          <div className="flex gap-6 items-center">
            {/* Big avg */}
            <div className="flex flex-col items-center shrink-0">
              <span className="text-5xl font-black text-white">{avgScore.toFixed(1)}</span>
              <StarRow count={Math.round(avgScore)} size={18} />
              <span className="text-xs text-white/30 mt-1">out of 5</span>
            </div>
            {/* Distribution */}
            <div className="flex-1 space-y-1.5">
              {[5,4,3,2,1].map((s, i) => (
                <AvgBar key={s} label={s.toString()} count={starCounts[i]} total={reviews.length}
                  color={s >= 4 ? '#30D158' : s === 3 ? '#FF9F0A' : '#FF3B30'} />
              ))}
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-[#1C1C1E] flex items-center gap-2">
            <Users className="w-3.5 h-3.5 text-white/25" />
            <p className="text-xs text-white/25">{reviews.length} NetoLynk user{reviews.length !== 1 ? 's' : ''} left a review</p>
            <div className="ml-auto">
              <Sparkles className="w-3.5 h-3.5 text-[#FF9F0A]" />
            </div>
          </div>
        </div>
      )}

      {/* Star filter tabs */}
      {reviews.length > 0 && (
        <div className="px-5 mb-4 flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          {[0,5,4,3,2,1].map(s => (
            <button key={s} onClick={() => setFilter(s)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all border"
              style={{
                borderColor:     filter === s ? '#FF3B30' : '#27272a',
                backgroundColor: filter === s ? '#FF3B3015' : 'transparent',
                color:           filter === s ? '#FF3B30' : '#555',
              }}>
              {s === 0 ? 'All' : (
                <><StarSVG filled size={12} color={filter === s ? '#FF3B30' : '#555'} /> {s}</>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Review cards */}
      <div className="px-5 space-y-3">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-white/20" />
          </div>
        ) : filtered.length === 0 ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-full bg-[#1C1C1E] flex items-center justify-center mb-4">
              <StarSVG filled={false} size={28} color="#333" />
            </div>
            <p className="text-white/30 font-semibold mb-1">
              {reviews.length === 0 ? 'No reviews yet' : `No ${filter}-star reviews`}
            </p>
            <p className="text-white/20 text-sm">Be the first to share your experience</p>
            <motion.button whileTap={{ scale: 0.95 }} onClick={() => navigate('/support')}
              className="mt-6 px-6 py-3 rounded-2xl font-bold text-sm text-white bg-[#FF3B30] hover:bg-[#e63429] transition-colors">
              Post a Review
            </motion.button>
          </motion.div>
        ) : (
          <AnimatePresence>
            {filtered.map((review, idx) => (
              <motion.div key={review.id}
                initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }} transition={{ delay: idx * 0.04 }}
                className="p-4 rounded-2xl bg-[#0D0D0D] border border-[#1C1C1E] space-y-3">
                {/* Top row */}
                <div className="flex items-start gap-3">
                  <Avatar name={review.name} image={review.profileImage} size={40} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-white text-sm truncate">{review.name}</span>
                      <span className="text-xs text-white/30">@{review.username}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <StarRow count={review.stars} size={14} />
                      <span className="text-xs font-bold"
                        style={{ color: review.stars >= 4 ? '#30D158' : review.stars === 3 ? '#FF9F0A' : '#FF3B30' }}>
                        {STAR_LABELS[review.stars]}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <span className="text-xs text-white/20">{timeAgo(review.createdAt)}</span>
                    {review.category && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                        style={{
                          color:           CATEGORY_COLORS[review.category] || '#636366',
                          backgroundColor: `${CATEGORY_COLORS[review.category] || '#636366'}18`,
                        }}>
                        {review.category}
                      </span>
                    )}
                  </div>
                </div>

                {/* Review text */}
                {review.reviewText && (
                  <p className="text-sm text-white/65 leading-relaxed pl-[52px]">{review.reviewText}</p>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>

      {/* Floating post review button (bottom) */}
      {reviews.length > 3 && (
        <div className="fixed bottom-24 right-4 z-50 lg:bottom-8">
          <motion.button
            whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
            initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
            onClick={() => navigate('/support')}
            className="flex items-center gap-2 px-4 py-3 rounded-full font-bold text-sm text-white shadow-2xl"
            style={{ backgroundColor: '#FF3B30', boxShadow: '0 8px 32px #FF3B3055' }}>
            <PenSquare className="w-4 h-4" />
            Post a Review
          </motion.button>
        </div>
      )}
    </motion.div>
  );
};
