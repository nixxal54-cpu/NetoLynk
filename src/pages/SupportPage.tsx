import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronLeft, Send, Loader2, CheckCircle2, Bug, Lightbulb, MessageSquare, Star, Sparkles, AlertTriangle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { usePageTitle } from '../hooks/usePageTitle';

// ─── EmailJS config ────────────────────────────────────────────────────────
// 1. Sign up at https://emailjs.com (free — 200 emails/mo)
// 2. Create a service (Gmail), add template with variables:
//    {{from_name}}, {{username}}, {{message}}, {{category}}, {{quality_score}}, {{quality_label}}
// 3. Set your recipient email INSIDE the EmailJS template (never here)
// 4. Replace the three values below
const EMAILJS_SERVICE_ID  = 'YOUR_SERVICE_ID';   // e.g. 'service_abc123'
const EMAILJS_TEMPLATE_ID = 'YOUR_TEMPLATE_ID';  // e.g. 'template_xyz456'
const EMAILJS_PUBLIC_KEY  = 'YOUR_PUBLIC_KEY';   // e.g. 'abc123XYZ'
// ───────────────────────────────────────────────────────────────────────────

type Category = 'bug' | 'feature' | 'general';

interface QualityDimension {
  label: string;
  score: number; // 0–100
  color: string;
}

const CATEGORY_CONFIG: Record<Category, { icon: React.FC<{ className?: string }>, label: string, color: string, hint: string }> = {
  bug:     { icon: Bug,           label: 'Bug Report',       color: '#FF3B30', hint: 'Describe what broke and how to reproduce it' },
  feature: { icon: Lightbulb,     label: 'Feature Request',  color: '#FF9F0A', hint: 'Tell us what you wish NetoLynk could do' },
  general: { icon: MessageSquare, label: 'General Feedback', color: '#30D158', hint: 'Share any thoughts, questions, or ideas' },
};

// ── Generative quality analyser ─────────────────────────────────────────────
// Runs entirely client-side. No API calls. Analyses text in real-time.
function analyseMessageQuality(text: string, category: Category): QualityDimension[] {
  if (text.trim().length < 5) return [];

  const words       = text.trim().split(/\s+/).filter(Boolean);
  const charCount   = text.trim().length;
  const sentences   = text.split(/[.!?]+/).filter(s => s.trim().length > 2);
  const hasNumbers  = /\d/.test(text);
  const hasSteps    = /step|first|then|after|finally|because|when|if|but/i.test(text);
  const hasQuestion = /\?/.test(text);
  const exclamations = (text.match(/!/g) || []).length;
  const capRatio    = (text.match(/[A-Z]/g) || []).length / Math.max(charCount, 1);
  const uniqueWords = new Set(words.map(w => w.toLowerCase())).size;
  const vocabRichness = uniqueWords / Math.max(words.length, 1);

  // ── Clarity: length, structure, sentences ──
  const clarityRaw =
    Math.min(charCount / 2, 50) +       // up to 50 pts for length (caps at 100 chars)
    sentences.length * 6 +              // multi-sentence = structured
    (hasSteps ? 18 : 0) -               // has flow words
    Math.max(exclamations - 1, 0) * 8 - // penalise shouting
    Math.min(capRatio * 80, 20);        // penalise ALL CAPS
  const clarity = Math.min(Math.max(Math.round(clarityRaw), 0), 100);

  // ── Detail: word count, specifics, numbers ──
  const detailRaw =
    Math.min(words.length * 2.5, 60) +  // up to 60 pts for word count
    (hasNumbers ? 20 : 0) +             // numbers = specific
    (vocabRichness * 20);               // varied vocabulary
  const detail = Math.min(Math.max(Math.round(detailRaw), 0), 100);

  // ── Relevance: category-specific keywords ──
  const bugKw     = /error|crash|broken|fail|bug|issue|glitch|stuck|can't|cannot|doesn't|not working/i;
  const featureKw = /add|want|wish|could|should|would|feature|improve|better|allow|support|enable/i;
  const genKw     = /love|great|awesome|thanks|feedback|suggestion|question|help|like|enjoy/i;
  const kwMatch   =
    category === 'bug'     ? bugKw.test(text) :
    category === 'feature' ? featureKw.test(text) : genKw.test(text);
  const hasQ      = category === 'general' && hasQuestion;
  const relevanceRaw = (kwMatch ? 55 : 15) + (hasQ ? 20 : 0) + Math.min(words.length * 1.5, 25);
  const relevance = Math.min(Math.max(Math.round(relevanceRaw), 0), 100);

  // ── Tone: measured writing, not emotional outburst ──
  const toneRaw =
    70 -
    exclamations * 10 -
    Math.min(capRatio * 100, 30) +
    (sentences.length > 1 ? 15 : 0) +
    (vocabRichness > 0.7 ? 15 : 0);
  const tone = Math.min(Math.max(Math.round(toneRaw), 0), 100);

  return [
    { label: 'Clarity',   score: clarity,   color: '#0A84FF' },
    { label: 'Detail',    score: detail,     color: '#30D158' },
    { label: 'Relevance', score: relevance,  color: '#FF9F0A' },
    { label: 'Tone',      score: tone,       color: '#BF5AF2' },
  ];
}

