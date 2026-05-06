/**
 * useBlinkUpload.ts
 *
 * ROOT-CAUSE FIX for "stuck at 0%":
 *   Firebase Storage blocks direct browser uploads from neto-lynk.vercel.app
 *   due to CORS. Instead of using the Firebase Storage SDK (which opens a
 *   WebSocket upload that CORS blocks), we:
 *     1. Call our Cloud Function `getBlinkUploadUrl` to get a signed PUT URL
 *     2. Upload the file directly via XHR PUT to that signed URL
 *        → no CORS issues, real upload progress (0-100%)
 *     3. Save the returned downloadUrl to Firestore as normal
 */
import { useState, useCallback, useRef } from 'react';
import { collection, addDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { BlinkUploadState } from '../types/blink';

const MAX_IMAGE_MB = 10;
const MAX_VIDEO_MB = 50;

const INITIAL_STATE: BlinkUploadState = {
  file: null, previewUrl: null, type: null,
  textOverlay: '', textOverlayColor: '#ffffff',
  caption: '', progress: 0, uploading: false, error: null,
};

/** Upload a file to a signed URL via XHR — gives real progress events */
function uploadViaSignedUrl(
  signedUrl: string,
  file: File,
  onProgress: (pct: number) => void,
  signal: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    signal.addEventListener('abort', () => { xhr.abort(); reject(new Error('Upload cancelled.')); });

    xhr.upload.addEventListener('progress', e => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    });

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload failed: HTTP ${xhr.status}`));
    });

    xhr.addEventListener('error', () => reject(new Error('Network error during upload.')));
    xhr.addEventListener('timeout', () => reject(new Error('Upload timed out.')));

    xhr.open('PUT', signedUrl);
    xhr.setRequestHeader('Content-Type', file.type);
    xhr.timeout = 120_000; // 2-minute timeout
    xhr.send(file);
  });
}

export function useBlinkUpload() {
  const { user } = useAuth();
  const [state, setState] = useState<BlinkUploadState>(INITIAL_STATE);
  const abortRef = useRef<AbortController | null>(null);

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
    abortRef.current = new AbortController();

    try {
      // Step 1 — get a signed PUT URL from our Cloud Function
      setState(s => ({ ...s, progress: 2 })); // show activity immediately

      const getUploadUrl = httpsCallable<
        { folder: string; filename: string; contentType: string },
        { signedUrl: string; downloadUrl: string }
      >(functions, 'getBlinkUploadUrl');

      const folder = type === 'video' ? 'blinks/videos' : 'blinks/images';
      const ext = file.name.split('.').pop() || (type === 'video' ? 'mp4' : 'jpg');
      const filename = `${user.uid}_${Date.now()}.${ext}`;

      const { data } = await getUploadUrl({ folder, filename, contentType: file.type });
      const { signedUrl, downloadUrl } = data;

      setState(s => ({ ...s, progress: 5 }));

      // Step 2 — upload directly via XHR (real progress, no CORS)
      await uploadViaSignedUrl(
        signedUrl, file,
        pct => setState(s => ({ ...s, progress: Math.round(5 + pct * 0.93) })), // 5→98%
        abortRef.current.signal,
      );

      setState(s => ({ ...s, progress: 99 }));

      // Step 3 — write Firestore document with the download URL
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

      await addDoc(collection(db, 'blinks'), {
        userId: user.uid,
        username: user.username,
        userDisplayName: user.displayName,
        userProfileImage: user.profileImage ?? null,
        mediaUrl: downloadUrl,
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
  }, [user]);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    if (dataRef.current.previewUrl) URL.revokeObjectURL(dataRef.current.previewUrl);
    dataRef.current = {
      file: null, type: null, textOverlay: '', textOverlayColor: '#ffffff',
      caption: '', previewUrl: null, musicUrl: null, musicTitle: null,
    };
    setState(INITIAL_STATE);
  }, []);

  return { state, selectFile, setTextOverlay, setTextOverlayColor, setCaption, setMusic, publish, reset };
}
