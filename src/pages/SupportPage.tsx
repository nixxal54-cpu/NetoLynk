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

// ─── Verified EmailJS Keys from your screenshots ───────────────────────────
const EMAILJS_SERVICE_ID  = 'service_unc0m3d';
const EMAILJS_TEMPLATE_ID = 'template_h4xia97';
const EMAILJS_PUBLIC_KEY  = 'qOfd-eAdWpnVD2AAj';
// ────────────────────────────────────────────────────────────────────────────

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

// ── Quality analysis logic ──────────────────────────────────────────────────
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
function qlabel(s: number) {
  if (s >= 85) return { text: 'Excellent',  color: '#30D158' };
  if (s >= 65) return { text: 'Good',       color: '#0A84FF' };
  if (s >= 45) return { text: 'Fair',       color: '#FF9F0A' };
  return { text: 'Needs work', color: '#FF6B00' };
}

// ── UI Components ───────────────────────────────────────────────────────────
const StarSVG: React.FC<{ filled: boolean; size?: number; color?: string }> = ({ filled, size = 36, color = '#FF9F0A' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" fill={filled ? color : 'transparent'} stroke={color} strokeWidth="1.5" />
  </svg>
);

const STAR_LABELS = ['', 'Terrible', 'Poor', 'Okay', 'Good', 'Amazing!'];

export const SupportPage: React.FC = () => {
  usePageTitle('Help & Support');
  const navigate = useNavigate();
  const { user } = useAuth();
  const [step, setStep] = useState<Step>('form');

  // Form State
  const [category, setCategory] = useState<Category>('bug');
  const [name, setName] = useState(user?.displayName || '');
  const [username, setUsername] = useState(user?.username || '');
  const [message, setMessage] = useState('');

  // Quality State
  const [dims, setDims] = useState<Dim[]>([]);
  useEffect(() => {
    const d = analyse(message, category);
    setDims(d);
  }, [message, category]);

  const score = overall(dims);
  const ql = qlabel(score);

  // Review State
  const [stars, setStars] = useState(0);
  const [reviewText, setReviewText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  // ── HANDLE SEND (DIRECT API METHOD) ───────────────────────────────────────
  const handleSend = async (skipReview = false) => {
    setSending(true);
    setError('');

    const payload = {
      service_id: EMAILJS_SERVICE_ID,
      template_id: EMAILJS_TEMPLATE_ID,
      user_id: EMAILJS_PUBLIC_KEY,
      template_params: {
        from_name:     name.trim(),
        username:      `@${username.trim().replace(/^@/, '')}`,
        category:      CATEGORY_CONFIG[category].label,
        message:       message.trim(),
        quality_score: score.toString(),
        quality_label: ql.text,
        star_rating:   (!skipReview && stars > 0) ? `${stars}/5 — ${STAR_LABELS[stars]}` : 'Not provided',
        review_text:   (!skipReview && reviewText.trim()) ? reviewText.trim() : 'Not provided',
      }
    };

    try {
      const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) throw new Error('API limit reached or ID mismatch');

      // Save to public review wall if rating was given
      if (!skipReview && stars > 0) {
        await addDoc(collection(db, 'reviews'), {
          uid: user?.uid || 'anonymous',
          name: name.trim(),
          username: username.trim().replace(/^@/, ''),
          profileImage: user?.profileImage || '',
          stars,
          reviewText: reviewText.trim(),
          category: CATEGORY_CONFIG[category].label,
          createdAt: serverTimestamp(),
        });
      }
      setStep('done');
    } catch (err) {
      setError("Email service busy. Please try again later.");
    } finally {
      setSending(false);
    }
  };

  const canProceedForm = name.trim().length >= 2 && username.trim().length >= 2 && message.trim().length >= 10;

  // ── RENDER DONE ───────────────────────────────────────────────────────────
  if (step === 'done') {
    return (
      <div className="flex-1 max-w-2xl border-x border-border min-h-screen bg-[#050505] flex flex-col items-center justify-center px-8 text-center">
        <CheckCircle2 className="w-16 h-16 text-[#30D158] mb-4" />
        <h2 className="text-2xl font-black text-white mb-2">Message Sent!</h2>
        <p className="text-white/40 text-sm mb-8">Thank you for helping us improve NetoLynk.</p>
        <button onClick={() => navigate(-1)} className="w-full max-w-xs py-4 rounded-2xl font-bold bg-[#FF3B30] text-white">Back</button>
      </div>
    );
  }

  // ── RENDER REVIEW ─────────────────────────────────────────────────────────
  if (step === 'review') {
    return (
      <div className="flex-1 max-w-2xl border-x border-border min-h-screen bg-[#050505] pb-24">
        <header className="p-4 flex items-center gap-3 border-b border-[#1C1C1E]">
          <button onClick={() => setStep('quality')} className="p-2 hover:bg-white/5 rounded-full"><ChevronLeft className="w-5 h-5 text-white" /></button>
          <h2 className="font-bold text-white">Final Step: Rate Us</h2>
        </header>
        <div className="p-6 space-y-6">
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map(i => (
              <button key={i} onClick={() => setStars(i)}><StarSVG filled={i <= stars} /></button>
            ))}
          </div>
          <textarea
            value={reviewText} onChange={e => setReviewText(e.target.value)}
            placeholder="Optional: Write a public review..."
            className="w-full p-4 rounded-2xl bg-[#1C1C1E] border border-[#27272a] text-white outline-none h-32 resize-none"
          />
          {error && <p className="text-[#FF3B30] text-xs">{error}</p>}
          <button onClick={() => handleSend(false)} disabled={sending} className="w-full py-4 rounded-2xl font-bold bg-[#FF3B30] text-white flex items-center justify-center gap-2">
            {sending ? <Loader2 className="animate-spin w-5 h-5" /> : <><Send className="w-5 h-5" /> Submit Support Ticket</>}
          </button>
          <button onClick={() => handleSend(true)} className="w-full text-white/30 text-sm">Skip rating, just send message</button>
        </div>
      </div>
    );
  }

  // ── RENDER QUALITY ────────────────────────────────────────────────────────
  if (step === 'quality') {
    return (
      <div className="flex-1 max-w-2xl border-x border-border min-h-screen bg-[#050505] pb-24">
        <header className="p-4 flex items-center gap-3 border-b border-[#1C1C1E]">
          <button onClick={() => setStep('form')} className="p-2 hover:bg-white/5 rounded-full"><ChevronLeft className="w-5 h-5 text-white" /></button>
          <h2 className="font-bold text-white">Message Quality</h2>
        </header>
        <div className="p-6 space-y-8 text-center">
            <div className="inline-block p-8 rounded-full border-4 border-[#FF3B30]">
                <span className="text-4xl font-black text-white">{score}</span>
            </div>
            <h3 className="text-2xl font-black text-white" style={{color: ql.color}}>{ql.text}</h3>
            <div className="space-y-4 text-left">
                {dims.map(d => (
                    <div key={d.label}>
                        <div className="flex justify-between text-xs font-bold text-white/40 mb-1 uppercase"><span>{d.label}</span><span>{d.score}%</span></div>
                        <div className="h-1 w-full bg-[#1C1C1E] rounded-full overflow-hidden">
                            <div className="h-full" style={{width: `${d.score}%`, backgroundColor: d.color}} />
                        </div>
                    </div>
                ))}
            </div>
            <button onClick={() => setStep('review')} className="w-full py-4 rounded-2xl font-bold bg-[#FF3B30] text-white flex items-center justify-center gap-2">
                Continue to Rating <ArrowRight className="w-5 h-5" />
            </button>
        </div>
      </div>
    );
  }

  // ── RENDER FORM ───────────────────────────────────────────────────────────
  return (
    <div className="flex-1 max-w-2xl border-x border-border min-h-screen bg-[#050505] pb-24">
      <header className="p-4 flex items-center gap-3 border-b border-[#1C1C1E] sticky top-0 bg-[#050505]/80 backdrop-blur-md z-10">
        <button onClick={() => navigate(-1)} className="p-2 hover:bg-white/5 rounded-full"><ChevronLeft className="w-5 h-5 text-white" /></button>
        <h2 className="font-bold text-white">Help & Support</h2>
      </header>

      <div className="p-6 space-y-6">
        <div className="grid grid-cols-3 gap-2">
          {(Object.keys(CATEGORY_CONFIG) as Category[]).map(cat => {
            const Icon = CATEGORY_CONFIG[cat].icon;
            const active = category === cat;
            return (
              <button key={cat} onClick={() => setCategory(cat)} 
                className={`p-4 rounded-2xl border transition-all flex flex-col items-center gap-2 ${active ? 'bg-[#FF3B30]/10 border-[#FF3B30]' : 'bg-[#0D0D0D] border-[#1C1C1E]'}`}>
                <Icon className={active ? 'text-[#FF3B30]' : 'text-white/20'} />
                <span className={`text-[10px] font-bold uppercase ${active ? 'text-white' : 'text-white/20'}`}>{CATEGORY_CONFIG[cat].label}</span>
              </button>
            );
          })}
        </div>

        <div className="space-y-4">
          <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Your Name" className="w-full p-4 rounded-2xl bg-[#1C1C1E] border border-[#27272a] text-white outline-none focus:border-[#FF3B30]" />
          <input type="text" value={username} onChange={e => setUsername(e.target.value)} placeholder="Username" className="w-full p-4 rounded-2xl bg-[#1C1C1E] border border-[#27272a] text-white outline-none focus:border-[#FF3B30]" />
          <textarea value={message} onChange={e => setMessage(e.target.value)} placeholder="Describe your issue..." className="w-full p-4 rounded-2xl bg-[#1C1C1E] border border-[#27272a] text-white outline-none focus:border-[#FF3B30] h-40 resize-none" />
        </div>

        <button onClick={() => setStep('quality')} disabled={!canProceedForm} 
            className="w-full py-4 rounded-2xl font-bold bg-[#FF3B30] text-white disabled:opacity-20 flex items-center justify-center gap-2">
          Analyze Message <Sparkles className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};
