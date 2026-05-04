/**
 * useBlinkUpload.ts
 * Handles image/video upload for Blinks with preview and progress tracking.
 *
 * FIX: publish() previously listed `state` in its useCallback deps. Because
 * `state` is a new object on every render, the callback was recreated on every
 * progress tick, which could cause the Firebase upload task listener to go
 * stale mid-upload — resulting in the spinner hanging forever at some %.
 *
 * Solution: store the mutable parts (file, type, caption, overlays) in a ref
 * so publish() never needs `state` as a dependency. setState calls only update
 * the UI; the actual upload reads from the stable ref.
 */
import { useState, useCallback, useRef } from 'react';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { collection, addDoc } from 'firebase/firestore';
import { storage, db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { BlinkUploadState } from '../types/blink';

const MAX_IMAGE_MB = 10;
const MAX_VIDEO_MB = 50;

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

  // Stable ref — publish reads from here, never from `state`
  const uploadDataRef = useRef({
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
      setState(s => ({ ...s, error: `File too large. Max ${maxMB}MB.` }));
      return;
    }

    // Revoke old preview URL if any
    if (uploadDataRef.current.previewUrl) {
      URL.revokeObjectURL(uploadDataRef.current.previewUrl);
    }

    const previewUrl = URL.createObjectURL(file);
    const type = isVideo ? 'video' : 'image';

    uploadDataRef.current = { ...uploadDataRef.current, file, type, previewUrl };

    setState(s => ({
      ...s,
      file,
      previewUrl,
      type,
      error: null,
    }));
  }, []);

  const setTextOverlay = useCallback((text: string) => {
    uploadDataRef.current.textOverlay = text;
    setState(s => ({ ...s, textOverlay: text }));
  }, []);

  const setTextOverlayColor = useCallback((color: string) => {
    uploadDataRef.current.textOverlayColor = color;
    setState(s => ({ ...s, textOverlayColor: color }));
  }, []);

  const setCaption = useCallback((caption: string) => {
    uploadDataRef.current.caption = caption;
    setState(s => ({ ...s, caption }));
  }, []);

  const setMusic = useCallback((musicUrl: string | null, musicTitle: string | null) => {
    uploadDataRef.current.musicUrl = musicUrl;
    uploadDataRef.current.musicTitle = musicTitle;
  }, []);

  // publish() depends only on `user` — never on `state`
  const publish = useCallback(async (): Promise<boolean> => {
    const { file, type, textOverlay, textOverlayColor, caption, musicUrl, musicTitle } = uploadDataRef.current;

    if (!user || !file || !type) return false;

    setState(s => ({ ...s, uploading: true, error: null, progress: 0 }));

    try {
      const fileId = `${user.uid}_${Date.now()}`;
      const folder = type === 'video' ? 'blinks/videos' : 'blinks/images';
      // Preserve real extension from the file object
      const ext = file.name.split('.').pop() ?? (type === 'video' ? 'mp4' : 'jpg');
      const storageRef = ref(storage, `${folder}/${fileId}.${ext}`);

      const task = uploadBytesResumable(storageRef, file);

      const mediaUrl = await new Promise<string>((resolve, reject) => {
        task.on(
          'state_changed',
          snap => {
            const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
            setState(s => ({ ...s, progress: pct }));
          },
          (err) => reject(err),
          async () => {
            try {
              const url = await getDownloadURL(task.snapshot.ref);
              resolve(url);
            } catch (e) {
              reject(e);
            }
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
        ...s,
        uploading: false,
        error: err?.message ?? 'Upload failed. Check your connection and try again.',
      }));
      return false;
    }
  }, [user]); // ← only user, NOT state

  const reset = useCallback(() => {
    if (uploadDataRef.current.previewUrl) {
      URL.revokeObjectURL(uploadDataRef.current.previewUrl);
    }
    uploadDataRef.current = {
      file: null, type: null, textOverlay: '',
      textOverlayColor: '#ffffff', caption: '', previewUrl: null,
      musicUrl: null, musicTitle: null,
    };
    setState(INITIAL_STATE);
  }, []);

  return { state, selectFile, setTextOverlay, setTextOverlayColor, setCaption, setMusic, publish, reset };
}
