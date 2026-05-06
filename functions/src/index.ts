import * as functions from "firebase-functions/v2";
import * as admin from "firebase-admin";

admin.initializeApp();
const db = admin.firestore();

// =============================================================================
// COUNTER INTEGRITY — Firestore triggers replace all client-side increment()
// =============================================================================
// These functions run on Google's servers. The client ONLY writes to the
// source-of-truth subcollection (likes/{uid}, followers/{uid}). The counter
// fields on parent documents are maintained exclusively here, so they can
// never drift due to network blips, duplicate clicks, or scripted abuse.

/**
 * Recalculates likesCount on a post whenever a document is written to
 * posts/{postId}/likes/{userId}.
 */
export const onLikeWrite = functions.firestore.onDocumentWritten(
  "posts/{postId}/likes/{userId}",
  async (event) => {
    const postRef = db.doc(`posts/${event.params.postId}`);
    const likesSnap = await db
      .collection(`posts/${event.params.postId}/likes`)
      .count()
      .get();
    await postRef.update({ likesCount: likesSnap.data().count });
  }
);

export const onPostCreatedNotification = functions.firestore.onDocumentCreated(
  "posts/{postId}",
  async (event) => {
    const postData = event.data?.data();
    if (!postData) return;

    // 1. Get the list of followers for the person who posted
    const userId = postData.userId;
    const followersSnap = await db.collection(`users/${userId}/followers`).get();

    // 2. Prepare notifications for all followers
    const batch = db.batch();
    followersSnap.docs.forEach((doc) => {
      const followerId = doc.id;
      const notifRef = db.collection("notifications").doc();
      batch.set(notifRef, {
        recipientId: followerId,
        senderId: userId,
        senderUsername: postData.username,
        senderProfileImage: postData.userProfileImage || '',
        type: 'post_alert',
        text: `${postData.username} just shared a new post!`,
        postId: event.params.postId,
        read: false,
        createdAt: new Date().toISOString()
      });
    });

    await batch.commit();
  }
);
/**
 * Recalculates followersCount on a user whenever a document is written to
 * users/{userId}/followers/{followerId}.
 */
export const onFollowerWrite = functions.firestore.onDocumentWritten(
  "users/{userId}/followers/{followerId}",
  async (event) => {
    const userRef = db.doc(`users/${event.params.userId}`);
    const snap = await db
      .collection(`users/${event.params.userId}/followers`)
      .count()
      .get();
    await userRef.update({ followersCount: snap.data().count });
  }
);

/**
 * Recalculates followingCount on a user whenever a document is written to
 * users/{userId}/following/{followingId}.
 */
export const onFollowingWrite = functions.firestore.onDocumentWritten(
  "users/{userId}/following/{followingId}",
  async (event) => {
    const userRef = db.doc(`users/${event.params.userId}`);
    const snap = await db
      .collection(`users/${event.params.userId}/following`)
      .count()
      .get();
    await userRef.update({ followingCount: snap.data().count });
  }
);

export const sendPushNotification = functions.https.onCall(async (request) => {
  const { recipientId, title, body } = request.data;
  
  // 1. Get the recipient's fcmToken from Firestore
  const userDoc = await db.collection('users').doc(recipientId).get();
  const token = userDoc.data()?.fcmToken;

  if (!token) return { success: false };

  // 2. Send via Firebase Admin Messaging
  await admin.messaging().send({
    token: token,
    notification: { title, body }
  });

  return { success: true };
});
/**
 * Recalculates commentsCount on a post whenever a document is written to
 * posts/{postId}/comments/{commentId}.
 */
export const onCommentWrite = functions.firestore.onDocumentWritten(
  "posts/{postId}/comments/{commentId}",
  async (event) => {
    const postRef = db.doc(`posts/${event.params.postId}`);
    const snap = await db
      .collection(`posts/${event.params.postId}/comments`)
      .count()
      .get();
    await postRef.update({ commentsCount: snap.data().count });
  }
);

