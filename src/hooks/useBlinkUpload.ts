/**
 * useBlinkUpload.ts
 *
 * FIXES:
 *  1. publish() uses a stable ref — never re-creates on state change mid-upload
 *  2. 60-second upload timeout — prevents silent hanging forever
 *  3. setMusic() exposed so CreateBlinkPage can wire real music URL
 */
import { useState, useCallback, useRef } from 'react';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { collection, addDoc } from 'firebase/firestore';
import { storage, db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { BlinkUploadState } from '../types/blink';

const MAX_IMAGE_MB = 10;
const MAX_VIDEO_MB = 50;
const UPLOAD_TIMEOUT_MS = 60_000; // 60 s

const INITIAL_STATE: BlinkUploadState = {
  file: null, previewUrl: null, type: null,
  textOverlay: '', textOverlayColor: '#ffffff',
  caption: '', progress: 0, uploading: false, error: null,
};

export function useBlinkUpload() {
  const { user } = useAuth();
  const [state, setState] = useState<BlinkUploadState>(INITIAL_STATE);

  // Stable ref — publish reads from here so it never needs `state` as a dep
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

    setState(s => ({ ...s, uploading: true, error: null, progress: 0 }));

    try {
      const fileId = `${user.uid}_${Date.now()}`;
      const folder = type === 'video' ? 'blinks/videos' : 'blinks/images';
      const ext = file.name.split('.').pop() || (type === 'video' ? 'mp4' : 'jpg');
      const storageRef = ref(storage, `${folder}/${fileId}.${ext}`);
      const task = uploadBytesResumable(storageRef, file);

      const mediaUrl = await new Promise<string>((resolve, reject) => {
        // Timeout guard — if no progress after 60s, abort
        const timer = setTimeout(() => {
          task.cancel();
          reject(new Error('Upload timed out. Check your internet connection and try again.'));
        }, UPLOAD_TIMEOUT_MS);

        task.on(
          'state_changed',
          snap => {
            const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
            setState(s => ({ ...s, progress: pct }));
          },
          err => { clearTimeout(timer); reject(err); },
          async () => {
            clearTimeout(timer);
            try { resolve(await getDownloadURL(task.snapshot.ref)); }
            catch (e) { reject(e); }
          }
        );
      });

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
        error: err?.message ?? 'Upload failed. Check your connection and try again.',
      }));
      return false;
    }
  }, [user]); // only user — never state

  const reset = useCallback(() => {
    if (dataRef.current.previewUrl) URL.revokeObjectURL(dataRef.current.previewUrl);
    dataRef.current = {
      file: null, type: null, textOverlay: '', textOverlayColor: '#ffffff',
      caption: '', previewUrl: null, musicUrl: null, musicTitle: null,
    };
    setState(INITIAL_STATE);
  }, []);

  return { state, selectFile, setTextOverlay, setTextOverlayColor, setCaption, setMusic, publish, reset };
}
