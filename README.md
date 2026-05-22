# NetoLynk

**A full-scale social media PWA built by NGAI (Nishal Global AI)**

NetoLynk is a real-time, multi-feature social network covering the full spectrum of modern social media — algorithmic text/image/video posts, TikTok-style short videos (Lynks), Instagram-style 24-hour stories (Blinks), real-time direct messages, an embedded AI assistant, and a custom analytics engine — all on a Firebase + React 19 stack.

---

## Table of Contents

- [Tech Stack](#tech-stack)
- [Feature Overview](#feature-overview)
- [Project Structure](#project-structure)
- [Data Model (Firestore Collections)](#data-model-firestore-collections)
- [Algorithms](#algorithms)
- [Cloud Functions](#cloud-functions)
- [Security Rules](#security-rules)
- [Environment Variables](#environment-variables)
- [Local Development](#local-development)
- [Build & Deploy](#build--deploy)
- [PWA Configuration](#pwa-configuration)
- [Error Tracking (Sentry)](#error-tracking-sentry)
- [Demo Bot](#demo-bot)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend framework | React 19 + TypeScript |
| Build tool | Vite 6 |
| Styling | Tailwind CSS v4 (via `@tailwindcss/vite`) |
| Animation | Framer Motion (`motion` v12) |
| Routing | React Router v7 |
| Backend | Firebase v12 (Auth, Firestore, Storage, Functions v2, FCM) |
| AI assistant | Groq API — `groq/compound` model, streaming SSE |
| Gemini proxy | Google Generative AI via Firebase Cloud Function (key never leaves server) |
| Media hosting | Cloudinary (Blinks — images ≤ 10 MB, videos ≤ 50 MB) |
| Video player | YouTube IFrame API (Lynks) |
| Error tracking | Sentry (`@sentry/react`) |
| Toast notifications | Sonner |
| Image compression | `browser-image-compression` |
| Date formatting | `date-fns` |

---

## Feature Overview

### Authentication & Onboarding

- **Email/password login** via Firebase Auth with `browserLocalPersistence` so sessions survive page reloads.
- **10-step onboarding flow**: Email → Password → Birthday → Privacy/Terms → Display name → Username (real-time availability check with debounce) → Profile photo (compressed before upload) → Contacts → Follow 5 suggested accounts → All Set.
- **Multi-account switcher**: stores display-only metadata (`uid`, `username`, `displayName`, `profileImage`, `email`) in `localStorage`. No passwords are ever stored locally. When a Firebase session expires the user is prompted to re-enter their password. Long-press the profile avatar in the sidebar to open the switcher.
- **DiceBear avatars** (`avataaars`) used as fallback profile images.

---

### Posts (Home Feed)

Post types supported: `text`, `image`, `video`, `poll`, `quiz`, `gif`.

**Moods** — optional per-post mood tag (8 options):

| Mood | Emoji |
|---|---|
| Frustrated | 😤 |
| Peaceful | 😌 |
| Dead inside | 💀 |
| Hyped | 🔥 |
| Feeling cute | ✨ |
| Need coffee | ☕ |
| Crying | 😭 |
| Productive | 🚀 |

**Feed tabs on Home:**
- **For You** — all posts ranked by the Gravity Algorithm (see [Algorithms](#algorithms)).
- **Following** — chronological posts from users you follow.
- **Vibes** — only posts with a mood set.

**Infinite scroll** — first page uses a live Firestore `onSnapshot` listener so new posts from the demo bot or real users appear instantly. Subsequent pages are loaded via `getDocs` with cursor pagination (15 posts per page), merged into state.

**Post interactions:** like (with optimistic UI + cache), comment (with GIF support and `@mention` parsing), share (copy link / Twitter / WhatsApp), save/bookmark, delete (owner only), mood display.

**Polls:** multi-option voting with percentage bars. Votes are stored per option with `votedBy` arrays.

**Quizzes:** up to 4 options, one correct answer, optional explanation reveal on answer.

**@Mentions:** `processMentions()` in `src/lib/mentionUtils.ts` — extracts `@username` tokens from post or comment text, looks up users by username in Firestore, then (a) creates a notification and (b) sends a DM to each mentioned user (up to 10 per post).

---

### Lynks (Short Video Feed)

Lynks is a TikTok-style vertical video feature. Videos are stored as YouTube video IDs — no raw video files are served from Firebase Storage in the public feed.

**Upload flow (`/create-lynk`):**
1. User selects a video file (5–60 seconds, max 100 MB).
2. Client-side thumbnail generation via an off-screen `<canvas>` at 540×960 (9:16 portrait).
3. Thumbnail uploaded to `lynks/thumbnails/` in Firebase Storage.
4. Video uploaded to `lynks/videos/` with resumable upload and progress tracking.
5. On success, a Lynk document is written to Firestore with all metadata.

New Lynks receive a 24-hour **boost window** (`boostExpiresAt`) so zero-engagement uploads still appear in feeds.

**Feed types:**
- **For You** — client-side scored batch, ranked by the Lynk Scoring Engine (see [Algorithms](#algorithms)).
- **Following** — videos from followed accounts, chronological (Firestore `in` query, max 10 UIDs).
- **Trending** — `isTrending == true` documents sorted by `viewsCount` descending.

**LynkPlayer (`src/components/Lynks/LynkPlayer.tsx`):**
- Wraps the YouTube IFrame API inside a custom full-screen player with no native YouTube controls.
- Double-tap to like (heart animation).
- Single-tap to play/pause.
- Real watch-time tracking via `setInterval`; batched to Firestore every 15 s via `MetricsSyncQueue`.
- Like/save/share/comment buttons on the right edge.
- Comments in a bottom sheet via `LynkCommentsSheet`.

**Creator Analytics** (`CreatorAnalytics.tsx`): shows completion rate, skip rate, and replay count per Lynk.

**Hashtag pages** (`/lynks/tag/:tag`): grid of 9:16 thumbnail cards fetched via `fetchByHashtag()`.

**Moderation:** `reportLynk()` increments `reportCount`; auto-hides the Lynk when count ≥ 5.

**Firestore collections used by Lynks:**

| Collection | Purpose |
|---|---|
| `lynks` | Lynk documents |
| `lynkLikes` | `{lynkId}_{userId}` keyed like records |
| `lynkComments` | Comments per Lynk |
| `lynkViews` | Unique view records per `{lynkId}_{userId}` |
| `watchTimeLogs` | Per-session watch time logs |
| `lynkSaves` | Save/bookmark records |
| `lynkReports` | Report records |

---

### Blinks (24-Hour Stories)

Blinks are ephemeral photo/video stories that expire exactly 24 hours after creation.

**Upload (`/create-blink`):**
- Media uploaded to **Cloudinary** (`cloud_name: dmwnywqes`, `upload_preset: blinks`) using the `fetch` API — more reliable than the Firebase SDK on mobile data connections.
- Images up to 10 MB, videos up to 50 MB.
- Editor tools: text overlay (12 colours, 3 fonts), freehand drawing canvas (4 brush sizes, 8 colours), 8 visual effects/filters (Normal, Vivid, Noir, Warm, Cool, Fade, Drama, Dreamy), Tenor GIF sticker picker, iTunes music search with 30-second preview playback.

**BlinkBar** — horizontal scrollable strip at the top of the Home feed. The current user's "Add" button always appears first; followed users with unseen blinks appear before those already viewed. Unseen blinks shown with a coloured ring.

**BlinkViewer** — full-screen viewer with:
- Segmented progress bars per blink in a user's set.
- Auto-advance (5 s per image; video plays to end).
- Tap left half to go back, right half to advance.
- Swipe-up or press X to close.
- Quick emoji reactions (❤️ 🔥 😂 😮 😢 👏) written to `blinks/{blinkId}/reactions`.
- Text reply input — creates a reply document in `blinks/{blinkId}/replies` and a notification for the blink owner.
- Owner can delete their own blinks.

**Expiry cleanup:** `cleanExpiredBlinks` Cloud Function (scheduled hourly) deletes expired blink documents, their sub-collections (reactions, replies), and the media file from Cloudinary/Storage.

---

### Direct Messages

Full-featured real-time messaging at `/messages`.

**Conversation list** — shows all chats the user participates in, sorted by `updatedAt`, with unread badges. New chat creation via user search.

**Chat view features:**
- Send text, images (compressed before upload to `chats/{chatId}/`), GIFs (Tenor picker), shared posts (inline preview card).
- Message reactions — tap/long-press a message to open an emoji picker; reactions stored in `reactions` map on the message document.
- Reply to message — shows a quoted preview above the input.
- Unsend/delete your own messages (`deleted: true` soft-delete, shown as "Message deleted").
- Download or zoom image attachments.
- Typing indicators and read receipts.
- Unread count tracked per user in `unreadCount.{uid}` on the chat document; cleared on open.
- Block user / report chat from the `⋮` menu.
- Delete entire conversation (calls the `deleteChat` Cloud Function which recursively deletes all sub-documents).
- **Neto AI chat** accessible from the messages list — opens `NetoAIChat` in a dedicated panel.

**Navigation badge** — the Messages icon in the nav shows a live unread count summed across all chats.

---

### Notifications

**In-app notifications** (`/notifications`):
- Notification types: `like`, `comment`, `follow`, `message`, `post_alert`, `system`, `blink_reply`, `new_blink`.
- Personal notifications filtered by `recipientId == currentUser.uid`.
- System-wide announcements stored with `recipientId == 'all'`.
- Merged and sorted by `createdAt` descending.
- Mark as read on tap; navigates to the relevant post or profile.
- Unread badge on nav icon via live `onSnapshot` query.

**Push notifications (FCM):**
- `usePushNotifications` hook requests browser notification permission on mount and stores the FCM token to `users/{uid}.fcmToken`.
- VAPID key configured for web push.
- `sendPushNotification` Cloud Function sends a push message when called with `recipientId`, `title`, `body`.
- Service worker at `public/firebase-messaging-sw.js` handles background messages.

---

### Neto AI (AI Assistant)

Accessible from the Messages page or sidebar. Powered by the **Groq API** (`groq/compound` model) with real-time streaming.

**Behaviour:**
- Streams token-by-token via SSE (`data:` lines from the Groq completions endpoint).
- Maintains conversation history — last 8 messages sent as context on each request.
- Stop-generation button aborts the in-flight `fetch` via `AbortController`.
- Context-aware **quick suggestion chips** regenerated after each AI reply based on keywords in the conversation.
- Context-aware **info cards** (type: `feature`, `tip`, `stat`, `action`) shown below AI messages.
- System prompt encodes full platform knowledge: feed algorithm formula, mood list, onboarding steps, notification types, multi-account mechanics, DM features, Vibe Rooms, and more.

**Configuration:** Requires `VITE_GROQ_API_KEY` as a Vite environment variable.

---

### Explore

- **User search** — client-side filter over a Firestore snapshot of up to 50 users by `username` or `displayName`.
- **Trending posts** — top 10 posts ordered by `likesCount` descending.
- **Trending Lynks** — top 6 Lynks from `fetchTrendingFeed()`.

---

### Profile

Route: `/profile/:username`

- Displays bio, follower/following counts, verified badge, join date.
- Three tabs: **Posts**, **Liked posts**, **Saved posts**.
- Follow/Unfollow with optimistic counter update using Firestore `writeBatch`.
- **Message** button — creates or opens an existing chat and navigates to it.
- Settings shortcut for own profile.

---

### Settings

- **Notifications** — navigates to `/notifications`.
- **Privacy** — private account toggle (UI shell; enforcement deferred).
- **Security** — password reset email via `sendPasswordResetEmail`.
- **Display** — light/dark theme toggle (also accessible from the sidebar).
- **Language** — language preferences (UI shell).
- **Help & Support** — navigates to `/support`.
- **NetoLynk Reviews** — navigates to `/reviews`.

---

### Support Page (`/support`)

A 4-step multi-stage feedback form:

1. **Form** — category selection (Bug Report 🐞, Feature Request 💡, General Feedback 💬) + message text.
2. **Quality analysis** — pure client-side NLP scores the submission on Clarity, Detail, Relevance, and Tone (0–100 each). Prompts improvement if quality is low.
3. **Review** — user confirms or edits their submission.
4. **Done** — submission written to Firestore (`support_submissions`) and sent via **EmailJS** (`service_unc0m3d` / `template_h4xia97`).

---

### Reviews Page (`/reviews`)

Live leaderboard of user reviews fetched from the `reviews` Firestore collection via `onSnapshot`. Displays star ratings, review text, category badge, and avatar. The `onLowReviewCreated` Cloud Function fires an alert to `analytics_alerts` when a review with ≤ 2 stars is submitted.

---

### Activity Page (`/activity`)

Shows posts the current user has liked (fetched via `likedBy array-contains` query). Placeholder for a fuller activity feed in future versions.

---

### Theme

- Light and dark mode, persisted in `localStorage`.
- Auto-detects system preference via `window.matchMedia('(prefers-color-scheme: dark)')`.
- Changes apply via a CSS class (`light`/`dark`) on `<html>`.
- Toggle available in both the sidebar (desktop) and top header (mobile).

---

## Project Structure

```
NetoLynk-main/
├── public/
│   ├── manifest.json           # PWA manifest
│   ├── sw.js                   # Service worker (static shell)
│   ├── firebase-messaging-sw.js # FCM background message handler
│   ├── sitemap.xml
│   └── netolynk-logo.png
├── src/
│   ├── main.tsx                # Entry — Sentry init + SW registration + React root
│   ├── App.tsx                 # Router, layout (Sidebar, TopHeader, BottomNav, right panel)
│   ├── index.css               # Tailwind v4 base styles
│   ├── types/
│   │   ├── index.ts            # User, Post, Comment, Notification, Chat, Message
│   │   ├── lynk.ts             # Lynk, LynkCategory, LynkView, LynkComment, FeedType, LynkUploadState
│   │   └── blink.ts            # Blink, BlinkReaction, BlinkReply, UserBlinks, BlinkUploadState
│   ├── lib/
│   │   ├── firebase.ts         # App init — Auth, Firestore, Storage (explicit gs:// bucket), Functions
│   │   ├── analytics.ts        # Event tracking, session management, daily batch flush, presence
│   │   ├── lynkService.ts      # All Lynk Firestore ops (feed queries, CRUD, likes, views, reports)
│   │   ├── lynkRecommendation.ts # Lynk scoring formula + session history
│   │   ├── metricsQueue.ts     # 15-second batched watch-time + skip/replay flush to Firestore
│   │   ├── mentionUtils.ts     # @mention extraction → notifications + DMs
│   │   └── utils.ts            # cn() (clsx + tailwind-merge), formatDate()
│   ├── context/
│   │   ├── AuthContext.tsx     # Firebase onAuthStateChanged + Firestore user profile live sync
│   │   ├── ThemeContext.tsx    # light/dark theme state + localStorage + system-pref listener
│   │   └── AccountSwitcherContext.tsx # Multi-account state, localStorage persistence
│   ├── hooks/
│   │   ├── useAnalytics.ts     # Wraps analytics.ts; session start/end tied to auth
│   │   ├── useBlinks.ts        # Live blinks feed, groupByUser, markViewed, sendReaction, sendReply
│   │   ├── useBlinkUpload.ts   # Cloudinary upload, progress tracking, Firestore write
│   │   ├── useDemoBot.ts       # Seeds 10 demo personas and their posts to Firestore
│   │   ├── useFirestore.ts     # useCollection (live) + useInfiniteFeed (live first page + pagination)
│   │   ├── useInfiniteScroll.ts # Alias / extended infinite scroll utilities
│   │   ├── useLynkFeed.ts      # Paginated + ranked Lynks feed (For You / Following / Trending)
│   │   ├── useLynkUpload.ts    # Video validation, thumbnail generation, Firebase Storage upload
│   │   ├── useNetoAI.ts        # Groq streaming chat, suggestion/card generation, abort control
│   │   ├── usePageTitle.ts     # document.title = "<title> | Netolynk"
│   │   └── usePushNotifications.ts # FCM token registration + save to Firestore
│   ├── components/
│   │   ├── AI/
│   │   │   └── NetoAIChat.tsx  # Chat UI — streaming render, cards, suggestions, copy, stop
│   │   ├── Auth/
│   │   │   ├── AuthForm.tsx    # Login form + saved accounts list
│   │   │   └── OnboardingFlow.tsx # 10-step animated onboarding
│   │   ├── Blinks/
│   │   │   ├── BlinkBar.tsx    # Home-page story ring bar
│   │   │   ├── BlinkViewer.tsx # Full-screen viewer with progress bars + reactions + replies
│   │   │   └── CreateBlinkPage.tsx # Full editor: camera/gallery, drawing, text, stickers, music
│   │   ├── Feed/
│   │   │   ├── CreatePost.tsx  # Compose — text, image, poll, quiz, GIF, mood, @mention
│   │   │   └── PostCard.tsx    # Rendered post — all interactions, poll/quiz inline, mood icon
│   │   ├── Layout/
│   │   │   └── Navigation.tsx  # Sidebar (desktop), TopHeader (mobile), BottomNav, unread badges
│   │   ├── Lynks/
│   │   │   ├── CreatorAnalytics.tsx  # Completion %, skip %, replay count
│   │   │   ├── LynkCommentsSheet.tsx # Bottom sheet comment thread
│   │   │   ├── LynkFeed.tsx          # Vertical snap-scroll feed wrapper
│   │   │   ├── LynkPlayer.tsx        # YouTube IFrame player + interactions + watch time
│   │   │   ├── LynkReportModal.tsx   # Report reason picker
│   │   │   └── LynksGrid.tsx         # Profile grid of 9:16 thumbnail cards
│   │   ├── Profile/
│   │   │   └── EditProfileModal.tsx  # Display name, bio, profile/cover image upload
│   │   └── UI/
│   │       ├── GifPicker.tsx         # Tenor API search + trending GIFs
│   │       └── MentionTextarea.tsx   # Textarea with @username autocomplete dropdown
│   └── pages/
│       ├── Home.tsx            # Feed tabs, Blinks bar, gravity-sorted posts, IntersectionObserver scroll
│       ├── Explore.tsx         # User search, trending posts, trending Lynks
│       ├── Notifications.tsx   # Merged personal + system notifications
│       ├── Messages.tsx        # Chat list + full chat view (40+ KB — the largest file)
│       ├── Profile.tsx         # Public profile with Posts / Liked / Saved tabs
│       ├── PostDetails.tsx     # Single post with paginated comments, GIF replies, @mentions
│       ├── CreatePostPage.tsx  # Full-page post composer (mirrors CreatePost component)
│       ├── CreateLynkPage.tsx  # Lynk upload wizard (pick → details → uploading → done)
│       ├── EditProfilePage.tsx # Edit name, bio, avatar, cover image
│       ├── LynksPage.tsx       # Full-screen TikTok-style vertical feed with strategic scoring
│       ├── LynkHashtagPage.tsx # Grid of Lynks for a given hashtag
│       ├── Activity.tsx        # Posts the current user has liked
│       ├── Settings.tsx        # Settings menu with sub-views
│       ├── SupportPage.tsx     # 4-step support/feedback form with client-side quality analysis
│       └── ReviewsPage.tsx     # Live user reviews feed with star ratings
├── functions/
│   ├── src/index.ts            # All Cloud Functions (v2)
│   ├── analyticsHandlers.ts    # Analytics Cloud Function extensions
│   ├── blinkFunctions.ts       # Blink cleanup + follower notification functions
│   ├── package.json
│   └── tsconfig.json
├── api/
│   └── uploadYouTube.ts        # Express endpoint for YouTube resumable upload (server-side)
├── firebase.json               # Hosting, Firestore, Storage, Functions config
├── firestore.rules             # Security rules for all collections
├── storage.rules               # Storage security rules
├── firebase-applet-config.json # Firebase SDK config (committed; contains no secrets)
├── firebase-blueprint.json     # Firestore indexes / structure reference
├── .env.example                # Environment variable template
├── vite.config.ts              # Vite + React + Tailwind + path alias (@/)
├── tsconfig.json
└── package.json
```

---

## Data Model (Firestore Collections)

| Collection | Key Fields |
|---|---|
| `users` | `uid`, `username`, `displayName`, `email`, `bio`, `profileImage`, `coverImage`, `followersCount`, `followingCount`, `postsCount`, `verified`, `createdAt`, `fcmToken` |
| `users/{uid}/followers` | `{followerId}` documents |
| `users/{uid}/following` | `{followingId}` documents |
| `posts` | `userId`, `username`, `text`, `mediaUrls`, `gifUrl`, `type`, `mood`, `pollOptions`, `quizOptions`, `likesCount`, `commentsCount`, `sharesCount`, `likedBy`, `savedBy`, `tags`, `mentions`, `createdAt` |
| `posts/{postId}/comments` | `userId`, `username`, `text`, `gifUrl`, `createdAt` |
| `posts/{postId}/likes` | `{userId}` documents (counter maintained by Cloud Function) |
| `chats` | `participants[]`, `participantDetails`, `lastMessage`, `lastMessageAt`, `updatedAt`, `unreadCount.{uid}` |
| `chats/{chatId}/messages` | `senderId`, `text`, `mediaUrl`, `gifUrl`, `type`, `reactions`, `replyTo`, `deleted`, `sharedPost`, `createdAt` |
| `notifications` | `recipientId` (`uid` or `'all'`), `senderId`, `type`, `postId`, `blinkId`, `text`, `read`, `createdAt` |
| `lynks` | `userId`, `username`, `videoId`, `thumbnailUrl`, `caption`, `category`, `hashtags`, `visibility`, `likesCount`, `commentsCount`, `sharesCount`, `viewsCount`, `savesCount`, `totalWatchSeconds`, `metrics`, `boostScore`, `boostExpiresAt`, `isTrending`, `isHidden`, `reportCount`, `createdAt` |
| `lynkLikes` | Keyed `{lynkId}_{userId}` |
| `lynkComments` | `lynkId`, `userId`, `username`, `text`, `createdAt` |
| `lynkViews` | Keyed `{lynkId}_{userId}`, `watchedSeconds`, `completed` |
| `watchTimeLogs` | `lynkId`, `userId`, `sessionSeconds`, `createdAt` |
| `lynkSaves` | Keyed `{lynkId}_{userId}` |
| `lynkReports` | `lynkId`, `userId`, `reason`, `createdAt` |
| `blinks` | `userId`, `username`, `userDisplayName`, `mediaUrl`, `type`, `caption`, `textOverlay`, `textOverlayColor`, `musicUrl`, `musicTitle`, `viewsCount`, `viewedBy[]`, `createdAt`, `expiresAt` |
| `blinks/{blinkId}/reactions` | `userId`, `emoji`, `createdAt` |
| `blinks/{blinkId}/replies` | `senderId`, `senderUsername`, `text`, `createdAt` |
| `analytics_events` | `event`, `userId`, `sessionId`, `timestamp`, `meta` |
| `analytics_daily` | Keyed `{YYYY-MM-DD}`, event counters, `new_users`, `new_posts`, `total_users` |
| `analytics_presence` | Keyed `{userId}`, `online`, `lastSeen`, `sessionId` |
| `analytics_alerts` | Alert records (e.g. negative reviews) |
| `reviews` | `uid`, `name`, `username`, `stars`, `reviewText`, `category`, `createdAt` |
| `support_submissions` | Form submissions from SupportPage |

---

## Algorithms

### Post Gravity Algorithm

Used to rank the **For You** post feed on the Home page.

```
score = engagement / (hoursAge + 2)^1.5

engagement = (likes × 1) + (comments × 3) + (shares × 5)
hoursAge   = hours since post.createdAt
```

Points by interaction type:
- Like: 1 pt
- Comment: 3 pts
- Share: 5 pts

---

### Lynk Scoring Engine (`src/lib/lynkRecommendation.ts`)

Used to rank Lynks in the **For You** feed after fetching a batch from Firestore.

```
baseScore = (likes × 3) + (comments × 5) + (safeWatchRatio × 8) + (safeReplays × 4) - (skips × 6)

safeWatchRatio = min(totalWatchTime / duration, 2.0)   // cap at 200%
safeReplays    = min(replays, 3)                        // max 3 per view count

recencyMultiplier = max(0.95^hoursOld, 0.1)             // decays to 10% floor
decayedBoost      = boostScore × 0.9^hoursOld           // boost loses 10% per hour

finalScore = max((baseScore × recencyMultiplier) + decayedBoost, 0)
```

Anti-gaming measures:
- Watch ratio capped at 200% (prevents bot farming with looped playback).
- Replays capped at 3 per session in `MetricsSyncQueue`.
- Skips actively reduce score (× −6).
- New Lynks get a `boostScore` that decays hourly — guarantees visibility before organic engagement builds.

---

### Strategic Lynk Feed (`src/pages/LynksPage.tsx`)

For the full-screen `/lynks` feed:
1. Fetches all visible (`isHidden !== true`, `visibility == 'public'`) Lynks not yet seen in this session.
2. Splits into **boosted** (those with `boostScore > 0`) and **rest**.
3. Fisher-Yates shuffles the merged array for variation.
4. Deduplicates against `seenIds` tracked in session state.

---

## Cloud Functions

All deployed via Firebase Functions v2 (`Node.js 20` runtime).

| Function | Trigger | Purpose |
|---|---|---|
| `onLikeWrite` | Firestore write on `posts/{postId}/likes/{userId}` | Recalculates `likesCount` on post using server-side `.count()` — prevents drift from duplicate clicks |
| `onFollowerWrite` | Firestore write on `users/{userId}/followers/{followerId}` | Recalculates `followersCount` |
| `onFollowingWrite` | Firestore write on `users/{userId}/following/{followingId}` | Recalculates `followingCount` |
| `onPostCreatedNotification` | Firestore create on `posts/{postId}` | Fans out a `post_alert` notification to all of the poster's followers |
| `sendPushNotification` | HTTPS Callable | Sends an FCM push to a user by `recipientId` |
| `deleteChat` | HTTPS Callable | Recursively deletes a chat document and all sub-collections |
| `geminiProxy` | HTTPS Callable (secret: `GEMINI_API_KEY`) | Server-side Gemini 1.5 Flash proxy — API key never reaches the browser |
| `initYouTubeUpload` | HTTPS Callable (secrets: `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, `YOUTUBE_REFRESH_TOKEN`) | Exchanges refresh token for access token; initiates a YouTube resumable upload session; returns `uploadUrl` and `videoId` |
| `getBlinkUploadUrl` | HTTPS Callable (from `blinkUpload` module) | Returns a signed Firebase Storage PUT URL for CORS-safe direct upload |
| `cleanExpiredBlinks` | Scheduled (every 60 min) | Deletes expired blinks, their sub-collections, and their Storage media |
| `onBlinkCreated` | Firestore create on `blinks/{blinkId}` | Fans out a `new_blink` notification to the creator's followers |
| `getActiveUsersCount` | HTTPS Callable | Returns count of presence docs with `online == true` in the last 5 minutes |
| `dailyStatsRollup` | Scheduled (`30 18 * * *` UTC = midnight IST) | Writes `new_users`, `new_posts`, `total_users` to `analytics_daily/{YYYY-MM-DD}` |
| `onLowReviewCreated` | Firestore create on `reviews/{reviewId}` | Writes a severity alert to `analytics_alerts` for ≤ 2-star reviews |
| `presenceCleanup` | Scheduled (every 10 min) | Marks stale presence documents (`lastSeen > 10 min ago`) as offline |

---

## Security Rules

### Firestore (`firestore.rules`)

Key rules:
- **Users** — any authenticated user can read; only the owner can create/update their own document; delete is disabled.
- **Posts** — authenticated read; create requires `userId == auth.uid`; update/delete restricted to the document owner.
- **Post comments** — authenticated read/create (with 1000-character limit); delete by comment owner only.
- **Chats** — read/write restricted to `participants` array members; max 2 participants per chat; message deletion only by sender.
- **Blinks** — view count updates validated server-side: only `viewedBy` and `viewsCount` may change, the viewer must not already be in `viewedBy`, and the count must increment by exactly 1.
- **Blink reactions/replies** — create by any authenticated user; delete by own record only.
- **Lynk collections** — standard authenticated CRUD with owner-only mutations.
- **Analytics** — write-only from authenticated clients; no read access.

### Storage (`storage.rules`)

| Path | Size limit | Content type |
|---|---|---|
| `users/{userId}/**` | 5 MB | `image/*` |
| `posts/{userId}/**` | 10 MB | `image/*` |
| `chats/{chatId}/**` | 5 MB | `image/*` |
| `blinks/images/{fileId}` | 10 MB | `image/*` |
| `blinks/videos/{fileId}` | 50 MB | `video/*` |
| `lynks/thumbnails/**` | (no explicit limit) | `image/*` |
| `lynks/videos/**` | (no explicit limit) | `video/*` |

All paths require `request.auth != null`.

---

## Environment Variables

Copy `.env.example` to `.env.local` and fill in:

```env
# Sentry DSN for client-side error tracking (leave blank to disable)
VITE_SENTRY_DSN=

# App URL (used for meta tags)
VITE_APP_URL=https://netolynk.app

# Groq API key for Neto AI (required for the AI assistant)
VITE_GROQ_API_KEY=

# Cloudinary (public — safe to commit)
VITE_CLOUDINARY_CLOUD_NAME=dmwnywqes
VITE_CLOUDINARY_UPLOAD_PRESET=blinks
```

**Server-side secrets (never in `.env` or the client bundle):**

Set these via Firebase Secret Manager:
```
firebase functions:secrets:set GEMINI_API_KEY
firebase functions:secrets:set YOUTUBE_CLIENT_ID
firebase functions:secrets:set YOUTUBE_CLIENT_SECRET
firebase functions:secrets:set YOUTUBE_REFRESH_TOKEN
```

---

## Local Development

### Prerequisites

- Node.js 20+
- Firebase CLI (`npm install -g firebase-tools`)

### Steps

```bash
# 1. Clone
git clone https://github.com/your-org/NetoLynk.git
cd NetoLynk

# 2. Install frontend dependencies
npm install

# 3. Copy and fill env vars
cp .env.example .env.local
# Edit .env.local with your keys

# 4. Start Vite dev server
npm run dev
# → http://localhost:3000
```

**Firebase Emulator (optional):**
```bash
firebase emulators:start
```

**Type check without building:**
```bash
npm run lint   # runs tsc --noEmit
```

---

## Build & Deploy

### Build frontend

```bash
npm run build          # outputs to dist/
npm run preview        # preview the production build locally
```

### Deploy everything

```bash
firebase deploy        # deploys hosting + functions + firestore rules + storage rules
```

### Deploy selectively

```bash
firebase deploy --only hosting
firebase deploy --only functions
firebase deploy --only firestore:rules
firebase deploy --only storage
```

---

## PWA Configuration

NetoLynk is a Progressive Web App. Key configuration:

- **`public/manifest.json`** — `short_name: "Netolynk"`, `display: "standalone"`, theme colour `#3b82f6`.
- **`public/sw.js`** — static service worker shell; handles offline caching.
- **`public/firebase-messaging-sw.js`** — background FCM message handler; must run at the root origin.
- The app requests `camera` and `microphone` permissions (declared in `metadata.json` for the hosting environment).
- Service worker is registered in `src/main.tsx` on `window load`.

---

## Error Tracking (Sentry)

Sentry is initialised in `src/main.tsx`:

- Enabled only when `VITE_SENTRY_DSN` is set (disabled in local dev by default).
- `browserTracingIntegration` active.
- Performance trace sample rate: 10% (`tracesSampleRate: 0.1`).
- Error reporting scoped to `netolynk.app` via `allowUrls`.

---

## Demo Bot

`src/hooks/useDemoBot.ts` seeds 10 realistic user personas and their posts into Firestore on first run. Each persona has a distinct identity, avatar (DiceBear `avataaars`), and follower count.

**Personas:**

| Username | Description |
|---|---|
| `arjun.builds` | Full-stack dev, building in public |
| `priya.pixels` | UI/UX designer, Figma addict |
| `zaidframes` | Street photographer, Kochi |
| `sneha.lifts` | Certified personal trainer |
| `rohan.wav` | Producer, bedroom musician |
| `aisha.reads` | Book nerd, chai devotee |
| `devesh.ships` | Founder @buildfast, YC S24 (verified) |
| `meera.eats` | Home chef, food blogger |
| `farisposting` | Certified menace |
| `lakshmi.grows` | Product manager, ex-teacher |

The bot writes posts to the `posts` collection so the feed is never empty for new users. It checks for existing demo documents before seeding to avoid duplication.

---

## Analytics System

`src/lib/analytics.ts` is a zero-dependency, pure Firestore analytics module.

**Event catalog (37 events):**
- Auth/Session: `user_signup`, `user_login`, `session_start`, `session_end`
- Content: `post_created`, `post_viewed`, `post_liked`, `post_unliked`, `post_shared`, `post_saved`, `comment_added`
- Social: `user_followed`, `user_unfollowed`, `message_sent`, `chat_opened`
- Navigation: `page_viewed`, `feed_tab_changed`
- Review/Feedback: `review_submitted`, `support_form_opened`, `support_submitted`
- AI: `netoai_opened`, `netoai_message_sent`
- Explore: `search_performed`, `explore_viewed`
- Onboarding: `onboarding_started`, `onboarding_completed`, `onboarding_skipped`

**Batching:** events accumulate in a queue and flush every 3 s (or immediately at 20 events) via `writeBatch`. Failures silently re-queue up to 5 events.

**Deduplication:** identical `{userId}:{event}` pairs within 1 second are dropped.

**Daily rollups:** `analytics_daily/{YYYY-MM-DD}` documents updated atomically with `increment()` per event type. The `dailyStatsRollup` Cloud Function adds `new_users`, `new_posts`, and `total_users` counts at midnight IST.

**Presence:** `updatePresence()` writes to `analytics_presence/{userId}` on auth. `presenceCleanup` Cloud Function marks stale presence records offline every 10 minutes.

---

*Built with ❤️ by NGAI — Nishal Global AI*
