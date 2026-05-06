// src/pages/CreateLynkPage.tsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db, functions } from '../lib/firebase';
import { httpsCallable } from 'firebase/functions';
import { useAuth } from '../context/AuthContext';
import { LynkCategory } from '../types/lynk';
import { Loader2, UploadCloud } from 'lucide-react';
import { toast } from 'sonner';

const CATEGORIES: LynkCategory[] =["gaming", "funny", "edits", "relatable", "music", "trending"];

export default function CreateLynkPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  
  const [file, setFile] = useState<File | null>(null);
  const [videoId, setVideoId] = useState<string | null>(null);
  const [isUploadingToYT, setIsUploadingToYT] = useState(false);
  
  const [caption, setCaption] = useState('');
  const [category, setCategory] = useState<LynkCategory | null>(null);
  const [tags, setTags] = useState('');

  // 1. Pick file and trigger backend YT Upload
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    setFile(selected);
    setIsUploadingToYT(true);

    try {
      // NOTE: Videos >10MB should use a presigned URL strategy.
      // For this demo, we convert to base64 and send to a Cloud Function 
      // which handles the YouTube Data API upload server-side.
      const reader = new FileReader();
      reader.readAsDataURL(selected);
      reader.onload = async () => {
        const base64Video = (reader.result as string).split(',')[1];
        
        const uploadToYT = httpsCallable(functions, 'uploadToYouTubeProxy');
        const res = await uploadToYT({ videoBase64: base64Video, title: selected.name }) as any;
        
        setVideoId(res.data.videoId);
        toast.success('Video processed! Now add details.');
      };
    } catch (err) {
      toast.error('Failed to upload to YouTube');
      setFile(null);
    } finally {
      setIsUploadingToYT(false);
    }
  };

  // 2. Save Metadata to Firestore
  const handleSaveToFirestore = async () => {
    if (!user || !videoId || !category || !caption) return;
    
    try {
      await addDoc(collection(db, 'lynks'), {
        userId: user.uid,
        username: user.username,
        videoId: videoId,
        thumbnail: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
        caption,
        category,
        tags: tags.split(',').map(t => t.trim()),
        visibility: 'public',
        likesCount: 0,
        commentsCount: 0,
        sharesCount: 0,
        boostScore: 50, // Initial viral boost
        createdAt: new Date().toISOString(),
        serverCreatedAt: serverTimestamp(),
      });
      
      toast.success('Lynk Published!');
      navigate('/lynks');
    } catch (err) {
      toast.error('Failed to publish');
    }
  };

  return (
    <div className="min-h-screen bg-background p-6 max-w-md mx-auto">
      <h1 className="text-2xl font-bold mb-6">Create Lynk</h1>

      {!videoId ? (
        <div className="flex flex-col items-center justify-center border-2 border-dashed border-border rounded-2xl p-10">
          {isUploadingToYT ? (
            <div className="text-center">
              <Loader2 className="w-10 h-10 animate-spin text-primary mx-auto mb-4" />
              <p>Uploading securely to YouTube (Unlisted)...</p>
              <p className="text-xs text-muted-foreground mt-2">Zero-bandwidth mode active</p>
            </div>
          ) : (
            <>
              <UploadCloud className="w-12 h-12 text-muted-foreground mb-4" />
              <label className="bg-primary text-white px-6 py-2 rounded-full font-bold cursor-pointer hover:opacity-90">
                Select Video
                <input type="file" accept="video/*" className="hidden" onChange={handleFileSelect} />
              </label>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
          <div className="rounded-xl overflow-hidden aspect-[9/16] w-32 mx-auto bg-black relative">
            <img src={`https://img.youtube.com/vi/${videoId}/hqdefault.jpg`} className="w-full h-full object-cover" />
            <div className="absolute top-2 right-2 bg-green-500 text-white text-[10px] px-2 py-1 rounded-md font-bold">YT Connected</div>
          </div>

          <div>
            <label className="block text-sm font-bold mb-2">Category</label>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map(cat => (
                <button
                  key={cat}
                  onClick={() => setCategory(cat)}
                  className={`px-4 py-1.5 rounded-full text-sm font-bold border transition-colors ${category === cat ? 'bg-primary border-primary text-white' : 'border-border text-muted-foreground'}`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold mb-2">Caption</label>
            <textarea
              value={caption}
              onChange={e => setCaption(e.target.value)}
              className="w-full bg-accent rounded-xl p-4 outline-none resize-none h-24"
              placeholder="What's this about?"
            />
          </div>

          <div>
            <label className="block text-sm font-bold mb-2">Tags (comma separated)</label>
            <input
              type="text"
              value={tags}
              onChange={e => setTags(e.target.value)}
              className="w-full bg-accent rounded-xl p-4 outline-none"
              placeholder="foryou, viral, dance"
            />
          </div>

          <button
            onClick={handleSaveToFirestore}
            disabled={!category || !caption}
            className="w-full bg-primary text-white py-4 rounded-xl font-bold disabled:opacity-50"
          >
            Post Lynk
          </button>
        </div>
      )}
    </div>
  );
}
