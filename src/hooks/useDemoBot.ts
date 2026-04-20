import { useEffect, useRef } from 'react';
import {
  collection, query, where, orderBy, limit,
  getDocs, writeBatch, doc, getDoc, setDoc
} from 'firebase/firestore';
import { db, auth } from '../lib/firebase';

// =============================================================================
// FAKE USER PERSONAS — 10 distinct accounts with real-feeling identities
// =============================================================================
const PERSONAS = [
  {
    uid: 'demo_user_arjun_dev',
    username: 'arjun.builds',
    displayName: 'Arjun Menon',
    bio: 'Full-stack dev. Building in public. Ex-Swiggy. Now indie. ☕ → 💻',
    profileImage: 'https://api.dicebear.com/7.x/avataaars/svg?seed=arjun_menon&backgroundColor=b6e3f4',
    verified: false,
    followersCount: 1843,
  },
  {
    uid: 'demo_user_priya_design',
    username: 'priya.pixels',
    displayName: 'Priya Nair',
    bio: 'UI/UX designer @ startup life 🎨 | Figma addict | Kerala girl in Bangalore',
    profileImage: 'https://api.dicebear.com/7.x/avataaars/svg?seed=priya_nair&backgroundColor=ffdfbf',
    verified: false,
    followersCount: 3210,
  },
  {
    uid: 'demo_user_zaid_photo',
    username: 'zaidframes',
    displayName: 'Zaid Rahman',
    bio: 'Street photographer 📷 | Capturing Kochi, one frame at a time. DMs open.',
    profileImage: 'https://api.dicebear.com/7.x/avataaars/svg?seed=zaid_rahman&backgroundColor=c0aede',
    verified: false,
    followersCount: 5670,
  },
  {
    uid: 'demo_user_sneha_fitness',
    username: 'sneha.lifts',
    displayName: 'Sneha Thomas',
    bio: 'Certified PT 💪 | Helping you get strong, not just skinny | Thrissur',
    profileImage: 'https://api.dicebear.com/7.x/avataaars/svg?seed=sneha_thomas&backgroundColor=d1f4cc',
    verified: false,
    followersCount: 8920,
  },
  {
    uid: 'demo_user_rohan_music',
    username: 'rohan.wav',
    displayName: 'Rohan Pillai',
    bio: 'Producer. Guitarist. Bedroom musician 🎸 | SoundCloud link in bio',
    profileImage: 'https://api.dicebear.com/7.x/avataaars/svg?seed=rohan_pillai&backgroundColor=ffd5dc',
    verified: false,
    followersCount: 2100,
  },
  {
    uid: 'demo_user_aisha_reads',
    username: 'aisha.reads',
    displayName: 'Aisha Khan',
    bio: '📚 Book nerd. Currently reading everything. Chai > Coffee. Kozhikode.',
    profileImage: 'https://api.dicebear.com/7.x/avataaars/svg?seed=aisha_khan&backgroundColor=b6e3f4',
    verified: false,
    followersCount: 1230,
  },
  {
    uid: 'demo_user_dev_startup',
    username: 'devesh.ships',
    displayName: 'Devesh Kumar',
    bio: 'Founder @buildfast | YC S24 | shipped 4 products, killed 3 🥲 | building in public',
    profileImage: 'https://api.dicebear.com/7.x/avataaars/svg?seed=devesh_kumar&backgroundColor=ffdfbf',
    verified: true,
    followersCount: 14500,
  },
  {
    uid: 'demo_user_meera_food',
    username: 'meera.eats',
    displayName: 'Meera Suresh',
    bio: 'Home chef 🍛 | Food blogger | Thalassery biryani supremacist | she/her',
    profileImage: 'https://api.dicebear.com/7.x/avataaars/svg?seed=meera_suresh&backgroundColor=c0aede',
    verified: false,
    followersCount: 6780,
  },
  {
    uid: 'demo_user_faris_memes',
    username: 'farisposting',
    displayName: 'Faris Hameed',
    bio: 'just a guy who posts | calicut university dropout era 💀 | certified menace',
    profileImage: 'https://api.dicebear.com/7.x/avataaars/svg?seed=faris_hameed&backgroundColor=d1f4cc',
    verified: false,
    followersCount: 920,
  },
  {
    uid: 'demo_user_lakshmi_career',
    username: 'lakshmi.grows',
    displayName: 'Lakshmi Varma',
    bio: 'Product Manager @TechCo | Ex-teacher → PM in 18 months | sharing the journey',
    profileImage: 'https://api.dicebear.com/7.x/avataaars/svg?seed=lakshmi_varma&backgroundColor=ffd5dc',
    verified: false,
    followersCount: 4350,
  },
];

