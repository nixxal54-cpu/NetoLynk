import { collection, query, where, getDocs, doc, setDoc, addDoc, updateDoc, increment } from 'firebase/firestore';
import { db } from './firebase';
import { User } from '../types';

export const processMentions = async (
  text: string,
  sourceType: 'post' | 'comment',
  sourceId: string,
  currentUser: User,
  postImageUrl?: string
) => {
  if (!text) return;

  // 1. Extract unique usernames (e.g., "@demo" -> "demo")
  const mentions = Array.from(new Set(text.match(/@([a-zA-Z0-9_]+)/g)?.map(m => m.slice(1).toLowerCase()) || []));
  if (mentions.length === 0) return;

  // Firestore "in" queries are limited to 10 items
  const limitedMentions = mentions.slice(0, 10);

  try {
    // 2. Fetch the actual user documents for these usernames
    const usersRef = collection(db, 'users');
    const q = query(usersRef, where('username', 'in', limitedMentions));
    const snapshot = await getDocs(q);
    
    if (snapshot.empty) return;

    const snippet = text.slice(0, 50) + (text.length > 50 ? '...' : '');
    const messageText = `Mentioned you in a ${sourceType}:\n"${snippet}"`;

    // 3. Process each mentioned user in parallel
    const promises = snapshot.docs.map(async (userDoc) => {
      const targetUser = userDoc.data() as User;
      const targetUid = userDoc.id;

      // Don't notify yourself
      if (targetUid === currentUser.uid) return;

      const now = new Date().toISOString();

      // --- A. Create Notification ---
      await addDoc(collection(db, 'notifications'), {
        recipientId: targetUid,
        senderId: currentUser.uid,
        senderUsername: currentUser.username,
        senderProfileImage: currentUser.profileImage || '',
        type: 'message', // Using message type as a general alert
        text: `mentioned you in a ${sourceType}.`,
        postId: sourceType === 'post' ? sourceId : undefined,
        read: false,
        createdAt: now
      });

      // --- B. Send Direct Message ---
      const chatId = [currentUser.uid, targetUid].sort().join('_');
      const chatRef = doc(db, 'chats', chatId);
      
      // Update/Create the Chat Document
      await setDoc(chatRef, {
        participants: [currentUser.uid, targetUid],
        participantDetails: {
          [currentUser.uid]: {
            username: currentUser.username,
            displayName: currentUser.displayName,
            profileImage: currentUser.profileImage || ''
          },
          [targetUid]: {
            username: targetUser.username,
            displayName: targetUser.displayName,
            profileImage: targetUser.profileImage || ''
          }
        },
        lastMessage: `Mentioned you in a ${sourceType}`,
        lastMessageAt: now,
        updatedAt: now,
        [`unreadCount.${targetUid}`]: increment(1)
      }, { merge: true });

      // Add the Message Document inside the Chat
      await addDoc(collection(db, 'chats', chatId, 'messages'), {
        chatId,
        senderId: currentUser.uid,
        text: messageText,
        imageUrl: postImageUrl || null,
        type: postImageUrl ? 'image' : 'text',
        deleted: false,
        createdAt: now
      });
    });

    await Promise.all(promises);
    console.log(`Successfully processed ${promises.length} mentions.`);
  } catch (error) {
    console.error("Error processing mentions:", error);
  }
};
