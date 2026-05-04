// ─── Lynk Core Type ──────────────────────────────────────────────────────────
export interface Lynk {
  id: string;
  userId: string;
  username: string;
  userDisplayName: string;
  userProfileImage?: string;
  videoUrl: string;
  thumbnailUrl: string;
  caption: string;
  hashtags: string[];
  likesCount: number;
  commentsCount: number;
  sharesCount: number;
  viewsCount: number;
  savesCount: number;
  totalWatchSeconds: number;   // aggregate watch time in seconds
  completionRate: number;      // 0–1, rolling average
  duration: number;            // seconds
  aspectRatio: '9:16';
  parentLynkId?: string;       // Chain Lynks — reply to another Lynk
  isTrending: boolean;
  boostExpiresAt?: string;     // Viral Boost System — ISO timestamp
  reportCount: number;
  isHidden: boolean;           // Moderation
  createdAt: string;
}

// ─── Engagement sub-collections ──────────────────────────────────────────────
export interface LynkLike {
  id: string;
  lynkId: string;
  userId: string;
  createdAt: string;
}

export interface LynkComment {
  id: string;
  lynkId: string;
  userId: string;
  username: string;
  userProfileImage?: string;
  text: string;
  createdAt: string;
}

export interface LynkView {
  id: string;
  lynkId: string;
  userId: string;
  watchedSeconds: number;
  completed: boolean;
  createdAt: string;
}

export interface WatchTimeLog {
  id: string;
  lynkId: string;
  userId: string;
  sessionSeconds: number;
  createdAt: string;
}

// ─── Feed types ───────────────────────────────────────────────────────────────
export type FeedType = 'forYou' | 'following' | 'trending';

// ─── Upload state ─────────────────────────────────────────────────────────────
export interface LynkUploadState {
  file: File | null;
  videoUrl: string | null;
  thumbnailUrl: string | null;
  caption: string;
  hashtags: string[];
  progress: number;
  uploading: boolean;
  error: string | null;
}

// ─── Recommendation score (computed client-side) ───────────────────────────────
export interface LynkScore {
  lynkId: string;
  score: number;
}
