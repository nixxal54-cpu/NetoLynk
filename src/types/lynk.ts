// src/types/lynk.ts
export type LynkCategory = "gaming" | "funny" | "edits" | "relatable" | "music" | "trending";

export interface Lynk {
  id: string;
  userId: string;
  username: string;
  userProfileImage?: string;
  
  // Video Metadata (No raw video URLs)
  videoId: string; 
  thumbnail: string; // https://img.youtube.com/vi/{videoId}/hqdefault.jpg
  
  // Content
  caption: string;
  category: LynkCategory;
  tags: string[];
  visibility: "public" | "unlisted";
  
  // Engagement
  likesCount: number;
  commentsCount: number;
  sharesCount: number;
  
  // Recommendation Engine
  boostScore: number; 
  createdAt: string;
}
