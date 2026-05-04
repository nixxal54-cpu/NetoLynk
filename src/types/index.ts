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

export interface PollOption {
  id: string;
  text: string;
  votes: number;
  votedBy: string[];
}

export interface QuizOption {
  id: string;
  text: string;
  isCorrect: boolean;
  answeredBy?: string[];
}

export interface Post {
  id: string;
  userId: string;
  username: string;
  userProfileImage?: string;
  text?: string;
  mediaUrls: string[];
  gifUrl?: string;
  type: 'text' | 'image' | 'video' | 'poll' | 'quiz' | 'gif';
  mood?: {
    emoji: string;
    label: string;
  };
  pollOptions?: PollOption[];
  pollQuestion?: string;
  pollExpiresAt?: string;
  quizOptions?: QuizOption[];
  quizQuestion?: string;
  quizExplanation?: string;
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
  gifUrl?: string;
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
  gifUrl?: string;
  type: 'text' | 'image' | 'gif' | 'shared_post';
  sharedPost?: {
    id: string;
    username: string;
    userProfileImage?: string;
    text?: string;
    mediaUrls?: string[];
    gifUrl?: string;
    type: string;
    pollQuestion?: string;
    quizQuestion?: string;
    createdAt: string;
  };
  createdAt: string;
}
