/**
 * CreateBlinkPage.tsx
 * FIXED:
 *  1. Stickers: uses Tenor API (same as GifPicker) — animated GIFs, 85vh sheet
 *  2. Music: uses iTunes Search API (free, no key, no CORS issues) — real previews, 85vh sheet
 *  3. Upload: explicit storage bucket URL to fix hanging uploads
 *  4. All tool panels are proper 85vh slide-up sheets with drag handle
 */
import React, {
  useRef, useState, useCallback, useEffect, useMemo,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import {
  X, Camera, Images, Type, Smile, Music2, Sparkles,
  AtSign, Pen, ChevronLeft, Send, Loader2, Check,
  RotateCcw, AlignCenter, Search, Play, Pause,
} from 'lucide-react';
import { useBlinkUpload } from '../../hooks/useBlinkUpload';
import { usePageTitle } from '../../hooks/usePageTitle';
import { cn } from '../../lib/utils';

/* ─── Constants ─────────────────────────────────────────────────────────────── */
const TEXT_COLORS = [
  '#FFFFFF','#000000','#FF3B30','#FF9F0A','#FFD60A',
  '#30D158','#32ADE6','#0A84FF','#BF5AF2','#FF375F',
  '#AC8E68','#636366',
];
const TEXT_FONTS = ['font-sans','font-serif','font-mono'];
const TEXT_FONT_LABELS = ['Modern','Classic','Mono'];
const DRAW_COLORS = ['#FFFFFF','#FF3B30','#FFD60A','#30D158','#0A84FF','#BF5AF2','#FF9F0A','#000000'];
const DRAW_SIZES = [3, 6, 12, 20];
const EFFECTS = [
  { id: 'none',   label: 'Normal', style: '' },
  { id: 'vivid',  label: 'Vivid',  style: 'saturate(1.8) contrast(1.1)' },
  { id: 'noir',   label: 'Noir',   style: 'grayscale(1) contrast(1.2)' },
  { id: 'warm',   label: 'Warm',   style: 'sepia(0.4) saturate(1.3) brightness(1.05)' },
  { id: 'cool',   label: 'Cool',   style: 'hue-rotate(30deg) saturate(1.2)' },
  { id: 'fade',   label: 'Fade',   style: 'opacity(0.85) brightness(1.1) saturate(0.8)' },
  { id: 'drama',  label: 'Drama',  style: 'contrast(1.4) saturate(1.3)' },
  { id: 'dreamy', label: 'Dreamy', style: 'brightness(1.1) saturate(1.4)' },
];

/* ─── Tenor GIF/Sticker API (same key as GifPicker.tsx) ─────────────────────── */
const TENOR_API_KEY = 'LIVDSRZULELA';
const TENOR_BASE = 'https://api.tenor.com/v1';
const STICKER_CATEGORIES = ['Trending','Reactions','Love','Funny','Sad','Wow','Yes','No','OMG','Dance'];

interface TenorGif {
  id: string; url: string; preview: string;
  title: string; width: number; height: number;
}

async function fetchTenorStickers(query: string, category: string): Promise<TenorGif[]> {
  const q = query.trim() || (category === 'Trending' ? '' : category);
  const endpoint = q
    ? `${TENOR_BASE}/search?q=${encodeURIComponent(q)}&key=${TENOR_API_KEY}&limit=30&media_filter=minimal`
    : `${TENOR_BASE}/trending?key=${TENOR_API_KEY}&limit=30&media_filter=minimal`;
  const res = await fetch(endpoint);
  if (!res.ok) throw new Error('Tenor failed');
  const data = await res.json();
  return (data.results || []).map((item: any) => {
    const media = item.media?.[0] || {};
    const gif = media.gif || media.mediumgif || {};
    const tiny = media.tinygif || media.nanogif || gif;
    return {
      id: item.id,
      url: gif.url || '',
      preview: tiny.url || gif.url || '',
      title: item.title || '',
      width: gif.dims?.[0] || 200,
      height: gif.dims?.[1] || 200,
    };
  }).filter((g: TenorGif) => g.url);
}

/* ─── iTunes Search API (free, no key, CORS-safe) ───────────────────────────── */
interface ItunesTrack {
  trackId: number;
  trackName: string;
  artistName: string;
  previewUrl: string;   // 30-sec MP3 preview — always present
  artworkUrl100: string;
  collectionName: string;
}

async function searchItunes(query: string): Promise<ItunesTrack[]> {
  const q = query.trim() || 'pop hits 2024';
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(q)}&entity=song&limit=20&media=music`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('iTunes failed');
  const data = await res.json();
  return (data.results || []).filter((t: ItunesTrack) => t.previewUrl);
}

/* ─── Types ──────────────────────────────────────────────────────────────────── */
type Step = 'pick' | 'edit' | 'share';
type ActiveTool = null | 'text' | 'stickers' | 'draw' | 'music' | 'effects' | 'mention';

interface TextLayer {
  id: string; text: string; color: string; font: string;
  bold: boolean; italic: boolean; align: 'left' | 'center' | 'right';
  x: number; y: number; fontSize: number;
}
interface StickerLayer {
  id: string; gifUrl: string; x: number; y: number;
}
interface DrawStroke {
  color: string; size: number; points: { x: number; y: number }[];
}

/* ─── Draggable ──────────────────────────────────────────────────────────────── */
function Draggable({ children, x, y, onMove }: {
  children: React.ReactNode; x: number; y: number;
  onMove: (x: number, y: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const start = useRef({ mx: 0, my: 0, ox: 0, oy: 0 });
  return (
    <div ref={ref}
      style={{ position: 'absolute', left: `${x}%`, top: `${y}%`, transform: 'translate(-50%,-50%)', touchAction: 'none', cursor: 'grab', zIndex: 8 }}
      onPointerDown={e => { dragging.current = true; start.current = { mx: e.clientX, my: e.clientY, ox: x, oy: y }; ref.current!.setPointerCapture(e.pointerId); }}
      onPointerMove={e => {
        if (!dragging.current) return;
        const rect = ref.current!.parentElement!.getBoundingClientRect();
        const dx = ((e.clientX - start.current.mx) / rect.width) * 100;
        const dy = ((e.clientY - start.current.my) / rect.height) * 100;
        onMove(Math.max(5, Math.min(95, start.current.ox + dx)), Math.max(5, Math.min(95, start.current.oy + dy)));
      }}
      onPointerUp={() => { dragging.current = false; }}>
      {children}
    </div>
  );
}

/* ─── Draw Canvas ────────────────────────────────────────────────────────────── */
function DrawCanvas({ strokes, onAddStroke, color, size }: {
  strokes: DrawStroke[]; onAddStroke: (s: DrawStroke) => void; color: string; size: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const current = useRef<{ x: number; y: number }[]>([]);

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const stroke of strokes) {
      if (stroke.points.length < 2) continue;
      ctx.beginPath(); ctx.strokeStyle = stroke.color; ctx.lineWidth = stroke.size;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
      for (let i = 1; i < stroke.points.length; i++) ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
      ctx.stroke();
    }
  }, [strokes]);

  const getPos = (e: React.PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: (e.clientX - rect.left) * (canvasRef.current!.width / rect.width), y: (e.clientY - rect.top) * (canvasRef.current!.height / rect.height) };
  };

  return (
    <canvas ref={canvasRef} width={600} height={1000}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', touchAction: 'none', zIndex: 5 }}
      onPointerDown={e => { drawing.current = true; current.current = [getPos(e)]; canvasRef.current!.setPointerCapture(e.pointerId); }}
      onPointerMove={e => {
        if (!drawing.current) return;
        const pos = getPos(e); current.current.push(pos);
        const canvas = canvasRef.current!; const ctx = canvas.getContext('2d')!;
        const pts = current.current; if (pts.length < 2) return;
        ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = size;
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.moveTo(pts[pts.length - 2].x, pts[pts.length - 2].y);
        ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y); ctx.stroke();
      }}
      onPointerUp={() => {
        if (!drawing.current) return;
        drawing.current = false;
        if (current.current.length > 1) onAddStroke({ color, size, points: [...current.current] });
        current.current = [];
      }} />
  );
}

function StaticCanvas({ strokes }: { strokes: DrawStroke[] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current; if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const stroke of strokes) {
      if (stroke.points.length < 2) continue;
      ctx.beginPath(); ctx.strokeStyle = stroke.color; ctx.lineWidth = stroke.size;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
      for (let i = 1; i < stroke.points.length; i++) ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
      ctx.stroke();
    }
  }, [strokes]);
  return <canvas ref={ref} width={600} height={1000} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 5 }} />;
}

/* ─── 85vh Sheet wrapper (matches GifPicker pattern) ───────────────────────── */
function Sheet({ title, badge, onClose, children }: {
  title: string; badge?: string; onClose: () => void; children: React.ReactNode;
}) {
  return (
    <>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/60 z-[60]" onClick={onClose} />
      <motion.div
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        className="fixed bottom-0 left-0 right-0 z-[70] bg-[#111] rounded-t-3xl border-t border-white/10 flex flex-col"
        style={{ height: '85vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 bg-white/20 rounded-full" />
        </div>
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-1 pb-3 flex-shrink-0">
          <h3 className="font-bold text-white text-lg">{title}</h3>
          <div className="flex items-center gap-2">
            {badge && <span className="text-[10px] text-white/30">{badge}</span>}
            <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
              <X className="w-5 h-5 text-white" />
            </button>
          </div>
        </div>
        {children}
      </motion.div>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════════════════════════════════════════ */
export default function CreateBlinkPage() {
  usePageTitle('New Blink');
  const navigate = useNavigate();
  const { state, selectFile, setTextOverlay, setTextOverlayColor, setCaption, setMusic, publish, reset } = useBlinkUpload();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>('pick');
  const [activeTool, setActiveTool] = useState<ActiveTool>(null);

  // Text
  const [textLayers, setTextLayers] = useState<TextLayer[]>([]);
  const [editingText, setEditingText] = useState<TextLayer | null>(null);
  const [textDraft, setTextDraft] = useState('');
  const [textColor, setTextColor] = useState('#FFFFFF');
  const [textFont, setTextFont] = useState(0);
  const [textBold, setTextBold] = useState(false);
  const [textItalic, setTextItalic] = useState(false);
  const [textAlign, setTextAlign] = useState<'left'|'center'|'right'>('center');
  const [textSize, setTextSize] = useState(28);

  // Stickers — Tenor GIFs (same as GifPicker)
  const [stickerLayers, setStickerLayers] = useState<StickerLayer[]>([]);
  const [tenorGifs, setTenorGifs] = useState<TenorGif[]>([]);
  const [stickerQuery, setStickerQuery] = useState('');
  const [stickerCategory, setStickerCategory] = useState('Trending');
  const [stickerLoading, setStickerLoading] = useState(false);
  const [stickerError, setStickerError] = useState('');
  const stickerSearchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stickerScrollRef = useRef<HTMLDivElement>(null);

  const loadStickers = useCallback(async (query: string, category: string) => {
    setStickerLoading(true); setStickerError('');
    try {
      const data = await fetchTenorStickers(query, category);
      setTenorGifs(data);
      stickerScrollRef.current?.scrollTo({ top: 0 });
    } catch {
      setStickerError('Could not load GIFs. Check your connection.');
      setTenorGifs([]);
    } finally {
      setStickerLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTool === 'stickers') loadStickers(stickerQuery, stickerCategory);
  }, [activeTool, stickerCategory]);

  const handleStickerSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value; setStickerQuery(val);
    if (stickerSearchTimeout.current) clearTimeout(stickerSearchTimeout.current);
    stickerSearchTimeout.current = setTimeout(() => loadStickers(val, stickerCategory), 500);
  };

  const handleStickerCategory = (cat: string) => {
    setStickerCategory(cat); setStickerQuery('');
  };

  // Draw
  const [drawStrokes, setDrawStrokes] = useState<DrawStroke[]>([]);
  const [drawColor, setDrawColor] = useState('#FFFFFF');
  const [drawSize, setDrawSize] = useState(6);

  // Effects
  const [activeEffect, setActiveEffect] = useState('none');
  const filterStyle = useMemo(() => EFFECTS.find(e => e.id === activeEffect)?.style ?? '', [activeEffect]);

  // Music — iTunes (free, CORS-safe, real 30s previews)
  const [musicTitle, setMusicTitle] = useState('');
  const [musicUrl, setMusicUrl] = useState('');
  const [musicQuery, setMusicQuery] = useState('');
  const [itunesTracks, setItunesTracks] = useState<ItunesTrack[]>([]);
  const [musicLoading, setMusicLoading] = useState(false);
  const [musicError, setMusicError] = useState('');
  const [previewingId, setPreviewingId] = useState<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const musicSearchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadMusic = useCallback(async (query: string) => {
    setMusicLoading(true); setMusicError('');
    try {
      const tracks = await searchItunes(query);
      setItunesTracks(tracks);
    } catch {
      setMusicError('Could not load music. Check your connection.');
      setItunesTracks([]);
    } finally {
      setMusicLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTool === 'music') loadMusic('');
  }, [activeTool]);

  const handleMusicSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value; setMusicQuery(val);
    if (musicSearchTimeout.current) clearTimeout(musicSearchTimeout.current);
    musicSearchTimeout.current = setTimeout(() => loadMusic(val), 600);
  };

  const previewTrack = (track: ItunesTrack) => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    if (previewingId === track.trackId) { setPreviewingId(null); return; }
    const audio = new Audio(track.previewUrl);
    audio.volume = 0.7;
    audio.play().catch(() => {});
    audioRef.current = audio;
    setPreviewingId(track.trackId);
    audio.addEventListener('ended', () => setPreviewingId(null));
  };

  const selectTrack = (track: ItunesTrack) => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    setPreviewingId(null);
    const title = `${track.trackName} – ${track.artistName}`;
    setMusicTitle(title);
    setMusicUrl(track.previewUrl);
    setMusic(track.previewUrl, title);
    setActiveTool(null);
    toast.success(`🎵 ${track.trackName} added`);
  };

  useEffect(() => () => { audioRef.current?.pause(); }, []);

  // Mention
  const [mentionDraft, setMentionDraft] = useState('');
  const [captionText, setCaptionText] = useState('');

  /* ── File handlers ── */
  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) { selectFile(file); setStep('edit'); }
    e.target.value = '';
  };

  const handleBack = () => {
    if (step === 'share') { setStep('edit'); return; }
    if (step === 'edit') {
      audioRef.current?.pause();
      reset();
      setTextLayers([]); setStickerLayers([]); setDrawStrokes([]);
      setActiveEffect('none'); setMusicTitle(''); setMusicUrl('');
      setStep('pick'); return;
    }
    reset(); navigate(-1);
  };

  const openAddText = useCallback(() => {
    const layer: TextLayer = {
      id: Date.now().toString(), text: '', color: textColor,
      font: TEXT_FONTS[textFont], bold: textBold, italic: textItalic,
      align: textAlign, x: 50, y: 50, fontSize: textSize,
    };
    setEditingText(layer); setTextDraft('');
  }, [textColor, textFont, textBold, textItalic, textAlign, textSize]);

  const commitText = useCallback(() => {
    if (!editingText) return;
    if (textDraft.trim()) {
      const layer: TextLayer = {
        ...editingText, text: textDraft.trim(), color: textColor,
        font: TEXT_FONTS[textFont], bold: textBold, italic: textItalic,
        align: textAlign, fontSize: textSize,
      };
      setTextLayers(ls => [...ls.filter(l => l.id !== layer.id), layer]);
      setTextOverlay(textDraft.trim()); setTextOverlayColor(textColor);
    }
    setEditingText(null); setActiveTool(null);
  }, [editingText, textDraft, textColor, textFont, textBold, textItalic, textAlign, textSize]);

  const addSticker = (gif: TenorGif) => {
    setStickerLayers(ls => [...ls, {
      id: Date.now().toString(), gifUrl: gif.url,
      x: 30 + Math.random() * 40, y: 30 + Math.random() * 40,
    }]);
    setActiveTool(null);
  };

  const addMention = () => {
    if (!mentionDraft.trim()) return;
    const mention = mentionDraft.startsWith('@') ? mentionDraft : `@${mentionDraft}`;
    setTextLayers(ls => [...ls, {
      id: Date.now().toString(), text: mention, color: '#FFFFFF',
      font: TEXT_FONTS[0], bold: true, italic: false, align: 'center', x: 50, y: 80, fontSize: 22,
    }]);
    setMentionDraft(''); setActiveTool(null);
  };

  const handlePublish = async () => {
    setCaption(captionText);
    const ok = await publish();
    if (ok) {
      toast.success('Blink shared! Disappears in 24h ✨');
      reset(); navigate('/');
    } else {
      toast.error(state.error ?? 'Failed to publish. Try again.');
    }
  };

  // Masonry split helper
  const splitCols = (arr: TenorGif[]) => [arr.filter((_, i) => i % 2 === 0), arr.filter((_, i) => i % 2 === 1)];

  /* ════════════════════════════════════════════════════════════════════════════
     RENDER
  ════════════════════════════════════════════════════════════════════════════ */
  return (
    <div className="fixed inset-0 z-[200] bg-black flex flex-col overflow-hidden"
      style={{ fontFamily: "'SF Pro Display', -apple-system, system-ui, sans-serif" }}>
      <input ref={fileInputRef} type="file" accept="image/*,video/*" className="hidden" onChange={handleFile} />
      <input ref={cameraInputRef} type="file" accept="image/*,video/*" capture="environment" className="hidden" onChange={handleFile} />

      <AnimatePresence mode="wait">

        {/* ══ STEP 1 — PICK ══ */}
        {step === 'pick' && (
          <motion.div key="pick" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col h-full">
            <div className="flex items-center justify-between px-5 pt-14 pb-4 flex-shrink-0">
              <button onClick={() => navigate(-1)} className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center">
                <X className="w-5 h-5 text-white" />
              </button>
              <span className="text-white font-bold text-base tracking-wide">New Blink</span>
              <div className="w-10" />
            </div>
            <div className="flex-1 mx-4 mb-6 rounded-3xl overflow-hidden relative bg-zinc-900 flex flex-col items-center justify-center gap-6">
              <div className="absolute inset-0 bg-gradient-to-br from-violet-900/30 via-transparent to-cyan-900/20 pointer-events-none" />
              <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.1, type: 'spring', stiffness: 200 }}>
                <div className="w-28 h-28 rounded-full bg-white/5 border border-white/10 flex items-center justify-center backdrop-blur-sm">
                  <Camera className="w-12 h-12 text-white/50" />
                </div>
              </motion.div>
              <motion.p initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="text-white/40 text-sm">Add a photo or video</motion.p>
              <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} className="flex gap-4">
                <button onClick={() => cameraInputRef.current!.click()}
                  className="flex flex-col items-center gap-2 px-8 py-5 rounded-2xl bg-white/10 backdrop-blur-sm border border-white/10 hover:bg-white/15 transition-all active:scale-95">
                  <Camera className="w-7 h-7 text-white" />
                  <span className="text-white text-xs font-semibold">Camera</span>
                </button>
                <button onClick={() => fileInputRef.current!.click()}
                  className="flex flex-col items-center gap-2 px-8 py-5 rounded-2xl bg-white/10 backdrop-blur-sm border border-white/10 hover:bg-white/15 transition-all active:scale-95">
                  <Images className="w-7 h-7 text-white" />
                  <span className="text-white text-xs font-semibold">Gallery</span>
                </button>
              </motion.div>
            </div>
          </motion.div>
        )}

        {/* ══ STEP 2 — EDIT ══ */}
        {step === 'edit' && state.previewUrl && (
          <motion.div key="edit" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="relative h-full w-full">

            {/* Media */}
            <div className="absolute inset-0 z-0">
              {state.type === 'image'
                ? <img src={state.previewUrl} alt="preview" className="w-full h-full object-cover" style={{ filter: filterStyle }} draggable={false} />
                : <video src={state.previewUrl} className="w-full h-full object-cover" autoPlay loop muted playsInline style={{ filter: filterStyle }} />}
              <div className="absolute inset-x-0 top-0 h-36 bg-gradient-to-b from-black/60 to-transparent pointer-events-none" />
              <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black/70 to-transparent pointer-events-none" />
            </div>

            {/* Draw canvas */}
            {activeTool === 'draw' && <DrawCanvas strokes={drawStrokes} onAddStroke={s => setDrawStrokes(p => [...p, s])} color={drawColor} size={drawSize} />}
            {activeTool !== 'draw' && drawStrokes.length > 0 && <StaticCanvas strokes={drawStrokes} />}

            {/* Text layers */}
            {textLayers.map(layer => (
              <Draggable key={layer.id} x={layer.x} y={layer.y}
                onMove={(x, y) => setTextLayers(ls => ls.map(l => l.id === layer.id ? { ...l, x, y } : l))}>
                <p onDoubleClick={() => { setEditingText(layer); setTextDraft(layer.text); setTextColor(layer.color); setActiveTool('text'); }}
                  className={cn('px-3 py-1 select-none whitespace-pre-wrap leading-tight', layer.font, layer.bold && 'font-bold', layer.italic && 'italic')}
                  style={{ color: layer.color, fontSize: layer.fontSize, textAlign: layer.align, textShadow: '0 2px 12px rgba(0,0,0,0.8)', maxWidth: '80vw' }}>
                  {layer.text}
                </p>
              </Draggable>
            ))}

            {/* Sticker layers — real animated GIFs */}
            {stickerLayers.map(s => (
              <Draggable key={s.id} x={s.x} y={s.y}
                onMove={(x, y) => setStickerLayers(ls => ls.map(l => l.id === s.id ? { ...l, x, y } : l))}>
                <img src={s.gifUrl} alt="sticker"
                  style={{ width: 80, height: 80, objectFit: 'contain', display: 'block', filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.6))' }}
                  className="select-none" />
              </Draggable>
            ))}

            {/* Music badge */}
            {musicTitle && activeTool === null && (
              <div className="absolute top-20 left-4 z-10 flex items-center gap-2 bg-black/60 backdrop-blur-md rounded-full px-3 py-1.5 border border-white/10">
                <Music2 className="w-3.5 h-3.5 text-white animate-pulse flex-shrink-0" />
                <span className="text-white text-xs font-medium truncate max-w-[140px]">{musicTitle}</span>
                <button onClick={() => { setMusicTitle(''); setMusicUrl(''); setMusic(null, null); }} className="text-white/50 ml-0.5 flex-shrink-0"><X className="w-3 h-3" /></button>
              </div>
            )}

            {/* TOP BAR */}
            <div className="absolute top-0 inset-x-0 z-10 flex items-center justify-between px-4 pt-12 pb-2">
              <button onClick={handleBack} className="w-10 h-10 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center">
                <ChevronLeft className="w-5 h-5 text-white" />
              </button>
              {drawStrokes.length > 0 && activeTool === null && (
                <button onClick={() => setDrawStrokes(s => s.slice(0, -1))} className="w-10 h-10 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center">
                  <RotateCcw className="w-4 h-4 text-white" />
                </button>
              )}
            </div>

            {/* RIGHT TOOL RAIL */}
            {activeTool === null && (
              <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
                className="absolute right-4 top-1/2 -translate-y-1/2 z-10 flex flex-col gap-2.5">
                {([
                  { tool: 'text',     icon: <Type className="w-5 h-5" />,     label: 'Text' },
                  { tool: 'stickers', icon: <Smile className="w-5 h-5" />,    label: 'GIFs' },
                  { tool: 'music',    icon: <Music2 className="w-5 h-5" />,   label: 'Music' },
                  { tool: 'effects',  icon: <Sparkles className="w-5 h-5" />, label: 'Effects' },
                  { tool: 'mention',  icon: <AtSign className="w-5 h-5" />,   label: 'Mention' },
                  { tool: 'draw',     icon: <Pen className="w-5 h-5" />,      label: 'Draw' },
                ] as const).map(({ tool, icon, label }) => (
                  <button key={tool}
                    onClick={() => { setActiveTool(tool); if (tool === 'text') openAddText(); }}
                    className="flex items-center gap-2 pl-2 pr-4 h-11 rounded-full bg-black/55 backdrop-blur-md border border-white/10 hover:bg-black/70 transition-all active:scale-95">
                    <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center text-white flex-shrink-0">{icon}</div>
                    <span className="text-white text-xs font-semibold">{label}</span>
                  </button>
                ))}
              </motion.div>
            )}

            {/* NEXT BUTTON */}
            {activeTool === null && (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="absolute bottom-10 inset-x-0 z-10 flex justify-center">
                <button onClick={() => setStep('share')}
                  className="flex items-center gap-2 px-10 py-3.5 rounded-full font-bold text-base text-black active:scale-95 transition-transform shadow-2xl"
                  style={{ background: 'linear-gradient(135deg, #fff 0%, #e0e0e0 100%)' }}>
                  Next →
                </button>
              </motion.div>
            )}

            {/* ════ TOOL PANELS ════ */}

            {/* TEXT — inline overlay (needs canvas access) */}
            <AnimatePresence>
              {activeTool === 'text' && editingText && (
                <motion.div key="text-tool" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-20 flex flex-col">
                  <div className="flex-1" onClick={commitText} />
                  <div className="absolute inset-0 flex items-center justify-center px-6 pointer-events-none">
                    <textarea autoFocus value={textDraft} onChange={e => setTextDraft(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commitText(); } }}
                      placeholder="Start typing..." maxLength={120} rows={3}
                      className={cn('bg-black/60 backdrop-blur-md text-center rounded-2xl px-4 py-3 outline-none resize-none pointer-events-auto w-full', TEXT_FONTS[textFont], textBold && 'font-bold', textItalic && 'italic')}
                      style={{ color: textColor, fontSize: textSize, textAlign, border: `2px solid ${textColor}55`, caretColor: textColor }} />
                  </div>
                  <motion.div initial={{ y: 200 }} animate={{ y: 0 }} exit={{ y: 200 }}
                    className="relative z-20 bg-black/95 backdrop-blur-xl rounded-t-3xl px-5 pt-4 pb-10 space-y-4 pointer-events-auto">
                    <div className="flex items-center gap-2 flex-wrap">
                      {TEXT_FONT_LABELS.map((label, i) => (
                        <button key={i} onClick={() => setTextFont(i)}
                          className={cn('px-3 py-1.5 rounded-full text-xs font-semibold transition-all', TEXT_FONTS[i], textFont === i ? 'bg-white text-black' : 'bg-white/10 text-white')}>
                          {label}
                        </button>
                      ))}
                      <div className="flex-1" />
                      <button onClick={() => setTextBold(v => !v)} className={cn('w-8 h-8 rounded-full flex items-center justify-center font-black text-sm', textBold ? 'bg-white text-black' : 'bg-white/10 text-white')}>B</button>
                      <button onClick={() => setTextItalic(v => !v)} className={cn('w-8 h-8 rounded-full flex items-center justify-center italic text-sm', textItalic ? 'bg-white text-black' : 'bg-white/10 text-white')}>I</button>
                      <button onClick={() => setTextAlign(a => a === 'center' ? 'left' : a === 'left' ? 'right' : 'center')} className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white">
                        <AlignCenter className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-white/40 text-xs">A</span>
                      <input type="range" min={14} max={56} value={textSize} onChange={e => setTextSize(Number(e.target.value))} className="flex-1 accent-white h-1" />
                      <span className="text-white/40 text-lg font-bold">A</span>
                    </div>
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {TEXT_COLORS.map(c => (
                        <button key={c} onClick={() => setTextColor(c)}
                          className="flex-shrink-0 w-8 h-8 rounded-full border-2 transition-all active:scale-110"
                          style={{ backgroundColor: c, borderColor: textColor === c ? '#fff' : 'transparent', transform: textColor === c ? 'scale(1.18)' : undefined }} />
                      ))}
                    </div>
                    <button onClick={commitText} className="w-full py-3 rounded-2xl bg-white text-black font-bold text-sm flex items-center justify-center gap-2">
                      <Check className="w-4 h-4" /> Done
                    </button>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* DRAW — small bottom bar (needs canvas) */}
            <AnimatePresence>
              {activeTool === 'draw' && (
                <motion.div key="draw" initial={{ y: 100, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 100, opacity: 0 }}
                  className="absolute bottom-0 inset-x-0 z-10 bg-black/85 backdrop-blur-xl rounded-t-3xl px-5 pt-4 pb-8">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-white font-bold text-sm">Draw</span>
                    <div className="flex gap-2">
                      <button onClick={() => setDrawStrokes(s => s.slice(0, -1))} className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
                        <RotateCcw className="w-3.5 h-3.5 text-white" />
                      </button>
                      <button onClick={() => setActiveTool(null)} className="w-8 h-8 rounded-full bg-white flex items-center justify-center">
                        <Check className="w-4 h-4 text-black" />
                      </button>
                    </div>
                  </div>
                  <div className="flex gap-2 mb-3">
                    {DRAW_COLORS.map(c => (
                      <button key={c} onClick={() => setDrawColor(c)}
                        className="flex-1 aspect-square rounded-full border-2 transition-all"
                        style={{ backgroundColor: c, borderColor: drawColor === c ? '#fff' : 'transparent', transform: drawColor === c ? 'scale(1.2)' : undefined }} />
                    ))}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-white/40 text-xs">Thin</span>
                    <div className="flex gap-3 flex-1 items-center justify-around">
                      {DRAW_SIZES.map(s => (
                        <button key={s} onClick={() => setDrawSize(s)}
                          className={cn('rounded-full transition-all', drawSize === s ? 'ring-2 ring-white ring-offset-1 ring-offset-black/50' : '')}
                          style={{ width: s * 2 + 8, height: s * 2 + 8, backgroundColor: drawColor }} />
                      ))}
                    </div>
                    <span className="text-white/40 text-lg font-bold">Thick</span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* STICKERS — 85vh Sheet with Tenor GIFs */}
            <AnimatePresence>
              {activeTool === 'stickers' && (
                <Sheet key="stickers" title="GIF Stickers" badge="Powered by Tenor" onClose={() => setActiveTool(null)}>
                  {/* Search */}
                  <div className="px-5 pb-3 flex-shrink-0">
                    <div className="relative">
                      <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                      <input value={stickerQuery} onChange={handleStickerSearch}
                        placeholder="Search GIFs..."
                        className="w-full bg-white/10 text-white placeholder:text-white/40 rounded-2xl pl-10 pr-4 py-3 text-sm outline-none border border-white/10 focus:border-white/30" />
                      {stickerQuery && (
                        <button onClick={() => { setStickerQuery(''); loadStickers('', stickerCategory); }} className="absolute right-3 top-1/2 -translate-y-1/2 p-1">
                          <X className="w-3.5 h-3.5 text-white/40" />
                        </button>
                      )}
                    </div>
                  </div>
                  {/* Category chips */}
                  {!stickerQuery && (
                    <div className="flex gap-2 px-5 pb-3 overflow-x-auto scrollbar-hide flex-shrink-0">
                      {STICKER_CATEGORIES.map(cat => (
                        <button key={cat} onClick={() => handleStickerCategory(cat)}
                          className={cn('flex-shrink-0 px-4 py-1.5 rounded-full text-sm font-semibold transition-all border',
                            stickerCategory === cat ? 'bg-primary text-primary-foreground border-transparent' : 'bg-white/10 text-white/60 border-white/10 hover:bg-white/15')}>
                          {cat}
                        </button>
                      ))}
                    </div>
                  )}
                  {/* GIF Grid — masonry 2 columns */}
                  <div ref={stickerScrollRef} className="flex-1 overflow-y-auto px-4 pb-8">
                    {stickerLoading ? (
                      <div className="flex items-center justify-center h-40"><Loader2 className="w-7 h-7 animate-spin text-white/40" /></div>
                    ) : stickerError ? (
                      <div className="flex flex-col items-center justify-center h-40 gap-3">
                        <p className="text-white/40 text-sm">{stickerError}</p>
                        <button onClick={() => loadStickers(stickerQuery, stickerCategory)} className="text-sm text-primary font-semibold">Retry</button>
                      </div>
                    ) : tenorGifs.length === 0 ? (
                      <div className="flex items-center justify-center h-40 text-white/40 text-sm">No GIFs found</div>
                    ) : (
                      <div className="flex gap-2">
                        {splitCols(tenorGifs).map((col, ci) => (
                          <div key={ci} className="flex-1 flex flex-col gap-2">
                            {col.map(gif => (
                              <button key={gif.id} onClick={() => addSticker(gif)}
                                className="w-full rounded-xl overflow-hidden hover:opacity-80 active:scale-95 transition-all">
                                <img src={gif.preview || gif.url} alt={gif.title}
                                  className="w-full object-cover rounded-xl" loading="lazy"
                                  style={{ aspectRatio: `${gif.width}/${gif.height}` }} />
                              </button>
                            ))}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </Sheet>
              )}
            </AnimatePresence>

            {/* MUSIC — 85vh Sheet with iTunes */}
            <AnimatePresence>
              {activeTool === 'music' && (
                <Sheet key="music" title="Add Music" badge="iTunes previews" onClose={() => { audioRef.current?.pause(); setPreviewingId(null); setActiveTool(null); }}>
                  {/* Search */}
                  <div className="px-5 pb-3 flex-shrink-0">
                    <div className="relative">
                      <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                      <input value={musicQuery} onChange={handleMusicSearch}
                        placeholder="Search songs, artists..."
                        className="w-full bg-white/10 text-white placeholder:text-white/40 rounded-2xl pl-10 pr-4 py-3 text-sm outline-none border border-white/10 focus:border-white/30" />
                      {musicQuery && (
                        <button onClick={() => { setMusicQuery(''); loadMusic(''); }} className="absolute right-3 top-1/2 -translate-y-1/2 p-1">
                          <X className="w-3.5 h-3.5 text-white/40" />
                        </button>
                      )}
                    </div>
                  </div>
                  {/* Track list */}
                  <div className="flex-1 overflow-y-auto px-4 pb-8">
                    {musicLoading ? (
                      <div className="flex items-center justify-center h-40"><Loader2 className="w-7 h-7 animate-spin text-white/40" /></div>
                    ) : musicError ? (
                      <div className="flex flex-col items-center justify-center h-40 gap-3">
                        <p className="text-white/40 text-sm">{musicError}</p>
                        <button onClick={() => loadMusic(musicQuery)} className="text-sm text-primary font-semibold">Retry</button>
                      </div>
                    ) : itunesTracks.length === 0 ? (
                      <div className="flex items-center justify-center h-40 text-white/40 text-sm">No tracks found</div>
                    ) : (
                      <div className="space-y-1">
                        {itunesTracks.map(track => {
                          const isSelected = musicUrl === track.previewUrl;
                          const isPreviewing = previewingId === track.trackId;
                          return (
                            <div key={track.trackId}
                              className={cn('flex items-center gap-3 px-3 py-3 rounded-2xl transition-colors', isSelected ? 'bg-white/10' : 'hover:bg-white/5')}>
                              {/* Art */}
                              <div className="relative flex-shrink-0">
                                <img src={track.artworkUrl100} alt={track.trackName}
                                  className="w-12 h-12 rounded-xl object-cover bg-white/10" />
                                {isSelected && (
                                  <div className="absolute inset-0 rounded-xl bg-green-500/30 flex items-center justify-center">
                                    <Check className="w-4 h-4 text-green-400" />
                                  </div>
                                )}
                              </div>
                              {/* Info */}
                              <div className="flex-1 min-w-0">
                                <p className="text-white text-sm font-medium truncate">{track.trackName}</p>
                                <p className="text-white/50 text-xs truncate">{track.artistName}</p>
                                <p className="text-white/25 text-[10px] truncate">{track.collectionName}</p>
                              </div>
                              {/* Preview */}
                              <button onClick={() => previewTrack(track)}
                                className={cn('w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 transition-colors', isPreviewing ? 'bg-primary' : 'bg-white/10 hover:bg-white/20')}>
                                {isPreviewing
                                  ? <Pause className="w-4 h-4 text-white" />
                                  : <Play className="w-4 h-4 text-white ml-0.5" />}
                              </button>
                              {/* Add */}
                              <button onClick={() => selectTrack(track)}
                                className={cn('px-3 py-1.5 rounded-full text-xs font-bold flex-shrink-0 transition-all', isSelected ? 'bg-green-500 text-white' : 'bg-white text-black hover:bg-white/90')}>
                                {isSelected ? '✓ Added' : 'Add'}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </Sheet>
              )}
            </AnimatePresence>

            {/* EFFECTS — 85vh Sheet */}
            <AnimatePresence>
              {activeTool === 'effects' && (
                <Sheet key="effects" title="Effects" onClose={() => setActiveTool(null)}>
                  <div className="flex-1 overflow-y-auto px-5 pb-8">
                    <div className="grid grid-cols-4 gap-3">
                      {EFFECTS.map(fx => (
                        <button key={fx.id} onClick={() => setActiveEffect(fx.id)} className="flex flex-col items-center gap-2">
                          <div className={cn('w-full aspect-square rounded-2xl overflow-hidden border-2 transition-all', activeEffect === fx.id ? 'border-white scale-105' : 'border-white/10')}>
                            {state.previewUrl && state.type === 'image'
                              ? <img src={state.previewUrl} alt={fx.label} className="w-full h-full object-cover" style={{ filter: fx.style }} />
                              : <div className="w-full h-full" style={{ background: 'linear-gradient(135deg,#555,#222)', filter: fx.style }} />}
                          </div>
                          <span className={cn('text-xs', activeEffect === fx.id ? 'text-white font-bold' : 'text-white/50')}>{fx.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </Sheet>
              )}
            </AnimatePresence>

            {/* MENTION — 85vh Sheet */}
            <AnimatePresence>
              {activeTool === 'mention' && (
                <Sheet key="mention" title="Mention Someone" onClose={() => setActiveTool(null)}>
                  <div className="px-5 pt-2 flex-1">
                    <div className="flex gap-3">
                      <input autoFocus type="text" value={mentionDraft} onChange={e => setMentionDraft(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && addMention()} placeholder="@username"
                        className="flex-1 bg-white/10 text-white placeholder:text-white/40 rounded-2xl px-4 py-3 text-sm outline-none border border-white/10 focus:border-white/30" />
                      <button onClick={addMention} className="px-5 py-3 rounded-2xl bg-white text-black font-bold text-sm">Add</button>
                    </div>
                    <p className="text-white/30 text-xs mt-3">The mention will appear as a draggable text layer on your Blink.</p>
                  </div>
                </Sheet>
              )}
            </AnimatePresence>

          </motion.div>
        )}

        {/* ══ STEP 3 — SHARE ══ */}
        {step === 'share' && state.previewUrl && (
          <motion.div key="share" initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex flex-col h-full">
            <div className="absolute inset-0 z-0">
              {state.type === 'image'
                ? <img src={state.previewUrl} alt="" className="w-full h-full object-cover opacity-20" style={{ filter: `${filterStyle} blur(20px)` }} />
                : <video src={state.previewUrl} className="w-full h-full object-cover opacity-20" muted playsInline style={{ filter: `${filterStyle} blur(20px)` }} />}
              <div className="absolute inset-0 bg-black/75" />
            </div>

            <div className="relative z-10 flex flex-col h-full px-5 pt-14 overflow-y-auto">
              <div className="flex items-center gap-3 mb-8 flex-shrink-0">
                <button onClick={handleBack} className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center">
                  <ChevronLeft className="w-5 h-5 text-white" />
                </button>
                <span className="text-white font-bold text-lg">Share Blink</span>
              </div>

              <div className="flex gap-4 items-center bg-white/5 border border-white/10 rounded-2xl p-4 mb-6 flex-shrink-0">
                <div className="w-16 h-24 rounded-xl overflow-hidden flex-shrink-0 bg-zinc-800">
                  {state.type === 'image'
                    ? <img src={state.previewUrl} alt="thumb" className="w-full h-full object-cover" style={{ filter: filterStyle }} />
                    : <video src={state.previewUrl} className="w-full h-full object-cover" muted playsInline style={{ filter: filterStyle }} />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-semibold text-sm mb-0.5">Your Blink</p>
                  <p className="text-white/40 text-xs mb-2">Disappears in 24 hours</p>
                  {musicTitle && (
                    <div className="flex items-center gap-1.5 mb-1">
                      <Music2 className="w-3 h-3 text-white/50 flex-shrink-0" />
                      <span className="text-white/50 text-xs truncate">{musicTitle}</span>
                    </div>
                  )}
                  <div className="flex gap-1.5 flex-wrap">
                    {textLayers.length > 0 && <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-white/50">Text</span>}
                    {stickerLayers.length > 0 && <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-white/50">GIFs</span>}
                    {drawStrokes.length > 0 && <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-white/50">Drawing</span>}
                    {activeEffect !== 'none' && <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-white/50">{EFFECTS.find(e => e.id === activeEffect)?.label}</span>}
                  </div>
                </div>
              </div>

              <div className="mb-5">
                <label className="text-white/50 text-xs font-semibold uppercase tracking-wider mb-2 block">Caption</label>
                <textarea value={captionText} onChange={e => setCaptionText(e.target.value)}
                  placeholder="Say something about your Blink..."
                  maxLength={200} rows={3}
                  className="w-full bg-white/5 border border-white/10 text-white placeholder:text-white/25 rounded-2xl px-4 py-3 text-sm outline-none focus:border-white/25 transition-colors resize-none" />
              </div>

              <div className="mb-8">
                <label className="text-white/50 text-xs font-semibold uppercase tracking-wider mb-2 block">Audience</label>
                <div className="flex gap-3">
                  {['Everyone', 'Following Only'].map((opt, i) => (
                    <button key={opt}
                      className={cn('flex-1 py-3 rounded-2xl text-sm font-medium transition-all border',
                        i === 0 ? 'bg-white/15 border-white/20 text-white' : 'bg-white/5 border-white/10 text-white/50')}>
                      {opt}
                    </button>
                  ))}
                </div>
              </div>

              <button onClick={handlePublish} disabled={state.uploading}
                className="w-full py-4 rounded-full font-bold text-base flex items-center justify-center gap-3 mb-4 transition-all active:scale-[0.98] disabled:opacity-60 text-white"
                style={{ background: state.uploading ? 'rgba(255,255,255,0.1)' : 'linear-gradient(135deg,#667eea 0%,#764ba2 100%)' }}>
                {state.uploading
                  ? <><Loader2 className="w-5 h-5 animate-spin" /> Uploading… {state.progress}%</>
                  : <><Send className="w-5 h-5" /> Share Blink</>}
              </button>

              {state.uploading && (
                <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden mb-4">
                  <motion.div className="h-full rounded-full"
                    style={{ background: 'linear-gradient(90deg,#667eea,#764ba2)', width: `${state.progress}%` }}
                    transition={{ duration: 0.3 }} />
                </div>
              )}
              {state.error && <p className="text-red-400 text-sm text-center mb-4">{state.error}</p>}
            </div>
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  );
}
