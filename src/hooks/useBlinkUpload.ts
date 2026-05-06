/**
 * blinkUpload.ts
 *
 * Provides a signed upload URL for Firebase Storage so the browser can PUT
 * the file directly — bypassing the CORS issue on neto-lynk.vercel.app.
 *
 * HOW IT WORKS:
 *   1. Client calls getBlinkUploadUrl({ folder, filename, contentType })
 *   2. Function creates a signed PUT URL (valid 10 min) & returns it + the final download URL
 *   3. Client PUTs the file directly to that URL — no CORS, no SDK needed
 *   4. Client saves the downloadUrl to Firestore as usual
 *
 * ADD TO functions/src/index.ts:
 *   export { getBlinkUploadUrl } from './blinkUpload';
 */
import * as functions from 'firebase-functions/v2';
import * as admin from 'firebase-admin';

// admin.initializeApp() is called in index.ts — don't call it again here

export const getBlinkUploadUrl = functions.https.onCall(
  { enforceAppCheck: false },
  async (request) => {
    if (!request.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be signed in.');
    }

    const { folder, filename, contentType } = request.data as {
      folder: string; filename: string; contentType: string;
    };

    if (!folder || !filename || !contentType) {
      throw new functions.https.HttpsError('invalid-argument', 'folder, filename, contentType required.');
    }

    // Only allow blinks paths
    if (!folder.startsWith('blinks/')) {
      throw new functions.https.HttpsError('permission-denied', 'Only blinks/ folder allowed.');
    }

    const bucket = admin.storage().bucket();
    const file = bucket.file(`${folder}/${filename}`);

    const [signedUrl] = await file.getSignedUrl({
      version: 'v4',
      action: 'write',
      expires: Date.now() + 10 * 60 * 1000, // 10 minutes
      contentType,
    });

    // Build the public download URL (same format Firebase SDK returns)
    const encodedPath = encodeURIComponent(`${folder}/${filename}`);
    const downloadUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodedPath}?alt=media`;

    return { signedUrl, downloadUrl };
  }
);
