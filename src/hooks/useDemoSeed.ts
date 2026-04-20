import { useEffect } from 'react';
import { collection, doc, getDoc, setDoc, writeBatch } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';

const PERSONAS = [
  { uid: 'demo_user_arjun_dev', username: 'arjun.builds', displayName: 'Arjun Menon', bio: 'Full-stack dev. #buildinpublic ☕', profileImage: 'https://api.dicebear.com/7.x/avataaars/svg?seed=arjun&backgroundColor=b6e3f4', followersCount: 1843 },
  { uid: 'demo_user_priya_design', username: 'priya.pixels', displayName: 'Priya Nair', bio: 'UI/UX Designer. #design #figma', profileImage: 'https://api.dicebear.com/7.x/avataaars/svg?seed=priya&backgroundColor=ffdfbf', followersCount: 3210 },
  { uid: 'demo_user_zaid_photo', username: 'zaidframes', displayName: 'Zaid Rahman', bio: 'Street photographer. #photography #kochi', profileImage: 'https://api.dicebear.com/7.x/avataaars/svg?seed=zaid&backgroundColor=c0aede', followersCount: 5670 },
];

// High-quality Unsplash source URLs that rarely fail
const IMAGE_SOURCES = [
  'https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&q=80&w=800',
  'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?auto=format&fit=crop&q=80&w=800',
  'https://images.unsplash.com/photo-1555066931-4365d14bab8c?auto=format&fit=crop&q=80&w=800',
  'https://images.unsplash.com/photo-1542744094-3a31f272c490?auto=format&fit=crop&q=80&w=800',
  'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&q=80&w=800'
];

const POSTS: Record<string, { text: string; mood?: { emoji: string; label: string }; hasImage?: boolean }[]> = {
  demo_user_arjun_dev: [
    { text: "Just shipped a massive update to the core engine! 🚀 #coding #buildinpublic #webdev", mood: { emoji: '🚀', label: 'Productive' }, hasImage: true },
    { text: "Does anyone else get stuck in CSS hell for hours? #webdev #frontend", mood: { emoji: '😤', label: 'Frustrated' } },
  ],
  demo_user_priya_design: [
    { text: "Figma components are a lifesaver. #uiux #design #figma", hasImage: true },
    { text: "Finally finished the color palette for the new project. #design #branding", mood: { emoji: '✨', label: 'Feeling cute' } },
  ],
  demo_user_zaid_photo: [
    { text: "Kochi streets always offer the best light. #photography #streetphoto", hasImage: true },
    { text: "Woke up at 5am for this shot. Worth it? #photography #goldenhour", hasImage: true },
  ]
};

const rand = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

export const useDemoSeed = () => {
  const { firebaseUser } = useAuth();

  useEffect(() => {
    if (!firebaseUser) return;

    const seed = async () => {
      const sentinelRef = doc(db, 'meta', 'demoSeed');
      const sentinelSnap = await getDoc(sentinelRef);
      if (sentinelSnap.exists()) return;

      const batch = writeBatch(db);
      const postsRef = collection(db, 'posts');

      // Create Posts (Increased volume: repeat our list 5 times)
      for (let i = 0; i < 5; i++) {
        for (const persona of PERSONAS) {
          const userPosts = POSTS[persona.uid] || [];
          for (const post of userPosts) {
            const docRef = doc(postsRef);
            batch.set(docRef, {
              userId: persona.uid,
              username: persona.username,
              userProfileImage: persona.profileImage,
              text: post.text,
              mediaUrls: post.hasImage ? [IMAGE_SOURCES[rand(0, IMAGE_SOURCES.length - 1)]] : [],
              type: post.hasImage ? 'image' : 'text',
              mood: post.mood || null,
              likesCount: rand(50, 500),
              commentsCount: rand(5, 50),
              sharesCount: rand(0, 20),
              isDemo: true,
              createdAt: new Date(Date.now() - rand(0, 1000000000)).toISOString()
            });
          }
        }
      }

      await batch.commit();
      await setDoc(sentinelRef, { seeded: true });
      console.log('Demo content seeded successfully with hashtags!');
    };

    seed();
  }, [firebaseUser]);
};
