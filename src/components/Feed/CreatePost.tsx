import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';
import { MentionTextarea } from '../UI/MentionTextarea';
import { processMentions } from '../../lib/mentionUtils';
import { cn } from '../../lib/utils';
import { GifPicker } from '../UI/GifPicker';
import { 
  Image as ImageIcon, Smile, Send, Loader2,
  Angry, Leaf, Skull, Flame, Sparkles, Coffee, CloudRain, Rocket,
  BarChart2, HelpCircle, Gif, Plus, X, Check, ChevronRight
} from 'lucide-react';

interface CreatePostProps {
  onPostCreated?: () => void;
}

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

export const CreatePost: React.FC<CreatePostProps> = ({ onPostCreated }) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [text, setText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedMood, setSelectedMood] = useState<typeof MOODS[0] | null>(null);
  const [showMoods, setShowMoods] = useState(false);
  const [postMode, setPostMode] = useState<PostMode>('text');
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [selectedGif, setSelectedGif] = useState<string | null>(null);

  // Poll state
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState(['', '']);

  // Quiz state
  const [quizQuestion, setQuizQuestion] = useState('');
  const [quizOptions, setQuizOptions] = useState([
    { text: '', isCorrect: false },
    { text: '', isCorrect: false },
    { text: '', isCorrect: false },
    { text: '', isCorrect: false },
  ]);
  const [quizExplanation, setQuizExplanation] = useState('');

  const resetForm = () => {
    setText('');
    setSelectedMood(null);
    setPostMode('text');
    setSelectedGif(null);
    setPollQuestion('');
    setPollOptions(['', '']);
    setQuizQuestion('');
    setQuizOptions([
      { text: '', isCorrect: false },
      { text: '', isCorrect: false },
      { text: '', isCorrect: false },
      { text: '', isCorrect: false },
    ]);
    setQuizExplanation('');
  };

  const canSubmit = () => {
    if (postMode === 'text') return (text.trim() || selectedGif);
    if (postMode === 'gif') return !!selectedGif;
    if (postMode === 'poll') {
      return pollQuestion.trim() && pollOptions.filter(o => o.trim()).length >= 2;
    }
    if (postMode === 'quiz') {
      return quizQuestion.trim() &&
        quizOptions.filter(o => o.text.trim()).length >= 2 &&
        quizOptions.some(o => o.isCorrect);
    }
    return false;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !canSubmit()) return;

    setIsSubmitting(true);
    try {
      let postData: any = {
        userId: user.uid,
        username: user.username,
        userProfileImage: user.profileImage || null,
        mood: selectedMood ? { emoji: selectedMood.emoji, label: selectedMood.label } : null,
        likesCount: 0,
        commentsCount: 0,
        sharesCount: 0,
        tags: [],
        mentions: [],
        createdAt: new Date().toISOString(),
        serverCreatedAt: serverTimestamp(),
      };

      if (postMode === 'poll') {
        postData = {
          ...postData,
          type: 'poll',
          text: pollQuestion.trim(),
          pollQuestion: pollQuestion.trim(),
          pollOptions: pollOptions.filter(o => o.trim()).map((o, i) => ({
            id: `opt_${i}`,
            text: o.trim(),
            votes: 0,
            votedBy: [],
          })),
          pollExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          mediaUrls: [],
        };
      } else if (postMode === 'quiz') {
        postData = {
          ...postData,
          type: 'quiz',
          text: quizQuestion.trim(),
          quizQuestion: quizQuestion.trim(),
          quizOptions: quizOptions.filter(o => o.text.trim()).map((o, i) => ({
            id: `q_${i}`,
            text: o.text.trim(),
            isCorrect: o.isCorrect,
          })),
          quizExplanation: quizExplanation.trim() || null,
          mediaUrls: [],
        };
      } else if (selectedGif) {
        postData = {
          ...postData,
          type: 'gif',
          text: text.trim() || null,
          gifUrl: selectedGif,
          mediaUrls: [],
        };
      } else {
        postData = {
          ...postData,
          type: 'text',
          text: text.trim(),
          mediaUrls: [],
        };
      }

      const postRef = await addDoc(collection(db, 'posts'), postData);
      if (text.trim()) processMentions(text.trim(), 'post', postRef.id, user);

      resetForm();
      toast.success('Post shared successfully!');
      if (onPostCreated) onPostCreated();
    } catch (error) {
      console.error('Error creating post:', error);
      toast.error('Failed to share post');
    } finally {
      setIsSubmitting(false);
    }
  };

  const avatarSrc = user?.profileImage || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user?.username}`;

  const MODE_TABS: { key: PostMode; label: string; Icon: React.FC<any>; color: string }[] = [
    { key: 'text', label: 'Post', Icon: Send, color: 'text-primary' },
    { key: 'poll', label: 'Poll', Icon: BarChart2, color: 'text-blue-500' },
    { key: 'quiz', label: 'Quiz', Icon: HelpCircle, color: 'text-purple-500' },
    { key: 'gif', label: 'GIF', Icon: Gif, color: 'text-green-500' },
  ];

  return (
    <div className="p-4 border-b border-border">
      {/* Mode tabs */}
      <div className="flex gap-1 mb-3">
        {MODE_TABS.map(({ key, label, Icon, color }) => (
          <button
            key={key}
            type="button"
            onClick={() => { setPostMode(key); setSelectedGif(null); }}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all',
              postMode === key
                ? 'bg-primary/10 text-primary border border-primary/30'
                : 'text-muted-foreground hover:bg-accent border border-transparent'
            )}
          >
            <Icon className={cn('w-3.5 h-3.5', postMode === key ? 'text-primary' : color)} />
            {label}
          </button>
        ))}
      </div>

      <div className="flex gap-3">
        <img src={avatarSrc} alt="User" className="w-12 h-12 rounded-full object-cover bg-accent flex-shrink-0" />

        <form onSubmit={handleSubmit} className="flex-1 relative min-w-0">
          {selectedMood && (
            <div className="mb-2 inline-flex items-center gap-2 bg-accent/50 px-3 py-1.5 rounded-full text-sm font-medium border border-border/50">
              <selectedMood.Icon className={cn('w-4 h-4', selectedMood.color)} />
              <span>Feeling {selectedMood.label.toLowerCase()}</span>
              <button type="button" onClick={() => setSelectedMood(null)} className="ml-2 text-muted-foreground hover:text-foreground">×</button>
            </div>
          )}

          {/* TEXT MODE */}
          <AnimatePresence mode="wait">
            {(postMode === 'text') && (
              <motion.div key="text" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <MentionTextarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={selectedMood ? `Why are you feeling ${selectedMood.label.toLowerCase()}?` : "What's happening? Type @ to mention"}
                  className="w-full bg-transparent border-none focus:ring-0 text-xl min-h-[100px] placeholder:text-muted-foreground text-base"
                />
                {selectedGif && (
                  <div className="relative mt-2 rounded-xl overflow-hidden border border-border inline-block">
                    <img src={selectedGif} alt="Selected GIF" className="max-h-48 rounded-xl" />
                    <button
                      type="button"
                      onClick={() => setSelectedGif(null)}
                      className="absolute top-2 right-2 bg-black/60 rounded-full p-1 text-white hover:bg-black/80"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </motion.div>
            )}

            {/* GIF MODE */}
            {postMode === 'gif' && (
              <motion.div key="gif" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <input
                  value={text}
                  onChange={e => setText(e.target.value)}
                  placeholder="Add a caption (optional)..."
                  className="w-full bg-transparent border-none focus:outline-none text-base placeholder:text-muted-foreground mb-2"
                />
                {selectedGif ? (
                  <div className="relative rounded-xl overflow-hidden border border-border inline-block">
                    <img src={selectedGif} alt="Selected GIF" className="max-h-56 rounded-xl" />
                    <button
                      type="button"
                      onClick={() => setSelectedGif(null)}
                      className="absolute top-2 right-2 bg-black/60 rounded-full p-1 text-white hover:bg-black/80"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowGifPicker(true)}
                    className="w-full border-2 border-dashed border-border rounded-xl py-8 text-muted-foreground hover:border-primary hover:text-primary transition-colors flex flex-col items-center gap-2"
                  >
                    <Gif className="w-8 h-8" />
                    <span className="text-sm font-medium">Pick a GIF</span>
                  </button>
                )}
              </motion.div>
            )}

            {/* POLL MODE */}
            {postMode === 'poll' && (
              <motion.div key="poll" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-3">
                <div className="flex items-center gap-2 text-blue-500 font-semibold text-sm">
                  <BarChart2 className="w-4 h-4" />
                  Create a Poll
                </div>
                <input
                  value={pollQuestion}
                  onChange={e => setPollQuestion(e.target.value)}
                  placeholder="Ask a question..."
                  className="w-full bg-accent/40 border border-border rounded-xl px-4 py-3 text-base font-medium placeholder:text-muted-foreground focus:outline-none focus:border-primary"
                  maxLength={200}
                />
                <div className="space-y-2">
                  {pollOptions.map((opt, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-xs font-bold text-blue-500 flex-shrink-0">
                        {String.fromCharCode(65 + i)}
                      </div>
                      <input
                        value={opt}
                        onChange={e => {
                          const updated = [...pollOptions];
                          updated[i] = e.target.value;
                          setPollOptions(updated);
                        }}
                        placeholder={`Option ${String.fromCharCode(65 + i)}`}
                        className="flex-1 bg-accent/40 border border-border rounded-xl px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:border-blue-500"
                        maxLength={80}
                      />
                      {pollOptions.length > 2 && (
                        <button
                          type="button"
                          onClick={() => setPollOptions(pollOptions.filter((_, idx) => idx !== i))}
                          className="p-1 text-muted-foreground hover:text-destructive"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                {pollOptions.length < 6 && (
                  <button
                    type="button"
                    onClick={() => setPollOptions([...pollOptions, ''])}
                    className="flex items-center gap-1.5 text-sm text-blue-500 hover:text-blue-600 font-medium"
                  >
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
                  <HelpCircle className="w-4 h-4" />
                  Create a Quiz
                </div>
                <input
                  value={quizQuestion}
                  onChange={e => setQuizQuestion(e.target.value)}
                  placeholder="What's the question?"
                  className="w-full bg-accent/40 border border-border rounded-xl px-4 py-3 text-base font-medium placeholder:text-muted-foreground focus:outline-none focus:border-primary"
                  maxLength={200}
                />
                <p className="text-xs text-muted-foreground">Tap ✓ to mark the correct answer</p>
                <div className="space-y-2">
                  {quizOptions.map((opt, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setQuizOptions(quizOptions.map((o, idx) => ({ ...o, isCorrect: idx === i })))}
                        className={cn(
                          'w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all',
                          opt.isCorrect
                            ? 'bg-green-500 border-green-500 text-white'
                            : 'border-border text-transparent hover:border-green-500'
                        )}
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <input
                        value={opt.text}
                        onChange={e => {
                          const updated = [...quizOptions];
                          updated[i] = { ...updated[i], text: e.target.value };
                          setQuizOptions(updated);
                        }}
                        placeholder={`Option ${i + 1}`}
                        className={cn(
                          'flex-1 bg-accent/40 border rounded-xl px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none transition-colors',
                          opt.isCorrect ? 'border-green-500/50 bg-green-500/5' : 'border-border focus:border-purple-500'
                        )}
                        maxLength={120}
                      />
                    </div>
                  ))}
                </div>
                <input
                  value={quizExplanation}
                  onChange={e => setQuizExplanation(e.target.value)}
                  placeholder="Explanation for the answer (optional)..."
                  className="w-full bg-accent/40 border border-border rounded-xl px-4 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:border-purple-500"
                  maxLength={300}
                />
              </motion.div>
            )}
          </AnimatePresence>

          {/* GIF Picker popover */}
          <div className="relative">
            <AnimatePresence>
              {showGifPicker && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="absolute bottom-full mb-2 left-0 w-full z-50"
                >
                  <GifPicker
                    onSelect={(url) => {
                      setSelectedGif(url);
                      setShowGifPicker(false);
                    }}
                    onClose={() => setShowGifPicker(false)}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Bottom bar */}
          <div className="flex items-center justify-between pt-3 border-t border-border mt-3 relative">
            <div className="flex items-center gap-1">
              {postMode === 'text' && (
                <>
                  <button type="button" onClick={() => navigate('/create')} className="p-2 text-primary hover:bg-primary/10 rounded-full transition-colors" title="Add photo">
                    <ImageIcon className="w-5 h-5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowGifPicker(!showGifPicker)}
                    className={cn('p-2 rounded-full transition-colors', showGifPicker || selectedGif ? 'bg-green-500/10 text-green-500' : 'text-primary hover:bg-primary/10')}
                    title="Add GIF"
                  >
                    <Gif className="w-5 h-5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowMoods(!showMoods)}
                    className={cn('p-2 rounded-full transition-colors', showMoods || selectedMood ? 'bg-primary/10 text-primary' : 'text-primary hover:bg-primary/10')}
                  >
                    <Smile className="w-5 h-5" />
                  </button>
                </>
              )}
              {postMode === 'gif' && selectedGif && (
                <button
                  type="button"
                  onClick={() => setShowGifPicker(true)}
                  className="p-2 text-green-500 hover:bg-green-500/10 rounded-full transition-colors text-xs font-medium"
                >
                  Change GIF
                </button>
              )}
            </div>

            {/* Mood picker */}
            <AnimatePresence>
              {showMoods && (
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  className="absolute top-12 left-0 bg-card border border-border rounded-2xl shadow-xl p-3 grid grid-cols-4 gap-2 z-50 w-full max-w-sm"
                >
                  {MOODS.map(mood => (
                    <button
                      key={mood.label}
                      type="button"
                      onClick={() => { setSelectedMood(mood); setShowMoods(false); }}
                      className="flex flex-col items-center gap-2 p-3 rounded-xl hover:bg-accent transition-colors"
                    >
                      <div className="transform scale-150">
                        <mood.Icon className={cn('w-5 h-5', mood.color)} />
                      </div>
                      <span className="text-xs font-medium text-center mt-1">{mood.label}</span>
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>

            <button
              type="submit"
              disabled={!canSubmit() || isSubmitting}
              className="bg-primary text-primary-foreground px-6 py-2 rounded-full font-bold disabled:opacity-50 hover:opacity-90 transition-all flex items-center gap-2"
            >
              {isSubmitting ? 'Posting...' : (
                <>
                  <span>Post</span>
                  <ChevronRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
