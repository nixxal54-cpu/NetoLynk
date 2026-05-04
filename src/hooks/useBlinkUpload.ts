/**
 * useBlinkUpload.ts
 * Handles image/video upload for Blinks with preview and progress tracking.
 */
import { useState, useCallback } from 'react';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { collection, addDoc } from 'firebase/firestore';
import { storage, db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { BlinkUploadState } from '../types/blink';

const MAX_IMAGE_MB = 10;
const MAX_VIDEO_MB = 50;

export function useBlinkUpload() {
  const { user } = useAuth();
  const [state, setState] = useState<BlinkUploadState>({
    file: null,
    previewUrl: null,
    type: null,
    textOverlay: '',
    textOverlayColor: '#ffffff',
    caption: '',
    progress: 0,
    uploading: false,
    error: null,
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

    const previewUrl = URL.createObjectURL(file);
    setState(s => ({
      ...s,
      file,
      previewUrl,
      type: isVideo ? 'video' : 'image',
      error: null,
    }));
  }, []);

  const setTextOverlay = useCallback((text: string) => {
    setState(s => ({ ...s, textOverlay: text }));
  }, []);

  const setTextOverlayColor = useCallback((color: string) => {
    setState(s => ({ ...s, textOverlayColor: color }));
  }, []);

  const setCaption = useCallback((caption: string) => {
    setState(s => ({ ...s, caption }));
  }, []);

  const publish = useCallback(async (): Promise<boolean> => {
    if (!user || !state.file || !state.type) return false;

    setState(s => ({ ...s, uploading: true, error: null, progress: 0 }));

    try {
      const fileId = `${user.uid}_${Date.now()}`;
      const folder = state.type === 'video' ? 'blinks/videos' : 'blinks/images';
      const ext = state.type === 'video' ? 'mp4' : 'jpg';
      const storageRef = ref(storage, `${folder}/${fileId}.${ext}`);

      const task = uploadBytesResumable(storageRef, state.file);

      const mediaUrl = await new Promise<string>((resolve, reject) => {
        task.on(
          'state_changed',
          snap => {
            const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
            setState(s => ({ ...s, progress: pct }));
          },
          reject,
          async () => resolve(await getDownloadURL(task.snapshot.ref))
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
        type: state.type,
        caption: state.caption.trim() || null,
        textOverlay: state.textOverlay.trim() || null,
        textOverlayColor: state.textOverlayColor,
        musicUrl: null,
        musicTitle: null,
        viewsCount: 0,
        viewedBy: [],
        createdAt: now.toISOString(),
        expiresAt,
      });

      // Notify followers — handled by Cloud Function (see functions/src/index.ts)

      setState(s => ({ ...s, uploading: false, progress: 100 }));
      return true;
    } catch (err: any) {
      setState(s => ({ ...s, uploading: false, error: err.message ?? 'Upload failed' }));
      return false;
    }
  }, [user, state]);

  const reset = useCallback(() => {
    if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
    setState({
      file: null,
      previewUrl: null,
      type: null,
      textOverlay: '',
      textOverlayColor: '#ffffff',
      caption: '',
      progress: 0,
      uploading: false,
      error: null,
    });
  }, [state.previewUrl]);

  return { state, selectFile, setTextOverlay, setTextOverlayColor, setCaption, publish, reset };
}
