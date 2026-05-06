/**
 * useBlinkUpload.ts
 *
 * Uses Cloudinary for storage — completely free, no Firebase Storage needed,
 * no CORS issues, works from any domain including Vercel.
 *
 * SECURITY:
 *  - VITE_CLOUDINARY_CLOUD_NAME  → public, safe in frontend
 *  - VITE_CLOUDINARY_UPLOAD_PRESET → public unsigned preset, safe in frontend
 *  - API Secret is NEVER used in frontend code
 *
 * Add to Vercel Environment Variables:
 *   VITE_CLOUDINARY_CLOUD_NAME=dmwnywqes
 *   VITE_CLOUDINARY_UPLOAD_PRESET=your_preset_name  ← you'll get this next
 */
import { useState, useCallback, useRef } from 'react';
import { collection, addDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { BlinkUploadState } from '../types/blink';

const MAX_IMAGE_MB = 10;
const MAX_VIDEO_MB = 50;

const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME as string;
const UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET as string;

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
  }, []);

  const setTextOverlay = useCallback((text: string) => {
    dataRef.current.textOverlay = text;
    setState(s => ({ ...s, textOverlay: text }));
  }, []);

  const setTextOverlayColor = useCallback((color: string) => {
    dataRef.current.textOverlayColor = color;
    setState(s => ({ ...s, textOverlayColor: color }));
  }, []);

  const setCaption = useCallback((caption: string) => {
    dataRef.current.caption = caption;
    setState(s => ({ ...s, caption }));
  }, []);

  const setMusic = useCallback((musicUrl: string | null, musicTitle: string | null) => {
    dataRef.current.musicUrl = musicUrl;
    dataRef.current.musicTitle = musicTitle;
  }, []);

  const publish = useCallback(async (): Promise<boolean> => {
    const { file, type, textOverlay, textOverlayColor, caption, musicUrl, musicTitle } = dataRef.current;
    if (!user || !file || !type) return false;

    if (!CLOUD_NAME || !UPLOAD_PRESET) {
      setState(s => ({ ...s, error: 'Cloudinary not configured. Add VITE_CLOUDINARY_CLOUD_NAME and VITE_CLOUDINARY_UPLOAD_PRESET to Vercel environment variables.' }));
      return false;
    }

    setState(s => ({ ...s, uploading: true, error: null, progress: 0 }));

    try {
      // ── Step 1: Upload to Cloudinary via XHR (real progress, no CORS) ──
      const formData = new FormData();
      formData.append('file', file);
      formData.append('upload_preset', UPLOAD_PRESET);
      formData.append('folder', 'blinks');
      // Tag with userId so you can manage files in Cloudinary dashboard
      formData.append('tags', `blink,${user.uid}`);

      const resourceType = type === 'video' ? 'video' : 'image';
      const uploadUrl = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/${resourceType}/upload`;

      const mediaUrl = await new Promise<string>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhrRef.current = xhr;

        xhr.upload.addEventListener('progress', e => {
          if (e.lengthComputable) {
            const pct = Math.round((e.loaded / e.total) * 95);
            setState(s => ({ ...s, progress: pct }));
          }
        });

        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            const data = JSON.parse(xhr.responseText);
            resolve(data.secure_url);
          } else {
            try {
              const err = JSON.parse(xhr.responseText);
              reject(new Error(err?.error?.message ?? `Upload failed: HTTP ${xhr.status}`));
            } catch {
              reject(new Error(`Upload failed: HTTP ${xhr.status}`));
            }
          }
        });

        xhr.addEventListener('error', () => reject(new Error('Network error. Check your connection.')));
        xhr.addEventListener('abort', () => reject(new Error('Upload cancelled.')));
        xhr.timeout = 120_000;
        xhr.addEventListener('timeout', () => reject(new Error('Upload timed out. Try a smaller file.')));

        xhr.open('POST', uploadUrl);
        xhr.send(formData);
      });

      setState(s => ({ ...s, progress: 97 }));

      // ── Step 2: Save blink document to Firestore ──
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
        viewedBy: [],
        createdAt: now.toISOString(),
        expiresAt,
      });

      setState(s => ({ ...s, uploading: false, progress: 100 }));
      return true;

    } catch (err: any) {
      console.error('Blink upload error:', err);
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
  }, []);

  return { state, selectFile, setTextOverlay, setTextOverlayColor, setCaption, setMusic, publish, reset };
}
