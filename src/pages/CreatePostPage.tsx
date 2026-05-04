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
import { MentionTextarea } from '../components/UI/MentionTextarea';
import { processMentions } from '../lib/mentionUtils';
import { cn } from '../lib/utils';
import { GifPicker } from '../components/UI/GifPicker';
import {
  ChevronLeft, Image as ImageIcon, Loader2, Smile, X, Send,
  Angry, Leaf, Skull, Flame, Sparkles, Coffee, CloudRain, Rocket,
  BarChart2, HelpCircle, FileImage, Plus, Check,
} from 'lucide-react';

const MOODS = [
  { emoji: '😤', label: 'Frustrated', Icon: Angry, color: '' },
  { emoji: '😌', label: 'Peaceful', Icon: Leaf, color: '' },
  { emoji: '💀', label: 'Dead inside', Icon: Skull, color: '' },
  { emoji: '🔥', label: 'Hyped', Icon: Flame, color: 'text-orange-500' },
  { emoji: '✨', label: 'Feeling cute', Icon: Sparkles, color: 'text-yellow-500' },
  { emoji: '☕', label: 'Need coffee', Icon: Coffee, color: 'text-amber-700' },
  { emoji: '😭', label: 'Crying', Icon: CloudRain, color: 'text-blue-500' },
  { emoji: '🚀', label: 'Productive', Icon: Rocket, color: 'text-purple-500' },
];

type PostMode = 'text' | 'poll' | 'quiz' | 'gif';

const MODE_TABS: { key: PostMode; label: string; Icon: React.FC<any>; activeClass: string; iconClass: string }[] = [
  { key: 'text', label: 'Post',  Icon: Send,       activeClass: 'bg-primary text-primary-foreground',  iconClass: 'text-primary' },
  { key: 'poll', label: 'Poll',  Icon: BarChart2,  activeClass: 'bg-blue-500 text-white',              iconClass: 'text-blue-500' },
  { key: 'quiz', label: 'Quiz',  Icon: HelpCircle, activeClass: 'bg-purple-500 text-white',            iconClass: 'text-purple-500' },
  { key: 'gif',  label: 'GIF',   Icon: FileImage,  activeClass: 'bg-green-500 text-white',             iconClass: 'text-green-500' },
];

