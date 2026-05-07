// api/uploadYouTube.ts
// Vercel Serverless Function — full server-side YouTube upload
// Browser sends the video file here → this function uploads to YouTube → returns videoId
//
// Vercel Environment Variables needed:
//   YOUTUBE_CLIENT_ID       = your OAuth client ID
//   YOUTUBE_CLIENT_SECRET   = your OAuth client secret  (one line, no line breaks!)
//   YOUTUBE_REFRESH_TOKEN   = your refresh token

import type { VercelRequest, VercelResponse } from '@vercel/node';

// Disable Vercel's body parser — we read the raw binary stream ourselves
export const config = {
  api: {
    bodyParser: false,
    responseLimit: '100mb',
  },
};

// Helper: collect raw request stream into a Buffer
function getRawBody(req: VercelRequest): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-video-title, x-video-description, x-privacy-status');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const clientId     = process.env.YOUTUBE_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
  const refreshToken = process.env.YOUTUBE_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    return res.status(500).json({ error: 'YouTube credentials not configured.' });
  }

  try {
    // ── Step 1: Get fresh access token ───────────────────────────────────────
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
      return res.status(500).json({ error: `YouTube auth failed: ${err}` });
    }

    const { access_token } = await tokenRes.json() as { access_token: string };

    // ── Step 2: Read metadata from headers ───────────────────────────────────
    const title         = ((req.headers['x-video-title'] as string) || 'Untitled').slice(0, 100);
    const description   = ((req.headers['x-video-description'] as string) || '').slice(0, 5000);
    const privacyStatus = (req.headers['x-privacy-status'] as string) || 'public';
    const mimeType      = req.headers['content-type'] || 'video/mp4';

    // Read raw binary stream from request
    const fileBuffer: Buffer = await getRawBody(req);

    const fileSize = fileBuffer.length;

    // ── Step 3: Init resumable upload session ────────────────────────────────
    const initRes = await fetch(
      'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
      {
        method: 'POST',
        headers: {
          Authorization:             `Bearer ${access_token}`,
          'Content-Type':            'application/json',
          'X-Upload-Content-Type':   mimeType,
          'X-Upload-Content-Length': String(fileSize),
        },
        body: JSON.stringify({
          snippet: { title, description, categoryId: '22' },
          status:  { privacyStatus, selfDeclaredMadeForKids: false },
        }),
      }
    );

    if (!initRes.ok) {
      const err = await initRes.text();
      return res.status(500).json({ error: `Failed to start upload session: ${err}` });
    }

    const uploadUrl = initRes.headers.get('location');
    if (!uploadUrl) {
      return res.status(500).json({ error: 'YouTube did not return an upload URL.' });
    }

    // ── Step 4: Upload the file buffer to YouTube ─────────────────────────────
    const uploadRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type':   mimeType,
        'Content-Length': String(fileSize),
      },
      body: fileBuffer,
    });

    if (!uploadRes.ok) {
      const err = await uploadRes.text();
      return res.status(500).json({ error: `YouTube upload failed: ${err}` });
    }

    // ── Step 5: Extract videoId from response ─────────────────────────────────
    const uploadData = await uploadRes.json() as { id?: string };
    const videoId = uploadData.id;

    if (!videoId) {
      return res.status(500).json({ error: 'YouTube did not return a video ID.' });
    }

    return res.status(200).json({
      videoId,
      thumbnail: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
    });

  } catch (err: any) {
    console.error('[uploadYouTube]', err);
    return res.status(500).json({ error: err.message || 'Internal server error.' });
  }
}
