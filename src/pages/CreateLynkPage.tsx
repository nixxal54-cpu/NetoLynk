/**
 * CreateLynkPage.tsx
 * Full upload flow: file select → preview → caption → upload
 */
import React, { useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDropzone } from 'react-dropzone';
import { Film, Upload, X, ChevronLeft, Loader2 } from 'lucide-react';
import { useLynkUpload } from '../hooks/useLynkUpload';
import { useAuth } from '../context/AuthContext';
import { createLynk } from '../lib/lynkService';
import { toast } from 'sonner';
import { motion } from 'motion/react';

export default function CreateLynkPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { state, selectFile, uploadToStorage, setCaption, reset } = useLynkUpload();
  const videoPreviewRef = useRef<HTMLVideoElement>(null);

  const onDrop = useCallback(
    (accepted: File[]) => {
      if (accepted[0]) selectFile(accepted[0]);
    },
    [selectFile]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'video/*': ['.mp4', '.mov', '.webm', '.avi'] },
    maxFiles: 1,
    multiple: false,
  });

  const handlePublish = async () => {
    if (!user || !state.file) return;
    if (!state.caption.trim()) {
      toast.error('Add a caption before posting');
      return;
    }

    try {
      const { videoUrl, thumbnailUrl, duration } = await uploadToStorage(user.uid);

      await createLynk({
        userId: user.uid,
        username: user.username,
        userDisplayName: user.displayName,
        userProfileImage: user.profileImage,
        videoUrl,
        thumbnailUrl,
        caption: state.caption,
        hashtags: state.hashtags,
        likesCount: 0,
        commentsCount: 0,
        sharesCount: 0,
        viewsCount: 0,
        savesCount: 0,
        totalWatchSeconds: 0,
        completionRate: 0,
        duration,
        aspectRatio: '9:16',
        isTrending: false,
        reportCount: 0,
        isHidden: false,
        createdAt: new Date().toISOString(),
      });

      toast.success('Lynk posted! 🎬');
      reset();
      navigate('/lynks');
    } catch (err: any) {
      toast.error(err.message || 'Upload failed');
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-background">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
        <button onClick={() => navigate(-1)}>
          <ChevronLeft className="w-6 h-6" />
        </button>
        <h1 className="font-bold text-lg flex-1">Create Lynk</h1>
        {state.videoUrl && !state.uploading && (
          <button
            onClick={handlePublish}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-full font-bold text-sm"
          >
            Post
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6">
        {/* Drop zone or preview */}
        {!state.videoUrl ? (
          <div
            {...getRootProps()}
            className={`
              border-2 border-dashed rounded-2xl flex flex-col items-center justify-center gap-4
              py-16 cursor-pointer transition-colors
              ${isDragActive ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'}
            `}
          >
            <input {...getInputProps()} />
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
              <Film className="w-8 h-8 text-primary" />
            </div>
            <div className="text-center">
              <p className="font-semibold">Drop your video here</p>
              <p className="text-sm text-muted-foreground mt-1">
                Vertical videos (9:16) · 15–60 seconds
              </p>
              <p className="text-xs text-muted-foreground">MP4, MOV, WebM</p>
            </div>
            <button className="px-6 py-2 bg-primary text-primary-foreground rounded-full font-bold text-sm flex items-center gap-2">
              <Upload className="w-4 h-4" />
              Browse files
            </button>
          </div>
        ) : (
          <div className="relative">
            {/* Video preview */}
            <div className="relative mx-auto rounded-2xl overflow-hidden bg-black" style={{ maxWidth: 270, aspectRatio: '9/16' }}>
              <video
                ref={videoPreviewRef}
                src={state.videoUrl}
                className="w-full h-full object-cover"
                controls
                playsInline
                muted
              />
              <button
                onClick={reset}
                className="absolute top-2 right-2 w-7 h-7 bg-black/60 rounded-full flex items-center justify-center text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Caption */}
        {state.videoUrl && (
          <div className="space-y-2">
            <label className="text-sm font-semibold">Caption</label>
            <textarea
              className="w-full bg-muted rounded-xl px-4 py-3 text-sm resize-none outline-none focus:ring-2 focus:ring-primary"
              rows={3}
              placeholder="Write a caption… use #hashtags to get discovered"
              value={state.caption}
              onChange={(e) => setCaption(e.target.value)}
              maxLength={300}
            />
            <p className="text-xs text-muted-foreground text-right">{state.caption.length}/300</p>

            {/* Detected hashtags */}
            {state.hashtags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {state.hashtags.map((tag) => (
                  <span key={tag} className="text-xs bg-primary/10 text-primary px-2 py-1 rounded-full font-medium">
                    #{tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Upload progress */}
        {state.uploading && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
              Uploading… {state.progress}%
            </div>
            <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-primary rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${state.progress}%` }}
                transition={{ ease: 'linear', duration: 0.3 }}
              />
            </div>
          </div>
        )}

        {/* Error */}
        {state.error && (
          <div className="bg-destructive/10 text-destructive text-sm px-4 py-3 rounded-xl">
            {state.error}
          </div>
        )}

        {/* Tips */}
        {!state.videoUrl && (
          <div className="bg-accent/40 rounded-2xl p-4 space-y-2">
            <h3 className="font-bold text-sm">📱 Lynk Tips</h3>
            <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
              <li>Film vertically (9:16) for best results</li>
              <li>Keep it between 15–60 seconds</li>
              <li>Use hashtags to get discovered</li>
              <li>New Lynks get a 24h viral boost automatically</li>
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
