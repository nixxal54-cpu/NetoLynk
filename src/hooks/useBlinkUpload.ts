/**
 * useBlinkUpload.ts
 * Uses Cloudinary with the modern `fetch` API for stable mobile data uploads!
 */
import { useState, useCallback, useRef } from 'react';
import { collection, addDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { BlinkUploadState } from '../types/blink';

const MAX_IMAGE_MB = 10;
const MAX_VIDEO_MB = 50;

// Hardcoded details — bypassing environment variable issues entirely
const CLOUD_NAME = 'dmwnywqes';
const UPLOAD_PRESET = 'blinks';

const INITIAL_STATE: BlinkUploadState = {
  file: null,
  previewUrl: null,
  type: null,
  textOverlay: '',
  textOverlayColor: '#ffffff',
  caption: '',
  progress: 0,
  uploading: false,
  error: null,
};

export function useBlinkUpload() {
  const { user } = useAuth();
  const [state, setState] = useState<BlinkUploadState>(INITIAL_STATE);

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

    if (dataRef.current.previewUrl) {
      URL.revokeObjectURL(dataRef.current.previewUrl);
    }

    const previewUrl = URL.createObjectURL(file);
    const type = isVideo ? 'video' : 'image';

    dataRef.current = { ...dataRef.current, file, type, previewUrl };

    setState(s => ({
      ...s,
      file,
      previewUrl,
      type,
      error: null,
    }));
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

    setState(s => ({ ...s, uploading: true, error: null, progress: 5 }));

    let currentProgress = 5;

    const progressInterval = setInterval(() => {
      currentProgress = Math.min(currentProgress + 8, 90);
      setState(s => ({ ...s, progress: currentProgress }));
    }, 600);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('upload_preset', UPLOAD_PRESET);

      const uploadUrl = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/auto/upload`;

      const response = await fetch(uploadUrl, {
        method: 'POST',
        body: formData,
      });

      clearInterval(progressInterval);
      setState(s => ({ ...s, progress: 95 }));

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        console.error('[Blink] Cloudinary rejected upload:', errorData);
        throw new Error(errorData?.error?.message || `Cloudinary Error ${response.status}`);
      }

      const data = await response.json();
      const mediaUrl = data.secure_url;

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
      clearInterval(progressInterval);

      console.error('[Blink] Upload error:', err);

      setState(s => ({
        ...s,
        uploading: false,
        error: err?.message ?? 'Upload failed. Please try again.',
      }));

      return false;
    }
  }, [user]);

  const reset = useCallback(() => {
    if (dataRef.current.previewUrl) {
      URL.revokeObjectURL(dataRef.current.previewUrl);
    }

    dataRef.current = {
      file: null,
      type: null,
      textOverlay: '',
      textOverlayColor: '#ffffff',
      caption: '',
      previewUrl: null,
      musicUrl: null,
      musicTitle: null,
    };

    setState(INITIAL_STATE);
  }, []);

  return {
    state,
    selectFile,
    setTextOverlay,
    setTextOverlayColor,
    setCaption,
    setMusic,
    publish,
    reset,
  };
}
