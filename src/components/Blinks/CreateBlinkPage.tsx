/**
 * CreateBlinkPage.tsx
 * Full-screen Blink creator: pick image/video, add text overlay, preview, publish.
 */
import React, { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Image as ImageIcon, Video, Type, Send, Loader2, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { useBlinkUpload } from '../../hooks/useBlinkUpload';
import { usePageTitle } from '../../hooks/usePageTitle';
import { cn } from '../../lib/utils';

const TEXT_COLORS = ['#ffffff', '#000000', '#FF3B30', '#FFD60A', '#30D158', '#0A84FF', '#FF9F0A', '#BF5AF2'];

export default function CreateBlinkPage() {
  usePageTitle('Add Blink');
  const navigate = useNavigate();
  const { state, selectFile, setTextOverlay, setTextOverlayColor, setCaption, publish, reset } = useBlinkUpload();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showTextInput, setShowTextInput] = useState(false);
  const [draft, setDraft] = useState('');

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) selectFile(file);
    e.target.value = '';
  };

  const handlePublish = async () => {
    const ok = await publish();
    if (ok) {
      toast.success('Blink added! It disappears in 24 hours.');
      reset();
      navigate('/');
    } else {
      toast.error(state.error ?? 'Failed to publish. Try again.');
    }
  };

  const handleApplyText = () => {
    setTextOverlay(draft);
    setShowTextInput(false);
  };

  return (
    <div className="flex-1 max-w-2xl border-x border-border min-h-screen pb-20 md:pb-0">
      {/* ── Header ── */}
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-md border-b border-border flex items-center gap-3 px-4 py-3 h-14">
        <button onClick={() => { reset(); navigate(-1); }} className="p-1 -ml-1 rounded-full hover:bg-accent">
          <ChevronLeft className="w-6 h-6" />
        </button>
        <h1 className="font-bold text-lg flex-1">Add Blink</h1>
        {state.previewUrl && !state.uploading && (
          <button
            onClick={handlePublish}
            className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-full font-bold text-sm hover:opacity-90 transition-opacity"
          >
            <Send className="w-4 h-4" />
            Share
          </button>
        )}
      </header>

      <div className="p-4 space-y-5">

        {/* ── No file selected ── */}
        {!state.previewUrl && (
          <div className="space-y-4">
            <p className="text-muted-foreground text-sm">
              Share a photo or video that disappears in <span className="font-bold text-foreground">24 hours</span>.
            </p>
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => { fileInputRef.current!.accept = 'image/*'; fileInputRef.current!.click(); }}
                className="flex flex-col items-center justify-center gap-3 p-8 rounded-2xl border-2 border-dashed border-border hover:border-primary hover:bg-primary/5 transition-all group"
              >
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                  <ImageIcon className="w-6 h-6 text-primary" />
                </div>
                <span className="font-semibold text-sm">Photo</span>
                <span className="text-xs text-muted-foreground">JPG, PNG up to 10MB</span>
              </button>

              <button
                onClick={() => { fileInputRef.current!.accept = 'video/*'; fileInputRef.current!.click(); }}
                className="flex flex-col items-center justify-center gap-3 p-8 rounded-2xl border-2 border-dashed border-border hover:border-primary hover:bg-primary/5 transition-all group"
              >
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                  <Video className="w-6 h-6 text-primary" />
                </div>
                <span className="font-semibold text-sm">Video</span>
                <span className="text-xs text-muted-foreground">MP4 up to 50MB</span>
              </button>
            </div>
            <input ref={fileInputRef} type="file" className="hidden" onChange={handleFile} />
            {state.error && <p className="text-destructive text-sm">{state.error}</p>}
          </div>
        )}

        {/* ── Preview ── */}
        {state.previewUrl && (
          <div className="space-y-4">
            {/* Media preview */}
            <div className="relative rounded-2xl overflow-hidden bg-black aspect-[9/16] max-h-[60vh]">
              {state.type === 'image' ? (
                <img src={state.previewUrl} alt="preview" className="w-full h-full object-cover" />
              ) : (
                <video src={state.previewUrl} className="w-full h-full object-cover" controls muted />
              )}

              {/* Text overlay preview */}
              {state.textOverlay && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none px-6">
                  <p
                    className="text-center font-bold text-2xl drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)] leading-tight"
                    style={{ color: state.textOverlayColor }}
                  >
                    {state.textOverlay}
                  </p>
                </div>
              )}

              {/* Remove button */}
              <button
                onClick={() => { reset(); }}
                className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/60 flex items-center justify-center text-white hover:bg-black/80 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>

              {/* Upload progress overlay */}
              {state.uploading && (
                <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-3">
                  <Loader2 className="w-10 h-10 text-white animate-spin" />
                  <div className="w-40 h-1.5 bg-white/20 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all duration-300"
                      style={{ width: `${state.progress}%` }}
                    />
                  </div>
                  <p className="text-white text-sm font-medium">{state.progress}%</p>
                </div>
              )}
            </div>

            {/* ── Tools ── */}
            <div className="flex gap-3">
              <button
                onClick={() => setShowTextInput(v => !v)}
                className={cn(
                  'flex items-center gap-2 px-4 py-2.5 rounded-full border text-sm font-semibold transition-all',
                  showTextInput
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'border-border hover:bg-accent'
                )}
              >
                <Type className="w-4 h-4" />
                Text
              </button>
            </div>

            {/* Text overlay input */}
            <AnimatePresence>
              {showTextInput && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden space-y-3"
                >
                  <input
                    autoFocus
                    type="text"
                    value={draft}
                    onChange={e => setDraft(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleApplyText()}
                    placeholder="Add text overlay..."
                    maxLength={80}
                    className="w-full bg-accent border border-border rounded-xl px-4 py-3 text-sm outline-none focus:border-primary transition-colors"
                  />
                  {/* Color picker */}
                  <div className="flex gap-2 flex-wrap">
                    {TEXT_COLORS.map(color => (
                      <button
                        key={color}
                        onClick={() => setTextOverlayColor(color)}
                        className={cn(
                          'w-8 h-8 rounded-full border-2 transition-transform hover:scale-110',
                          state.textOverlayColor === color ? 'border-foreground scale-110' : 'border-transparent'
                        )}
                        style={{ backgroundColor: color, boxShadow: color === '#ffffff' ? 'inset 0 0 0 1px #d1d5db' : undefined }}
                      />
                    ))}
                  </div>
                  <button
                    onClick={handleApplyText}
                    className="w-full py-2.5 bg-foreground text-background rounded-xl font-semibold text-sm hover:opacity-90 transition-opacity"
                  >
                    Apply Text
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Caption */}
            <div>
              <textarea
                value={state.caption}
                onChange={e => setCaption(e.target.value)}
                placeholder="Add a caption..."
                maxLength={200}
                rows={2}
                className="w-full bg-accent border border-border rounded-xl px-4 py-3 text-sm outline-none focus:border-primary transition-colors resize-none"
              />
            </div>

            {/* Publish button (bottom) */}
            <button
              onClick={handlePublish}
              disabled={state.uploading}
              className="w-full py-3.5 bg-primary text-primary-foreground rounded-full font-bold text-base hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-primary/20"
            >
              {state.uploading ? (
                <><Loader2 className="w-5 h-5 animate-spin" /> Uploading...</>
              ) : (
                <><Send className="w-5 h-5" /> Add Blink</>
              )}
            </button>

            {state.error && <p className="text-destructive text-sm text-center">{state.error}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
