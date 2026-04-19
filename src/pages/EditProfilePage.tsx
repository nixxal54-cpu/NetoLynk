import { usePageTitle } from '../hooks/usePageTitle';
import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { db, storage } from '../lib/firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { toast } from 'sonner';
import { motion } from 'motion/react';
import { ChevronLeft, Camera, Loader2 } from 'lucide-react';

export const EditProfilePage: React.FC = () => {
  usePageTitle('Edit Profile');
  const { user } = useAuth();
  const navigate = useNavigate();
  
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [profileImage, setProfileImage] = useState(user?.profileImage || '');
  const [coverImage, setCoverImage] = useState(user?.coverImage || '');
  const [loading, setLoading] = useState(false);
  const [uploadingProfile, setUploadingProfile] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);

  const profileInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  if (!user) return null;

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'profile' | 'cover') => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Basic validation
    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image size should be less than 5MB');
      return;
    }

    const setUploading = type === 'profile' ? setUploadingProfile : setUploadingCover;
    const setImage = type === 'profile' ? setProfileImage : setCoverImage;
    
    setUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.uid}_${type}_${Date.now()}.${fileExt}`;
      const storageRef = ref(storage, `users/${user.uid}/${fileName}`);
      
      await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(storageRef);
      
      setImage(downloadURL);
      toast.success(`${type === 'profile' ? 'Profile' : 'Cover'} image uploaded!`);
    } catch (error) {
      console.error(`Error uploading ${type} image:`, error);
      toast.error(`Failed to upload ${type} image`);
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, {
        displayName,
        bio,
        profileImage,
        coverImage,
        updatedAt: new Date().toISOString()
      });
      toast.success('Profile updated successfully!');
      navigate(`/profile/${user.username}`);
    } catch (error) {
      console.error("Error updating profile:", error);
      toast.error('Failed to update profile');
    } finally {
      setLoading(false);
    }
  };

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
          <h2 className="text-xl font-bold">Edit Profile</h2>
        </div>
        <button
          onClick={handleSubmit}
          disabled={loading || uploadingProfile || uploadingCover}
          className="bg-foreground text-background px-6 py-1.5 rounded-full font-bold hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-2"
        >
          {loading && <Loader2 className="w-4 h-4 animate-spin" />}
          Save
        </button>
      </header>

      <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-0 pb-20">
        <div 
          className="relative h-48 bg-accent/50 group cursor-pointer"
          onClick={() => coverInputRef.current?.click()}
        >
          {coverImage && <img src={coverImage} alt="Cover" className="w-full h-full object-cover opacity-70" />}
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/20">
            {uploadingCover ? <Loader2 className="w-8 h-8 text-white animate-spin" /> : <Camera className="w-8 h-8 text-white" />}
          </div>
          <input 
            type="file" 
            ref={coverInputRef}
            onChange={(e) => handleImageUpload(e, 'cover')}
            accept="image/*"
            className="hidden"
          />
        </div>

        <div className="px-4 relative">
          <div 
            className="absolute -top-16 left-4 w-32 h-32 rounded-full border-4 border-background overflow-hidden bg-accent group cursor-pointer"
            onClick={() => profileInputRef.current?.click()}
          >
            <img src={profileImage || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.username}`} alt="Profile" className="w-full h-full object-cover opacity-70" />
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/20">
              {uploadingProfile ? <Loader2 className="w-6 h-6 text-white animate-spin" /> : <Camera className="w-6 h-6 text-white" />}
            </div>
            <input 
              type="file" 
              ref={profileInputRef}
              onChange={(e) => handleImageUpload(e, 'profile')}
              accept="image/*"
              className="hidden"
            />
          </div>
          <div className="pt-20 space-y-6 pb-6 max-w-lg">
            <div>
              <label className="text-sm font-medium text-muted-foreground ml-1">Name</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full mt-1 px-4 py-3 rounded-xl bg-accent/30 border border-border focus:border-primary outline-none transition-all text-base"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground ml-1">Bio</label>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                rows={4}
                className="w-full mt-1 px-4 py-3 rounded-xl bg-accent/30 border border-border focus:border-primary outline-none transition-all resize-none text-base"
                placeholder="Tell us about yourself..."
              />
            </div>
          </div>
        </div>
      </form>
    </motion.div>
  );
};
