// ─── Blink Core Type ──────────────────────────────────────────────────────────
export interface Blink {
  id: string;
  userId: string;
  username: string;
  userDisplayName: string;
  userProfileImage?: string;
  mediaUrl: string;
  type: 'image' | 'video';
  caption?: string;
  textOverlay?: string;
  textOverlayColor?: string;
  musicUrl?: string;
  musicTitle?: string;
  viewsCount: number;
  viewedBy: string[];
  createdAt: string;
  expiresAt: string; // createdAt + 24h ISO string
}

// ─── Blink Reaction ───────────────────────────────────────────────────────────
export interface BlinkReaction {
  id: string;
  blinkId: string;
  userId: string;
  username: string;
  userProfileImage?: string;
  emoji: string;
  createdAt: string;
}

// ─── Blink Reply (DM) ─────────────────────────────────────────────────────────
export interface BlinkReply {
  id: string;
  blinkId: string;
  blinkOwnerId: string;
  senderId: string;
  senderUsername: string;
  senderProfileImage?: string;
  text: string;
  createdAt: string;
}

// ─── Grouped by user (for the bar) ───────────────────────────────────────────
export interface UserBlinks {
  userId: string;
  username: string;
  userDisplayName: string;
  userProfileImage?: string;
  blinks: Blink[];
  hasUnseen: boolean; // true if current user hasn't seen all blinks
}

// ─── Upload state ─────────────────────────────────────────────────────────────
export interface BlinkUploadState {
  file: File | null;
  previewUrl: string | null;
  type: 'image' | 'video' | null;
  textOverlay: string;
  textOverlayColor: string;
  caption: string;
  progress: number;
  uploading: boolean;
  error: string | null;
}
