import { useEffect, useRef } from 'react';
import { collection, query, where, orderBy, limit, getDocs, writeBatch, doc, getDoc, setDoc } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';

const BOT_UID = "system_netolynk_official"; // MUST match your Firestore Rules
const BOT_USERNAME = "netolynk_official";
const BOT_DISPLAY_NAME = "NetoLynk Official";
const BOT_AVATAR = "https://api.dicebear.com/7.x/bottts/svg?seed=netolynk_system&backgroundColor=FF3B30";

// --- MASSIVE CONTENT LIBRARY ---
const DEMO_TEXTS = [
  // Tech & Coding
  "Just pushed a massive update to production! Check out the new features. 🚀 #Update #Tech",
  "React vs Vue vs Svelte. What's your framework of choice in 2024? 🤔",
  "Late night coding sessions always lead to the best ideas. 🌙💻",
  "Finally fixed that bug that's been haunting me for 3 days. The relief is real! 🐛🔫",
  "TypeScript is an absolute lifesaver. Change my mind. 🛡️",
  "Who else drinks way too much coffee when debugging? ☕😅",
  
  // Community & Engagement
  "Welcome to all the new users joining NetoLynk today! Say hi in the comments 👇",
  "What is the biggest goal you want to achieve this month? Let's manifest it. ✨",
  "Drop your current favorite song below. I need a new coding playlist! 🎵🎧",
  "Rate your day so far from 1-10! 📊",
  "Tag a creator on here whose content you absolutely love! 🤝",
  
  // Lifestyle & Vibes
  "Sometimes you just need to step away from the screen and take a walk. Mental health matters. 🌿",
  "Weekend vibes loading... What are your plans? 🎉",
  "Current setup. How's your workspace looking today? 🖥️⌨️",
  "Nothing beats the feeling of a fresh, clean codebase. 🧹✨",
  "Good morning NetoLynk! Let's get to work. ☀️",
  
  // Platform Hype
  "The algorithm is learning... Keep posting to see the magic happen. 🧠🔥",
  "We are scaling faster than we ever imagined. Thank you all! 📈❤️",
  "Dark mode or Light mode? Which side are you on? 🌗",
  "Some amazing new features are dropping next week. Stay tuned... 👀",
  
  // Generic / Relatable
  "Imposter syndrome hits hard sometimes, but remember how far you've come. 💪",
  "Keep building. Keep shipping. 🚢",
  "Stay hydrated, fix your posture, and write good code. 💧",
  "The tech community on here is unmatched. You guys are awesome. 🌍",
  "Just a random vibe check. How is everyone doing? ✌️"
];

const DEMO_MOODS = [
  { emoji: '🔥', label: 'Hyped' },
  { emoji: '😌', label: 'Peaceful' },
  { emoji: '☕', label: 'Need coffee' },
  { emoji: '🚀', label: 'Productive' },
  { emoji: '✨', label: 'Feeling cute' },
  { emoji: '💀', label: 'Dead inside' },
  null, null, null, null // 40% chance of NO mood for realism
];

const IMAGE_KEYWORDS = [
  "technology", "workspace", "coffee", "neon", "nature", 
  "coding", "architecture", "abstract", "setup", "developer"
];

export const useDemoBot = () => {
  const hasRun = useRef(false);

  useEffect(() => {
    if (hasRun.current) return;
    hasRun.current = true;

    const runBot = async () => {
      // Must be logged in to trigger the batch write
      if (!auth.currentUser) return;

      try {
        // 1. Create the Bot User Profile if it doesn't exist
        // Note: Wrapped in try/catch because Firestore rules might block client user creation,
        // but we want the script to continue to post generation regardless.
        const userRef = doc(db, `users/${BOT_UID}`);
        try {
          const userSnap = await getDoc(userRef);
          if (!userSnap.exists()) {
            await setDoc(userRef, {
              uid: BOT_UID,
              username: BOT_USERNAME,
              displayName: BOT_DISPLAY_NAME,
              email: "official@netolynk.app",
              bio: "The official NetoLynk system account. Bringing you the latest updates! 🚀",
              profileImage: BOT_AVATAR,
              coverImage: "https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=1200&q=80",
              followersCount: 15420,
              followingCount: 0,
              postsCount: 0,
              verified: true,
              createdAt: new Date().toISOString()
            });
          }
        } catch (e) {
          console.warn("Could not create bot profile (Permissions), continuing to posts...", e);
        }

        // 2. Find the last time the bot posted
        const postsRef = collection(db, 'posts');
        const q = query(
          postsRef, 
          where('userId', '==', BOT_UID), 
          orderBy('createdAt', 'desc'), 
          limit(1)
        );
        const snap = await getDocs(q);

        const now = Date.now();
        const ONE_HOUR_MS = 60 * 60 * 1000;
        
        // If no posts exist, go back 24 hours to create a full initial timeline
        let lastPostTime = now - (24 * ONE_HOUR_MS); 
        if (!snap.empty) {
          lastPostTime = new Date(snap.docs[0].data().createdAt).getTime();
        }

        // 3. If the last post was less than an hour ago, timeline is healthy! Do nothing.
        if (now - lastPostTime < ONE_HOUR_MS) return;

        // 4. Calculate missing hours (Cap at 24 so we don't overload Firebase with 1000s of writes if offline for a month)
        const missingHours = Math.min(Math.floor((now - lastPostTime) / ONE_HOUR_MS), 24);
        if (missingHours <= 0) return;

        console.log(`[NetoLynk Engine] Backfilling ${missingHours} hours of timeline activity...`);

        // 5. Generate missing posts in a high-speed Batch Write
        const batch = writeBatch(db);

        for (let i = 1; i <= missingHours; i++) {
          const fakeTime = new Date(lastPostTime + (i * ONE_HOUR_MS)).toISOString();
          
          // Randomize Content
          const randomText = DEMO_TEXTS[Math.floor(Math.random() * DEMO_TEXTS.length)];
          const randomMood = DEMO_MOODS[Math.floor(Math.random() * DEMO_MOODS.length)];
          const randomKeyword = IMAGE_KEYWORDS[Math.floor(Math.random() * IMAGE_KEYWORDS.length)];
          
          // 40% chance to include a high-quality Unsplash image
          const includeImage = Math.random() > 0.6;
          const mediaUrls = includeImage 
            ? [`https://source.unsplash.com/random/800x800/?${randomKeyword}&sig=${i}`] 
            : [];

          // Fake Engagement numbers to make feed look viral
          const fakeLikes = Math.floor(Math.random() * 350) + 12;
          const fakeShares = Math.floor(Math.random() * 45);

          const newPostRef = doc(postsRef);
          batch.set(newPostRef, {
            userId: BOT_UID,
            username: BOT_USERNAME,
            userProfileImage: BOT_AVATAR,
            text: randomText,
            mediaUrls: mediaUrls,
            type: includeImage ? 'image' : 'text',
            mood: randomMood,
            likesCount: fakeLikes,
            commentsCount: 0,
            sharesCount: fakeShares,
            tags: ["netolynk", "explore"],
            mentions: [],
            isOfficial: true, // MUST BE TRUE to bypass your Firestore Security Rules!
            createdAt: fakeTime, 
            serverCreatedAt: fakeTime
          });
        }

        // Commit all generated posts instantly
        await batch.commit();
        console.log("[NetoLynk Engine] Timeline successfully synchronized! 🚀");

      } catch (err) {
        console.error("[NetoLynk Engine] Auto-population failed:", err);
      }
    };

    runBot();
  }, []);
};
