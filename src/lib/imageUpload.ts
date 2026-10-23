/**
 * imageUpload.ts
 * Shared Cloudinary upload helper (unsigned preset). Replaces Firebase Storage.
 *
 * Built for flaky mobile networks:
 *  - copies the picked file into memory first (files from Google Photos / cloud
 *    galleries can otherwise fail mid-upload with "Failed to fetch")
 *  - XHR with real progress + per-attempt timeout
 *  - retries network errors, timeouts and 5xx (not 4xx)
 */
const CLOUD_NAME =
  (import.meta.env.VITE_CLOUDINARY_CLOUD_NAME as string) || 'dmwnywqes';
const UPLOAD_PRESET =
  (import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET as string) || 'blinks';

export interface CloudinaryResult { url: string; publicId: string }

interface Opts {
  resourceType: 'image' | 'video';
  folder: string;
  name?: string;
  onProgress?: (pct: number) => void;
  preset?: string;
  publicId?: string;
  attempts?: number;
}

class HttpError extends Error { constructor(m: string, public status: number) { super(m); } }

function sendOnce(body: Blob, name: string, o: Opts, timeoutMs: number): Promise<CloudinaryResult> {
  return new Promise((resolve, reject) => {
    const fd = new FormData();
    fd.append('file', body, name);
    fd.append('upload_preset', o.preset || UPLOAD_PRESET);
    fd.append('folder', o.folder);
    if (o.publicId) fd.append('public_id', o.publicId);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/${o.resourceType}/upload`);
    xhr.timeout = timeoutMs;
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) o.onProgress?.(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      let data: any = null;
      try { data = JSON.parse(xhr.responseText); } catch { /* ignore */ }
      if (xhr.status >= 200 && xhr.status < 300 && data?.secure_url) {
        resolve({ url: data.secure_url, publicId: data.public_id });
      } else {
        reject(new HttpError(data?.error?.message || `Upload failed (${xhr.status})`, xhr.status));
      }
    };
    xhr.onerror = () => reject(new HttpError('Network error during upload', 0));
    xhr.ontimeout = () => reject(new HttpError('Upload timed out', 0));
    xhr.send(fd);
  });
}

export async function uploadToCloudinary(file: Blob, o: Opts): Promise<CloudinaryResult> {
  const name = o.name || (file as File).name || (o.resourceType === 'video' ? 'video.mp4' : 'image.jpg');

  // Snapshot into memory (skip for very large files to avoid RAM spikes)
  let body: Blob = file;
  if (file.size <= 40 * 1024 * 1024) {
    try { body = new Blob([await file.arrayBuffer()], { type: file.type }); } catch { body = file; }
  }

  const timeoutMs = o.resourceType === 'video' ? 180_000 : 60_000;
  const attempts = o.attempts ?? 3;
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await sendOnce(body, name, o, timeoutMs);
    } catch (err) {
      lastErr = err;
      const status = err instanceof HttpError ? err.status : 0;
      if (status >= 400 && status < 500) break; // client error — retrying won't help
      if (i < attempts - 1) await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Upload failed');
}

/** Convenience wrapper for images → returns just the URL */
export async function uploadImage(file: Blob, folder: string, name?: string): Promise<string> {
  return (await uploadToCloudinary(file, { resourceType: 'image', folder, name })).url;
}