// =============================================================================
// POST CONTENT — 100+ ultra-realistic posts tied to each persona
// =============================================================================
const POSTS_BY_PERSONA: Record<string, Array<{
  text: string;
  mood?: { emoji: string; label: string };
  imageKeyword?: string;
  likes: [number, number];
  comments: [number, number];
  shares: [number, number];
}>> = {
  'demo_user_arjun_dev': [
    { text: "shipped dark mode at 2am. wasn't even on the roadmap. no regrets. 🌙", mood: { emoji: '🚀', label: 'Productive' }, likes: [180, 340], comments: [12, 35], shares: [8, 20] },
    { text: "hot take: the best architecture decision you can make is the one your team will actually understand at 11pm on a Friday.", likes: [220, 480], comments: [30, 60], shares: [15, 40] },
    { text: "3 months of solo building → first paying customer.\n\nfee was ₹499. I cried.", mood: { emoji: '🔥', label: 'Hyped' }, likes: [890, 1400], comments: [75, 120], shares: [60, 90] },
    { text: "reminder: your side project doesn't need to be a startup. it's allowed to just be fun.", likes: [310, 520], comments: [18, 45], shares: [25, 55] },
    { text: "spent 4 hours debugging. the issue was a missing semicolon in a config file. I am fine. everything is fine. ☕", mood: { emoji: '💀', label: 'Dead inside' }, likes: [450, 700], comments: [40, 80], shares: [20, 50] },
    { text: "React Server Components are genuinely changing how I think about data fetching. or maybe I'm just easily excited. both probably.", likes: [130, 280], comments: [22, 55], shares: [10, 30] },
    { text: "my entire development setup:\n\n→ VS Code\n→ one terminal\n→ Figma in another tab I barely look at\n→ Stack Overflow\n→ questionable amounts of black coffee\n\nthat's it. that's the stack.", imageKeyword: 'developer workspace setup', likes: [560, 900], comments: [45, 90], shares: [35, 70] },
    { text: "writing tests after the feature works isn't TDD. it's archaeology.", likes: [200, 380], comments: [28, 60], shares: [18, 45] },
    { text: "nobody talks about how lonely indie dev can get. shipping to an audience of zero for months. if you're in that phase right now, keep going. the compounding starts slow.", mood: { emoji: '😌', label: 'Peaceful' }, likes: [720, 1100], comments: [55, 95], shares: [40, 80] },
    { text: "new personal rule: if a meeting could have been a Notion doc, I'm sending the Notion doc.", likes: [340, 600], comments: [20, 50], shares: [30, 65] },
    { text: "just discovered I've been spelling 'definitely' wrong in commit messages for 2 years. my git history is a crime scene.", mood: { emoji: '💀', label: 'Dead inside' }, likes: [880, 1300], comments: [60, 110], shares: [50, 90] },
  ],

  'demo_user_priya_design': [
    { text: "unpopular opinion: a design that needs a tutorial is a bad design. fight me.", likes: [420, 700], comments: [50, 90], shares: [30, 65] },
    { text: "redesigned our onboarding flow. reduced drop-off by 34%. all I did was remove 2 screens and change one button label. design is mostly subtraction.", mood: { emoji: '🚀', label: 'Productive' }, likes: [650, 1000], comments: [40, 80], shares: [45, 85] },
    { text: "the way my figma file is organized vs the way the devs receive it:", imageKeyword: 'messy organized desk comparison', likes: [780, 1200], comments: [70, 130], shares: [55, 100] },
    { text: "current mood: kerning things that will never be noticed by anyone except me.", mood: { emoji: '☕', label: 'Need coffee' }, likes: [310, 560], comments: [25, 55], shares: [15, 40] },
    { text: "not all feedback is equal. 'make the logo bigger' from the CEO and 'I couldn't find the checkout button' from a user are very different things. learn to triage.", likes: [480, 820], comments: [35, 75], shares: [28, 60] },
    { text: "color accessibility isn't a nice-to-have. it's a minimum. a 3:1 contrast ratio isn't a design constraint, it's a human rights thing.", likes: [540, 900], comments: [38, 78], shares: [40, 80] },
    { text: "I have 47 unread DMs from people asking me to review their portfolio 'for free, just 5 minutes'. respectfully: my time has value. so does yours. charge for it.", mood: { emoji: '😤', label: 'Frustrated' }, likes: [890, 1400], comments: [85, 150], shares: [70, 120] },
    { text: "current aesthetic: brutalism mixed with that warm Figma community energy ✨", imageKeyword: 'brutalist web design aesthetic', likes: [220, 420], comments: [18, 45], shares: [12, 35] },
    { text: "the font isn't the problem. it's never the font. the problem is your layout.", likes: [360, 640], comments: [30, 70], shares: [22, 55] },
    { text: "day 14 of posting design teardowns. someone told me yesterday it helped them land a job. this is why I do it 🥹", mood: { emoji: '✨', label: 'Feeling cute' }, likes: [720, 1100], comments: [60, 100], shares: [48, 90] },
  ],

  'demo_user_zaid_photo': [
    { text: "MG Road at 6am hits different. no crowds, just the city waking up.", imageKeyword: 'empty city street morning fog', likes: [430, 750], comments: [30, 65], shares: [25, 55] },
    { text: "someone asked me what my 'editing style' is. honestly? I just try to make it look like how it felt when I took the shot.", likes: [310, 580], comments: [22, 50], shares: [18, 42] },
    { text: "the best camera is the one you have with you. yes this is my way of defending phone photography. no I will not apologize.", mood: { emoji: '😌', label: 'Peaceful' }, likes: [520, 900], comments: [45, 88], shares: [30, 68] },
    { text: "spent 3 hours at the fish market in Fort Kochi. came back with 400 frames. 3 are usable. this is the job.", imageKeyword: 'fish market photography candid', likes: [680, 1050], comments: [50, 95], shares: [40, 80] },
    { text: "golden hour in Kerala isn't just a photography thing, it's a spiritual experience.", imageKeyword: 'golden hour Kerala backwaters sunset', likes: [890, 1450], comments: [65, 120], shares: [58, 105] },
    { text: "gear post since everyone asks:\n\nSony A7C + 35mm 1.8\n\nthat's genuinely it. I've sold everything else. simplicity is underrated.", likes: [240, 480], comments: [35, 75], shares: [15, 40] },
    { text: "photographed a wedding last weekend. 9 hours on your feet in 34° heat. beautiful chaos. also I need new shoes.", mood: { emoji: '💀', label: 'Dead inside' }, likes: [560, 950], comments: [42, 85], shares: [28, 65] },
    { text: "the shot you delete today might be the shot you wish you kept in 5 years. I stop mass-deleting now.", likes: [380, 670], comments: [28, 58], shares: [20, 50] },
    { text: "rain photography > everything else. change my mind.", imageKeyword: 'rain street photography monsoon', likes: [490, 820], comments: [38, 78], shares: [32, 70] },
    { text: "the moment a stranger notices you photographing them and smiles instead of shielding their face is the greatest trust you can earn.", mood: { emoji: '✨', label: 'Feeling cute' }, likes: [640, 1050], comments: [48, 92], shares: [42, 85] },
  ],

  'demo_user_sneha_fitness': [
    { text: "the gym didn't fix my problems. but it gave me 60 minutes where my only problem was this set. that's worth a lot.", mood: { emoji: '🔥', label: 'Hyped' }, likes: [780, 1200], comments: [60, 110], shares: [55, 100] },
    { text: "your 'perfect diet' means nothing if you can't sustain it past Thursday. consistency over perfection. every time.", likes: [540, 920], comments: [42, 85], shares: [38, 78] },
    { text: "new PR on deadlift today 🥲 took 8 months of showing up when I really didn't want to.", mood: { emoji: '🚀', label: 'Productive' }, likes: [920, 1500], comments: [80, 145], shares: [65, 115] },
    { text: "nobody talks about how exhausting it is to be the 'fit friend' who has to justify every food choice at every outing. I'm tired of it.", mood: { emoji: '😤', label: 'Frustrated' }, likes: [670, 1100], comments: [75, 135], shares: [50, 95] },
    { text: "5am workouts are not for everyone and that's completely okay. the best time to workout is whenever you actually do it.", likes: [450, 780], comments: [35, 70], shares: [28, 60] },
    { text: "quick Monday routine if you're short on time:\n\n→ 10 min warmup\n→ 3x squat\n→ 3x push\n→ 3x hinge\n→ 5 min walk\n\n40 minutes. done. no excuses.", imageKeyword: 'gym workout routine fitness', likes: [380, 680], comments: [30, 65], shares: [35, 75] },
    { text: "the scale going up while getting stronger is a feature not a bug. muscle weighs more than fat. throw the scale out honestly.", likes: [820, 1300], comments: [70, 125], shares: [60, 110] },
    { text: "rest days are training days. your muscles grow when you sleep, not when you lift. protecting your sleep IS fitness.", mood: { emoji: '😌', label: 'Peaceful' }, likes: [490, 850], comments: [38, 80], shares: [32, 70] },
    { text: "I cancelled my gym membership and started training people from home. scariest and best decision I ever made.", likes: [610, 1000], comments: [52, 98], shares: [42, 85] },
    { text: "if one person reading this goes for a walk today instead of scrolling, I'll consider this account a success. go. now. I'll still be here.", mood: { emoji: '✨', label: 'Feeling cute' }, likes: [750, 1200], comments: [58, 105], shares: [55, 100] },
  ],

  'demo_user_rohan_music': [
    { text: "finished a track at 3am that I started 4 months ago. played it back once. deleted it. started over. this is the process.", mood: { emoji: '💀', label: 'Dead inside' }, likes: [320, 580], comments: [28, 62], shares: [18, 45] },
    { text: "the chord progression I've been obsessing over:\n\nAmaj7 → F#m → Dmaj7 → E\n\nit shouldn't work this well. it does.", likes: [180, 380], comments: [22, 55], shares: [12, 35] },
    { text: "new beat. made it in one take, 45 minute session, didn't overthink it. why is this one the best thing I've ever made.", mood: { emoji: '🔥', label: 'Hyped' }, likes: [420, 750], comments: [35, 78], shares: [28, 60] },
    { text: "gear that actually changed my workflow:\n\n→ MIDI keyboard on the bed, not at the desk\n→ 15 minute rule: if it doesn't spark in 15 min, move on\n→ voice memos > perfectionism\n\nthat's it.", likes: [260, 500], comments: [20, 48], shares: [15, 38] },
    { text: "the most useless music advice I keep seeing: 'just make music every day'. some days you make music. some days you listen. some days you stare at the ceiling. all of it is the job.", mood: { emoji: '😌', label: 'Peaceful' }, likes: [540, 920], comments: [45, 90], shares: [35, 72] },
    { text: "finally released something after 6 months of sitting on it. the paralysis is real. perfectionism is just fear wearing a sophisticated outfit.", likes: [480, 820], comments: [40, 82], shares: [30, 65] },
    { text: "someone used one of my free samples on a track that hit 200k streams. I got zero credit. I got zero royalties. I learned a very expensive lesson.", mood: { emoji: '😤', label: 'Frustrated' }, likes: [680, 1100], comments: [62, 115], shares: [48, 92] },
    { text: "playlist for late night sessions 🌙\n\nlink in bio. updated every Sunday. zero algorithm. pure feel.", imageKeyword: 'music studio late night aesthetic', likes: [290, 540], comments: [25, 58], shares: [20, 50] },
    { text: "people underestimate how much of music production is just sitting with discomfort. the track sounds bad. you keep going anyway.", likes: [350, 630], comments: [28, 65], shares: [22, 52] },
    { text: "made my first rupee from music today. ₹83 from streaming. framing this.", mood: { emoji: '✨', label: 'Feeling cute' }, likes: [890, 1450], comments: [90, 160], shares: [75, 130] },
  ],

  'demo_user_aisha_reads': [
    { text: "currently reading 4 books at once. this is not a flex. this is a cry for help.", mood: { emoji: '☕', label: 'Need coffee' }, likes: [380, 680], comments: [32, 70], shares: [22, 52] },
    { text: "the Midnight Library destroyed me in the best way. I keep thinking about it weeks later. that's the mark of a real book.", likes: [420, 760], comments: [38, 80], shares: [30, 65] },
    { text: "unpopular bookish opinion: DNF-ing a book is not quitting. it's editing your time. life is too short for books that aren't right for you right now.", likes: [510, 880], comments: [45, 92], shares: [35, 75] },
    { text: "annotating my books with a pencil and people treating me like I committed a crime. it's my book. the annotations ARE the experience.", mood: { emoji: '😤', label: 'Frustrated' }, likes: [290, 550], comments: [30, 68], shares: [18, 45] },
    { text: "books I read this month:\n\n→ Pachinko — 5/5 devastated\n→ The God of Small Things — 5/5 devastated differently\n→ Project Hail Mary — 5/5 did not expect the feelings\n\nthemes of the month: apparently crying", imageKeyword: 'books reading aesthetic cozy', likes: [460, 820], comments: [40, 85], shares: [32, 70] },
    { text: "a good book recommendation is one of the most intimate things you can give someone. you're essentially saying 'I think you'll feel things in the same places I did'.", mood: { emoji: '😌', label: 'Peaceful' }, likes: [620, 1050], comments: [48, 95], shares: [42, 85] },
    { text: "the Kozhikode beach at sunset with a book and cutting chai. I have solved the human condition.", imageKeyword: 'beach reading sunset chai', likes: [750, 1200], comments: [55, 100], shares: [50, 95] },
    { text: "someone asked me why I don't just use a Kindle. friend I need to smell the paper. this is not a debate I'm willing to have.", likes: [480, 860], comments: [42, 88], shares: [30, 65] },
    { text: "starting a tiny book club in Kozhikode. first meeting is Sunday at 5pm. DM if you want in. all genres welcome. just bring chai money.", mood: { emoji: '🔥', label: 'Hyped' }, likes: [310, 590], comments: [55, 105], shares: [28, 60] },
    { text: "rereading a book you loved at 16 as an adult is one of the strangest experiences. same sentences. completely different person reading them.", likes: [560, 960], comments: [45, 92], shares: [38, 78] },
  ],

  'demo_user_dev_startup': [
    { text: "we just crossed ₹10L MRR. 14 months ago I was pitching to rooms of 3 people who were half-listening. compounding is real but it's invisible for a long time.", mood: { emoji: '🔥', label: 'Hyped' }, likes: [1800, 2800], comments: [140, 220], shares: [120, 200] },
    { text: "the mistake I see every early founder make: hiring to solve problems instead of hiring to scale solutions. if it's still a mess, adding headcount makes it a bigger mess.", likes: [980, 1600], comments: [85, 150], shares: [70, 130] },
    { text: "honest reflection: my first product failed because I was building what I thought was cool, not what people would pay for. the pivot that saved us was embarrassingly simple.", likes: [1200, 1900], comments: [100, 175], shares: [90, 160] },
    { text: "your pricing is probably too low. I've raised prices 3 times. churned zero customers each time. the fear is worse than the reality.", likes: [860, 1400], comments: [72, 135], shares: [62, 118] },
    { text: "what nobody tells you about YC:\n\nthe network is real but it's not magic. the real value is the pressure to think clearly. the batch forces you to articulate things you were vague about.", likes: [740, 1250], comments: [65, 125], shares: [55, 108] },
    { text: "a VC passed on us saying our market was 'too niche'. we just closed a deal with the largest player in that niche. niche is not small. niche is focused.", mood: { emoji: '😌', label: 'Peaceful' }, likes: [1450, 2200], comments: [110, 190], shares: [100, 175] },
    { text: "daily routine that works for me:\n\n6am: walk, no phone\n7am: writing / thinking\n9am: first meeting\n12pm: deep work block\n5pm: cutoff\n\nI protect the morning like it's my only asset. because it is.", imageKeyword: 'entrepreneur morning routine desk', likes: [680, 1150], comments: [58, 112], shares: [48, 98] },
    { text: "we tried to be everything to everyone in year one. almost killed the company. the best strategic decision we made was firing 60% of our own feature set.", likes: [920, 1550], comments: [78, 145], shares: [68, 128] },
    { text: "cold email that worked: 3 sentences. problem, how we solve it, one specific result. no fluff. 22% reply rate. that's it.", likes: [1100, 1800], comments: [90, 165], shares: [82, 150] },
    { text: "building a company is mostly just making decisions with incomplete information slightly faster than everyone else.", mood: { emoji: '☕', label: 'Need coffee' }, likes: [760, 1280], comments: [62, 118], shares: [52, 102] },
    { text: "to every founder grinding quietly right now: the lack of noise around you isn't failure. it's just early.", mood: { emoji: '✨', label: 'Feeling cute' }, likes: [1650, 2600], comments: [130, 215], shares: [115, 195] },
  ],

  'demo_user_meera_food': [
    { text: "made my thatha's fish curry from memory today. no written recipe, no measurements. just smell and instinct. tasted exactly right. started crying halfway through. food is wild.", mood: { emoji: '😭', label: 'Crying' }, likes: [890, 1450], comments: [80, 145], shares: [65, 120] },
    { text: "Thalassery biryani vs Kozhikode biryani discourse will not happen on my page. they're both perfect for different reasons. this is not a debate.", likes: [620, 1050], comments: [75, 140], shares: [48, 95] },
    { text: "recipe for the sambar that makes people ask for the recipe:\n\ntamarind, tomato, toor dal, pearl onions, drumstick, and enough time. the last ingredient is non-negotiable.", imageKeyword: 'South Indian sambar dal recipe', likes: [480, 860], comments: [42, 88], shares: [35, 75] },
    { text: "going to restaurants as a food blogger is psychologically complicated. I can't just eat. I'm always working. my family has accepted this.", mood: { emoji: '☕', label: 'Need coffee' }, likes: [340, 640], comments: [32, 70], shares: [22, 55] },
    { text: "the most underrated Kerala snack: banana chips with a cup of black tea at 4pm. I will not be taking questions.", imageKeyword: 'Kerala banana chips snack tea', likes: [720, 1200], comments: [58, 108], shares: [52, 100] },
    { text: "cooking is a love language. when my amma makes food for someone she doesn't even particularly like, she still makes it with full care. that taught me everything.", mood: { emoji: '😌', label: 'Peaceful' }, likes: [840, 1380], comments: [70, 128], shares: [60, 112] },
    { text: "people who season at the end only: we need to talk.", likes: [560, 980], comments: [65, 125], shares: [42, 88] },
    { text: "new series starting this week: cooking on a ₹200 budget that doesn't taste like a ₹200 budget. first up: dal tadka that slaps.", imageKeyword: 'dal tadka recipe budget cooking', likes: [410, 740], comments: [38, 80], shares: [30, 65] },
    { text: "the chai I make at 6am and the chai I make at 6pm are different products. I don't make the rules.", mood: { emoji: '🔥', label: 'Hyped' }, likes: [650, 1100], comments: [52, 100], shares: [45, 90] },
    { text: "hosting a small dinner for strangers next Saturday in Thrissur. pay what you want. just come hungry and ready to talk. DM for details.", likes: [380, 720], comments: [68, 130], shares: [48, 95] },
  ],

  'demo_user_faris_memes': [
    { text: "me explaining to my amma why I need a second monitor for 'productivity': 🧍", likes: [480, 850], comments: [55, 108], shares: [40, 85] },
    { text: "the audacity of my alarm clock honestly. who approved this.", mood: { emoji: '💀', label: 'Dead inside' }, likes: [620, 1050], comments: [48, 98], shares: [45, 92] },
    { text: "3 stages of a college assignment:\n\n1. I'll start early this time\n2. okay I have a week\n3. 4am the night before asking ChatGPT to explain what the question even means", likes: [890, 1450], comments: [80, 150], shares: [70, 130] },
    { text: "friendship ended with attendance percentage. now CGPA is my problem.", likes: [540, 950], comments: [42, 88], shares: [38, 80] },
    { text: "Kerala summer be like: step outside for 30 seconds and immediately understand why people move to Canada.", mood: { emoji: '😤', label: 'Frustrated' }, likes: [720, 1200], comments: [60, 115], shares: [55, 105] },
    { text: "Calicut University WiFi when I need to submit an assignment vs Calicut University WiFi when I'm literally just trying to exist:", imageKeyword: 'slow internet frustrated meme', likes: [660, 1100], comments: [55, 108], shares: [50, 98] },
    { text: "my productivity today:\n\n→ opened laptop\n→ looked at assignments\n→ closed laptop\n→ made tea\n→ posted this\n\nimpressive stuff.", mood: { emoji: '😌', label: 'Peaceful' }, likes: [750, 1250], comments: [65, 125], shares: [58, 112] },
    { text: "interviewer: where do you see yourself in 5 years\nme: existing hopefully, that's kind of the dream right now", likes: [880, 1450], comments: [75, 140], shares: [68, 128] },
    { text: "the one thing about Mallu parents: no matter what career you pick, the first response is 'but what about engineering'.", likes: [920, 1550], comments: [85, 158], shares: [72, 138] },
    { text: "petition to make 'I sent it to your email' illegal. just tell me the thing. directly. in the message. I beg.", mood: { emoji: '😤', label: 'Frustrated' }, likes: [560, 980], comments: [48, 98], shares: [42, 88] },
  ],

  'demo_user_lakshmi_career': [
    { text: "I went from high school teacher to Product Manager in 18 months with no tech background.\n\nthe single thing that got me interviews: I documented every experiment I ran as a teacher using PM frameworks. your past experience IS transferable. reframe it.", mood: { emoji: '🚀', label: 'Productive' }, likes: [1200, 1950], comments: [110, 190], shares: [95, 170] },
    { text: "nobody told me that PM work is 70% managing up, 20% managing across, and 10% actually doing product things. adjust your expectations accordingly.", likes: [780, 1300], comments: [68, 128], shares: [58, 112] },
    { text: "the imposter syndrome doesn't go away when you get the title. it just wears a blazer now.", mood: { emoji: '😭', label: 'Crying' }, likes: [920, 1550], comments: [85, 158], shares: [72, 138] },
    { text: "my first sprint planning as a PM:\n\nme: confident, framework-ready\ndev lead: 'what does done mean for this ticket'\nme: learning began that day", likes: [650, 1100], comments: [55, 108], shares: [45, 95] },
    { text: "free resource thread for career changers into tech:\n\n→ Lenny's Newsletter\n→ Shreyas Doshi on Twitter\n→ Pragmatic Institute free courses\n→ just… read YC startup post-mortems. all of them.\n\nbookmark this.", imageKeyword: 'career growth learning notes laptop', likes: [540, 960], comments: [48, 98], shares: [52, 108] },
    { text: "the best PM skill nobody teaches: being wrong fast and cheaply. hypothesis → test → kill or iterate. most PMs take too long to kill their own ideas.", likes: [680, 1150], comments: [58, 112], shares: [50, 100] },
    { text: "I took a 40% pay cut to switch careers. 18 months later I'm earning more than I ever did as a teacher. the dip is real. so is the other side of it.", mood: { emoji: '✨', label: 'Feeling cute' }, likes: [1050, 1750], comments: [95, 170], shares: [82, 155] },
    { text: "mentorship ask: if you're a senior PM who has 30 minutes a month, I will make it worth your time. I come prepared, I take notes, I follow up. DMs open.", likes: [340, 650], comments: [62, 122], shares: [28, 65] },
    { text: "something they don't tell you about a career pivot: you grieve your old identity. I was 'the teacher' for 6 years. letting that go was unexpectedly hard.", mood: { emoji: '😌', label: 'Peaceful' }, likes: [780, 1300], comments: [70, 135], shares: [58, 112] },
    { text: "your network is not your net worth. but the right mentor conversation at the right time absolutely changes your trajectory. invest in relationships, not connections.", likes: [580, 1000], comments: [48, 95], shares: [42, 88] },
  ],
};

