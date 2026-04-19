export interface User {
  uid: string;
  username: string;
  displayName: string;
  email: string;
  bio?: string;
  profileImage?: string;
  coverImage?: string;
  followersCount: number;
  followingCount: number;
  followers?: string[];
  following?: string[];
  postsCount: number;
  verified?: boolean;
  createdAt: string;
}

export interface Post {
  id: string;
  userId: string;
  username: string;
  userProfileImage?: string;
  text?: string;
  mediaUrls: string[];
  type: 'text' | 'image' | 'video';
  mood?: {
    emoji: string;
    label: string;
  };
  likesCount: number;
  commentsCount: number;
  sharesCount: number;
  likedBy?: string[];
  savedBy?: string[];
  tags: string[];
  mentions: string[];
  createdAt: string;
}

export interface Comment {
  id: string;
  postId: string;
  userId: string;
  username: string;
  userProfileImage?: string;
  text: string;
  createdAt: string;
}

export interface Notification {
  id: string;
  recipientId: string;
  senderId: string;
  senderUsername: string;
  senderProfileImage?: string;
  type: 'like' | 'comment' | 'follow' | 'message';
  postId?: string;
  read: boolean;
  createdAt: string;
}

export interface Chat {
  id: string;
  participants: string[];
  participantDetails?: Record<string, {
    username: string;
    displayName: string;
    profileImage: string;
  }>;
  lastMessage?: string;
  lastMessageAt?: string;
  updatedAt: string;
}

export interface Message {
  id: string;
  chatId: string;
  senderId: string;
  text?: string;
  mediaUrl?: string;
  imageUrl?: string;
  type: 'text' | 'image';
  createdAt: string;
}
