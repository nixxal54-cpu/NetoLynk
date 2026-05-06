// api/initYouTubeUpload.ts
// Vercel Serverless Function — replaces Firebase Cloud Function
// Secrets live in Vercel Environment Variables, never in the browser.
//
// Vercel Dashboard → Your Project → Settings → Environment Variables:
//   YOUTUBE_CLIENT_ID       = your OAuth client ID
//   YOUTUBE_CLIENT_SECRET   = your OAuth client secret
//   YOUTUBE_REFRESH_TOKEN   = your refresh token
//   NETOLYNK_API_SECRET     = any random string you choose (e.g. openssl rand -hex 32)
//
// How to get a refresh token (one-time setup):
//   1. console.cloud.google.com → enable "YouTube Data API v3"
//   2. Create OAuth 2.0 credentials (Web application)
//      Authorised redirect URI: https://developers.google.com/oauthplayground
//   3. Open https://developers.google.com/oauthplayground
//      ⚙ → "Use your own OAuth credentials" → paste Client ID + Secret
//   4. Step 1 → YouTube Data API v3 → select:
//        https://www.googleapis.com/auth/youtube.upload
//   5. Authorise → Exchange authorisation code for tokens
//   6. Copy "Refresh token" → that's YOUTUBE_REFRESH_TOKEN

import type { VercelRequest, VercelResponse } from '@vercel/node';

const MAX_FILE_MB = 100;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // ── CORS headers (allow your Vercel app origin) ────────────────────────────
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-secret');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // ── Simple shared-secret auth (no Firebase SDK needed) ────────────────────
  // The frontend sends the secret in a header. It's not a user token, just a
  // lightweight guard so random people can't hit your endpoint.
  const apiSecret = process.env.NETOLYNK_API_SECRET;
  if (apiSecret && req.headers['x-api-secret'] !== apiSecret) {
    return res.status(401).json({ error: 'Unauthorised' });
  }

  // ── Validate input ─────────────────────────────────────────────────────────
  const { fileName, fileSize, mimeType, title, description, privacyStatus } = req.body ?? {};

  if (!fileName || !fileSize || !mimeType) {
    return res.status(400).json({ error: 'fileName, fileSize, and mimeType are required.' });
  }
  if (!mimeType.startsWith('video/')) {
    return res.status(400).json({ error: 'mimeType must be a video type.' });
  }
  if (fileSize > MAX_FILE_MB * 1024 * 1024) {
    return res.status(400).json({ error: `Max file size is ${MAX_FILE_MB} MB.` });
  }

  const clientId     = process.env.YOUTUBE_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
  const refreshToken = process.env.YOUTUBE_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    console.error('[initYouTubeUpload] Missing YouTube env vars');
    return res.status(500).json({ error: 'YouTube credentials not configured.' });
  }

  try {
    // ── Step 1: Exchange refresh token for a fresh access token ───────────────
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id:     clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type:    'refresh_token',
      }),
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      console.error('[initYouTubeUpload] Token exchange failed:', err);
      return res.status(500).json({ error: 'Failed to authenticate with YouTube.' });
    }

    const { access_token } = await tokenRes.json() as { access_token: string };

    // ── Step 2: Initiate a resumable upload session ───────────────────────────
    const videoTitle       = ((title || fileName.replace(/\.[^/.]+$/, '')) as string).slice(0, 100);
    const videoDescription = ((description || '') as string).slice(0, 5000);
    const privacy          = (privacyStatus as string) || 'public';

    const initRes = await fetch(
      'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
      {
        method: 'POST',
        headers: {
          Authorization:            `Bearer ${access_token}`,
          'Content-Type':           'application/json',
          'X-Upload-Content-Type':  mimeType,
          'X-Upload-Content-Length': String(fileSize),
        },
        body: JSON.stringify({
          snippet: {
            title:       videoTitle,
            description: videoDescription,
            categoryId:  '22', // People & Blogs
          },
          status: {
            privacyStatus:             privacy,
            selfDeclaredMadeForKids:   false,
          },
        }),
      }
    );

    if (!initRes.ok) {
      const err = await initRes.text();
      console.error('[initYouTubeUpload] Session init failed:', err);
      return res.status(500).json({ error: 'Failed to start YouTube upload session.' });
    }

    // ── Step 3: Extract upload URL + video ID ────────────────────────────────
    const uploadUrl = initRes.headers.get('location');
    if (!uploadUrl) {
      return res.status(500).json({ error: 'YouTube did not return an upload URL.' });
    }

    const videoIdMatch = uploadUrl.match(/[?&]videoId=([^&]+)/);
    const videoId      = videoIdMatch?.[1] ?? null;

    return res.status(200).json({ uploadUrl, videoId });

  } catch (err: any) {
    console.error('[initYouTubeUpload] Unexpected error:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}