// =============================================================================
// HELPERS
// =============================================================================
const rand = (min: number, max: number) =>
  Math.floor(Math.random() * (max - min + 1)) + min;

const IMAGE_POOL = [
  'technology', 'workspace', 'coffee shop', 'neon city night',
  'nature trail Kerala', 'coding laptop', 'street photography India',
  'monsoon rain', 'Indian food', 'fitness gym', 'music studio',
  'books reading cozy', 'startup office', 'beach sunset',
];

// =============================================================================
// HOOK
// =============================================================================
export const useDemoBot = () => {
  const hasRun = useRef(false);

  useEffect(() => {
    if (hasRun.current) return;
    hasRun.current = true;

    const runBot = async () => {
      if (!auth.currentUser) return;

      try {
        const postsRef = collection(db, 'posts');

        // Check if we already seeded (look for any post from first persona)
        const checkQ = query(
          postsRef,
          where('userId', '==', 'demo_user_arjun_dev'),
          limit(1)
        );
        const checkSnap = await getDocs(checkQ);

        if (!checkSnap.empty) {
          // Already seeded — run the original hourly heartbeat instead
          const latestQ = query(
            postsRef,
            where('userId', '==', 'demo_user_arjun_dev'),
            orderBy('createdAt', 'desc'),
            limit(1)
          );
          const latestSnap = await getDocs(latestQ);
          const lastPostTime = latestSnap.empty
            ? Date.now() - 25 * 3600000
            : new Date(latestSnap.docs[0].data().createdAt).getTime();

          if (Date.now() - lastPostTime < 3600000) return;
        }

        console.log('[NetoLynk Engine] Seeding 100+ demo posts across 10 personas...');
        const now = Date.now();
        const HOUR = 3600000;

        // -----------------------------------------------------------------------
        // 1. Upsert all persona user profiles
        // -----------------------------------------------------------------------
        for (const p of PERSONAS) {
          const userRef = doc(db, `users/${p.uid}`);
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
                coverImage: `https://images.unsplash.com/photo-1557804506-669a67965ba0?w=1200&q=80`,
                followersCount: p.followersCount,
                followingCount: rand(80, 400),
                postsCount: POSTS_BY_PERSONA[p.uid]?.length ?? 10,
                verified: p.verified ?? false,
                createdAt: new Date(now - rand(30, 180) * 24 * HOUR).toISOString(),
              });
            }
          } catch (e) {
            console.warn(`[NetoLynk Engine] Could not upsert profile ${p.uid}`, e);
          }
        }

        // -----------------------------------------------------------------------
        // 2. Build all posts with shuffled, interleaved timestamps
        // -----------------------------------------------------------------------
        const allPosts: Array<{
          persona: typeof PERSONAS[0];
          post: typeof POSTS_BY_PERSONA[string][0];
          fakeTime: string;
        }> = [];

        for (const persona of PERSONAS) {
          const posts = POSTS_BY_PERSONA[persona.uid] ?? [];
          posts.forEach((post, i) => {
            // Spread each persona's posts across the last 7 days, non-uniformly
            const hoursBack = rand(1, 168);
            const jitter = i * rand(2, 10) * HOUR;
            const fakeTime = new Date(now - hoursBack * HOUR - jitter).toISOString();
            allPosts.push({ persona, post, fakeTime });
          });
        }

        // Shuffle so personas interleave naturally in the feed
        allPosts.sort(() => Math.random() - 0.5);

        // -----------------------------------------------------------------------
        // 3. Write in batched chunks (Firestore max: 500 ops per batch)
        // -----------------------------------------------------------------------
        let batch = writeBatch(db);
        let opCount = 0;

        for (const { persona, post, fakeTime } of allPosts) {
          const includeImage = !!post.imageKeyword || Math.random() > 0.65;
          const keyword = post.imageKeyword ?? IMAGE_POOL[rand(0, IMAGE_POOL.length - 1)];
          const sig = `${persona.uid.slice(-4)}_${rand(1000, 9999)}`;
          const mediaUrls = includeImage
            ? [`https://images.unsplash.com/photo-1557804506-669a67965ba0?w=800&q=80&sig=${sig}`]
            : [];

          const newPostRef = doc(postsRef);
          batch.set(newPostRef, {
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

          opCount++;

          // Flush before hitting the 500-op Firestore limit
          if (opCount >= 490) {
            await batch.commit();
            batch = writeBatch(db);
            opCount = 0;
          }
        }

        if (opCount > 0) await batch.commit();

        console.log(`[NetoLynk Engine] ✅ Seeded ${allPosts.length} posts across ${PERSONAS.length} personas.`);

      } catch (err) {
        console.error('[NetoLynk Engine] Seeding failed:', err);
      }
    };

    runBot();
  }, []);
};
