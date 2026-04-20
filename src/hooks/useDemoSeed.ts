/**
 * useDemoSeed — standalone demo content seeder.
 *
 * Drop-in alternative to useDemoBot. Call it from AppContent the same way:
 *   useDemoSeed();
 *
 * Differences from useDemoBot:
 *  - Writes a sentinel doc (`meta/demoSeed`) to track seeded state, so it
 *    never double-seeds even if Firestore rules block querying isDemo posts.
 *  - Does NOT depend on querying posts with where('isDemo','==',true) for the
 *    check — avoids index / rules issues.
 *  - Identical persona + post data.
 */

import { useEffect } from 'react';
import {
  collection, doc, getDoc, setDoc, writeBatch
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';

// ---------------------------------------------------------------------------
// Personas
// ---------------------------------------------------------------------------
const PERSONAS = [
  { uid: 'demo_user_arjun_dev', username: 'arjun.builds', displayName: 'Arjun Menon', bio: 'Full-stack dev. Building in public. Ex-Swiggy. Now indie. ☕ → 💻', profileImage: 'https://api.dicebear.com/7.x/avataaars/svg?seed=arjun_menon&backgroundColor=b6e3f4', verified: false, followersCount: 1843 },
  { uid: 'demo_user_priya_design', username: 'priya.pixels', displayName: 'Priya Nair', bio: 'UI/UX designer @ startup life 🎨 | Figma addict | Kerala girl in Bangalore', profileImage: 'https://api.dicebear.com/7.x/avataaars/svg?seed=priya_nair&backgroundColor=ffdfbf', verified: false, followersCount: 3210 },
  { uid: 'demo_user_zaid_photo', username: 'zaidframes', displayName: 'Zaid Rahman', bio: 'Street photographer 📷 | Capturing Kochi, one frame at a time. DMs open.', profileImage: 'https://api.dicebear.com/7.x/avataaars/svg?seed=zaid_rahman&backgroundColor=c0aede', verified: false, followersCount: 5670 },
  { uid: 'demo_user_sneha_fitness', username: 'sneha.lifts', displayName: 'Sneha Thomas', bio: 'Certified PT 💪 | Helping you get strong, not just skinny | Thrissur', profileImage: 'https://api.dicebear.com/7.x/avataaars/svg?seed=sneha_thomas&backgroundColor=d1f4cc', verified: false, followersCount: 8920 },
  { uid: 'demo_user_rohan_music', username: 'rohan.wav', displayName: 'Rohan Pillai', bio: 'Producer. Guitarist. Bedroom musician 🎸 | SoundCloud link in bio', profileImage: 'https://api.dicebear.com/7.x/avataaars/svg?seed=rohan_pillai&backgroundColor=ffd5dc', verified: false, followersCount: 2100 },
  { uid: 'demo_user_aisha_reads', username: 'aisha.reads', displayName: 'Aisha Khan', bio: '📚 Book nerd. Currently reading everything. Chai > Coffee. Kozhikode.', profileImage: 'https://api.dicebear.com/7.x/avataaars/svg?seed=aisha_khan&backgroundColor=b6e3f4', verified: false, followersCount: 1230 },
  { uid: 'demo_user_dev_startup', username: 'devesh.ships', displayName: 'Devesh Kumar', bio: 'Founder @buildfast | YC S24 | shipped 4 products, killed 3 🥲 | building in public', profileImage: 'https://api.dicebear.com/7.x/avataaars/svg?seed=devesh_kumar&backgroundColor=ffdfbf', verified: true, followersCount: 14500 },
  { uid: 'demo_user_meera_food', username: 'meera.eats', displayName: 'Meera Suresh', bio: 'Home chef 🍛 | Food blogger | Thalassery biryani supremacist | she/her', profileImage: 'https://api.dicebear.com/7.x/avataaars/svg?seed=meera_suresh&backgroundColor=c0aede', verified: false, followersCount: 6780 },
  { uid: 'demo_user_faris_memes', username: 'farisposting', displayName: 'Faris Hameed', bio: 'just a guy who posts | calicut university dropout era 💀 | certified menace', profileImage: 'https://api.dicebear.com/7.x/avataaars/svg?seed=faris_hameed&backgroundColor=d1f4cc', verified: false, followersCount: 920 },
  { uid: 'demo_user_lakshmi_career', username: 'lakshmi.grows', displayName: 'Lakshmi Varma', bio: 'Product Manager @TechCo | Ex-teacher → PM in 18 months | sharing the journey', profileImage: 'https://api.dicebear.com/7.x/avataaars/svg?seed=lakshmi_varma&backgroundColor=ffd5dc', verified: false, followersCount: 4350 },
];

// ---------------------------------------------------------------------------
// Posts (abbreviated — same as useDemoBot)
// ---------------------------------------------------------------------------
type PostDef = { text: string; mood?: { emoji: string; label: string }; hasImage?: boolean; likes: [number, number]; comments: [number, number]; shares: [number, number] };

const POSTS: Record<string, PostDef[]> = {
  demo_user_arjun_dev: [
    { text: "shipped dark mode at 2am. wasn't even on the roadmap. no regrets. 🌙", mood: { emoji: '🚀', label: 'Productive' }, likes: [180, 340], comments: [12, 35], shares: [8, 20] },
    { text: "hot take: the best architecture decision you can make is the one your team will actually understand at 11pm on a Friday.", likes: [220, 480], comments: [30, 60], shares: [15, 40] },
    { text: "3 months of solo building → first paying customer.\n\nfee was ₹499. I cried.", mood: { emoji: '🔥', label: 'Hyped' }, likes: [890, 1400], comments: [75, 120], shares: [60, 90] },
    { text: "reminder: your side project doesn't need to be a startup. it's allowed to just be fun.", likes: [310, 520], comments: [18, 45], shares: [25, 55] },
    { text: "spent 4 hours debugging. the issue was a missing semicolon in a config file. I am fine. everything is fine. ☕", mood: { emoji: '💀', label: 'Dead inside' }, likes: [450, 700], comments: [40, 80], shares: [20, 50] },
    { text: "writing tests after the feature works isn't TDD. it's archaeology.", likes: [200, 380], comments: [28, 60], shares: [18, 45] },
    { text: "nobody talks about how lonely indie dev can get. shipping to an audience of zero for months. keep going. the compounding starts slow.", mood: { emoji: '😌', label: 'Peaceful' }, likes: [720, 1100], comments: [55, 95], shares: [40, 80] },
  ],
  demo_user_priya_design: [
    { text: "unpopular opinion: a design that needs a tutorial is a bad design. fight me.", likes: [420, 700], comments: [50, 90], shares: [30, 65] },
    { text: "redesigned our onboarding flow. reduced drop-off by 34%. all I did was remove 2 screens and change one button label. design is mostly subtraction.", mood: { emoji: '🚀', label: 'Productive' }, likes: [650, 1000], comments: [40, 80], shares: [45, 85] },
    { text: "the way my figma file is organized vs the way the devs receive it 💀", hasImage: true, likes: [780, 1200], comments: [70, 130], shares: [55, 100] },
    { text: "color accessibility isn't a nice-to-have. it's a minimum. a 3:1 contrast ratio isn't a design constraint, it's a human rights thing.", likes: [540, 900], comments: [38, 78], shares: [40, 80] },
    { text: "white space is not empty space. it is the loudest design decision you will make.", likes: [580, 960], comments: [42, 88], shares: [35, 72] },
  ],
  demo_user_zaid_photo: [
    { text: "MG Road at 6am hits different. no crowds, just the city waking up.", hasImage: true, likes: [430, 750], comments: [30, 65], shares: [25, 55] },
    { text: "golden hour in Kerala isn't just a photography thing. it's a spiritual experience.", hasImage: true, likes: [890, 1450], comments: [65, 120], shares: [58, 105] },
    { text: "the shot you delete today might be the one you wish you kept in 5 years. I stopped mass-deleting.", likes: [380, 670], comments: [28, 58], shares: [20, 50] },
    { text: "rain photography > everything else. change my mind.", hasImage: true, likes: [490, 820], comments: [38, 78], shares: [32, 70] },
  ],
  demo_user_sneha_fitness: [
    { text: "the gym didn't fix my problems. but it gave me 60 minutes where my only problem was this set. that's worth a lot.", mood: { emoji: '🔥', label: 'Hyped' }, likes: [780, 1200], comments: [60, 110], shares: [55, 100] },
    { text: "your 'perfect diet' means nothing if you can't sustain it past Thursday. consistency over perfection. every time.", likes: [540, 920], comments: [42, 85], shares: [38, 78] },
    { text: "5am workouts are not for everyone and that's okay. the best time to work out is whenever you actually do it.", likes: [450, 780], comments: [35, 70], shares: [28, 60] },
    { text: "if one person reading this goes for a walk today instead of scrolling, this account is worth it. go. now.", mood: { emoji: '✨', label: 'Feeling cute' }, likes: [750, 1200], comments: [58, 105], shares: [55, 100] },
  ],
  demo_user_rohan_music: [
    { text: "finished a track at 3am that I started 4 months ago. played it back once. deleted it. started over. this is the process.", mood: { emoji: '💀', label: 'Dead inside' }, likes: [320, 580], comments: [28, 62], shares: [18, 45] },
    { text: "new beat dropped. made it in one take. 45 min session. didn't overthink it. why is this one the best thing I've made.", mood: { emoji: '🔥', label: 'Hyped' }, likes: [420, 750], comments: [35, 78], shares: [28, 60] },
    { text: "made my first rupee from music today. ₹83 from streaming. framing this.", mood: { emoji: '✨', label: 'Feeling cute' }, likes: [890, 1450], comments: [90, 160], shares: [75, 130] },
  ],
  demo_user_aisha_reads: [
    { text: "currently reading 4 books at once. this is not a flex. this is a cry for help.", mood: { emoji: '☕', label: 'Need coffee' }, likes: [380, 680], comments: [32, 70], shares: [22, 52] },
    { text: "DNF-ing a book is not quitting. it's editing your time. life is too short for books that aren't right for you right now.", likes: [510, 880], comments: [45, 92], shares: [35, 75] },
    { text: "Kozhikode beach at sunset with a book and cutting chai. I have solved the human condition.", hasImage: true, likes: [750, 1200], comments: [55, 100], shares: [50, 95] },
    { text: "rereading a book you loved at 16 as an adult is one of the strangest experiences. same sentences. completely different person reading them.", likes: [560, 960], comments: [45, 92], shares: [38, 78] },
  ],
  demo_user_dev_startup: [
    { text: "we just crossed ₹10L MRR. 14 months ago I was pitching to rooms of 3 people who were half-listening. compounding is real but invisible for a long time.", mood: { emoji: '🔥', label: 'Hyped' }, likes: [1800, 2800], comments: [140, 220], shares: [120, 200] },
    { text: "your pricing is probably too low. I've raised prices 3 times. churned zero customers each time. the fear is always worse than the reality.", likes: [860, 1400], comments: [72, 135], shares: [62, 118] },
    { text: "building a company is mostly just making decisions with incomplete information slightly faster than everyone else.", mood: { emoji: '☕', label: 'Need coffee' }, likes: [760, 1280], comments: [62, 118], shares: [52, 102] },
    { text: "to every founder grinding quietly right now: the lack of noise around you isn't failure. it's just early.", mood: { emoji: '✨', label: 'Feeling cute' }, likes: [1650, 2600], comments: [130, 215], shares: [115, 195] },
  ],
  demo_user_meera_food: [
    { text: "made my thatha's fish curry from memory today. no recipe, no measurements. just smell and instinct. tasted exactly right. started crying halfway through. food is wild.", mood: { emoji: '😭', label: 'Crying' }, likes: [890, 1450], comments: [80, 145], shares: [65, 120] },
    { text: "the most underrated Kerala snack: banana chips with black tea at 4pm. I will not be taking questions.", hasImage: true, likes: [720, 1200], comments: [58, 108], shares: [52, 100] },
    { text: "cooking is a love language. when my amma makes food for someone she doesn't even like, she still makes it with full care. that taught me everything.", mood: { emoji: '😌', label: 'Peaceful' }, likes: [840, 1380], comments: [70, 128], shares: [60, 112] },
  ],
  demo_user_faris_memes: [
    { text: "me explaining to my amma why I need a second monitor for 'productivity': 🧍", likes: [480, 850], comments: [55, 108], shares: [40, 85] },
    { text: "3 stages of a college assignment:\n\n1. I'll start early this time\n2. okay I have a week still\n3. 4am asking ChatGPT what the question even means", likes: [890, 1450], comments: [80, 150], shares: [70, 130] },
    { text: "Kerala summer be like: step outside for 30 seconds and immediately understand why people move to Canada.", mood: { emoji: '😤', label: 'Frustrated' }, likes: [720, 1200], comments: [60, 115], shares: [55, 105] },
    { text: "the one thing about Mallu parents: no matter what career you pick, first response is 'but what about engineering'.", likes: [920, 1550], comments: [85, 158], shares: [72, 138] },
  ],
  demo_user_lakshmi_career: [
    { text: "I went from high school teacher to Product Manager in 18 months with zero tech background.\n\nthe thing that got me interviews: I documented every experiment I ran as a teacher using PM frameworks. your past is transferable. reframe it.", mood: { emoji: '🚀', label: 'Productive' }, likes: [1200, 1950], comments: [110, 190], shares: [95, 170] },
    { text: "imposter syndrome doesn't go away when you get the title. it just wears a blazer now.", mood: { emoji: '😭', label: 'Crying' }, likes: [920, 1550], comments: [85, 158], shares: [72, 138] },
    { text: "I took a 40% pay cut to switch careers. 18 months later I'm earning more than I ever did as a teacher. the dip is real. so is the other side.", mood: { emoji: '✨', label: 'Feeling cute' }, likes: [1050, 1750], comments: [95, 170], shares: [82, 155] },
  ],
};

const PHOTOS = [
  '1517694712202-14dd9538aa97', '1555066931-4365d14bab8c', '1519389950473-47ba0277781c',
  '1498050108023-c5249f4df085', '1484417894907-623942c8ee29', '1542744094-3a31f272c490',
  '1506905925346-21bda4d32df4', '1476514525535-07fb3b4ae5f1', '1490750967868-88df5691240e',
  '1512621776951-a57141f2eefd', '1571019613454-1cb2f99b2d8b', '1534438327276-14e5300c3a48',
  '1511671782779-c97d3d27a1d4', '1481627834876-b7833e8f84c6', '1522071820081-009f0129c71c',
];

const rand = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------
export const useDemoSeed = () => {
  const { firebaseUser } = useAuth();

  useEffect(() => {
    if (!firebaseUser) return;

    const seed = async () => {
      // Use a sentinel doc instead of querying posts — avoids index/rules issues
      const sentinelRef = doc(db, 'meta', 'demoSeed');
      try {
        const sentinelSnap = await getDoc(sentinelRef);
        if (sentinelSnap.exists()) {
          console.log('[useDemoSeed] Already seeded. Skipping.');
          return;
        }
      } catch (e) {
        // If we can't read meta (rules), assume not seeded and try anyway
        console.warn('[useDemoSeed] Could not read sentinel, proceeding with seed attempt.', e);
      }

      console.log('[useDemoSeed] First run — seeding demo content...');
      const now = Date.now();
      const HOUR = 3_600_000;
      const postsRef = collection(db, 'posts');

      // 1. Write persona profiles
      for (const p of PERSONAS) {
        const userRef = doc(db, 'users', p.uid);
        try {
          const snap = await getDoc(userRef);
          if (!snap.exists()) {
            await setDoc(userRef, {
              uid: p.uid,
              username: p.username,
              displayName: p.displayName,
              email: `${p.username}@demo.netolynk.app`,
              bio: p.bio,
              profileImage: p.profileImage,
              coverImage: 'https://images.unsplash.com/photo-1557804506-669a67965ba0?w=1200&q=80',
              followersCount: p.followersCount,
              followingCount: rand(80, 400),
              postsCount: POSTS[p.uid]?.length ?? 0,
              verified: p.verified ?? false,
              createdAt: new Date(now - rand(30, 180) * 24 * HOUR).toISOString(),
            });
          }
        } catch (e) {
          console.warn(`[useDemoSeed] Profile write skipped for ${p.uid}`, e);
        }
      }

      // 2. Flatten + shuffle posts
      const allPosts: Array<{ persona: typeof PERSONAS[0]; post: PostDef; fakeTime: string }> = [];
      for (const persona of PERSONAS) {
        (POSTS[persona.uid] ?? []).forEach((post, i) => {
          const hoursBack = rand(1, 168) + i * rand(1, 6);
          allPosts.push({ persona, post, fakeTime: new Date(now - hoursBack * HOUR).toISOString() });
        });
      }
      for (let i = allPosts.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [allPosts[i], allPosts[j]] = [allPosts[j], allPosts[i]];
      }

      // 3. Batch write posts
      let batch = writeBatch(db);
      let ops = 0;
      for (const { persona, post, fakeTime } of allPosts) {
        const includeImage = post.hasImage === true || Math.random() > 0.6;
        const photoId = PHOTOS[rand(0, PHOTOS.length - 1)];
        const mediaUrls = includeImage
          ? [`https://images.unsplash.com/photo-${photoId}?w=800&q=80`]
          : [];

        batch.set(doc(postsRef), {
          userId: persona.uid,
          username: persona.username,
          userProfileImage: persona.profileImage,
          text: post.text,
          mediaUrls,
          type: mediaUrls.length > 0 ? 'image' : 'text',
          mood: post.mood ?? null,
          likesCount: rand(post.likes[0], post.likes[1]),
          commentsCount: rand(post.comments[0], post.comments[1]),
          sharesCount: rand(post.shares[0], post.shares[1]),
          tags: [],
          mentions: [],
          isDemo: true,
          createdAt: fakeTime,
          serverCreatedAt: fakeTime,
        });

        ops++;
        if (ops >= 490) {
          await batch.commit();
          batch = writeBatch(db);
          ops = 0;
        }
      }
      if (ops > 0) await batch.commit();

      // 4. Write sentinel so we never seed again
      try {
        await setDoc(sentinelRef, { seededAt: new Date().toISOString(), count: allPosts.length });
      } catch (e) {
        console.warn('[useDemoSeed] Could not write sentinel (rules may block meta writes)', e);
      }

      console.log(`[useDemoSeed] ✅ Seeded ${allPosts.length} posts across ${PERSONAS.length} personas.`);
    };

    seed();
  }, [firebaseUser]);
};
