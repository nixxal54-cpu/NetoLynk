import { useEffect } from 'react';
import { doc, getDoc, setDoc, collection, writeBatch, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';

const PERSONAS = [
  { uid: 'u1', username: 'alex_travels', displayName: 'Alex Rivera', bio: 'Digital Nomad. 🌍 #travel #adventure', img: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&q=80' },
  { uid: 'u2', username: 'sarah_codes', displayName: 'Sarah Chen', bio: 'Building the future. #coding #tech #100DaysOfCode', img: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400&q=80' },
  { uid: 'u3', username: 'mike_fitness', displayName: 'Mike Ross', bio: 'Fitness & Health Coach. #fitness #gymlife #wellness', img: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400&q=80' }
];

const SEED_DATA = [
  {
    persona: PERSONAS[0],
    text: "Just arrived in Bali! The view is incredible. 🌴 #travel #bali #vacation",
    img: "https://images.unsplash.com/photo-1537996194471-e657df975ab4?w=800&q=80",
    likes: 134,
    comments: [
      { user: "Sarah Chen", text: "So jealous! Enjoy!" },
      { user: "Mike Ross", text: "Lookin shredded, bro." }
    ]
  },
  {
    persona: PERSONAS[1],
    text: "Finally fixed that production bug! 💻✨ #coding #software #techlife",
    img: "https://images.unsplash.com/photo-1498050108023-c5249f4df085?w=800&q=80",
    likes: 567,
    comments: [{ user: "Alex Rivera", text: "The relief is real!" }]
  }
];

export const useDemoSeed = () => {
  const { firebaseUser } = useAuth();

  useEffect(() => {
    if (!firebaseUser) return;

    const seed = async () => {
      const sentinelRef = doc(db, 'meta', 'demoSeedV2');
      const snap = await getDoc(sentinelRef);
      if (snap.exists()) return;

      const batch = writeBatch(db);

      // 1. Create Users
      for (const p of PERSONAS) {
        batch.set(doc(db, 'users', p.uid), {
          uid: p.uid, username: p.username, displayName: p.displayName, bio: p.bio,
          profileImage: p.img, followersCount: 0, followingCount: 0, postsCount: 0, createdAt: new Date().toISOString()
        });
      }

      // 2. Create Posts + Comments
      for (const item of SEED_DATA) {
        const postRef = doc(collection(db, 'posts'));
        batch.set(postRef, {
          userId: item.persona.uid,
          username: item.persona.username,
          userProfileImage: item.persona.img,
          text: item.text,
          mediaUrls: [item.img],
          type: 'image',
          likesCount: item.likes,
          commentsCount: item.comments.length,
          createdAt: new Date().toISOString(),
          isDemo: true
        });

        // 3. Add Comments as Subcollections
        for (const c of item.comments) {
          const commentRef = doc(collection(db, 'posts', postRef.id, 'comments'));
          batch.set(commentRef, {
            postId: postRef.id,
            userId: 'random_user',
            username: c.user.split(' ')[0].toLowerCase(),
            text: c.text,
            createdAt: new Date().toISOString()
          });
        }
      }

      await batch.commit();
      await setDoc(sentinelRef, { seeded: true });
      console.log('Seed Complete: Realistic photos + Hashtags + Matching Comments.');
    };

    seed();
  }, [firebaseUser]);
};
