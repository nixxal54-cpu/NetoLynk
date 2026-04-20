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
import { 
  Image as ImageIcon, Smile, Send, Loader2,
  Angry, Leaf, Skull, Flame, Sparkles, Coffee, CloudRain, Rocket
} from 'lucide-react';

interface CreatePostProps {
  onPostCreated?: () => void;
}

// 1. Embed SVGs directly to avoid import errors
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

export const CreatePost: React.FC<CreatePostProps> = ({ onPostCreated }) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [text, setText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedMood, setSelectedMood] = useState<typeof MOODS[0] | null>(null);
  const [showMoods, setShowMoods] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || !user) return;

    setIsSubmitting(true);
    try {
      const postRef = await addDoc(collection(db, 'posts'), {
        userId: user.uid,
        username: user.username,
        userProfileImage: user.profileImage || null,
        text: text.trim(),
        mediaUrls: [],
        type: 'text',
        // Strip out the Icon component before saving to Firestore
        mood: selectedMood ? { emoji: selectedMood.emoji, label: selectedMood.label } : null,
        likesCount: 0,
        commentsCount: 0,
        sharesCount: 0,
        tags: [],
        mentions: [],
        createdAt: new Date().toISOString(),
        serverCreatedAt: serverTimestamp()
      });

      // Fire and forget mentions processing
      processMentions(text.trim(), 'post', postRef.id, user);

      setText('');
      setSelectedMood(null);
      toast.success('Post shared successfully!');
      if (onPostCreated) onPostCreated();
    } catch (error) {
      console.error("Error creating post:", error);
      toast.error('Failed to share post');
    } finally {
      setIsSubmitting(false);
    }
  };

  const avatarSrc = user?.profileImage || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user?.username}`;

  return (
    <div className="p-4 border-b border-border">
      <div className="flex gap-3">
        <img 
          src={avatarSrc} 
          alt="User" 
          className="w-12 h-12 rounded-full object-cover bg-accent"
        />
        <form onSubmit={handleSubmit} className="flex-1 relative">
          {selectedMood && (
            <div className="mb-2 inline-flex items-center gap-2 bg-accent/50 px-3 py-1.5 rounded-full text-sm font-medium border border-border/50">
              <selectedMood.Icon className={cn("w-4 h-4", selectedMood.color)} />
              <span>Feeling {selectedMood.label.toLowerCase()}</span>
              <button 
                type="button"
                onClick={() => setSelectedMood(null)}
                className="ml-2 text-muted-foreground hover:text-foreground"
              >
                ×
              </button>
            </div>
          )}
          
          <MentionTextarea
            value={text}
            onValueChange={setText}
            placeholder={selectedMood ? `Why are you feeling ${selectedMood.label.toLowerCase()}?` : "What's happening? Type @ to mention"}
            className="w-full bg-transparent border-none focus:ring-0 text-xl min-h-[100px] placeholder:text-muted-foreground text-base"
          />
          
          <div className="flex items-center justify-between pt-3 border-t border-border relative">
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => navigate('/create')} className="p-2 text-primary hover:bg-primary/10 rounded-full transition-colors" title="Add photo">
                <ImageIcon className="w-5 h-5" />
              </button>
              <button 
                type="button" 
                onClick={() => setShowMoods(!showMoods)}
                className={cn("p-2 rounded-full transition-colors", showMoods || selectedMood ? "bg-primary/10 text-primary" : "text-primary hover:bg-primary/10")}
              >
                <Smile className="w-5 h-5" />
              </button>
            </div>

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
                      onClick={() => {
                        setSelectedMood(mood);
                        setShowMoods(false);
                      }}
                      className="flex flex-col items-center gap-2 p-3 rounded-xl hover:bg-accent transition-colors"
                    >
                      <div className="transform scale-150">
                        <mood.Icon className={cn("w-5 h-5", mood.color)} />
                      </div>
                      <span className="text-xs font-medium text-center mt-1">{mood.label}</span>
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
            
            <button
              type="submit"
              disabled={!text.trim() || isSubmitting}
              className="bg-primary text-primary-foreground px-6 py-2 rounded-full font-bold disabled:opacity-50 hover:opacity-90 transition-all flex items-center gap-2"
            >
              {isSubmitting ? 'Posting...' : (
                <>
                  <span>Post</span>
                  <Send className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
