/**
 * useBlinkUpload.ts
 * Uses Cloudinary for storage — free, no Firebase Storage, no CORS issues.
 */
import { useState, useCallback, useRef } from 'react';
import { collection, addDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { BlinkUploadState } from '../types/blink';

const MAX_IMAGE_MB = 10;
const MAX_VIDEO_MB = 50;

// HARDCODED FIX: These are your exact Cloudinary details. 
// This bypasses any Vercel/Environment variable issues completely.
const CLOUD_NAME = 'dmwnywqes';
const UPLOAD_PRESET = 'blinks';

const INITIAL_STATE: BlinkUploadState = {
  file: null, previewUrl: null, type: null,
  textOverlay: '', textOverlayColor: '#ffffff',
  caption: '', progress: 0, uploading: false, error: null,
};

export function useBlinkUpload() {
  const { user } = useAuth();
  const [state, setState] = useState<BlinkUploadState>(INITIAL_STATE);
  const xhrRef = useRef<XMLHttpRequest | null>(null);

  const dataRef = useRef({
    file: null as File | null,
    type: null as 'image' | 'video' | null,
    textOverlay: '',
    textOverlayColor: '#ffffff',
    caption: '',
    previewUrl: null as string | null,
    musicUrl: null as string | null,
    musicTitle: null as string | null,
  });

  const selectFile = useCallback((file: File) => {
    const isVideo = file.type.startsWith('video/');
    const isImage = file.type.startsWith('image/');
    if (!isVideo && !isImage) {
      setState(s => ({ ...s, error: 'Only images and videos are supported.' }));
      return;
    }
    const maxMB = isVideo ? MAX_VIDEO_MB : MAX_IMAGE_MB;
    if (file.size > maxMB * 1024 * 1024) {
      setState(s => ({ ...s, error: `File too large. Max ${maxMB} MB.` }));
      return;
    }
    if (dataRef.current.previewUrl) URL.revokeObjectURL(dataRef.current.previewUrl);
    const previewUrl = URL.createObjectURL(file);
    const type = isVideo ? 'video' : 'image';
    dataRef.current = { ...dataRef.current, file, type, previewUrl };
    setState(s => ({ ...s, file, previewUrl, type, error: null }));
  },[]);

  const setTextOverlay = useCallback((text: string) => {
    dataRef.current.textOverlay = text;
    setState(s => ({ ...s, textOverlay: text }));
  },[]);

  const setTextOverlayColor = useCallback((color: string) => {
    dataRef.current.textOverlayColor = color;
    setState(s => ({ ...s, textOverlayColor: color }));
  },[]);

  const setCaption = useCallback((caption: string) => {
    dataRef.current.caption = caption;
    setState(s => ({ ...s, caption }));
  },[]);

  const setMusic = useCallback((musicUrl: string | null, musicTitle: string | null) => {
    dataRef.current.musicUrl = musicUrl;
    dataRef.current.musicTitle = musicTitle;
  },[]);

  const publish = useCallback(async (): Promise<boolean> => {
    const { file, type, textOverlay, textOverlayColor, caption, musicUrl, musicTitle } = dataRef.current;
    if (!user || !file || !type) return false;

    setState(s => ({ ...s, uploading: true, error: null, progress: 1 }));

    try {
      // ── Step 1: Upload file to Cloudinary ──────────────────────────────
      const formData = new FormData();
      formData.append('file', file);
      formData.append('upload_preset', UPLOAD_PRESET);
      
      // CRITICAL FIX: Removed `folder` and `tags` here. 
      // Cloudinary's "Unsigned" presets block uploads and throw Network Errors if you send these!

      const resourceType = type === 'video' ? 'video' : 'image';
      const uploadUrl = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/${resourceType}/upload`;

      console.log('[Blink] Uploading to:', uploadUrl);

      const mediaUrl = await new Promise<string>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhrRef.current = xhr;

        xhr.upload.addEventListener('progress', e => {
          if (e.lengthComputable) {
            const pct = Math.round((e.loaded / e.total) * 90);
            setState(s => ({ ...s, progress: Math.max(1, pct) }));
          }
        });

        xhr.addEventListener('load', () => {
          console.log('[Blink] XHR status:', xhr.status, xhr.responseText.slice(0, 200));
          if (xhr.status >= 200 && xhr.status < 300) {
            const data = JSON.parse(xhr.responseText);
            resolve(data.secure_url);
          } else {
            try {
              const errData = JSON.parse(xhr.responseText);
              reject(new Error(errData?.error?.message ?? `Cloudinary error ${xhr.status}`));
            } catch {
              reject(new Error(`Upload failed: HTTP ${xhr.status}`));
            }
          }
        });

        xhr.addEventListener('error', (e) => {
          console.error('[Blink] XHR network error', e);
          reject(new Error('Network error uploading to Cloudinary. Check your internet.'));
        });
        xhr.addEventListener('abort', () => reject(new Error('Upload cancelled.')));
        xhr.timeout = 120_000;
        xhr.addEventListener('timeout', () => reject(new Error('Upload timed out. Try a smaller file or better connection.')));

        xhr.open('POST', uploadUrl);
        // Do NOT set Content-Type — browser sets it with the correct boundary for FormData
        xhr.send(formData);
      });

      setState(s => ({ ...s, progress: 95 }));
      console.log('[Blink] Cloudinary URL:', mediaUrl);

      // ── Step 2: Save to Firestore ──────────────────────────────────────
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

      await addDoc(collection(db, 'blinks'), {
        userId: user.uid,
        username: user.username,
        userDisplayName: user.displayName,
        userProfileImage: user.profileImage ?? null,
        mediaUrl,
        type,
        caption: caption.trim() || null,
        textOverlay: textOverlay.trim() || null,
        textOverlayColor,
        musicUrl: musicUrl ?? null,
        musicTitle: musicTitle ?? null,
        viewsCount: 0,
        viewedBy:[],
        createdAt: now.toISOString(),
        expiresAt,
      });

      setState(s => ({ ...s, uploading: false, progress: 100 }));
      return true;

    } catch (err: any) {
      console.error('[Blink] Upload error:', err);
      setState(s => ({
        ...s, uploading: false,
        error: err?.message ?? 'Upload failed. Please try again.',
      }));
      return false;
    }
  }, [user]);

  const reset = useCallback(() => {
    xhrRef.current?.abort();
    if (dataRef.current.previewUrl) URL.revokeObjectURL(dataRef.current.previewUrl);
    dataRef.current = {
      file: null, type: null, textOverlay: '', textOverlayColor: '#ffffff',
      caption: '', previewUrl: null, musicUrl: null, musicTitle: null,
    };
    setState(INITIAL_STATE);
  },
