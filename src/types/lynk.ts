// src/types/lynk.ts
export type LynkCategory = "gaming" | "funny" | "edits" | "relatable" | "music" | "trending";

export interface Lynk {
  id: string;
  userId: string;
  username: string;
  userProfileImage?: string;

  // Video — stored as direct Cloudinary URLs (no YouTube dependency)
  videoUrl: string;       // e.g. https://res.cloudinary.com/…/video/upload/…/xyz.mp4
  thumbnailUrl: string;   // e.g. https://res.cloudinary.com/…/image/upload/…/xyz.jpg
  publicId?: string;      // Cloudinary public_id, useful for transforms / deletion

  // Content
  caption: string;
  hashtags: string[];
  category: LynkCategory;
  visibility: "public" | "unlisted";
  allowComments: boolean;
  duration: number;       // seconds

  // Engagement
  likesCount: number;
  commentsCount: number;
  sharesCount: number;
  savesCount: number;
  viewsCount: number;
  totalWatchSeconds: number;
  completionRate: number;
  reportCount: number;

  // Recommendation Engine
  boostScore: number;
  boostExpiresAt: string;
  isTrending: boolean;
  isHidden: boolean;

  createdAt: any;
}

export interface LynkComment {
  id: string;
  lynkId: string;
  userId: string;
  username: string;
  userProfileImage?: string;
  text: string;
  createdAt: any;
}

export interface LynkView {
  id: string;
  lynkId: string;
  userId: string;
  createdAt: any;
}

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
