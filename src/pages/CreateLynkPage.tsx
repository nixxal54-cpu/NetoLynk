// src/pages/CreateLynkPage.tsx
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { httpsCallable } from 'firebase/functions';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db, functions } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { LynkCategory } from '../types/lynk';
import axios from 'axios';

// ─── Types ────────────────────────────────────────────────────────────────────

type Visibility = 'public' | 'unlisted';

type Step = 'pick' | 'details' | 'uploading' | 'done';

const CATEGORIES: { value: LynkCategory; label: string; emoji: string }[] = [
  { value: 'gaming',    label: 'Gaming',    emoji: '🎮' },
  { value: 'funny',     label: 'Funny',     emoji: '😂' },
  { value: 'edits',     label: 'Edits',     emoji: '✂️' },
  { value: 'relatable', label: 'Relatable', emoji: '🤝' },
  { value: 'music',     label: 'Music',     emoji: '🎵' },
  { value: 'trending',  label: 'Trending',  emoji: '🔥' },
];

const MAX_CAPTION = 150;
const MAX_FILE_MB = 100;
const MIN_DURATION = 5;
const MAX_DURATION = 60;

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function generateThumbnail(file: File, seekTo = 0.5): Promise<string> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.src = URL.createObjectURL(file);
    video.muted = true;
    video.playsInline = true;
    video.onloadeddata = () => { video.currentTime = seekTo; };
    video.onseeked = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 540;
      canvas.height = 960;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(video, 0, 0, 540, 960);
      URL.revokeObjectURL(video.src);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    video.onerror = () => reject(new Error('Could not read video'));
  });
}

async function validateVideo(file: File): Promise<{ duration: number }> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.src = URL.createObjectURL(file);
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(video.src);
      const { duration } = video;
      if (!file.type.startsWith('video/')) return reject(new Error('File must be a video'));
      if (duration < MIN_DURATION) return reject(new Error(`Lynk must be at least ${MIN_DURATION}s`));
      if (duration > MAX_DURATION) return reject(new Error(`Lynk can be at most ${MAX_DURATION}s`));
      resolve({ duration });
    };
    video.onerror = () => reject(new Error('Could not read video metadata'));
  });
}

