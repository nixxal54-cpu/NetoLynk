# Netolynk — Firebase Cloud Functions

## Setup

```bash
cd functions
npm install
npm run build
```

## Deploy all functions

```bash
# From the project root:
firebase deploy --only functions
```

## Set the Gemini API key secret

```bash
firebase functions:secrets:set GEMINI_API_KEY
# Paste your key when prompted. It is stored in Google Secret Manager,
# never in source control or the client bundle.
```

## Grant yourself admin access (Custom Claims)

Run this once from a trusted environment (e.g. a local Node script or
Cloud Shell) using the Firebase Admin SDK:

```js
const admin = require('firebase-admin');
admin.initializeApp();
admin.auth().setCustomUserClaims('YOUR_UID_HERE', { role: 'admin' });
```

The user must sign out and back in for the new claim to take effect.
No Firestore rules redeployment is needed to add or revoke admins.

## Functions summary

| Function           | Trigger         | What it does |
|--------------------|-----------------|--------------|
| `onLikeWrite`      | Firestore write | Recounts `likesCount` on a post from the `likes` subcollection |
| `onFollowerWrite`  | Firestore write | Recounts `followersCount` on a user from the `followers` subcollection |
| `onFollowingWrite` | Firestore write | Recounts `followingCount` on a user from the `following` subcollection |
| `onCommentWrite`   | Firestore write | Recounts `commentsCount` on a post from the `comments` subcollection |
| `onPostWrite`      | Firestore write | Recounts `postsCount` on a user whenever any post is created or deleted |
| `deleteChat`       | HTTPS callable  | Recursively deletes a chat + all messages (any size, no 500-op limit) |
| `geminiProxy`      | HTTPS callable  | Proxies Gemini API calls; key never reaches the browser |

## Calling `geminiProxy` from the client

```ts
import { httpsCallable } from 'firebase/functions';
import { functions } from '../lib/firebase';

const gemini = httpsCallable(functions, 'geminiProxy');
const result = await gemini({ prompt: 'Write a caption for my photo' });
console.log((result.data as { text: string }).text);
```
