/**
 * useLynkUpload.ts
 * Handles video compression, thumbnail generation, and Firebase Storage upload.
 */
import { useState, useCallback } from 'react';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { storage } from '../lib/firebase';
import { LynkUploadState } from '../types/lynk';

const MAX_DURATION = 60;  // seconds
const MIN_DURATION = 5;

/** Extract first-frame thumbnail as a Blob */
async function generateThumbnail(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.src = URL.createObjectURL(file);
    video.muted = true;
    video.playsInline = true;

    video.onloadeddata = () => {
      video.currentTime = 0.5; // 0.5s into video for better frame
    };

    video.onseeked = () => {
      const canvas = document.createElement('canvas');
      canvas.width  = 540;   // 9:16 at 540p
      canvas.height = 960;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(video, 0, 0, 540, 960);
      canvas.toBlob(
        (blob) => {
          URL.revokeObjectURL(video.src);
          blob ? resolve(blob) : reject(new Error('Thumbnail failed'));
        },
        'image/jpeg',
        0.85
      );
    };

    video.onerror = () => reject(new Error('Video load error'));
  });
}

/** Validate video dimensions, duration, type */
async function validateVideo(file: File): Promise<{ duration: number }> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.src = URL.createObjectURL(file);

    video.onloadedmetadata = () => {
      URL.revokeObjectURL(video.src);
      const { duration, videoWidth, videoHeight } = video;

      if (!file.type.startsWith('video/')) {
        return reject(new Error('File must be a video'));
      }
      if (duration < MIN_DURATION) {
        return reject(new Error(`Lynk must be at least ${MIN_DURATION}s`));
      }
      if (duration > MAX_DURATION) {
        return reject(new Error(`Lynk can be at most ${MAX_DURATION}s`));
      }
      resolve({ duration });
    };

    video.onerror = () => reject(new Error('Could not read video metadata'));
  });
}

export function useLynkUpload() {
  const [state, setState] = useState<LynkUploadState>({
    file: null,
    videoUrl: null,
    thumbnailUrl: null,
    caption: '',
    hashtags: [],
    progress: 0,
    uploading: false,
    error: null,
  });

  const selectFile = useCallback(async (file: File) => {
    setState((s) => ({ ...s, error: null, file, videoUrl: URL.createObjectURL(file) }));
  }, []);

  const uploadToStorage = useCallback(
    async (userId: string): Promise<{ videoUrl: string; thumbnailUrl: string; duration: number }> => {
      if (!state.file) throw new Error('No file selected');

      setState((s) => ({ ...s, uploading: true, error: null, progress: 0 }));

      try {
        const { duration } = await validateVideo(state.file);

        // Generate thumbnail
        const thumbBlob = await generateThumbnail(state.file);
        const thumbId = `${userId}_${Date.now()}`;
        const thumbRef = ref(storage, `lynks/thumbnails/${thumbId}.jpg`);
        await uploadBytesResumable(thumbRef, thumbBlob);
        const thumbnailUrl = await getDownloadURL(thumbRef);

        // Upload video with progress tracking
        const videoId = `${userId}_${Date.now()}`;
        const videoRef = ref(storage, `lynks/videos/${videoId}`);
        const task = uploadBytesResumable(videoRef, state.file);

        const videoUrl = await new Promise<string>((resolve, reject) => {
          task.on(
            'state_changed',
            (snap) => {
              const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
              setState((s) => ({ ...s, progress: pct }));
            },
            reject,
            async () => {
              resolve(await getDownloadURL(task.snapshot.ref));
            }
          );
        });

        setState((s) => ({ ...s, uploading: false, progress: 100 }));
        return { videoUrl, thumbnailUrl, duration };
      } catch (err: any) {
        setState((s) => ({ ...s, uploading: false, error: err.message }));
        throw err;
      }
    },
    [state.file]
  );

  const setCaption = useCallback((caption: string) => {
    // Auto-extract hashtags
    const hashtags = [...caption.matchAll(/#(\w+)/g)].map((m) => m[1].toLowerCase());
    setState((s) => ({ ...s, caption, hashtags }));
  }, []);

  const reset = useCallback(() => {
    setState({
      file: null, videoUrl: null, thumbnailUrl: null,
      caption: '', hashtags: [], progress: 0, uploading: false, error: null,
    });
  }, []);

  return { state, selectFile, uploadToStorage, setCaption, reset };
}
