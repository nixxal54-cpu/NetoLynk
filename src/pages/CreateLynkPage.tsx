// src/pages/CreateLynkPage.tsx
import React, { useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db, functions } from '../lib/firebase';
import axios from 'axios';

export default function CreateLynkPage() {
  const [file, setFile] = useState<File | null>(null);

  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);

  const [videoId, setVideoId] = useState<string | null>(null);
  const [isPosting, setIsPosting] = useState(false);

  // 🔹 Handle file select
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;

    // ✅ Validation
    if (!selected.type.startsWith('video/')) {
      alert('Only video files allowed');
      return;
    }

    if (selected.size > 100 * 1024 * 1024) {
      alert('Max 100MB allowed');
      return;
    }

    setFile(selected);
    setVideoId(null);
    setUploadProgress(0);
  };

  // 🔹 Upload to YouTube (direct resumable)
  const handleUpload = async () => {
    if (!file) return;

    setIsUploading(true);
    setUploadProgress(0);

    try {
      // 1. Get resumable upload URL from backend
      const initYTUpload = httpsCallable(functions, 'initYouTubeUpload');

      const { data } = await initYTUpload({
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type
      }) as { data: { uploadUrl: string; videoId: string } };

      setVideoId(data.videoId);

      // 2. Upload directly to YouTube
      await axios.put(data.uploadUrl, file, {
        headers: {
          'Content-Type': file.type,
        },
        onUploadProgress: (progressEvent) => {
          const percent = Math.round(
            (progressEvent.loaded * 100) /
            (progressEvent.total || file.size)
          );
          setUploadProgress(percent);
        }
      });

      setUploadProgress(100);

    } catch (err) {
      console.error('Upload failed', err);
      alert('Upload failed');
      setFile(null);
      setVideoId(null);
    } finally {
      setIsUploading(false);
    }
  };

  // 🔹 Publish Lynk to Firestore
  const handlePublish = async () => {
    if (!videoId) return;

    setIsPosting(true);

    try {
      await addDoc(collection(db, 'lynks'), {
        videoId,
        thumbnail: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
        visibility: 'public',

        category: 'gaming', // 🔥 replace with real UI later
        tags: [],

        metrics: {
          likes: 0,
          comments: 0,
          shares: 0,
          skips: 0,
          replays: 0,
          totalWatchTime: 0
        },

        duration: 0, // will update via backend later
        boostScore: 100,

        createdAt: serverTimestamp()
      });

      alert('Lynk Published 🚀');

      // 🔄 Reset state
      setFile(null);
      setVideoId(null);
      setUploadProgress(0);

    } catch (err) {
      console.error(err);
      alert('Publish failed');
    } finally {
      setIsPosting(false);
    }
  };

  return (
    <div style={{ padding: 20, maxWidth: 400, margin: 'auto' }}>
      <h2>Create Lynk</h2>

      {/* File Picker */}
      <input type="file" accept="video/*" onChange={handleFileChange} />

      {/* Upload Button */}
      <button
        onClick={handleUpload}
        disabled={!file || isUploading}
        style={{ marginTop: 10 }}
      >
        {isUploading ? `Uploading ${uploadProgress}%` : 'Upload to YouTube'}
      </button>

      {/* Progress Bar */}
      {isUploading && (
        <div style={{ marginTop: 10 }}>
          <progress value={uploadProgress} max="100" />
        </div>
      )}

      {/* Preview */}
      {videoId && (
        <div style={{ marginTop: 20 }}>
          <img
            src={`https://img.youtube.com/vi/${videoId}/hqdefault.jpg`}
            alt="thumbnail"
            style={{ width: '100%', borderRadius: 10 }}
          />
          <p style={{ fontSize: 12 }}>Video ready ✅</p>
        </div>
      )}

      {/* Publish Button */}
      <button
        onClick={handlePublish}
        disabled={!videoId || isPosting}
        style={{ marginTop: 10 }}
      >
        {isPosting ? 'Posting...' : 'Post Lynk'}
      </button>
    </div>
  );
}
