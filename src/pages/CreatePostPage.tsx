import { usePageTitle } from '../hooks/usePageTitle';
import imageCompression from 'browser-image-compression';
import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { db, storage } from '../lib/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronLeft, Image as ImageIcon, Loader2, Smile, X } from 'lucide-react';
import { getMoodIconByLabel } from '../components/Feed/PostCard';

const MOODS = [
  { emoji: '😤', label: 'Frustrated' },
  { emoji: '😌', label: 'Peaceful' },
  { emoji: '💀', label: 'Dead inside' },
  { emoji: '🔥', label: 'Hyped' },
  { emoji: '✨', label: 'Feeling cute' },
  { emoji: '☕', label: 'Need coffee' },
  { emoji: '😭', label: 'Crying' },
  { emoji: '🚀', label: 'Productive' },
];

export const CreatePostPage: React.FC = () => {
  usePageTitle('New Post');
  const { user } = useAuth();
  const navigate = useNavigate();
  const [text, setText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedMood, setSelectedMood] = useState<{emoji: string, label: string} | null>(null);
  const [showMoods, setShowMoods] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [isProcessingImages, setIsProcessingImages] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const remaining = 4 - selectedFiles.length;
    const toProcess = files.slice(0, remaining);

    if (files.length > remaining) {
      toast.info(`Only ${remaining} more image(s) can be added (max 4)`);
    }

    const oversized = toProcess.filter(f => f.size > 10 * 1024 * 1024);
    oversized.forEach(f => toast.error(`${f.name} is too large (max 10MB)`));
    const valid = toProcess.filter(f => f.size <= 10 * 1024 * 1024);

    const newPreviews = valid.map(f => URL.createObjectURL(f));
    setSelectedFiles(prev => [...prev, ...valid]);
    setPreviewUrls(prev => [...prev, ...newPreviews]);

    e.target.value = '';
  };

  const removeImage = (index: number) => {
    URL.revokeObjectURL(previewUrls[index]);
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
    setPreviewUrls(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() && selectedFiles.length === 0) {
      toast.error('Please add some text or an image');
      return;
    }
    if (!user) return;

    setIsSubmitting(true);
    try {
      // Compress then upload all images to Firebase Storage
      const mediaUrls: string[] = await Promise.all(
        selectedFiles.map(async (file) => {
          const compressed = await imageCompression(file, {
            maxSizeMB: 1,
            maxWidthOrHeight: 1920,
            useWebWorker: true,
          });
          const fileName = `posts/${user.uid}/${Date.now()}_${file.name}`;
          const storageRef = ref(storage, fileName);
          await uploadBytes(storageRef, compressed);
          return getDownloadURL(storageRef);
        })
      );

      await addDoc(collection(db, 'posts'), {
        userId: user.uid,
        username: user.username,
        userProfileImage: user.profileImage || null,
        text: text.trim(),
        mediaUrls,
        type: mediaUrls.length > 0 ? 'image' : 'text',
        mood: selectedMood,
        likesCount: 0,
        commentsCount: 0,
        sharesCount: 0,
        likedBy: [],
        savedBy: [],
        tags: [],
        mentions: [],
        createdAt: new Date().toISOString(),
        serverCreatedAt: serverTimestamp()
      });
      // Revoke object URLs to free memory
      previewUrls.forEach(url => URL.revokeObjectURL(url));
      toast.success('Post shared successfully!');
      navigate('/');
    } catch (error) {
      console.error("Error creating post:", error);
      toast.error('Failed to share post');
    } finally {
      setIsSubmitting(false);
    }
  };

  const canPost = (text.trim().length > 0 || selectedFiles.length > 0) && !isSubmitting;

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="flex-1 max-w-2xl border-x border-border min-h-screen bg-background"
    >
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-md border-b border-border p-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate(-1)} className="p-2 hover:bg-accent rounded-full transition-colors">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <h2 className="text-xl font-bold">New Post</h2>
        </div>
        <button
          onClick={handleSubmit}
          disabled={!canPost}
          className="bg-primary text-primary-foreground px-6 py-1.5 rounded-full font-bold hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-2"
        >
          {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
          Post
        </button>
      </header>

      <div className="p-4 flex gap-4">
        <img 
          src={user?.profileImage || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user?.username}`} 
          alt="Profile" 
          className="w-12 h-12 rounded-full object-cover flex-shrink-0"
        />
        <div className="flex-1">
          {selectedMood && (
            <div className="mb-2 inline-flex items-center gap-2 bg-accent/50 px-3 py-1.5 rounded-full text-sm font-medium border border-border/50">
              {getMoodIconByLabel(selectedMood.label)}
              <span>Feeling {selectedMood.label.toLowerCase()}</span>
              <button 
                onClick={() => setSelectedMood(null)}
                className="ml-2 text-muted-foreground hover:text-foreground"
              >
                ×
              </button>
            </div>
          )}

          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={selectedMood ? `Why are you feeling ${selectedMood.label.toLowerCase()}?` : "What's happening?"}
            className="w-full bg-transparent text-xl outline-none resize-none min-h-[120px] placeholder:text-muted-foreground/60 text-base"
            autoFocus
          />

          {/* Image previews */}
          {previewUrls.length > 0 && (
            <div className={`grid gap-2 mt-3 mb-3 ${previewUrls.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
              {previewUrls.map((src, index) => (
                <div key={index} className="relative group rounded-xl overflow-hidden aspect-square">
                  <img
                    src={src}
                    alt={`Selected ${index + 1}`}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                  <button
                    onClick={() => removeImage(index)}
                    className="absolute top-2 right-2 p-1.5 bg-black/60 hover:bg-black/80 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {isSubmitting && selectedFiles.length > 0 && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground mt-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Uploading images…
            </div>
          )}
          
          <div className="border-t border-border pt-4 flex items-center gap-4 relative">
            {/* Image button */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={selectedFiles.length >= 4}
              className="text-primary hover:bg-primary/10 p-2 rounded-full transition-colors disabled:opacity-40 relative"
              title={selectedFiles.length >= 4 ? 'Max 4 images' : 'Add photo'}
            >
              <ImageIcon className="w-6 h-6" />
              {selectedFiles.length > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-primary text-primary-foreground text-[10px] font-bold rounded-full flex items-center justify-center">
                  {selectedFiles.length}
                </span>
              )}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleImageSelect}
            />

            <button 
              type="button"
              onClick={() => setShowMoods(!showMoods)}
              className={`p-2 rounded-full transition-colors flex items-center gap-2 ${showMoods || selectedMood ? 'bg-primary/10 text-primary' : 'text-primary hover:bg-primary/10'}`}
            >
              <Smile className="w-6 h-6" />
            </button>

            <AnimatePresence>
              {showMoods && (
                <motion.div 
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  className="absolute top-14 left-0 bg-card border border-border rounded-2xl shadow-xl p-3 grid grid-cols-2 sm:grid-cols-4 gap-2 z-50 w-full max-w-sm"
                >
                  {MOODS.map(mood => (
                    <button
                      key={mood.label}
                      type="button"
                      onClick={() => {
                        setSelectedMood(mood);
                        setShowMoods(false);
                      }}
                      className="flex flex-col items-center gap-2 p-3 rounded-xl hover:bg-accent transition-colors"
                    >
                      <div className="transform scale-150">
                        {getMoodIconByLabel(mood.label)}
                      </div>
                      <span className="text-xs font-medium text-center">{mood.label}</span>
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </motion.div>
  );
};
