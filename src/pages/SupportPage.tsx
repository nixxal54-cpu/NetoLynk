import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ChevronLeft, Send, Loader2, CheckCircle2,
  Bug, Lightbulb, MessageSquare, Sparkles,
  AlertTriangle, ArrowRight, SkipForward
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { usePageTitle } from '../hooks/usePageTitle';
import { db } from '../lib/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

// ─── EmailJS config ─────────────────────────────────────────────────────────
const EMAILJS_SERVICE_ID  = 'service_unc0m3d';
const EMAILJS_TEMPLATE_ID = 'template_h4xia97';
const EMAILJS_PUBLIC_KEY  = 'qOfd-eAdWpnVD2AAj';
// ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

type Category = 'bug' | 'feature' | 'general';
type Step = 'form' | 'quality' | 'review' | 'done';

const CATEGORY_CONFIG: Record<Category, {
  icon: React.FC<{ className?: string }>;
  label: string; color: string; hint: string;
}> = {
  bug:     { icon: Bug,           label: 'Bug Report',       color: '#FF3B30', hint: 'Describe what broke and how to reproduce it' },
  feature: { icon: Lightbulb,     label: 'Feature Request',  color: '#FF9F0A', hint: 'Tell us what you wish NetoLynk could do'     },
  general: { icon: MessageSquare, label: 'General Feedback', color: '#30D158', hint: 'Share any thoughts, questions or ideas'       },
};

// ── Quality analysis (pure client-side, no API) ──────────────────────────────
interface Dim { label: string; score: number; color: string; }

function clamp(n: number) { return Math.min(Math.max(Math.round(n), 0), 100); }

function analyse(text: string, cat: Category): Dim[] {
  if (text.trim().length < 5) return [];
  const words     = text.trim().split(/\s+/).filter(Boolean);
  const chars     = text.trim().length;
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 2);
  const hasNums   = /\d/.test(text);
  const hasFlow   = /step|first|then|after|finally|because|when|if|but/i.test(text);
  const excl      = (text.match(/!/g) || []).length;
  const capRatio  = (text.match(/[A-Z]/g) || []).length / Math.max(chars, 1);
  const unique    = new Set(words.map(w => w.toLowerCase())).size;
  const vocab     = unique / Math.max(words.length, 1);

  const clarity   = clamp(Math.min(chars / 2, 50) + sentences.length * 6 + (hasFlow ? 18 : 0) - Math.max(excl - 1, 0) * 8 - Math.min(capRatio * 80, 20));
  const detail    = clamp(Math.min(words.length * 2.5, 60) + (hasNums ? 20 : 0) + vocab * 20);
  const kwHit     = cat === 'bug'
    ? /error|crash|broken|fail|bug|issue|stuck|can't|cannot|doesn't|not working/i.test(text)
    : cat === 'feature'
    ? /add|want|wish|could|should|would|feature|improve|better|allow|support/i.test(text)
    : /love|great|awesome|thanks|feedback|question|help|like|enjoy/i.test(text);
  const relevance = clamp((kwHit ? 55 : 15) + Math.min(words.length * 1.5, 25) + (cat === 'general' && /\?/.test(text) ? 20 : 0));
  const tone      = clamp(70 - excl * 10 - Math.min(capRatio * 100, 30) + (sentences.length > 1 ? 15 : 0) + (vocab > 0.7 ? 15 : 0));

  return [
    { label: 'Clarity',   score: clarity,   color: '#0A84FF' },
    { label: 'Detail',    score: detail,     color: '#30D158' },
    { label: 'Relevance', score: relevance,  color: '#FF9F0A' },
    { label: 'Tone',      score: tone,       color: '#BF5AF2' },
  ];
}

function overall(dims: Dim[]) { return dims.length ? Math.round(dims.reduce((a, d) => a + d.score, 0) / dims.length) : 0; }

function qlabel(s: number): { text: string; color: string } {
  if (s >= 85) return { text: 'Excellent',  color: '#30D158' };
  if (s >= 65) return { text: 'Good',       color: '#0A84FF' };
  if (s >= 45) return { text: 'Fair',       color: '#FF9F0A' };
  if (s >= 20) return { text: 'Needs work', color: '#FF6B00' };
  return             { text: 'Too short',  color: '#636366' };
}