function overallScore(dims: QualityDimension[]): number {
  if (!dims.length) return 0;
  return Math.round(dims.reduce((a, d) => a + d.score, 0) / dims.length);
}

function qualityLabel(score: number): { text: string; color: string } {
  if (score >= 85) return { text: 'Excellent',  color: '#30D158' };
  if (score >= 65) return { text: 'Good',       color: '#0A84FF' };
  if (score >= 45) return { text: 'Fair',       color: '#FF9F0A' };
  if (score >= 20) return { text: 'Needs work', color: '#FF6B00' };
  return               { text: 'Too short',  color: '#8E8E93' };
}

// ── Radial arc SVG for overall score ────────────────────────────────────────
const RadialScore: React.FC<{ score: number; color: string }> = ({ score, color }) => {
  const r   = 36;
  const c   = 2 * Math.PI * r;
  const pct = score / 100;
  return (
    <svg width="96" height="96" viewBox="0 0 96 96">
      <circle cx="48" cy="48" r={r} fill="none" stroke="#27272a" strokeWidth="8" />
      <circle
        cx="48" cy="48" r={r} fill="none"
        stroke={color} strokeWidth="8"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - pct)}
        strokeLinecap="round"
        transform="rotate(-90 48 48)"
        style={{ transition: 'stroke-dashoffset 0.6s cubic-bezier(0.34,1.56,0.64,1)' }}
      />
      <text x="48" y="52" textAnchor="middle" fontSize="18" fontWeight="800" fill="white">{score}</text>
    </svg>
  );
};

// ── Horizontal bar for a single dimension ───────────────────────────────────
const DimBar: React.FC<{ dim: QualityDimension; delay: number }> = ({ dim, delay }) => (
  <div>
    <div className="flex justify-between items-center mb-1">
      <span className="text-xs font-medium text-white/60">{dim.label}</span>
      <span className="text-xs font-bold" style={{ color: dim.color }}>{dim.score}</span>
    </div>
    <div className="h-1.5 w-full rounded-full bg-[#27272a] overflow-hidden">
      <motion.div
        className="h-full rounded-full"
        style={{ backgroundColor: dim.color }}
        initial={{ width: 0 }}
        animate={{ width: `${dim.score}%` }}
        transition={{ duration: 0.7, delay, ease: [0.34, 1.56, 0.64, 1] }}
      />
    </div>
  </div>
);

// ── Tip based on weakest dimension ──────────────────────────────────────────
function getTip(dims: QualityDimension[], category: Category): string {
  if (!dims.length) return '';
  const weakest = [...dims].sort((a, b) => a.score - b.score)[0];
  if (weakest.score >= 70) return '✨ Looking great — your message is clear and helpful!';
  switch (weakest.label) {
    case 'Clarity':
      return '💡 Try breaking your message into sentences. More structure = easier to act on.';
    case 'Detail':
      return category === 'bug'
        ? '🔍 Add more detail — what exactly did you do before it broke?'
        : '📝 More words help us understand exactly what you mean.';
    case 'Relevance':
      return category === 'bug'
        ? '🐛 Mention keywords like "error", "crash", or "not working" to flag this as a bug.'
        : '🎯 Use words that match your intent — like "feature", "add", or "improve".';
    case 'Tone':
      return '😌 A calmer tone helps us respond faster. No need for caps or multiple exclamation marks!';
    default:
      return '';
  }
}