/**
 * Recalculates postsCount on a user whenever a post document is written.
 * Reads userId from the post document (before or after state).
 */
export const onPostWrite = functions.firestore.onDocumentWritten(
  "posts/{postId}",
  async (event) => {
    const afterData = event.data?.after?.data();
    const beforeData = event.data?.before?.data();
    const userId = afterData?.userId ?? beforeData?.userId;
    if (!userId) return;

    const snap = await db
      .collection("posts")
      .where("userId", "==", userId)
      .count()
      .get();
    await db.doc(`users/${userId}`).update({ postsCount: snap.data().count });
  }
);

// =============================================================================
// CHAT DELETION — Recursive delete via Admin SDK
// =============================================================================
// The client calls this HTTPS function. The Admin SDK's recursiveDelete()
// handles subcollections of any depth and any size without the 500-op batch
// limit. The client never touches Firestore directly for this operation.

export const deleteChat = functions.https.onCall(
  { enforceAppCheck: false },
  async (request) => {
    if (!request.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "Must be signed in."
      );
    }

    const { chatId } = request.data as { chatId: string };
    if (!chatId || typeof chatId !== "string") {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "chatId is required."
      );
    }

    // Verify the caller is a participant in this chat
    const chatDoc = await db.doc(`chats/${chatId}`).get();
    if (!chatDoc.exists) {
      throw new functions.https.HttpsError("not-found", "Chat not found.");
    }
    const participants: string[] = chatDoc.data()?.participants ?? [];
    if (!participants.includes(request.auth.uid)) {
      throw new functions.https.HttpsError(
        "permission-denied",
        "You are not a participant in this chat."
      );
    }

    // Admin SDK recursiveDelete handles subcollections of any size
    await db.recursiveDelete(db.doc(`chats/${chatId}`));
    return { success: true };
  }
);

// =============================================================================
// GEMINI PROXY — API key never leaves the server
// =============================================================================
// The client calls this function with a prompt. The API key is stored in
// Google Secret Manager and accessed via the functions config, so it is
// never bundled into the client JavaScript.
//
// To set the secret:
//   firebase functions:secrets:set GEMINI_API_KEY
//
// Then update your function to use:
//   runWith({ secrets: ["GEMINI_API_KEY"] })

export const geminiProxy = functions.https.onCall(
  {
    enforceAppCheck: false,
    secrets: ["GEMINI_API_KEY"],
  },
  async (request) => {
    if (!request.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "Must be signed in."
      );
    }

    const { prompt } = request.data as { prompt: string };
    if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "prompt is required."
      );
    }
    if (prompt.length > 4000) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "prompt must be under 4000 characters."
      );
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new functions.https.HttpsError(
        "internal",
        "Gemini API key not configured."
      );
    }

    const { GoogleGenerativeAI } = await import("@google/generative-ai");
    const genai = new GoogleGenerativeAI(apiKey);
    const model = genai.getGenerativeModel({ model: "gemini-1.5-flash" });
    const result = await model.generateContent(prompt);
    const text = result.response.text();

    return { text };
  }
);

// =============================================================================
// BLINK SIGNED UPLOAD — Bypasses CORS for neto-lynk.vercel.app
// =============================================================================
// The browser cannot upload directly to Firebase Storage from Vercel due to
// CORS. This function returns a short-lived signed PUT URL so the browser can
// upload the file directly without touching the Firebase Storage SDK at all.
export { getBlinkUploadUrl } from './blinkUpload';
// =============================================================================
// YOUTUBE RESUMABLE UPLOAD — initYouTubeUpload
// =============================================================================
// Paste this block into functions/src/index.ts
//
// SETUP (one-time, run in your terminal):
//   firebase functions:secrets:set YOUTUBE_CLIENT_ID
//   firebase functions:secrets:set YOUTUBE_CLIENT_SECRET
//   firebase functions:secrets:set YOUTUBE_REFRESH_TOKEN
//
// How to get a refresh token:
//   1. Go to console.cloud.google.com → enable "YouTube Data API v3"
//   2. Create OAuth 2.0 credentials (type: Web application)
//      - Authorised redirect URI: https://developers.google.com/oauthplayground
//   3. Open https://developers.google.com/oauthplayground
//      - Click ⚙ (top right) → check "Use your own OAuth credentials"
//      - Paste your Client ID + Secret
//   4. In Step 1, find "YouTube Data API v3" → select:
//        https://www.googleapis.com/auth/youtube.upload
//   5. Click "Authorise APIs" → sign in with the YouTube account you want to
//      upload to → allow access
//   6. Click "Exchange authorisation code for tokens"
//   7. Copy the "Refresh token" value — that's YOUTUBE_REFRESH_TOKEN
//
// Deploy:
//   firebase deploy --only functions