export const CreatePostPage: React.FC = () => {
  usePageTitle('New Post');
  const { user } = useAuth();
  const navigate = useNavigate();

  const [postMode, setPostMode] = useState<PostMode>('text');
  const [text, setText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedMood, setSelectedMood] = useState<typeof MOODS[0] | null>(null);
  const [showMoods, setShowMoods] = useState(false);

  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedGif, setSelectedGif] = useState<string | null>(null);
  const [showGifPicker, setShowGifPicker] = useState(false);

  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState(['', '']);

  const [quizQuestion, setQuizQuestion] = useState('');
  const [quizOptions, setQuizOptions] = useState([
    { text: '', isCorrect: false },
    { text: '', isCorrect: false },
    { text: '', isCorrect: false },
    { text: '', isCorrect: false },
  ]);
  const [quizExplanation, setQuizExplanation] = useState('');

  const resetForm = () => {
    setText(''); setSelectedMood(null); setPostMode('text'); setSelectedGif(null);
    setSelectedFiles([]); setPreviewUrls([]);
    setPollQuestion(''); setPollOptions(['', '']);
    setQuizQuestion('');
    setQuizOptions([{ text: '', isCorrect: false }, { text: '', isCorrect: false }, { text: '', isCorrect: false }, { text: '', isCorrect: false }]);
    setQuizExplanation('');
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const remaining = 4 - selectedFiles.length;
    const toProcess = files.slice(0, remaining);
    if (files.length > remaining) toast.info(`Only ${remaining} more image(s) can be added`);
    const valid = toProcess.filter(f => f.size <= 10 * 1024 * 1024);
    setSelectedFiles(prev => [...prev, ...valid]);
    setPreviewUrls(prev => [...prev, ...valid.map(f => URL.createObjectURL(f))]);
    e.target.value = '';
  };

  const removeImage = (index: number) => {
    URL.revokeObjectURL(previewUrls[index]);
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
    setPreviewUrls(prev => prev.filter((_, i) => i !== index));
  };

  const canPost = () => {
    if (isSubmitting) return false;
    if (postMode === 'text') return text.trim().length > 0 || selectedFiles.length > 0;
    if (postMode === 'gif') return !!selectedGif;
    if (postMode === 'poll') return pollQuestion.trim().length > 0 && pollOptions.filter(o => o.trim()).length >= 2;
    if (postMode === 'quiz') return quizQuestion.trim().length > 0 && quizOptions.filter(o => o.text.trim()).length >= 2 && quizOptions.some(o => o.isCorrect);
    return false;
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!user || !canPost()) return;
    setIsSubmitting(true);
    try {
      const base = {
        userId: user.uid, username: user.username,
        userProfileImage: user.profileImage || null,
        mood: selectedMood ? { emoji: selectedMood.emoji, label: selectedMood.label } : null,
        likesCount: 0, commentsCount: 0, sharesCount: 0,
        tags: [], mentions: [],
        createdAt: new Date().toISOString(), serverCreatedAt: serverTimestamp(),
      };

      let postData: any;

      if (postMode === 'poll') {
        postData = { ...base, type: 'poll', text: pollQuestion.trim(), pollQuestion: pollQuestion.trim(),
          pollOptions: pollOptions.filter(o => o.trim()).map((o, i) => ({ id: `opt_${i}`, text: o.trim(), votes: 0, votedBy: [] })),
          pollExpiresAt: new Date(Date.now() + 86400000).toISOString(), mediaUrls: [] };
      } else if (postMode === 'quiz') {
        postData = { ...base, type: 'quiz', text: quizQuestion.trim(), quizQuestion: quizQuestion.trim(),
          quizOptions: quizOptions.filter(o => o.text.trim()).map((o, i) => ({ id: `q_${i}`, text: o.text.trim(), isCorrect: o.isCorrect })),
          quizExplanation: quizExplanation.trim() || null, mediaUrls: [] };
      } else if (postMode === 'gif') {
        postData = { ...base, type: 'gif', text: text.trim() || null, gifUrl: selectedGif, mediaUrls: [] };
      } else {
        const mediaUrls: string[] = await Promise.all(
          selectedFiles.map(async (file) => {
            const compressed = await imageCompression(file, { maxSizeMB: 1, maxWidthOrHeight: 1920, useWebWorker: true });
            const storageRef = ref(storage, `posts/${user.uid}/${Date.now()}_${file.name}`);
            await uploadBytes(storageRef, compressed);
            return getDownloadURL(storageRef);
          })
        );
        postData = { ...base, type: mediaUrls.length > 0 ? 'image' : 'text', text: text.trim(), mediaUrls };
        previewUrls.forEach(url => URL.revokeObjectURL(url));
      }

      const postRef = await addDoc(collection(db, 'posts'), postData);
      if (text.trim()) processMentions(text.trim(), 'post', postRef.id, user);
      toast.success('Post shared successfully!');
      resetForm();
      navigate('/');
    } catch (error) {
      console.error('Error creating post:', error);
      toast.error('Failed to share post');
    } finally {
      setIsSubmitting(false);
    }
  };

  const avatarSrc = user?.profileImage || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user?.username}`;

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
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
          onClick={() => handleSubmit()}
          disabled={!canPost()}
          className="bg-primary text-primary-foreground px-6 py-1.5 rounded-full font-bold hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-2"
        >
          {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
          Post
        </button>
      </header>

      <div className="p-4">
        {/* Mode Tabs */}
        <div className="mb-4">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">Post type</p>
          <div className="flex gap-2 flex-wrap">
            {MODE_TABS.map(({ key, label, Icon, activeClass, iconClass }) => (
              <button
                key={key}
                type="button"
                onClick={() => { setPostMode(key); setSelectedGif(null); }}
                className={cn(
                  'flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold transition-all border',
                  postMode === key
                    ? activeClass + ' border-transparent scale-105 shadow-sm'
                    : 'text-muted-foreground bg-accent/50 border-border hover:bg-accent'
                )}
              >
                <Icon className={cn('w-4 h-4', postMode === key ? 'opacity-90' : iconClass)} />
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-4">
          <img src={avatarSrc} alt="Profile" className="w-12 h-12 rounded-full object-cover flex-shrink-0 bg-accent" />

          <div className="flex-1 relative min-w-0">
            {selectedMood && (
              <div className="mb-2 inline-flex items-center gap-2 bg-accent/50 px-3 py-1.5 rounded-full text-sm font-medium border border-border/50">
                <selectedMood.Icon className={cn('w-4 h-4', selectedMood.color)} />
                <span>Feeling {selectedMood.label.toLowerCase()}</span>
                <button onClick={() => setSelectedMood(null)} className="ml-2 hover:text-foreground text-muted-foreground">×</button>
              </div>
            )}

            <AnimatePresence mode="wait">
              {/* TEXT MODE */}
              {postMode === 'text' && (
                <motion.div key="text" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <MentionTextarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder={selectedMood ? `Why are you feeling ${selectedMood.label.toLowerCase()}?` : "What's happening? Type @ to mention"}
                    className="w-full bg-transparent text-xl min-h-[120px] placeholder:text-muted-foreground/60 text-base"
                    autoFocus
                  />
                  {previewUrls.length > 0 && (
                    <div className={cn('grid gap-2 mt-3 mb-3', previewUrls.length === 1 ? 'grid-cols-1' : 'grid-cols-2')}>
                      {previewUrls.map((src, index) => (
                        <div key={index} className="relative group rounded-xl overflow-hidden aspect-square">
                          <img src={src} className="w-full h-full object-cover" loading="lazy" alt="" />
                          <button onClick={() => removeImage(index)} className="absolute top-2 right-2 p-1.5 bg-black/60 hover:bg-black/80 text-white rounded-full">
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  {isSubmitting && selectedFiles.length > 0 && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mt-2">
                      <Loader2 className="w-4 h-4 animate-spin" /> Uploading images…
                    </div>
                  )}
                  <div className="border-t border-border pt-4 flex items-center gap-4 relative mt-3">
                    <button type="button" onClick={() => fileInputRef.current?.click()} disabled={selectedFiles.length >= 4}
                      className="text-primary hover:bg-primary/10 p-2 rounded-full transition-colors disabled:opacity-40" title="Add photo">
                      <ImageIcon className="w-6 h-6" />
                    </button>
                    <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleImageSelect} />
                    <button type="button" onClick={() => setShowMoods(!showMoods)}
                      className={cn('p-2 rounded-full transition-colors', showMoods || selectedMood ? 'bg-primary/10 text-primary' : 'text-primary hover:bg-primary/10')}>
                      <Smile className="w-6 h-6" />
                    </button>
                    <AnimatePresence>
                      {showMoods && (
                        <motion.div initial={{ opacity: 0, y: 10, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: 0.95 }}
                          className="absolute top-14 left-0 bg-card border border-border rounded-2xl shadow-xl p-3 grid grid-cols-2 sm:grid-cols-4 gap-2 z-50 w-full max-w-sm">
                          {MOODS.map(mood => (
                            <button key={mood.label} type="button" onClick={() => { setSelectedMood(mood); setShowMoods(false); }}
                              className="flex flex-col items-center gap-2 p-3 rounded-xl hover:bg-accent transition-colors">
                              <div className="transform scale-150"><mood.Icon className={cn('w-5 h-5', mood.color)} /></div>
                              <span className="text-xs font-medium text-center mt-1">{mood.label}</span>
                            </button>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </motion.div>
              )}

              {/* GIF MODE */}
              {postMode === 'gif' && (
                <motion.div key="gif" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <input value={text} onChange={e => setText(e.target.value)} placeholder="Add a caption (optional)..."
                    className="w-full bg-transparent border-none focus:outline-none text-base placeholder:text-muted-foreground mb-3" />
                  {selectedGif ? (
                    <div className="relative rounded-xl overflow-hidden border border-border inline-block">
                      <img src={selectedGif} alt="Selected GIF" className="max-h-56 rounded-xl" />
                      <button type="button" onClick={() => setSelectedGif(null)}
                        className="absolute top-2 right-2 bg-black/60 rounded-full p-1 text-white hover:bg-black/80">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <button type="button" onClick={() => setShowGifPicker(true)}
                      className="w-full border-2 border-dashed border-border rounded-xl py-10 text-muted-foreground hover:border-green-500 hover:text-green-500 transition-colors flex flex-col items-center gap-2">
                      <FileImage className="w-8 h-8" />
                      <span className="text-sm font-medium">Pick a GIF</span>
                    </button>
                  )}
                  {selectedGif && (
                    <button type="button" onClick={() => setShowGifPicker(true)} className="mt-2 text-sm text-green-500 hover:text-green-600 font-medium">
                      Change GIF
                    </button>
                  )}
                  <AnimatePresence>
                    {showGifPicker && (
                      <GifPicker onSelect={(url) => { setSelectedGif(url); setShowGifPicker(false); }} onClose={() => setShowGifPicker(false)} />
                    )}
                  </AnimatePresence>
                </motion.div>
              )}

              {/* POLL MODE */}
              {postMode === 'poll' && (
                <motion.div key="poll" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-3">
                  <div className="flex items-center gap-2 text-blue-500 font-semibold text-sm">
                    <BarChart2 className="w-4 h-4" /> Create a Poll
                  </div>
                  <input value={pollQuestion} onChange={e => setPollQuestion(e.target.value)} placeholder="Ask a question..." autoFocus
                    className="w-full bg-accent/40 border border-border rounded-xl px-4 py-3 text-base font-medium placeholder:text-muted-foreground focus:outline-none focus:border-blue-500" maxLength={200} />
                  <div className="space-y-2">
                    {pollOptions.map((opt, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-xs font-bold text-blue-500 flex-shrink-0">
                          {String.fromCharCode(65 + i)}
                        </div>
                        <input value={opt} onChange={e => { const u = [...pollOptions]; u[i] = e.target.value; setPollOptions(u); }}
                          placeholder={`Option ${String.fromCharCode(65 + i)}`} maxLength={80}
                          className="flex-1 bg-accent/40 border border-border rounded-xl px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:border-blue-500" />
                        {pollOptions.length > 2 && (
                          <button type="button" onClick={() => setPollOptions(pollOptions.filter((_, idx) => idx !== i))} className="p-1 text-muted-foreground hover:text-destructive">
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  {pollOptions.length < 6 && (
                    <button type="button" onClick={() => setPollOptions([...pollOptions, ''])} className="flex items-center gap-1.5 text-sm text-blue-500 hover:text-blue-600 font-medium">
                      <Plus className="w-4 h-4" /> Add option
                    </button>
                  )}
                  <p className="text-xs text-muted-foreground">Poll expires in 24 hours</p>
                </motion.div>
              )}

              {/* QUIZ MODE */}
              {postMode === 'quiz' && (
                <motion.div key="quiz" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-3">
                  <div className="flex items-center gap-2 text-purple-500 font-semibold text-sm">
                    <HelpCircle className="w-4 h-4" /> Create a Quiz
                  </div>
                  <input value={quizQuestion} onChange={e => setQuizQuestion(e.target.value)} placeholder="What's the question?" autoFocus
                    className="w-full bg-accent/40 border border-border rounded-xl px-4 py-3 text-base font-medium placeholder:text-muted-foreground focus:outline-none focus:border-purple-500" maxLength={200} />
                  <p className="text-xs text-muted-foreground">Tap ✓ to mark the correct answer</p>
                  <div className="space-y-2">
                    {quizOptions.map((opt, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <button type="button" onClick={() => setQuizOptions(quizOptions.map((o, idx) => ({ ...o, isCorrect: idx === i })))}
                          className={cn('w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all',
                            opt.isCorrect ? 'bg-green-500 border-green-500 text-white' : 'border-border text-transparent hover:border-green-500')}>
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <input value={opt.text} onChange={e => { const u = [...quizOptions]; u[i] = { ...u[i], text: e.target.value }; setQuizOptions(u); }}
                          placeholder={`Option ${i + 1}`} maxLength={120}
                          className={cn('flex-1 bg-accent/40 border rounded-xl px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none transition-colors',
                            opt.isCorrect ? 'border-green-500/50 bg-green-500/5' : 'border-border focus:border-purple-500')} />
                      </div>
                    ))}
                  </div>
                  <input value={quizExplanation} onChange={e => setQuizExplanation(e.target.value)} placeholder="Explanation for the answer (optional)..." maxLength={300}
                    className="w-full bg-accent/40 border border-border rounded-xl px-4 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:border-purple-500" />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </motion.div>
  );
};
