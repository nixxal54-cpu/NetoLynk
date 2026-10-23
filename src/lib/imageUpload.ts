/**
 * imageUpload.ts
 * Single image-upload helper (Cloudinary, unsigned preset). Replaces Firebase Storage.
 */
const CLOUD_NAME =
  (import.meta.env.VITE_CLOUDINARY_CLOUD_NAME as string) || 'dmwnywqes';
const UPLOAD_PRESET =
  (import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET as string) || 'blinks';

export async function uploadImage(file: Blob, folder: string, name?: string): Promise<string> {
  const fd = new FormData();
  fd.append('file', file, name || (file as File).name || 'image.jpg');
  fd.append('upload_preset', UPLOAD_PRESET);
  fd.append('folder', folder);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 45_000);
  try {
    const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, {
      method: 'POST',
      body: fd,
      signal: ctrl.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error?.message || `Upload failed (${res.status})`);
    return data.secure_url as string;
  } finally {
    clearTimeout(timer);
  }
}
