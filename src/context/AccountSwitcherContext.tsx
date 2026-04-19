import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { signInWithEmailAndPassword, signOut, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { toast } from 'sonner';

// NOTE: We no longer store passwords or base64 secrets locally.
// Firebase Auth handles session persistence securely via IndexedDB
// (browserLocalPersistence). The account switcher stores only safe,
// non-sensitive display data (uid, username, displayName, profileImage, email).
// If a saved account's Firebase session has expired, the user is prompted
// to re-enter their password.

export interface SavedAccount {
  uid: string;
  username: string;
  displayName: string;
  profileImage: string;
  email: string;
}

interface AccountSwitcherContextType {
  savedAccounts: SavedAccount[];
  showSwitcher: boolean;
  openSwitcher: () => void;
  closeSwitcher: () => void;
  addCurrentAccount: (uid: string) => Promise<void>;
  removeAccount: (uid: string) => void;
  logoutCurrentAccount: () => Promise<void>;
  currentUid: string | null;
}

const AccountSwitcherContext = createContext<AccountSwitcherContextType>({
  savedAccounts: [],
  showSwitcher: false,
  openSwitcher: () => {},
  closeSwitcher: () => {},
  addCurrentAccount: async () => {},
  removeAccount: () => {},
  logoutCurrentAccount: async () => {},
  currentUid: null,
});

const STORAGE_KEY = 'netolynk_saved_accounts';

// Ensure Firebase keeps the auth session alive across page reloads
setPersistence(auth, browserLocalPersistence).catch(console.error);

export const AccountSwitcherProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [savedAccounts, setSavedAccounts] = useState<SavedAccount[]>([]);
  const [showSwitcher, setShowSwitcher] = useState(false);
  const [currentUid, setCurrentUid] = useState<string | null>(null);

  // Load saved accounts from localStorage on mount
  // Strip any legacy `secret` fields that may have been stored previously
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed: SavedAccount[] = JSON.parse(raw);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setSavedAccounts(parsed.map(({ uid, username, displayName, profileImage, email }: Record<string, string>) => ({
          uid, username, displayName, profileImage, email,
        })));
      }
    } catch {}
  }, []);

  // Persist whenever savedAccounts changes
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(savedAccounts));
  }, [savedAccounts]);

  const addCurrentAccount = useCallback(async (uid: string) => {
    try {
      const snap = await getDoc(doc(db, 'users', uid));
      if (!snap.exists()) return;
      const data = snap.data();

      setSavedAccounts((prev) => {
        const newAccount: SavedAccount = {
          uid,
          username: data.username,
          displayName: data.displayName,
          profileImage: data.profileImage || `https://api.dicebear.com/7.x/avataaars/svg?seed=${data.username}`,
          email: data.email,
        };
        const existing = prev.find((a) => a.uid === uid);
        if (existing) {
          return prev.map((a) => a.uid === uid ? { ...a, ...newAccount } : a);
        }
        return [...prev, newAccount];
      });
    } catch (e) {
      console.error('Failed to save account', e);
    }
  }, []);

  // Track current Firebase user
  useEffect(() => {
    const unsub = auth.onAuthStateChanged((u) => {
      setCurrentUid(u?.uid ?? null);
      if (u?.uid) addCurrentAccount(u.uid);
    });
    return () => unsub();
  }, [addCurrentAccount]);

  const removeAccount = useCallback((uid: string) => {
    setSavedAccounts((prev) => prev.filter((a) => a.uid !== uid));
  }, []);

  const logoutCurrentAccount = useCallback(async () => {
    if (currentUid) removeAccount(currentUid);
    await signOut(auth);
    toast.success('Signed out');
  }, [currentUid, removeAccount]);

  return (
    <AccountSwitcherContext.Provider value={{
      savedAccounts,
      showSwitcher,
      openSwitcher: () => setShowSwitcher(true),
      closeSwitcher: () => setShowSwitcher(false),
      addCurrentAccount,
      removeAccount,
      logoutCurrentAccount,
      currentUid,
    }}>
      {children}
    </AccountSwitcherContext.Provider>
  );
};

export const useAccountSwitcher = () => useContext(AccountSwitcherContext);
