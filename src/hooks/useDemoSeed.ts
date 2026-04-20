import { useEffect } from 'react';
import { doc, getDoc, setDoc, collection, writeBatch, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';

// REALISTIC PORTRAITS FROM UNSPLASH
const REAL_PROFILES = [
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&q=80',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&q=80',
  'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=400&q=80',
  'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=400&q=80'
];

const PERSONAS = [
  { uid: 'u1', username: 'lakshmi.grows', displayName: 'Lakshmi Varma', bio: 'Product Manager @TechCo. #career #tech', img: REAL_PROFILES[0] },
  { uid: 'u2', username: 'devesh.ships', displayName: 'Devesh Kumar', bio: 'Founder. Building in public. #startup #buildinpublic', img: REAL_PROFILES[1] },
];

const SEED_POSTS = [
  {
    persona: PERSONAS[0],
    text: "Imposter syndrome doesn't go away when you get the title. It just wears a blazer now. #career #pm #growth",
    likes: 968, comments: 150
  },
  {
    persona: PERSONAS[1],
    text: "The mistake every early founder makes: hiring to solve problems instead of hiring to scale solutions. #startup #founders #business",
    img: "https://images.unsplash.com/photo-1519389950473-47ba0277781c?w=800&q=80",
    likes: 1104, comments: 122
  }
];

export const useDemoSeed = () => {
  const { firebaseUser } = useAuth();

  useEffect(() => {
    if (!firebaseUser) return;

    const seed = async () => {
      const sentinelRef = doc(db, 'meta', 'demoSeedV3');
      const snap = await getDoc(sentinelRef);
      if (snap.exists()) return;

      const batch = writeBatch(db);

      // 1. Create Users with Profile Images
      for (const p of PERSONAS) {
        batch.set(doc(db, 'users', p.uid), {
          uid: p.uid,
          username: p.username,
          displayName: p.displayName,
          bio: p.bio,
          profileImage: p.img, // The PostCard component uses this!
          followersCount: 1200,
          followingCount: 400,
          postsCount: 1,
          createdAt: new Date().toISOString()
        });
      }

      // 2. Create Posts
      for (const item of SEED_POSTS) {
        const postRef = doc(collection(db, 'posts'));
        batch.set(postRef, {
          userId: item.persona.uid,
          username: item.persona.username,
          userProfileImage: item.persona.img, // Crucial: Link the image to the post
          text: item.text,
          mediaUrls: item.img ? [item.img] : [],
          type: item.img ? 'image' : 'text',
          likesCount: item.likes,
          commentsCount: item.comments,
          createdAt: new Date().toISOString(),
          serverCreatedAt: serverTimestamp(),
          isDemo: true
        });
      }

      await batch.commit();
      await setDoc(sentinelRef, { seeded: true });
      console.log('Seed Complete: Realistic people, hashtags, and profile images linked.');
    };

    seed();
  }, [firebaseUser]);
};