export const initYouTubeUpload = functions.https.onCall(
  {
    enforceAppCheck: false,
    secrets: ["YOUTUBE_CLIENT_ID", "YOUTUBE_CLIENT_SECRET", "YOUTUBE_REFRESH_TOKEN"],
  },
  async (request) => {
    if (!request.auth) {
      throw new functions.https.HttpsError("unauthenticated", "Must be signed in.");
    }

    const { fileName, fileSize, mimeType, title, description, privacyStatus } =
      request.data as {
        fileName: string;
        fileSize: number;
        mimeType: string;
        title?: string;
        description?: string;
        privacyStatus?: "public" | "unlisted" | "private";
      };

    if (!fileName || !fileSize || !mimeType) {
      throw new functions.https.HttpsError("invalid-argument", "fileName, fileSize, and mimeType are required.");
    }

    if (!mimeType.startsWith("video/")) {
      throw new functions.https.HttpsError("invalid-argument", "mimeType must be a video type.");
    }

    if (fileSize > 100 * 1024 * 1024) {
      throw new functions.https.HttpsError("invalid-argument", "Max file size is 100 MB.");
    }

    // ── Step 1: Exchange refresh token for a fresh access token ──────────────
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.YOUTUBE_CLIENT_ID!,
        client_secret: process.env.YOUTUBE_CLIENT_SECRET!,
        refresh_token: process.env.YOUTUBE_REFRESH_TOKEN!,
        grant_type: "refresh_token",
      }),
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      console.error("Token exchange failed:", err);
      throw new functions.https.HttpsError("internal", "Failed to authenticate with YouTube.");
    }

    const { access_token } = await tokenRes.json() as { access_token: string };

    // ── Step 2: Initiate a resumable upload session ───────────────────────────
    const videoTitle = (title || fileName.replace(/\.[^/.]+$/, "")).slice(0, 100);
    const videoDescription = (description || "").slice(0, 5000);
    const privacy = privacyStatus || "public";

    const initRes = await fetch(
      "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${access_token}`,
          "Content-Type": "application/json",
          "X-Upload-Content-Type": mimeType,
          "X-Upload-Content-Length": String(fileSize),
        },
        body: JSON.stringify({
          snippet: {
            title: videoTitle,
            description: videoDescription,
            categoryId: "22", // People & Blogs — generic default
          },
          status: {
            privacyStatus: privacy,
            selfDeclaredMadeForKids: false,
          },
        }),
      }
    );

    if (!initRes.ok) {
      const err = await initRes.text();
      console.error("YouTube session init failed:", err);
      throw new functions.https.HttpsError("internal", "Failed to start YouTube upload session.");
    }

    // The resumable upload URL is in the Location header
    const uploadUrl = initRes.headers.get("location");
    if (!uploadUrl) {
      throw new functions.https.HttpsError("internal", "YouTube did not return an upload URL.");
    }

    // ── Step 3: Extract the video ID from the upload URL ─────────────────────
    // YouTube embeds the video ID as `?videoId=<id>` in the resumable URL
    const videoIdMatch = uploadUrl.match(/[?&]videoId=([^&]+)/);
    const videoId = videoIdMatch?.[1] ?? null;

    return { uploadUrl, videoId };
  }
);
