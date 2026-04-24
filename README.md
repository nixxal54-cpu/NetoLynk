# NETOLYNK — Complete Technical Documentation

> **Version:** 1.0.0 · **Platform:** Web (PWA) · **Live:** [neto-lynk.vercel.app](https://neto-lynk.vercel.app) · **Stack:** React 19 + Firebase + Vite

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Architecture Overview](#2-architecture-overview)
3. [Tech Stack & Dependencies](#3-tech-stack--dependencies)
4. [Project Structure](#4-project-structure)
5. [Environment Setup](#5-environment-setup)
6. [Firebase Configuration](#6-firebase-configuration)
7. [Authentication System](#7-authentication-system)
8. [Data Models & Types](#8-data-models--types)
9. [Firestore Database Rules](#9-firestore-database-rules)
10. [Firebase Storage Rules](#10-firebase-storage-rules)
11. [Cloud Functions](#11-cloud-functions)
12. [Frontend Pages & Routing](#12-frontend-pages--routing)
13. [React Context Providers](#13-react-context-providers)
14. [Custom Hooks](#14-custom-hooks)
15. [Feed Algorithm — Gravity Score](#15-feed-algorithm--gravity-score)
16. [PWA & Push Notifications](#16-pwa--push-notifications)
17. [SEO & Google Search Console](#17-seo--google-search-console)
18. [Sitemap](#18-sitemap)
19. [Deployment — Vercel](#19-deployment--vercel)
20. [Security Model](#20-security-model)
21. [Performance Considerations](#21-performance-considerations)
22. [Known Limitations & Future Roadmap](#22-known-limitations--future-roadmap)

---

## 1. Project Overview

**NetoLynk** is a full-stack, real-time global social network built as a Progressive Web App (PWA). It enables users to share posts (text, image, video), interact via likes/comments/shares, follow other users, exchange direct messages, and receive live push notifications — all backed by Firebase and deployed on Vercel.

### Core Features

| Feature | Description |
|---|---|
| Authentication | Email/password sign-up and login via Firebase Auth |
| Onboarding | 10-step guided registration flow with avatar upload |
| Feed | Algorithmic "For You", chronological "Following", and mood-based "Vibes" feeds |
| Posts | Text, image, and video posts with mood tags and @mention support |
| Likes / Comments / Shares | Real-time engagement with server-side counter integrity |
| Follow System | Follow/unfollow users, followers and following counts maintained by Cloud Functions |
| Direct Messages | Real-time 1:1 chat with image support |
| Notifications | In-app and push notifications via FCM |
| Explore | Discover trending posts and users |
| Profile | Customizable profiles with cover image, bio, and stats |
| Account Switcher | Multi-account manager with Firebase session persistence |
| Dark / Light Mode | System-preference-aware theme with localStorage override |
| PWA | Installable on any device, offline-capable service worker |

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENT (React 19)                       │
│                                                                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐   │
│  │  Pages   │  │Components│  │ Contexts │  │  Hooks       │   │
│  │ (Routes) │  │(UI Layer)│  │(State)   │  │(Data Access) │   │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └──────┬───────┘   │
│       └─────────────┴──────────────┴───────────────┘           │
│                          Firebase SDK                           │
└───────────────────────────┬─────────────────────────────────────┘
                            │ HTTPS / WebSocket
┌───────────────────────────▼─────────────────────────────────────┐
│                        FIREBASE BACKEND                         │
│                                                                 │
│  ┌──────────────┐  ┌───────────────┐  ┌──────────────────────┐ │
│  │  Firebase    │  │   Firestore   │  │  Firebase Storage    │ │
│  │  Auth        │  │  (Database)   │  │  (Images / Media)    │ │
│  └──────────────┘  └───────┬───────┘  └──────────────────────┘ │
│                            │ Triggers                           │
│                    ┌───────▼───────────────────────────────┐   │
│                    │       Cloud Functions (Node.js)        │   │
│                    │  onLikeWrite · onFollowerWrite ·       │   │
│                    │  onFollowingWrite · onCommentWrite ·   │   │
│                    │  onPostWrite · onPostCreated ·         │   │
│                    │  deleteChat · sendPushNotification ·   │   │
│                    │  geminiProxy                           │   │
│                    └───────────────────────────────────────┘   │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │   Firebase Cloud Messaging (FCM) — Push Notifications    │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                            │
                    ┌───────▼───────┐
                    │    Vercel     │
                    │  (Hosting +   │
                    │   CDN + CI)   │
                    └───────────────┘
```

**Data flow:** The React client communicates exclusively with Firebase services. Firestore real-time listeners (`onSnapshot`) power the live feed, chat, and notifications. All counter fields (likes, comments, followers, posts) are maintained by server-side Cloud Functions — clients never increment counters directly, preventing drift and abuse.

---

## 3. Tech Stack & Dependencies

### Runtime Dependencies

| Package | Version | Purpose |
|---|---|---|
| `react` | ^19.0.0 | UI framework |
| `react-dom` | ^19.0.0 | DOM rendering |
| `react-router-dom` | ^7.14.0 | Client-side routing |
| `firebase` | ^12.12.0 | Auth, Firestore, Storage, FCM, Functions |
| `motion` | ^12.38.0 | Animations (Motion/Framer) |
| `lucide-react` | ^0.546.0 | Icon library |
| `sonner` | ^2.0.7 | Toast notifications |
| `date-fns` | ^4.1.0 | Date formatting utilities |
| `browser-image-compression` | ^2.0.2 | Client-side image compression before upload |
| `react-dropzone` | ^15.0.0 | Drag-and-drop file uploads |
| `clsx` | ^2.1.1 | Conditional class name utility |
| `tailwind-merge` | ^3.5.0 | Tailwind class merging |
| `@sentry/react` | ^10.49.0 | Error monitoring |
| `@google/genai` | ^1.29.0 | Gemini AI SDK (server-side only via Cloud Function) |

### Dev Dependencies

| Package | Version | Purpose |
|---|---|---|
| `vite` | ^6.2.0 | Build tool and dev server |
| `@vitejs/plugin-react` | ^5.0.4 | React Fast Refresh |
| `tailwindcss` | ^4.1.14 | Utility-first CSS |
| `@tailwindcss/vite` | ^4.1.14 | Tailwind Vite integration |
| `typescript` | ~5.8.2 | Static typing |

---

## 4. Project Structure

```
NetoLynk-main/
│
├── public/                         # Static assets served at root
│   ├── netolynk-logo.png           # App logo
│   ├── manifest.json               # PWA web app manifest
│   ├── sw.js                       # Custom service worker
│   ├── firebase-messaging-sw.js    # FCM background service worker
│   └── sitemap.xml                 # (add) Google Search Console sitemap
│
├── src/
│   ├── main.tsx                    # App entry point
│   ├── App.tsx                     # Root component with routing and providers
│   ├── index.css                   # Global styles (Tailwind base)
│   │
│   ├── types/
│   │   └── index.ts                # All TypeScript interfaces (User, Post, etc.)
│   │
│   ├── lib/
│   │   ├── firebase.ts             # Firebase initialization and exports
│   │   ├── utils.ts                # Utility functions (cn, etc.)
│   │   └── mentionUtils.ts         # @mention parsing helpers
│   │
│   ├── context/
│   │   ├── AuthContext.tsx         # Firebase Auth state + Firestore user profile
│   │   ├── ThemeContext.tsx        # Light/dark mode state
│   │   └── AccountSwitcherContext.tsx  # Multi-account manager
│   │
│   ├── hooks/
│   │   ├── useFirestore.ts         # Generic useCollection hook
│   │   ├── useInfiniteScroll.ts    # Paginated infinite feed hook
│   │   ├── useNetolynkSystem.ts    # System account (disabled)
│   │   ├── useDemoSeed.ts          # Demo data seeder
│   │   ├── useDemoBot.ts           # Demo bot for activity simulation
│   │   ├── usePushNotifications.ts # FCM token registration
│   │   └── usePageTitle.ts         # Dynamic document.title
│   │
│   ├── components/
│   │   ├── AccountSwitcher.tsx     # Multi-account switcher modal
│   │   ├── Auth/
│   │   │   ├── AuthForm.tsx        # Login form
│   │   │   └── OnboardingFlow.tsx  # 10-step registration wizard
│   │   ├── Feed/
│   │   │   ├── CreatePost.tsx      # Compose new post
│   │   │   └── PostCard.tsx        # Post display component
│   │   ├── Layout/
│   │   │   └── Navigation.tsx      # Sidebar + BottomNav
│   │   ├── Profile/
│   │   │   └── EditProfileModal.tsx
│   │   └── UI/
│   │       └── MentionTextarea.tsx # @mention-aware text input
│   │
│   └── pages/
│       ├── Home.tsx                # Main feed (For You / Following / Vibes)
│       ├── Explore.tsx             # Search and trending
│       ├── Notifications.tsx       # Notification inbox
│       ├── Messages.tsx            # Direct messages list + chat
│       ├── Profile.tsx             # User profile page
│       ├── PostDetails.tsx         # Single post view with comments
│       ├── CreatePostPage.tsx      # Full-page post creation
│       ├── EditProfilePage.tsx     # Profile edit
│       ├── Settings.tsx            # App settings
│       └── Activity.tsx            # Activity log
│
├── functions/
│   ├── src/
│   │   └── index.ts                # All Firebase Cloud Functions
│   ├── package.json
│   └── tsconfig.json
│
├── index.html                      # Vite HTML entry point (SEO meta, PWA link)
├── vite.config.ts                  # Vite configuration
├── tsconfig.json                   # TypeScript configuration
├── firebase.json                   # Firebase project configuration
├── firestore.rules                 # Firestore security rules
├── storage.rules                   # Firebase Storage security rules
├── firebase-applet-config.json     # Firebase SDK config (non-secret)
├── firebase-blueprint.json         # Firebase project blueprint
├── .env.example                    # Environment variable template
└── package.json                    # Root project dependencies
```

---

## 5. Environment Setup

### Prerequisites

- Node.js >= 18
- npm >= 9
- Firebase CLI: `npm install -g firebase-tools`

### Installation

```bash
# 1. Clone the repository
git clone <repo-url>
cd NetoLynk-main

# 2. Install dependencies
npm install

# 3. Copy environment template
cp .env.example .env.local

# 4. Fill in your values (see table below)
nano .env.local

# 5. Start development server
npm run dev
# Runs at http://localhost:3000
```

### Environment Variables

| Variable | Required | Description |
|---|---|---|
| `VITE_SENTRY_DSN` | Optional | Sentry DSN for error tracking. Leave blank to disable. |
| `VITE_APP_URL` | Optional | Production URL for dynamic og:url. Defaults to `https://netolynk.app` |
| `GEMINI_API_KEY` | Server-only | **Never expose to client.** Set via Firebase Secret Manager for Cloud Functions only. |

> **Security Note:** `GEMINI_API_KEY` must never be prefixed with `VITE_`. Variables prefixed with `VITE_` are bundled into the client JavaScript and visible to anyone. The Gemini key is accessed exclusively inside the `geminiProxy` Cloud Function via `process.env.GEMINI_API_KEY`, where it is injected from Google Secret Manager at runtime.

### npm Scripts

| Script | Command | Description |
|---|---|---|
| `dev` | `vite --port=3000 --host=0.0.0.0` | Development server with HMR |
| `build` | `vite build` | Production build to `dist/` |
| `preview` | `vite preview` | Preview production build locally |
| `lint` | `tsc --noEmit` | TypeScript type checking |
| `clean` | `rm -rf dist` | Remove build artifacts |

---

## 6. Firebase Configuration

Firebase is initialized in `src/lib/firebase.ts`. The configuration is loaded from `firebase-applet-config.json` (this file is safe to commit — it contains no secrets, only public SDK identifiers).

```typescript
// src/lib/firebase.ts
import { initializeApp } from 'firebase/app';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);

export const auth     = getAuth(app);
export const db       = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const storage  = getStorage(app);
export const functions = getFunctions(app);
```

A connection test runs automatically on app boot to detect offline/misconfiguration issues early:

```typescript
async function testConnection() {
  try {
    await getDocFromServer(doc(db, '_connection_test_', 'ping'));
  } catch (error) {
    if (error.message.includes('the client is offline')) {
      console.error("Firebase client is offline. Check your config.");
    }
  }
}
```

### Firebase Services Used

| Service | Usage |
|---|---|
| Firebase Authentication | Email/password sign-up, login, session persistence |
| Cloud Firestore | All application data (users, posts, chats, notifications) |
| Firebase Storage | Profile images, cover images, post media, chat images |
| Cloud Functions (v2) | Counter integrity, notifications, chat deletion, Gemini proxy |
| Firebase Cloud Messaging | Push notifications (FCM) |

---

## 7. Authentication System

### Login Flow

1. User opens the app → `AuthProvider` subscribes to `onAuthStateChanged`
2. If no Firebase session → `AuthForm` is shown
3. User enters email + password → `signInWithEmailAndPassword`
4. On success → `addCurrentAccount(uid)` stores safe display data in localStorage
5. `onAuthStateChanged` fires → Firestore listener starts on `users/{uid}`
6. User profile loaded → app renders

### Registration Flow (Onboarding — 10 Steps)

| Step | Field | Validation |
|---|---|---|
| 0 | Email | RFC 5322 format |
| 1 | Password | Minimum length enforced |
| 2 | Birthday | Day / Month / Year dropdowns |
| 3 | Privacy + Terms | Public or Private account selection |
| 4 | Display Name | Max 50 characters |
| 5 | Username | 3–30 chars, uniqueness check against Firestore in real-time |
| 6 | Profile Picture | File upload with `browser-image-compression`, stored in Firebase Storage |
| 7 | Import Contacts | UI step (UI only, no contacts API) |
| 8 | Follow Suggestions | Suggested accounts to follow on first join |
| 9 | All Set | Confirmation screen |

On completion, `createUserWithEmailAndPassword` creates the Firebase Auth account, then `setDoc(doc(db, 'users', uid), {...})` writes the initial user profile to Firestore.

### Session Persistence

`setPersistence(auth, browserLocalPersistence)` is called in `AccountSwitcherContext` to keep users logged in across page reloads. Firebase stores the session in IndexedDB — no passwords are ever stored in localStorage.

### Account Switcher

Allows users to save multiple accounts and switch between them. Stored data in `localStorage` under key `netolynk_saved_accounts`:

```typescript
interface SavedAccount {
  uid: string;
  username: string;
  displayName: string;
  profileImage: string;
  email: string;
  // NOTE: NO password stored. Session handled by Firebase Auth.
}
```

When switching: if the Firebase session is still valid, the switch is instant. If the token has expired, the user is prompted to re-enter their password.

---

## 8. Data Models & Types

All types are defined in `src/types/index.ts`.

### User

```typescript
interface User {
  uid: string;               // Firebase Auth UID (document ID)
  username: string;          // Unique, 3–30 chars, lowercase
  displayName: string;       // Display name, max 50 chars
  email: string;
  bio?: string;              // Max 160 chars
  profileImage?: string;     // Firebase Storage URL
  coverImage?: string;       // Firebase Storage URL
  followersCount: number;    // Maintained by Cloud Function
  followingCount: number;    // Maintained by Cloud Function
  followers?: string[];      // Array of follower UIDs (denormalized)
  following?: string[];      // Array of following UIDs (denormalized)
  postsCount: number;        // Maintained by Cloud Function
  verified?: boolean;        // Verified badge
  createdAt: string;         // ISO 8601 timestamp
}
```

### Post

```typescript
interface Post {
  id: string;                // Firestore document ID
  userId: string;            // Author's UID
  username: string;          // Denormalized author username
  userProfileImage?: string; // Denormalized author avatar
  text?: string;             // Max 2200 chars
  mediaUrls: string[];       // Up to 10 Firebase Storage URLs
  type: 'text' | 'image' | 'video';
  mood?: {
    emoji: string;
    label: string;
  };
  likesCount: number;        // Maintained by Cloud Function
  commentsCount: number;     // Maintained by Cloud Function
  sharesCount: number;
  likedBy?: string[];        // Array of UIDs (for client-side optimistic UI)
  savedBy?: string[];        // Array of UIDs (saved/bookmarked posts)
  tags: string[];            // Hashtags extracted from text
  mentions: string[];        // @mentions extracted from text
  createdAt: string;         // ISO 8601 timestamp
}
```

### Comment

```typescript
interface Comment {
  id: string;
  postId: string;
  userId: string;
  username: string;
  userProfileImage?: string;
  text: string;
  createdAt: string;
}
```

### Notification

```typescript
interface Notification {
  id: string;
  recipientId: string;       // UID or 'all' for global notifications
  senderId: string;
  senderUsername: string;
  senderProfileImage?: string;
  type: 'like' | 'comment' | 'follow' | 'message';
  postId?: string;
  read: boolean;
  createdAt: string;
}
```

### Chat & Message

```typescript
interface Chat {
  id: string;
  participants: string[];    // Array of UIDs (always 2 for DMs)
  participantDetails?: Record<string, {
    username: string;
    displayName: string;
    profileImage: string;
  }>;
  lastMessage?: string;
  lastMessageAt?: string;
  updatedAt: string;
}

interface Message {
  id: string;
  chatId: string;
  senderId: string;
  text?: string;
  mediaUrl?: string;
  imageUrl?: string;
  type: 'text' | 'image';
  createdAt: string;
}
```

### Firestore Collection Structure

```
/users/{uid}
  /followers/{followerId}
  /following/{followingId}

/posts/{postId}
  /comments/{commentId}
  /likes/{userId}

/chats/{chatId}
  /messages/{messageId}

/notifications/{notificationId}

/meta/{docId}           ← Demo seed sentinel
```

---

## 9. Firestore Database Rules

Located in `firestore.rules`. Deployed with `firebase deploy --only firestore:rules`.

### Helper Functions

```javascript
function isAuthenticated()  → request.auth != null
function isOwner(userId)    → auth.uid == userId
function isDocOwner()       → auth.uid == resource.data.userId
function isAdmin()          → auth.token.role == 'admin'
```

### Validation Functions

`isValidUser(data)` — Enforces: uid matches auth, username 3–30 chars, displayName ≤ 50 chars, valid email format, bio ≤ 160 chars, valid HTTPS URLs for images, immutable uid and createdAt on updates.

`isValidPost(data)` — Enforces: userId matches auth, text ≤ 2200 chars, mediaUrls ≤ 10 items, type is one of `text | image | video`.

### Key Rules Summary

| Collection | Read | Write |
|---|---|---|
| `users/{uid}` | Any authenticated user | Owner only (with validation), or any auth user for follow array updates |
| `posts/{postId}` | Any authenticated user | Owner (create/update/delete), or any auth user for like/save/share updates |
| `posts/{postId}/comments` | Any authenticated user | Any authenticated user (create), owner or post owner (delete) |
| `posts/{postId}/likes` | Any authenticated user | Owner of the like document only |
| `chats/{chatId}` | Participants only | Participants only |
| `chats/{chatId}/messages` | Participants only | Sender only (senderId must match auth) |
| `notifications` | Own or global (`all`) | Any authenticated user (create), recipient only (update read, delete) |
| `meta` | Any authenticated user | Any authenticated user |

---

## 10. Firebase Storage Rules

Located in `storage.rules`. Deployed with `firebase deploy --only storage`.

| Path | Read | Write | Size Limit | Type |
|---|---|---|---|---|
| `users/{userId}/**` | Any authenticated user | Owner only | 5 MB | `image/*` |
| `posts/{userId}/**` | Any authenticated user | Owner only | 10 MB | `image/*` |
| `chats/{chatId}/**` | Any authenticated user | Any authenticated user | 5 MB | `image/*` |

---

## 11. Cloud Functions

Located in `functions/src/index.ts`. Written in TypeScript, targeting Firebase Functions v2. Deploy with `firebase deploy --only functions`.

### Counter Integrity Functions

These Firestore-triggered functions are the single source of truth for all counter fields. Clients **never** call `increment()` directly.

#### `onLikeWrite`
- **Trigger:** `posts/{postId}/likes/{userId}` (any write)
- **Action:** Counts all documents in `posts/{postId}/likes`, updates `posts/{postId}.likesCount`

#### `onCommentWrite`
- **Trigger:** `posts/{postId}/comments/{commentId}` (any write)
- **Action:** Counts all documents in `posts/{postId}/comments`, updates `posts/{postId}.commentsCount`

#### `onPostWrite`
- **Trigger:** `posts/{postId}` (any write)
- **Action:** Counts all posts by `userId`, updates `users/{userId}.postsCount`

#### `onFollowerWrite`
- **Trigger:** `users/{userId}/followers/{followerId}` (any write)
- **Action:** Counts follower documents, updates `users/{userId}.followersCount`

#### `onFollowingWrite`
- **Trigger:** `users/{userId}/following/{followingId}` (any write)
- **Action:** Counts following documents, updates `users/{userId}.followingCount`

### Notification Function

#### `onPostCreatedNotification`
- **Trigger:** `posts/{postId}` (document created)
- **Action:** Fetches all followers of the post author, batch-creates notification documents for each follower.

### HTTPS Callable Functions

#### `sendPushNotification`
- **Caller:** Client SDK
- **Input:** `{ recipientId: string, title: string, body: string }`
- **Action:** Looks up recipient's `fcmToken` from Firestore, sends via `admin.messaging().send()`

#### `deleteChat`
- **Caller:** Client SDK
- **Auth:** Required + participant verification
- **Input:** `{ chatId: string }`
- **Action:** Verifies caller is a participant, calls `db.recursiveDelete()` to remove the chat and all subcollection messages atomically. Handles subcollections of any depth without the 500-op batch limit.

#### `geminiProxy`
- **Caller:** Client SDK
- **Auth:** Required
- **Secrets:** `GEMINI_API_KEY` (Google Secret Manager)
- **Input:** `{ prompt: string }` (max 4000 chars)
- **Action:** Forwards prompt to Gemini 1.5 Flash, returns `{ text: string }`. The API key is **never** bundled in client code.

### Setting the Gemini Secret

```bash
firebase functions:secrets:set GEMINI_API_KEY
# Enter your key when prompted
firebase deploy --only functions
```

---

## 12. Frontend Pages & Routing

Routing is handled by `react-router-dom` v7 in `src/App.tsx`.

| Path | Component | Description |
|---|---|---|
| `/` | `<Home />` | Main feed — For You, Following, Vibes tabs |
| `/explore` | `<Explore />` | Search users and trending posts |
| `/notifications` | `<Notifications />` | In-app notification inbox |
| `/messages` | `<Messages />` | DM list and chat view |
| `/profile/:username` | `<Profile />` | Public user profile |
| `/post/:id` | `<PostDetails />` | Single post with comments thread |
| `/create` | `<CreatePostPage />` | Full-screen post composer |
| `/edit-profile` | `<EditProfilePage />` | Edit own profile |
| `/settings` | `<Settings />` | App settings (theme, account, etc.) |
| `/activity` | `<Activity />` | Activity log |
| `*` | `<Navigate to="/" />` | Fallback — redirect to home |

### Layout

The layout is a three-column design on desktop, single-column on mobile:

```
┌─────────────┬──────────────────────────┬──────────────┐
│  Sidebar    │         Main Feed        │  Trending /  │
│  (Nav)      │      (flex-1, routes)    │  Who to      │
│  hidden on  │                          │  Follow      │
│  mobile     │                          │  (lg+ only)  │
└─────────────┴──────────────────────────┴──────────────┘
                       BottomNav (mobile only)
```

---

## 13. React Context Providers

The provider tree in `App.tsx` (outer to inner):

```tsx
<ThemeProvider>
  <AuthProvider>
    <AccountSwitcherProvider>
      <Router>
        <AppContent />
        <Toaster />
      </Router>
    </AccountSwitcherProvider>
  </AuthProvider>
</ThemeProvider>
```

### `AuthContext`

Exposes `{ user: User | null, firebaseUser: FirebaseUser | null, loading: boolean }`.

Two `useEffect` layers: the first subscribes to `onAuthStateChanged` (Firebase Auth), the second starts a Firestore `onSnapshot` listener on `users/{uid}` once a Firebase user is confirmed. This ensures the React `user` object is always in sync with Firestore in real-time.

### `ThemeContext`

Exposes `{ theme: 'light' | 'dark', toggleTheme: () => void }`.

Priority order for initial theme:
1. `localStorage.getItem('theme')` (user's explicit choice)
2. `window.matchMedia('(prefers-color-scheme: dark)')` (system preference)
3. `'dark'` (fallback default)

Theme is applied by toggling `.light` / `.dark` class on `<html>` (Tailwind CSS dark mode via class strategy).

### `AccountSwitcherContext`

Exposes saved accounts, switcher modal visibility, and methods: `addCurrentAccount`, `removeAccount`, `logoutCurrentAccount`, `openSwitcher`, `closeSwitcher`.

Saves to `localStorage` under key `netolynk_saved_accounts` as an array of `SavedAccount` objects (no passwords, no tokens).

---

## 14. Custom Hooks

### `useCollection<T>(collectionPath, constraints, deps)`

Generic real-time Firestore collection listener. Returns `{ data: T[], loading, error }`.

Includes a fix for message flash: data is only wiped to `[]` when navigating to a **different** collection path — not on every re-render. Tracks the previous path with `useRef`.

### `useInfiniteFeed<T>(collectionPath)`

Paginated feed with real-time first page. Architecture:

- **Page 1:** Live `onSnapshot` listener — new posts appear automatically.
- **Page 2+:** Manual `getDocs` calls triggered by scroll sentinel.

Page size is 15 (`PAGE_SIZE = 15`). Extra pages are stored in `extraPagesRef` and merged with the live first page on each snapshot update, ensuring the live feed never overwrites paginated content.

Returns `{ data, loading, loadingMore, hasMore, fetchMore }`.

### `usePushNotifications()`

Requests browser notification permission, retrieves the FCM registration token using the app's VAPID key, and saves the token to `users/{uid}.fcmToken` in Firestore.

### `usePageTitle(title: string)`

Sets `document.title` to `${title} | NetoLynk` on mount and restores it on unmount.

### `useDemoSeed()`

Seeds demo posts and users into Firestore on first login, using a `meta/demoSeed` sentinel document to ensure seeding only happens once per deployment.

### `useDemoBot()`

Simulates user activity (likes, comments) on demo posts to make the feed feel alive for new users.

---

## 15. Feed Algorithm — Gravity Score

Located in `src/pages/Home.tsx`. Used for the **"For You"** tab.

```typescript
const calculatePostScore = (post: Post): number => {
  const likes    = post.likesCount    || 0;
  const comments = post.commentsCount || 0;
  const shares   = post.sharesCount   || 0;

  // Engagement weights: shares are most valuable
  const engagementScore = (likes * 1) + (comments * 3) + (shares * 5);

  // Age in hours since the post was created
  const hoursAge = (Date.now() - new Date(post.createdAt).getTime()) / (1000 * 60 * 60);

  // Gravity formula — inspired by Hacker News ranking
  return engagementScore / Math.pow(hoursAge + 2, 1.5);
};
```

**How it works:** A post's score decays over time by dividing by `(age + 2)^1.5`. The `+2` prevents division by zero for brand-new posts. The result is that 100 likes in the last hour will always outrank 100 likes from last week — keeping the feed fresh and rewarding recent viral content.

### Feed Tabs

| Tab | Logic |
|---|---|
| **For You** | All posts sorted by gravity score (algorithmic) |
| **Following** | Posts filtered by `user.following.includes(post.userId)` |
| **Vibes** | Posts filtered by `post.mood != null` |

The feed data is memoized with `useMemo` to prevent recalculation on every render.

---

## 16. PWA & Push Notifications

### PWA Manifest (`public/manifest.json`)

```json
{
  "short_name": "Netolynk",
  "name": "Netolynk Social Network",
  "description": "Global social media platform by NGAI",
  "start_url": "/",
  "display": "standalone",
  "theme_color": "#3b82f6",
  "background_color": "#ffffff"
}
```

`"display": "standalone"` makes the app launch without browser chrome when installed on a device, behaving like a native app.

### Service Workers

Two service workers are registered:

| File | Purpose |
|---|---|
| `public/sw.js` | Custom service worker (caching, offline support) |
| `public/firebase-messaging-sw.js` | FCM background message handling |

The FCM service worker runs in the background even when the app is closed, allowing push notifications to be delivered and displayed even when the user is not actively using the app.

### Push Notification Flow

```
User opens app
→ usePushNotifications() runs
→ Notification.requestPermission() → 'granted'
→ getToken(messaging, { vapidKey: '...' })
→ FCM registration token returned
→ Token saved to users/{uid}.fcmToken in Firestore

Later, when user gets a like/comment/follow:
→ Client calls sendPushNotification Cloud Function
→ Function reads fcmToken from Firestore
→ admin.messaging().send({ token, notification: { title, body } })
→ FCM delivers push to device
→ firebase-messaging-sw.js handles display if app is in background
```

---

## 17. SEO & Google Search Console

### Current Meta Tags (`index.html`)

```html
<!-- Primary -->
<title>NETOLYNK | Global Social Network</title>
<meta name="description" content="Netolynk — the global social network. Share moments, connect with friends, and discover what's happening right now." />
<meta name="theme-color" content="#3b82f6" />

<!-- Open Graph (Facebook, WhatsApp, iMessage) -->
<meta property="og:type"        content="website" />
<meta property="og:site_name"   content="Netolynk" />
<meta property="og:title"       content="NETOLYNK | Global Social Network" />
<meta property="og:description" content="Share moments, connect with friends, and discover what's happening right now." />
<meta property="og:image"       content="/netolynk-logo.png" />
<meta property="og:url"         content="https://neto-lynk.vercel.app" />

<!-- Twitter / X Card -->
<meta name="twitter:card"        content="summary" />
<meta name="twitter:site"        content="@netolynk" />
<meta name="twitter:title"       content="NETOLYNK | Global Social Network" />
<meta name="twitter:description" content="Share moments, connect with friends, and discover what's happening right now." />
<meta name="twitter:image"       content="/netolynk-logo.png" />
```

### Google Search Console Setup

The site `https://neto-lynk.vercel.app` has been:

1. ✅ **Ownership verified** via HTML file method (file placed in `/public/`)
2. ✅ **Indexing requested** via URL Inspection tool

> **Critical:** Do NOT remove the Google HTML verification file from `/public/`. Removing it will cause Search Console to lose ownership verification.

### Limitations of a Vercel Subdomain for SEO

`*.vercel.app` domains are less trusted by Google than custom domains. For best SEO results, migrating to a custom domain (e.g., `netolynk.app`) is recommended. A custom domain also enables:

- Better Google ranking
- Cleaner brand identity in search results
- Proper HTTPS with your own SSL certificate

---

## 18. Sitemap

The `sitemap.xml` file should be placed in the `/public/` folder and submitted to Google Search Console under **Sitemaps → Add a new sitemap → `sitemap.xml`**.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">

  <url>
    <loc>https://neto-lynk.vercel.app/</loc>
    <lastmod>2026-04-24</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>

  <url>
    <loc>https://neto-lynk.vercel.app/explore</loc>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>

  <url>
    <loc>https://neto-lynk.vercel.app/notifications</loc>
    <changefreq>weekly</changefreq>
    <priority>0.6</priority>
  </url>

  <url>
    <loc>https://neto-lynk.vercel.app/messages</loc>
    <changefreq>weekly</changefreq>
    <priority>0.6</priority>
  </url>

  <url>
    <loc>https://neto-lynk.vercel.app/activity</loc>
    <changefreq>weekly</changefreq>
    <priority>0.6</priority>
  </url>

  <url>
    <loc>https://neto-lynk.vercel.app/settings</loc>
    <changefreq>monthly</changefreq>
    <priority>0.4</priority>
  </url>

</urlset>
```

> Note: Since NetoLynk is a React SPA (Single Page Application), dynamic user profile URLs (`/profile/:username`) and post URLs (`/post/:id`) are not statically known at build time and cannot be pre-listed in the sitemap. Google will discover these pages over time via link crawling as users share and interact with them.

---

## 19. Deployment — Vercel

The app is deployed at **[https://neto-lynk.vercel.app](https://neto-lynk.vercel.app)**.

### Build Configuration

| Setting | Value |
|---|---|
| Framework | Vite |
| Build Command | `npm run build` |
| Output Directory | `dist` |
| Node.js Version | 18.x or 20.x |

### SPA Routing on Vercel

React Router uses client-side routing. Without server configuration, direct navigation to `/explore` or `/profile/username` returns a 404. To fix this, create a `vercel.json` in the project root:

```json
{
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

This tells Vercel to serve `index.html` for all routes, letting React Router handle the routing on the client.

### Environment Variables on Vercel

Set via **Vercel Dashboard → Project → Settings → Environment Variables**:

| Variable | Environment |
|---|---|
| `VITE_SENTRY_DSN` | Production |
| `VITE_APP_URL` | Production |

Firebase credentials are in `firebase-applet-config.json` and committed to the repo — this is safe as they are public-facing SDK identifiers, not secrets. Firebase security is enforced by Firestore rules and Storage rules on the server side.

### Deploying Cloud Functions

Cloud Functions are deployed **separately** from the Vercel frontend:

```bash
cd functions
npm install
firebase deploy --only functions
```

---

## 20. Security Model

### Authentication

All protected data requires a valid Firebase Auth token. Tokens are short-lived JWTs refreshed automatically by the Firebase SDK. There is no way to access Firestore or Storage without a valid token (enforced at the Firebase server level, not just client-side).

### Firestore Security

The `firestore.rules` file enforces:

- Users can only write their own profile (uid match)
- Posts can only be created/edited/deleted by their author
- Counter fields (`likesCount`, `commentsCount`, etc.) are updated exclusively by Cloud Functions — clients can only modify the underlying subcollection (`likes/{uid}`), not the counter field directly
- Chat messages are only readable by participants
- Notifications are only readable/modifiable by their recipient

### Storage Security

- Profile and post images are owner-write only (uid must match the path)
- All images have a maximum file size (5 MB for profiles/chats, 10 MB for posts)
- Only `image/*` MIME types are accepted (no executable uploads)

### Gemini API Key

The `GEMINI_API_KEY` is stored in Google Secret Manager and only accessed inside the `geminiProxy` Cloud Function. It is never present in the client bundle.

### No Passwords in localStorage

The Account Switcher stores only display-safe data (uid, username, displayName, email, profileImage). Firebase Auth manages session tokens securely via IndexedDB with `browserLocalPersistence`.

---

## 21. Performance Considerations

### Image Compression

All user-uploaded images pass through `browser-image-compression` before being uploaded to Firebase Storage. This reduces storage costs and speeds up media loading.

### Infinite Scroll Pagination

The feed loads 15 posts per page. Additional pages are fetched via `IntersectionObserver` with a 300px root margin (pre-fetching before the user reaches the bottom). The first page uses a live `onSnapshot` listener so new posts appear automatically.

### Memoization

Feed sorting (the gravity algorithm) is wrapped in `useMemo` and only recalculates when the underlying `posts` array changes, preventing expensive sort operations on every render.

### Tailwind CSS

Tailwind v4 purges unused CSS at build time, resulting in a minimal CSS bundle. Combined with Vite's code splitting and tree-shaking, the initial JS bundle is kept small.

### Firebase Reads Optimization

`useCollection` tracks the previous collection path with `useRef` and only resets data when navigating to a different collection — preventing unnecessary blank flashes on re-renders.

---

## 22. Known Limitations & Future Roadmap

### Current Limitations

| Area | Limitation |
|---|---|
| Dynamic Sitemap | User profiles and posts are not in `sitemap.xml` (SPA limitation) |
| SEO | Vercel subdomain has lower Google trust than a custom domain |
| Video Posts | `type: 'video'` is defined in types but upload/playback UI may need review |
| Contacts Import | Step 7 of onboarding is UI-only; no actual contacts API integration |
| Admin Role | `isAdmin()` check exists in rules but admin token role assignment is not in the frontend yet |
| `useNetolynkSystem` | System/official account hook is disabled (commented out) |

### Recommended Next Steps

1. **Add `vercel.json`** with SPA rewrite rule to fix direct URL navigation
2. **Connect a custom domain** (e.g., `netolynk.app`) for better SEO ranking
3. **Dynamic sitemap** — generate sitemap from Firestore at build time or via a Vercel Edge Function
4. **Video upload** — integrate Firebase Storage video upload with `<video>` playback in PostCard
5. **`robots.txt`** — add to `/public/` to guide crawler behavior:
   ```
   User-agent: *
   Allow: /
   Sitemap: https://neto-lynk.vercel.app/sitemap.xml
   ```
6. **Sentry** — fill in `VITE_SENTRY_DSN` in production for error tracking
7. **Rate limiting** — add Firebase App Check to prevent abuse of callable functions
8. **Admin dashboard** — build admin panel using the existing `isAdmin()` rule

---

## Appendix A — Firestore Index Requirements

For queries that combine `orderBy` with `where`, Firestore requires composite indexes. Create them in the Firebase Console under **Firestore → Indexes** or via `firebase.json`:

| Collection | Fields | Order |
|---|---|---|
| `posts` | `userId ASC`, `createdAt DESC` | For profile feed |
| `posts` | `tags ARRAY`, `createdAt DESC` | For hashtag search |
| `notifications` | `recipientId ASC`, `createdAt DESC` | For notification inbox |
| `chats` | `participants ARRAY`, `updatedAt DESC` | For DM list |

---

## Appendix B — Firebase CLI Quick Reference

```bash
# Login
firebase login

# Select project
firebase use <project-id>

# Deploy everything
firebase deploy

# Deploy only rules
firebase deploy --only firestore:rules
firebase deploy --only storage

# Deploy only functions
firebase deploy --only functions

# Emulate locally
firebase emulators:start

# View function logs
firebase functions:log

# Set a secret
firebase functions:secrets:set GEMINI_API_KEY
```

---

## Appendix C — Useful URLs

| Resource | URL |
|---|---|
| Live App | https://neto-lynk.vercel.app |
| Google Search Console | https://search.google.com/search-console |
| Firebase Console | https://console.firebase.google.com |
| Vercel Dashboard | https://vercel.com/dashboard |
| Sentry | https://sentry.io |
| Firebase Docs | https://firebase.google.com/docs |
| React Router Docs | https://reactrouter.com |
| Vite Docs | https://vitejs.dev |

---

*Documentation generated: April 24, 2026 · NetoLynk v1.0.0*