function getTip(dims: Dim[], cat: Category): string {
  if (!dims.length) return '';
  const w = [...dims].sort((a, b) => a.score - b.score)[0];
  if (w.score >= 70) return 'Your message is clear and detailed — great job!';
  if (w.label === 'Clarity')   return 'Break it into sentences. Structure makes it actionable.';
  if (w.label === 'Detail')    return cat === 'bug' ? 'What exactly did you do before it broke?' : 'More detail helps us understand you better.';
  if (w.label === 'Relevance') return cat === 'bug' ? 'Mention "error", "crash", or "not working".' : 'Use words that match your intent.';
  return 'A calm tone gets faster responses — fewer caps and exclamation marks help.';
}

// ── SVG Star (no emoji) ───────────────────────────────────────────────────────
const StarSVG: React.FC<{ filled: boolean; size?: number; color?: string }> = ({
  filled, size = 36, color = '#FF9F0A'
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

// ── Radial score arc ──────────────────────────────────────────────────────────
const RadialScore: React.FC<{ score: number; color: string }> = ({ score, color }) => {
  const r = 52; const c = 2 * Math.PI * r;
  return (
    <svg width={140} height={140} viewBox="0 0 140 140">
      <circle cx={70} cy={70} r={r} fill="none" stroke="#1C1C1E" strokeWidth={12} />
      <circle
        cx={70} cy={70} r={r} fill="none" stroke={color} strokeWidth={12}
        strokeDasharray={c} strokeDashoffset={c * (1 - score / 100)}
        strokeLinecap="round" transform="rotate(-90 70 70)"
        style={{ transition: 'stroke-dashoffset 0.9s cubic-bezier(0.34,1.56,0.64,1), stroke 0.4s' }}
      />
      <text x={70} y={76} textAnchor="middle" fontSize={30} fontWeight="900" fill="white">{score}</text>
    </svg>
  );
};

// ── Animated dimension bar ────────────────────────────────────────────────────
const DimBar: React.FC<{ dim: Dim; delay: number }> = ({ dim, delay }) => (
  <div>
    <div className="flex justify-between mb-2">
      <span className="text-sm font-semibold text-white/55">{dim.label}</span>
      <span className="text-sm font-black" style={{ color: dim.color }}>{dim.score}/100</span>
    </div>
    <div className="h-2.5 w-full rounded-full bg-[#1C1C1E] overflow-hidden">
      <motion.div
        className="h-full rounded-full"
        style={{ backgroundColor: dim.color }}
        initial={{ width: 0 }}
        animate={{ width: `${dim.score}%` }}
        transition={{ duration: 0.8, delay, ease: [0.34, 1.56, 0.64, 1] }}
      />
    </div>
  </div>
);

// ── Interactive star rater ────────────────────────────────────────────────────
const STAR_LABELS = ['', 'Terrible', 'Poor', 'Okay', 'Good', 'Amazing!'];

const StarRater: React.FC<{ value: number; onChange: (v: number) => void }> = ({ value, onChange }) => {
  const [hover, setHover] = useState(0);
  return (
    <div className="flex gap-1.5" onMouseLeave={() => setHover(0)}>
      {[1, 2, 3, 4, 5].map(i => (
        <motion.button
          key={i} whileHover={{ scale: 1.25, y: -4 }} whileTap={{ scale: 0.9 }}
          onMouseEnter={() => setHover(i)} onClick={() => onChange(i)}
          className="focus:outline-none transition-transform"
        >
          <StarSVG filled={i <= (hover || value)} size={44} />
        </motion.button>
      ))}
    </div>
  );
};

// ════════════════════════════════════════════════════════════════════════════
export const SupportPage: React.FC = () => {
  usePageTitle('Help & Support');
  const navigate = useNavigate();
  const { user } = useAuth();
  const [step, setStep] = useState<Step>('form');

  // Form
  const [category, setCategory] = useState<Category>('bug');
  const [name,     setName]     = useState(user?.displayName || '');
  const [username, setUsername] = useState(user?.username    || '');
  const [message,  setMessage]  = useState('');

  // Quality (debounced)
  const [dims, setDims] = useState<Dim[]>([]);
  const debRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debRef.current) clearTimeout(debRef.current);
    debRef.current = setTimeout(() => setDims(analyse(message, category)), 200);
    return () => { if (debRef.current) clearTimeout(debRef.current); };
  }, [message, category]);
  const score   = overall(dims);
  const ql      = qlabel(score);
  const tipText = getTip(dims, category);

  // Review
  const [stars,      setStars]      = useState(0);
  const [reviewText, setReviewText] = useState('');

  // Send
  const [sending, setSending] = useState(false);
  const [error,   setError]   = useState('');

  const canProceedForm = name.trim().length >= 2 && username.trim().length >= 2 && message.trim().length >= 10;

  const handleSend = async (skipReview = false) => {
    setSending(true);
    setError('');
    try {
      const emailjs = (await import('https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/es/emailjs.js' as any));
      await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
        from_name:     name.trim(),
        username:      `@${username.trim().replace(/^@/, '')}`,
        category:      CATEGORY_CONFIG[category].label,
        message:       message.trim(),
        quality_score: score.toString(),
        quality_label: ql.text,
        star_rating:   (!skipReview && stars > 0) ? `${stars}/5 — ${STAR_LABELS[stars]}` : 'Not provided',
        review_text:   (!skipReview && reviewText.trim()) ? reviewText.trim() : 'Not provided',
      }, EMAILJS_PUBLIC_KEY);

      if (!skipReview && stars > 0) {
        await addDoc(collection(db, 'reviews'), {
          uid:          user?.uid || 'anonymous',
          name:         name.trim(),
          username:     username.trim().replace(/^@/, ''),
          profileImage: user?.profileImage || '',
          stars,
          reviewText:   reviewText.trim(),
          category:     CATEGORY_CONFIG[category].label,
          createdAt:    serverTimestamp(),
        });
      }
      setStep('done');
    } catch (err) {
      console.error(err);
      setError('Failed to send. Please try again.');
    } finally {
      setSending(false);
    }
  };

  // ── DONE ──────────────────────────────────────────────────────────────────
  if (step === 'done') {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        className="flex-1 max-w-2xl border-x border-border min-h-screen bg-[#050505] flex flex-col items-center justify-center px-8 text-center">
        <motion.div
          initial={{ scale: 0.3, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 200, damping: 14 }}
          className="w-28 h-28 rounded-full flex items-center justify-center mb-6"
          style={{ background: 'radial-gradient(circle, #30D15828 0%, transparent 70%)', border: '1px solid #30D15840' }}
        >
          <CheckCircle2 className="w-14 h-14 text-[#30D158]" />
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <h2 className="text-3xl font-black text-white mb-3">Thank you, {name.split(' ')[0]}!</h2>
          <p className="text-white/40 leading-relaxed max-w-xs mx-auto text-sm">
            Your message has been received. The NetoLynk team will review it carefully.
          </p>
          {stars > 0 && (
            <div className="mt-5 flex items-center justify-center gap-1">
              {[1,2,3,4,5].map(i => <StarSVG key={i} filled={i <= stars} size={22} />)}
              <span className="ml-2 text-sm font-bold" style={{ color: stars >= 4 ? '#30D158' : stars === 3 ? '#FF9F0A' : '#FF3B30' }}>
                {STAR_LABELS[stars]}
              </span>
            </div>
          )}
          <div className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-[#1C1C1E] rounded-xl border border-[#27272a]">
            <Sparkles className="w-3.5 h-3.5 text-[#FF9F0A]" />
            <span className="text-xs text-white/40">Quality: </span>
            <span className="text-xs font-black" style={{ color: ql.color }}>{ql.text} ({score}/100)</span>
          </div>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
          className="mt-10 flex flex-col gap-3 w-full max-w-xs">
          <button onClick={() => navigate('/reviews')}
            className="w-full py-3.5 rounded-2xl font-bold text-sm text-white border border-[#27272a] hover:bg-[#1C1C1E] transition-colors">
            See All Reviews
          </button>
          <button onClick={() => navigate(-1)}
            className="w-full py-3.5 rounded-2xl font-bold text-sm text-white bg-[#FF3B30] hover:bg-[#e63429] transition-colors">
            Back to Settings
          </button>
        </motion.div>
      </motion.div>
    );
  }

  // ── REVIEW STEP ───────────────────────────────────────────────────────────
  if (step === 'review') {
    return (
      <motion.div key="review" initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }}
        className="flex-1 max-w-2xl border-x border-border min-h-screen bg-[#050505] pb-24 overflow-y-auto">
        <header className="sticky top-0 z-40 bg-[#050505]/90 backdrop-blur-md border-b border-[#1C1C1E] p-4 flex items-center gap-3">
          <button onClick={() => setStep('quality')} className="p-2 hover:bg-white/8 rounded-full transition-colors">
            <ChevronLeft className="w-5 h-5 text-white" />
          </button>
          <div>
            <h2 className="text-base font-bold text-white">Rate NetoLynk</h2>
            <p className="text-xs text-white/35">Optional · visible to all users</p>
          </div>
          {/* Step indicator */}
          <div className="ml-auto flex gap-1.5">
            {(['form','quality','review'] as Step[]).map((s, i) => (
              <div key={i} className="w-6 h-1 rounded-full transition-all"
                style={{ backgroundColor: ['form','quality','review'].indexOf(step) >= i ? '#FF3B30' : '#27272a' }} />
            ))}
          </div>
        </header>

        <div className="p-6 space-y-8">
          {/* App card */}
          <div className="flex items-center gap-4 p-4 bg-[#0D0D0D] rounded-2xl border border-[#1C1C1E]">
            <div className="w-16 h-16 rounded-2xl overflow-hidden bg-[#1C1C1E] border border-[#27272a] flex items-center justify-center shrink-0">
              <img src="/netolynk-logo.png" alt="NetoLynk" className="w-12 h-12 object-contain"
                onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            </div>
            <div>
              <h3 className="text-xl font-black text-white">NetoLynk</h3>
              <p className="text-sm text-white/40">Global Social Network</p>
              <p className="text-xs text-white/25 mt-0.5">neto-lynk.vercel.app</p>
            </div>
          </div>

          {/* Stars */}
          <div>
            <p className="text-xs font-bold text-white/35 uppercase tracking-widest mb-4">Your Rating</p>
            <StarRater value={stars} onChange={setStars} />
            <AnimatePresence mode="wait">
              {stars > 0 && (
                <motion.div key={stars} initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  className="mt-3 flex items-center gap-2">
                  <span className="text-xl font-black"
                    style={{ color: stars >= 4 ? '#30D158' : stars === 3 ? '#FF9F0A' : '#FF3B30' }}>
                    {STAR_LABELS[stars]}
                  </span>
                  <span className="text-sm text-white/25">{stars}/5</span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Review text */}
          <div>
            <p className="text-xs font-bold text-white/35 uppercase tracking-widest mb-3">Write a Review</p>
            <textarea
              value={reviewText}
              onChange={e => setReviewText(e.target.value)}
              placeholder="What do you love about NetoLynk? What could be better? Your honest words help the whole community..."
              rows={5}
              className="w-full px-4 py-3.5 rounded-2xl bg-[#1C1C1E] border border-[#27272a] focus:border-[#FF9F0A] outline-none text-white placeholder:text-white/20 text-sm transition-colors resize-none leading-relaxed"
            />
            <p className="text-xs text-white/20 mt-1.5">{reviewText.length} chars · Public — visible to all NetoLynk users</p>
          </div>

          {error && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="flex items-center gap-2 p-3 bg-[#FF3B30]/10 border border-[#FF3B30]/30 rounded-xl">
              <AlertTriangle className="w-4 h-4 text-[#FF3B30] shrink-0" />
              <p className="text-xs text-[#FF3B30]">{error}</p>
            </motion.div>
          )}

          <div className="space-y-3">
            <motion.button whileTap={{ scale: 0.97 }}
              onClick={() => handleSend(false)} disabled={sending}
              className="w-full py-4 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 text-white transition-colors"
              style={{ backgroundColor: stars > 0 ? '#FF9F0A' : '#FF3B30' }}>
              {sending
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</>
                : <><Send className="w-4 h-4" /> {stars > 0 ? 'Post Review & Send' : 'Send Without Rating'}</>}
            </motion.button>
            <button onClick={() => handleSend(true)} disabled={sending}
              className="w-full py-3 rounded-2xl font-medium text-xs text-white/25 hover:text-white/45 transition-colors flex items-center justify-center gap-1.5">
              <SkipForward className="w-3.5 h-3.5" /> Skip rating, just send message
            </button>
          </div>
        </div>
      </motion.div>
    );
  }

  // ── QUALITY STEP ──────────────────────────────────────────────────────────
  if (step === 'quality') {
    return (
      <motion.div key="quality" initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }}
        className="flex-1 max-w-2xl border-x border-border min-h-screen bg-[#050505] pb-24 overflow-y-auto">
        <header className="sticky top-0 z-40 bg-[#050505]/90 backdrop-blur-md border-b border-[#1C1C1E] p-4 flex items-center gap-3">
          <button onClick={() => setStep('form')} className="p-2 hover:bg-white/8 rounded-full transition-colors">
            <ChevronLeft className="w-5 h-5 text-white" />
          </button>
          <div>
            <h2 className="text-base font-bold text-white">Message Quality</h2>
            <p className="text-xs text-white/35">Review before sending</p>
          </div>
          <div className="ml-auto flex gap-1.5">
            {(['form','quality','review'] as Step[]).map((s, i) => (
              <div key={i} className="w-6 h-1 rounded-full transition-all"
                style={{ backgroundColor: ['form','quality','review'].indexOf(step) >= i ? '#FF3B30' : '#27272a' }} />
            ))}
          </div>
        </header>

        <div className="p-6 space-y-7">
          {/* Big radial */}
          <div className="flex flex-col items-center py-4">
            <RadialScore score={score} color={ql.color} />
            <motion.p initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.3 }}
              className="text-3xl font-black mt-3" style={{ color: ql.color }}>
              {ql.text}
            </motion.p>
            <p className="text-sm text-white/30 mt-1">Overall message quality</p>
          </div>

          {/* Bars */}
          <div className="space-y-5">
            {dims.map((d, i) => <DimBar key={d.label} dim={d} delay={i * 0.1} />)}
          </div>

          {/* AI tip */}
          {tipText && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55 }}
              className="p-4 rounded-2xl border border-[#27272a] bg-[#0D0D0D]">
              <div className="flex items-start gap-3">
                <Sparkles className="w-4 h-4 text-[#FF9F0A] mt-0.5 shrink-0" />
                <p className="text-sm text-white/55 leading-relaxed">{tipText}</p>
              </div>
            </motion.div>
          )}

          {/* Message preview */}
          <div className="p-4 rounded-2xl bg-[#0D0D0D] border border-[#1C1C1E]">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: CATEGORY_CONFIG[category].color }} />
              <p className="text-xs font-bold text-white/30 uppercase tracking-widest">{CATEGORY_CONFIG[category].label}</p>
            </div>
            <p className="text-sm text-white/70 leading-relaxed">{message}</p>
          </div>

          <div className="space-y-3">
            <motion.button whileTap={{ scale: 0.97 }} onClick={() => setStep('review')}
              className="w-full py-4 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 text-white bg-[#FF3B30] hover:bg-[#e63429] transition-colors">
              Continue to Review <ArrowRight className="w-4 h-4" />
            </motion.button>
            <button onClick={() => setStep('form')}
              className="w-full py-3 rounded-2xl font-medium text-xs text-white/25 hover:text-white/45 transition-colors">
              Edit message
            </button>
          </div>
        </div>
      </motion.div>
    );
  }

  // ── FORM STEP ─────────────────────────────────────────────────────────────
  return (
    <motion.div key="form" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
      className="flex-1 max-w-2xl border-x border-border min-h-screen bg-[#050505] pb-24 overflow-y-auto">
      <header className="sticky top-0 z-40 bg-[#050505]/90 backdrop-blur-md border-b border-[#1C1C1E] p-4 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-2 hover:bg-white/8 rounded-full transition-colors">
          <ChevronLeft className="w-5 h-5 text-white" />
        </button>
        <div>
          <h2 className="text-base font-bold text-white">Help & Support</h2>
          <p className="text-xs text-white/35">We read every message</p>
        </div>
        {/* Step dots */}
        <div className="ml-auto flex gap-1.5">
          {[0,1,2].map(i => (
            <div key={i} className="w-6 h-1 rounded-full" style={{ backgroundColor: i === 0 ? '#FF3B30' : '#27272a' }} />
          ))}
        </div>
      </header>

      <div className="p-5 space-y-6">
        {/* Category */}
        <div>
          <p className="text-xs font-bold text-white/35 uppercase tracking-widest mb-3">What kind of message?</p>
          <div className="grid grid-cols-3 gap-2">
            {(Object.entries(CATEGORY_CONFIG) as [Category, typeof CATEGORY_CONFIG[Category]][]).map(([key, cfg]) => {
              const Icon = cfg.icon;
              const active = category === key;
              return (
                <motion.button key={key} whileTap={{ scale: 0.95 }} onClick={() => setCategory(key)}
                  className="flex flex-col items-center gap-2 py-4 px-2 rounded-2xl border transition-all"
                  style={{ borderColor: active ? cfg.color : '#1C1C1E', backgroundColor: active ? `${cfg.color}12` : '#0D0D0D' }}>
                  <Icon className="w-5 h-5" style={{ color: active ? cfg.color : '#555' }} />
                  <span className="text-[11px] font-bold leading-tight text-center" style={{ color: active ? cfg.color : '#555' }}>
                    {cfg.label}
                  </span>
                </motion.button>
              );
            })}
          </div>
          <p className="text-xs text-white/20 mt-2">{CATEGORY_CONFIG[category].hint}</p>
        </div>

        {/* Name */}
        <div>
          <label className="block text-xs font-bold text-white/35 uppercase tracking-widest mb-2">Your Name</label>
          <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Full name"
            className="w-full px-4 py-3.5 rounded-2xl bg-[#1C1C1E] border border-[#27272a] focus:border-[#FF3B30] outline-none text-white placeholder:text-white/20 text-sm transition-colors" />
        </div>

        {/* Username */}
        <div>
          <label className="block text-xs font-bold text-white/35 uppercase tracking-widest mb-2">Username</label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30 text-sm font-medium">@</span>
            <input type="text" value={username}
              onChange={e => setUsername(e.target.value.replace(/^@/, '').replace(/\s/g, '').toLowerCase())}
              placeholder="yourhandle"
              className="w-full pl-8 pr-4 py-3.5 rounded-2xl bg-[#1C1C1E] border border-[#27272a] focus:border-[#FF3B30] outline-none text-white placeholder:text-white/20 text-sm transition-colors" />
          </div>
        </div>

        {/* Message */}
        <div>
          <label className="block text-xs font-bold text-white/35 uppercase tracking-widest mb-2">Message</label>
          <textarea value={message} onChange={e => setMessage(e.target.value)}
            placeholder={CATEGORY_CONFIG[category].hint} rows={6}
            className="w-full px-4 py-3.5 rounded-2xl bg-[#1C1C1E] border border-[#27272a] focus:border-[#FF3B30] outline-none text-white placeholder:text-white/20 text-sm transition-colors resize-none leading-relaxed" />
          <div className="flex justify-between items-center mt-1.5">
            <span className="text-xs text-white/20">{message.length} chars</span>
            <AnimatePresence>
              {dims.length > 0 && (
                <motion.span initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                  className="text-xs font-black px-2.5 py-1 rounded-full"
                  style={{ color: ql.color, backgroundColor: `${ql.color}18` }}>
                  {ql.text} · {score}/100
                </motion.span>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* CTA */}
        <motion.button whileTap={{ scale: 0.97 }} onClick={() => setStep('quality')} disabled={!canProceedForm}
          className="w-full py-4 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-all"
          style={{
            backgroundColor: canProceedForm ? '#FF3B30' : '#1C1C1E',
            color: canProceedForm ? 'white' : '#444',
            cursor: canProceedForm ? 'pointer' : 'not-allowed',
          }}>
          Review Quality <ArrowRight className="w-4 h-4" />
        </motion.button>

        <p className="text-center text-xs text-white/12 pb-2">
          Messages go directly to the NetoLynk team · Your email is never shown
        </p>
      </div>
    </motion.div>
  );
};