function extractHashtags(text: string): string[] {
  return [...text.matchAll(/#(\w+)/g)].map(m => m[1].toLowerCase());
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ProgressRing({ progress, size = 64 }: { progress: number; size?: number }) {
  const r = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (progress / 100) * circ;
  return (
    <svg width={size} height={size} className="rotate-[-90deg]">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#1a1a1a" strokeWidth={6} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke="#FF3B30" strokeWidth={6}
        strokeDasharray={circ} strokeDashoffset={offset}
        strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 0.3s ease' }}
      />
    </svg>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function CreateLynkPage() {
  const { currentUser } = useAuth();

  // File
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [thumbnailDataUrl, setThumbnailDataUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);

  // Details
  const [caption, setCaption] = useState('');
  const [category, setCategory] = useState<LynkCategory>('gaming');
  const [visibility, setVisibility] = useState<Visibility>('public');
  const [allowComments, setAllowComments] = useState(true);

  // Upload
  const [step, setStep] = useState<Step>('pick');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [videoId, setVideoId] = useState<string | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const hashtags = extractHashtags(caption);

  // ── File selection ──────────────────────────────────────────────────────────

  const processFile = useCallback(async (selected: File) => {
    setFileError(null);
    if (!selected.type.startsWith('video/')) {
      setFileError('Only video files are allowed.');
      return;
    }
    if (selected.size > MAX_FILE_MB * 1024 * 1024) {
      setFileError(`Max file size is ${MAX_FILE_MB}MB.`);
      return;
    }
    try {
      const { duration } = await validateVideo(selected);
      const thumb = await generateThumbnail(selected);
      setFile(selected);
      setPreviewUrl(URL.createObjectURL(selected));
      setThumbnailDataUrl(thumb);
      setDuration(Math.round(duration));
      setStep('details');
    } catch (err: any) {
      setFileError(err.message);
    }
  }, []);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) processFile(f);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) processFile(f);
  };

  // ── Upload & Publish ────────────────────────────────────────────────────────

  const handlePost = async () => {
    if (!file || !currentUser) return;
    setPublishError(null);
    setStep('uploading');
    setUploadProgress(0);

    try {
      // 1. Get resumable YouTube upload URL
      const initYTUpload = httpsCallable(functions, 'initYouTubeUpload');
      const { data } = await initYTUpload({
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type,
      }) as { data: { uploadUrl: string; videoId: string } };

      setVideoId(data.videoId);

      // 2. Upload directly to YouTube
      await axios.put(data.uploadUrl, file, {
        headers: { 'Content-Type': file.type },
        onUploadProgress: (evt) => {
          const pct = Math.round((evt.loaded * 100) / (evt.total || file.size));
          setUploadProgress(pct);
        },
      });

      // 3. Write Lynk to Firestore
      await addDoc(collection(db, 'lynks'), {
        userId: currentUser.uid,
        username: currentUser.displayName || 'unknown',
        userProfileImage: currentUser.photoURL || null,

        videoId: data.videoId,
        thumbnail: `https://img.youtube.com/vi/${data.videoId}/hqdefault.jpg`,

        caption: caption.trim(),
        hashtags,
        category,
        visibility,
        allowComments,
        duration,

        likesCount: 0,
        commentsCount: 0,
        sharesCount: 0,
        viewsCount: 0,
        savesCount: 0,
        totalWatchSeconds: 0,
        completionRate: 0,
        reportCount: 0,
        isHidden: false,
        isTrending: false,

        boostScore: 100,
        boostExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),

        createdAt: serverTimestamp(),
      });

      setStep('done');
    } catch (err: any) {
      console.error(err);
      setPublishError(err.message || 'Something went wrong. Please try again.');
      setStep('details');
    }
  };

  const reset = () => {
    setFile(null);
    setPreviewUrl(null);
    setThumbnailDataUrl(null);
    setDuration(0);
    setCaption('');
    setCategory('gaming');
    setVisibility('public');
    setAllowComments(true);
    setStep('pick');
    setUploadProgress(0);
    setVideoId(null);
    setPublishError(null);
    setFileError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-background text-foreground pb-20">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-md border-b border-border px-4 py-3 flex items-center justify-between">
        <h1 className="text-lg font-semibold tracking-tight">Create Lynk</h1>
        {step === 'details' && (
          <button
            onClick={reset}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Discard
          </button>
        )}
      </div>

      <div className="max-w-lg mx-auto px-4 pt-6 space-y-6">

        {/* ── STEP: PICK ── */}
        {step === 'pick' && (
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`
              relative flex flex-col items-center justify-center gap-4 cursor-pointer
              border-2 border-dashed rounded-2xl p-12 transition-all duration-200
              ${dragOver
                ? 'border-primary bg-primary/5 scale-[1.01]'
                : 'border-border hover:border-primary/50 hover:bg-secondary/50'
              }
            `}
          >
            <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center">
              <svg className="w-7 h-7 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M15 10l4.553-2.069A1 1 0 0121 8.845v6.31a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </div>
            <div className="text-center">
              <p className="font-medium">Drop your video here</p>
              <p className="text-sm text-muted-foreground mt-1">or tap to browse</p>
              <p className="text-xs text-muted-foreground mt-3">
                MP4, MOV, WEBM · Max {MAX_FILE_MB}MB · {MIN_DURATION}–{MAX_DURATION}s
              </p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*"
              className="hidden"
              onChange={handleFileInput}
            />
          </div>
        )}

        {fileError && (
          <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-xl px-4 py-3">
            <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd"/>
            </svg>
            {fileError}
          </div>
        )}

        {/* ── STEP: DETAILS ── */}
        {step === 'details' && (
          <>
            {/* Preview + meta */}
            <div className="flex gap-4 items-start">
              {thumbnailDataUrl && (
                <div className="relative shrink-0 w-24 h-[170px] rounded-xl overflow-hidden bg-secondary">
                  <img src={thumbnailDataUrl} alt="thumbnail" className="w-full h-full object-cover" />
                  <div className="absolute bottom-1 right-1 bg-black/70 text-white text-[10px] px-1.5 py-0.5 rounded-md font-mono">
                    {Math.floor(duration / 60)}:{String(duration % 60).padStart(2, '0')}
                  </div>
                </div>
              )}
              <div className="flex-1 space-y-1 pt-1">
                <p className="text-sm font-medium truncate">{file?.name}</p>
                <p className="text-xs text-muted-foreground">
                  {file ? `${(file.size / 1024 / 1024).toFixed(1)} MB` : ''}
                </p>
                <button
                  onClick={reset}
                  className="text-xs text-primary mt-1 hover:underline"
                >
                  Change video
                </button>
              </div>
            </div>

            {/* Caption */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Caption</label>
              <div className="relative">
                <textarea
                  value={caption}
                  onChange={(e) => setCaption(e.target.value.slice(0, MAX_CAPTION))}
                  placeholder="Write a caption… add #hashtags to get discovered"
                  rows={3}
                  className="w-full bg-secondary rounded-xl px-4 py-3 text-sm resize-none outline-none
                    focus:ring-2 focus:ring-primary/40 placeholder:text-muted-foreground
                    transition-all"
                />
                <span className={`absolute bottom-2 right-3 text-xs ${caption.length >= MAX_CAPTION ? 'text-destructive' : 'text-muted-foreground'}`}>
                  {caption.length}/{MAX_CAPTION}
                </span>
              </div>
              {/* Hashtag pills */}
              {hashtags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {hashtags.map(tag => (
                    <span key={tag} className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                      #{tag}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Category */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Category</label>
              <div className="grid grid-cols-3 gap-2">
                {CATEGORIES.map(cat => (
                  <button
                    key={cat.value}
                    onClick={() => setCategory(cat.value)}
                    className={`
                      flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium
                      border transition-all duration-150
                      ${category === cat.value
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-secondary text-foreground border-transparent hover:border-border'
                      }
                    `}
                  >
                    <span>{cat.emoji}</span>
                    <span>{cat.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Visibility */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Visibility</label>
              <div className="flex gap-2">
                {(['public', 'unlisted'] as Visibility[]).map(v => (
                  <button
                    key={v}
                    onClick={() => setVisibility(v)}
                    className={`
                      flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium
                      border transition-all duration-150
                      ${visibility === v
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-secondary text-foreground border-transparent hover:border-border'
                      }
                    `}
                  >
                    {v === 'public' ? (
                      <>
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064" />
                        </svg>
                        Public
                      </>
                    ) : (
                      <>
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                        </svg>
                        Unlisted
                      </>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Allow comments toggle */}
            <div className="flex items-center justify-between py-1">
              <div>
                <p className="text-sm font-medium">Allow Comments</p>
                <p className="text-xs text-muted-foreground">Let others comment on your Lynk</p>
              </div>
              <button
                onClick={() => setAllowComments(v => !v)}
                className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${allowComments ? 'bg-primary' : 'bg-secondary'}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${allowComments ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
            </div>

            {/* Error */}
            {publishError && (
              <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-xl px-4 py-3">
                <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd"/>
                </svg>
                {publishError}
              </div>
            )}

            {/* Post button */}
            <button
              onClick={handlePost}
              className="w-full bg-primary text-primary-foreground font-semibold py-3.5 rounded-2xl
                hover:opacity-90 active:scale-[0.98] transition-all duration-150 text-sm"
            >
              Post Lynk 🚀
            </button>
          </>
        )}

        {/* ── STEP: UPLOADING ── */}
        {step === 'uploading' && (
          <div className="flex flex-col items-center justify-center gap-6 py-20">
            <div className="relative">
              <ProgressRing progress={uploadProgress} size={80} />
              <span className="absolute inset-0 flex items-center justify-center text-sm font-semibold">
                {uploadProgress}%
              </span>
            </div>
            <div className="text-center space-y-1">
              <p className="font-medium">
                {uploadProgress < 100 ? 'Uploading…' : 'Finalising…'}
              </p>
              <p className="text-sm text-muted-foreground">
                {uploadProgress < 100 ? 'Please keep this page open.' : 'Almost there!'}
              </p>
            </div>
            {thumbnailDataUrl && (
              <img
                src={thumbnailDataUrl}
                alt="preview"
                className="w-24 h-[170px] rounded-xl object-cover opacity-60"
              />
            )}
          </div>
        )}

        {/* ── STEP: DONE ── */}
        {step === 'done' && (
          <div className="flex flex-col items-center justify-center gap-6 py-20 text-center">
            <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center text-4xl">
              🚀
            </div>
            <div className="space-y-1">
              <p className="text-xl font-semibold">Lynk Posted!</p>
              <p className="text-sm text-muted-foreground">Your video is live and in the feed.</p>
            </div>
            <div className="flex gap-3 w-full">
              <button
                onClick={reset}
                className="flex-1 bg-secondary text-foreground font-medium py-3 rounded-2xl
                  hover:bg-secondary/80 transition-colors text-sm"
              >
                Create Another
              </button>
              <a
                href="/lynks"
                className="flex-1 bg-primary text-primary-foreground font-medium py-3 rounded-2xl
                  hover:opacity-90 transition-opacity text-sm flex items-center justify-center"
              >
                View Feed
              </a>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
