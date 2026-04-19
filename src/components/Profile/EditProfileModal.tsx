import React, { useState, useRef } from 'react';
import { X, Camera, Loader2 } from 'lucide-react';
import { doc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { updateProfile } from 'firebase/auth';
import { db, storage, auth } from '../../lib/firebase';
import { User } from '../../types';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';

interface EditProfileModalProps {
  user: User;
  isOpen: boolean;
  onClose: () => void;
}

export const EditProfileModal: React.FC<EditProfileModalProps> = ({ user, isOpen, onClose }) => {
  const [displayName, setDisplayName] = useState(user.displayName);
  const [bio, setBio] = useState(user.bio || '');
  const [profilePreview, setProfilePreview] = useState(user.profileImage || '');
  const [coverPreview, setCoverPreview] = useState(user.coverImage || '');
  const [profileFile, setProfileFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);

  const profileInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  const handleProfilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setProfileFile(file);
    setProfilePreview(URL.createObjectURL(file));
  };

  const handleCoverPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCoverFile(file);
    setCoverPreview(URL.createObjectURL(file));
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      let finalProfileImage = user.profileImage || '';
      let finalCoverImage = user.coverImage || '';

      // Upload profile image to Firebase Storage
      if (profileFile) {
        const storageRef = ref(storage, `profileImages/${user.uid}`);
        await uploadBytes(storageRef, profileFile);
        finalProfileImage = await getDownloadURL(storageRef);
      }

      // Upload cover image to Firebase Storage
      if (coverFile) {
        const storageRef = ref(storage, `coverImages/${user.uid}`);
        await uploadBytes(storageRef, coverFile);
        finalCoverImage = await getDownloadURL(storageRef);
      }

      // Update Firestore user document
      await updateDoc(doc(db, 'users', user.uid), {
        displayName,
        bio,
        profileImage: finalProfileImage,
        coverImage: finalCoverImage,
        updatedAt: new Date().toISOString(),
      });

      // Keep Firebase Auth profile in sync
      if (auth.currentUser) {
        await updateProfile(auth.currentUser, {
          displayName,
          photoURL: finalProfileImage,
        });
      }

      toast.success('Profile updated!');
      onClose();
    } catch (error: unknown) {
      console.error('Error updating profile:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to update profile');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 16 }}
            transition={{ duration: 0.2 }}
            className="bg-background w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
              <div className="flex items-center gap-3">
                <button onClick={onClose} className="p-2 hover:bg-accent rounded-full transition-colors">
                  <X className="w-5 h-5" />
                </button>
                <h3 className="font-bold text-lg">Edit Profile</h3>
              </div>
              <button onClick={handleSave} disabled={loading}
                className="bg-foreground text-background px-5 py-1.5 rounded-full font-bold text-sm hover:opacity-80 transition-opacity disabled:opacity-40 flex items-center gap-2">
                {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Save
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {/* Cover photo */}
              <div
                className="relative h-32 bg-accent/50 cursor-pointer group"
                onClick={() => coverInputRef.current?.click()}
              >
                {coverPreview
                  ? <img src={coverPreview} alt="Cover" className="w-full h-full object-cover" />
                  : <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm">Tap to add cover photo</div>
                }
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <Camera className="w-7 h-7 text-white" />
                </div>
                <input ref={coverInputRef} type="file" accept="image/*" onChange={handleCoverPick} className="hidden" />
              </div>

              {/* Profile photo + fields */}
              <div className="px-4 pb-6">
                {/* Profile photo circle */}
                <div
                  className="relative w-24 h-24 rounded-full border-4 border-background -mt-12 mb-4 cursor-pointer group overflow-hidden bg-accent"
                  onClick={() => profileInputRef.current?.click()}
                >
                  <img
                    src={profilePreview || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.username}`}
                    alt="Profile" className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-full">
                    <Camera className="w-6 h-6 text-white" />
                  </div>
                  <input ref={profileInputRef} type="file" accept="image/*" onChange={handleProfilePick} className="hidden" />
                </div>

                {(profileFile || coverFile) && (
                  <div className="text-xs text-primary font-medium mb-4 flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                    {[profileFile && 'Profile photo', coverFile && 'Cover photo'].filter(Boolean).join(' & ')} ready to save
                  </div>
                )}

                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider ml-0.5">Name</label>
                    <input type="text" value={displayName} onChange={e => setDisplayName(e.target.value)}
                      className="w-full mt-1.5 px-4 py-2.5 rounded-xl bg-accent/40 border border-border focus:border-primary outline-none transition-colors" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider ml-0.5">Bio</label>
                    <textarea value={bio} onChange={e => setBio(e.target.value)} rows={3}
                      className="w-full mt-1.5 px-4 py-2.5 rounded-xl bg-accent/40 border border-border focus:border-primary outline-none transition-colors resize-none"
                      placeholder="Tell people about yourself..." />
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