// ── Main page ────────────────────────────────────────────────────────────────
export const SupportPage: React.FC = () => {
  usePageTitle('Help & Support');
  const navigate  = useNavigate();
  const { user }  = useAuth();

  const [category, setCategory] = useState<Category>('bug');
  const [name,     setName]     = useState(user?.displayName || '');
  const [username, setUsername] = useState(user?.username    || '');
  const [message,  setMessage]  = useState('');
  const [sending,  setSending]  = useState(false);
  const [sent,     setSent]     = useState(false);
  const [error,    setError]    = useState('');

  // Quality analysis — debounced 250 ms
  const [dims, setDims]   = useState<QualityDimension[]>([]);
  const debounce          = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => {
      setDims(analyseMessageQuality(message, category));
    }, 250);
    return () => { if (debounce.current) clearTimeout(debounce.current); };
  }, [message, category]);

  const score = overallScore(dims);
  const ql    = qualityLabel(score);
  const tip   = getTip(dims, category);

  const canSend = name.trim().length >= 2
    && username.trim().length >= 3
    && message.trim().length >= 10
    && !sending;

  const handleSend = async () => {
    if (!canSend) return;
    setSending(true);
    setError('');
    try {
      // Dynamically load EmailJS so the SDK is not in the main bundle
      const emailjs = await import('https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/es/emailjs.js' as any);
      await emailjs.send(
        EMAILJS_SERVICE_ID,
        EMAILJS_TEMPLATE_ID,
        {
          from_name:     name.trim(),
          username:      username.trim().startsWith('@') ? username.trim() : `@${username.trim()}`,
          category:      CATEGORY_CONFIG[category].label,
          message:       message.trim(),
          quality_score: score.toString(),
          quality_label: ql.text,
        },
        EMAILJS_PUBLIC_KEY,
      );
      setSent(true);
    } catch (err) {
      console.error('EmailJS error:', err);
      setError('Failed to send. Please try again in a moment.');
    } finally {
      setSending(false);
    }
  };

  // ── Success screen ──────────────────────────────────────────────────────
  if (sent) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex-1 max-w-2xl border-x border-border min-h-screen bg-[#050505] flex flex-col items-center justify-center px-8 text-center"
      >
        <motion.div
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 200, damping: 14 }}
          className="w-20 h-20 rounded-full bg-[#30D158]/15 flex items-center justify-center mb-6"
        >
          <CheckCircle2 className="w-10 h-10 text-[#30D158]" />
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <h2 className="text-2xl font-black text-white mb-2">Message Sent!</h2>
          <p className="text-white/40 text-sm leading-relaxed max-w-xs mx-auto">
            Thanks for reaching out, <span className="text-white font-semibold">{name}</span>. We'll review your message and get back to you soon.
          </p>
          <div className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-[#1C1C1E] rounded-xl border border-[#27272a]">
            <Sparkles className="w-3.5 h-3.5 text-[#FF9F0A]" />
            <span className="text-xs text-white/50">Message quality: </span>
            <span className="text-xs font-bold" style={{ color: ql.color }}>{ql.text} ({score}/100)</span>
          </div>
        </motion.div>
        <motion.button
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}
          onClick={() => navigate(-1)}
          className="mt-10 px-8 py-3 bg-[#FF3B30] hover:bg-[#e63429] text-white rounded-xl font-bold transition-colors"
        >
          Back to Settings
        </motion.button>
      </motion.div>
    );
  }

  // ── Main form ───────────────────────────────────────────────────────────
  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      className="flex-1 max-w-2xl border-x border-border min-h-screen bg-[#050505] pb-24 overflow-y-auto"
    >
      {/* Header */}
      <header className="sticky top-0 z-40 bg-[#050505]/90 backdrop-blur-md border-b border-[#1C1C1E] p-4 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-2 hover:bg-white/8 rounded-full transition-colors">
          <ChevronLeft className="w-5 h-5 text-white" />
        </button>
        <div>
          <h2 className="text-base font-bold text-white leading-tight">Help & Support</h2>
          <p className="text-xs text-white/35">We read every message</p>
        </div>
      </header>

      <div className="flex gap-0">
        {/* ── Left: form ── */}
        <div className="flex-1 min-w-0 p-5 space-y-5">

          {/* Category selector */}
          <div>
            <p className="text-xs font-semibold text-white/35 uppercase tracking-widest mb-3">What kind of message?</p>
            <div className="grid grid-cols-3 gap-2">
              {(Object.entries(CATEGORY_CONFIG) as [Category, typeof CATEGORY_CONFIG[Category]][]).map(([key, cfg]) => {
                const Icon = cfg.icon;
                const active = category === key;
                return (
                  <button
                    key={key}
                    onClick={() => setCategory(key)}
                    className="flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl border transition-all"
                    style={{
                      borderColor: active ? cfg.color : '#27272a',
                      backgroundColor: active ? `${cfg.color}15` : '#0D0D0D',
                    }}
                  >
                    <Icon className="w-4 h-4" style={{ color: active ? cfg.color : '#555' }} />
                    <span className="text-[11px] font-semibold leading-tight text-center"
                      style={{ color: active ? cfg.color : '#555' }}>
                      {cfg.label}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-white/25 mt-2 ml-0.5">{CATEGORY_CONFIG[category].hint}</p>
          </div>

          {/* Name */}
          <div>
            <label className="block text-xs font-semibold text-white/35 uppercase tracking-widest mb-2">Your Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Full name"
              className="w-full px-4 py-3 rounded-xl bg-[#1C1C1E] border border-[#27272a] focus:border-[#FF3B30] outline-none text-white placeholder:text-white/25 text-sm transition-colors"
            />
          </div>

          {/* Username */}
          <div>
            <label className="block text-xs font-semibold text-white/35 uppercase tracking-widest mb-2">Username</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30 text-sm">@</span>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value.replace(/^@/, '').replace(/\s/g, '').toLowerCase())}
                placeholder="yourhandle"
                className="w-full pl-8 pr-4 py-3 rounded-xl bg-[#1C1C1E] border border-[#27272a] focus:border-[#FF3B30] outline-none text-white placeholder:text-white/25 text-sm transition-colors"
              />
            </div>
          </div>

          {/* Message */}
          <div>
            <label className="block text-xs font-semibold text-white/35 uppercase tracking-widest mb-2">Message</label>
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder={CATEGORY_CONFIG[category].hint}
              rows={6}
              className="w-full px-4 py-3 rounded-xl bg-[#1C1C1E] border border-[#27272a] focus:border-[#FF3B30] outline-none text-white placeholder:text-white/25 text-sm transition-colors resize-none leading-relaxed"
            />
            <div className="flex justify-between items-center mt-1 px-0.5">
              <span className="text-xs text-white/20">{message.length} chars</span>
              {message.length > 0 && message.length < 10 && (
                <span className="text-xs text-[#FF3B30]">Minimum 10 characters</span>
              )}
            </div>
          </div>

          {/* Error */}
          {error && (
            <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-2 p-3 bg-[#FF3B30]/10 border border-[#FF3B30]/30 rounded-xl">
              <AlertTriangle className="w-4 h-4 text-[#FF3B30] shrink-0" />
              <p className="text-xs text-[#FF3B30]">{error}</p>
            </motion.div>
          )}

          {/* Send */}
          <button
            onClick={handleSend}
            disabled={!canSend}
            className="w-full py-4 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all"
            style={{
              backgroundColor: canSend ? '#FF3B30' : '#1C1C1E',
              color: canSend ? 'white' : '#555',
              cursor: canSend ? 'pointer' : 'not-allowed',
            }}
          >
            {sending
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</>
              : <><Send className="w-4 h-4" /> Send Message</>}
          </button>

          <p className="text-center text-xs text-white/15 mt-1">
            Messages go directly to the NetoLynk team
          </p>
        </div>

        {/* ── Right: quality sidebar ── */}
        <div className="w-[148px] shrink-0 border-l border-[#1C1C1E] p-4 sticky top-[73px] h-fit">
          <div className="flex items-center gap-1.5 mb-4">
            <Sparkles className="w-3.5 h-3.5 text-[#FF9F0A]" />
            <span className="text-[11px] font-bold text-white/40 uppercase tracking-wider">Quality</span>
          </div>

          <AnimatePresence mode="wait">
            {dims.length === 0 ? (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center justify-center py-6 text-center"
              >
                <div className="w-10 h-10 rounded-full bg-[#1C1C1E] flex items-center justify-center mb-3">
                  <Star className="w-5 h-5 text-white/15" />
                </div>
                <p className="text-[11px] text-white/20 leading-relaxed">Start typing to see quality analysis</p>
              </motion.div>
            ) : (
              <motion.div
                key="scores"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="space-y-4"
              >
                {/* Radial overall */}
                <div className="flex flex-col items-center">
                  <RadialScore score={score} color={ql.color} />
                  <span className="text-xs font-black mt-1" style={{ color: ql.color }}>{ql.text}</span>
                </div>

                {/* Dimension bars */}
                <div className="space-y-2.5">
                  {dims.map((d, i) => (
                    <DimBar key={d.label} dim={d} delay={i * 0.07} />
                  ))}
                </div>

                {/* Tip */}
                {tip && (
                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.35 }}
                    className="mt-3 p-2.5 bg-[#1C1C1E] rounded-xl border border-[#27272a]"
                  >
                    <p className="text-[10px] text-white/50 leading-relaxed">{tip}</p>
                  </motion.div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
};
