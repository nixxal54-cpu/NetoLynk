import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Check, X, LogOut, ChevronRight, ChevronLeft, Loader2 } from 'lucide-react';
import { useAccountSwitcher, SavedAccount } from '../context/AccountSwitcherContext';
import { useAuth } from '../context/AuthContext';
import { auth } from '../lib/firebase';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

export const AccountSwitcher: React.FC = () => {
  const { savedAccounts, showSwitcher, closeSwitcher, removeAccount, currentUid, addCurrentAccount, logoutCurrentAccount } = useAccountSwitcher();
  const { user } = useAuth();
  const navigate = useNavigate();
  const backdropRef = useRef<HTMLDivElement>(null);

  const [removingId, setRemovingId] = useState<string | null>(null);
  const [switchTarget, setSwitchTarget] = useState<SavedAccount | null>(null);
  const [password, setPassword] = useState('');
  const [switching, setSwitching] = useState(false);

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === backdropRef.current) closeSwitcher();
  };

  useEffect(() => {
    if (showSwitcher) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
      setTimeout(() => {
        setSwitchTarget(null);
        setPassword('');
      }, 300);
    }
    return () => { document.body.style.overflow = ''; };
  }, [showSwitcher]);

  // No longer attempts auto-switch with stored password.
  // Firebase session persistence handles seamless re-auth automatically.
  // If the session is expired, we prompt for a password.
  const handleSwitch = (account: SavedAccount) => {
    if (account.uid === currentUid) {
      navigate(`/profile/${account.username}`);
      closeSwitcher();
      return;
    }
    setSwitchTarget(account);
  };

  const executeSwitch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!switchTarget) return;
    setSwitching(true);
    try {
      await signInWithEmailAndPassword(auth, switchTarget.email, password);
      await addCurrentAccount(switchTarget.uid);
      toast.success(`Switched to @${switchTarget.username}`);
      closeSwitcher();
    } catch {
      toast.error('Incorrect password or failed to switch.');
    } finally {
      setSwitching(false);
    }
  };

  const handleRemove = (e: React.MouseEvent, uid: string) => {
    e.stopPropagation();
    setRemovingId(uid);
    setTimeout(() => {
      removeAccount(uid);
      setRemovingId(null);
      toast.success('Account removed');
    }, 300);
  };

  const handleAddAccount = () => {
    closeSwitcher();
    auth.signOut();
  };

  const handleLogout = () => {
    closeSwitcher();
    logoutCurrentAccount();
  };

  const currentAccount = savedAccounts.find((a) => a.uid === currentUid);
  const otherAccounts = savedAccounts.filter((a) => a.uid !== currentUid);

  const displayCurrent = currentAccount ?? (user ? {
    uid: user.uid,
    username: user.username,
    displayName: user.displayName,
    profileImage: user.profileImage || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.username}`,
    email: user.email,
  } : null);

  return (
    <AnimatePresence>
      {showSwitcher && (
        <>
          <motion.div ref={backdropRef} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} onClick={handleBackdropClick} className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-[2px]" />

          <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 30, stiffness: 300 }} className="fixed bottom-0 left-0 right-0 z-[201] bg-[#1a1a1a] rounded-t-3xl overflow-hidden shadow-2xl max-w-lg mx-auto">
            <div className="flex justify-center pt-3 pb-1"><div className="w-10 h-1 rounded-full bg-white/20" /></div>

            <AnimatePresence mode="wait">
              {switchTarget ? (
                <motion.div key="password-prompt" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="px-4 py-2 pb-6">
                  <div className="flex items-center gap-3 mb-6">
                    <button onClick={() => { setSwitchTarget(null); setPassword(''); }} className="p-2 bg-white/5 rounded-full hover:bg-white/10 transition-colors">
                      <ChevronLeft className="w-5 h-5 text-white" />
                    </button>
                    <div className="flex items-center gap-3">
                      <img src={switchTarget.profileImage} className="w-10 h-10 rounded-full ring-2 ring-white/10 object-cover" alt="Profile" loading="lazy" />
                      <div>
                        <p className="font-semibold text-white text-[15px]">@{switchTarget.username}</p>
                        <p className="text-[12px] text-white/50">{switchTarget.email}</p>
                      </div>
                    </div>
                  </div>

                  <form onSubmit={executeSwitch} className="space-y-3">
                    <input
                      type="password"
                      placeholder="Enter password"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3.5 text-white focus:border-primary outline-none transition-colors"
                      autoComplete="current-password"
                      autoFocus
                    />
                    <button disabled={switching || !password} type="submit" className="w-full bg-primary text-white py-3.5 rounded-xl font-bold disabled:opacity-50 transition-opacity flex items-center justify-center">
                      {switching ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Log In'}
                    </button>
                  </form>
                </motion.div>
              ) : (
                <motion.div key="account-list" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}>
                  <div className="px-2 pt-2 pb-1">
                    {displayCurrent && (
                      <motion.button onClick={() => { navigate(`/profile/${displayCurrent.username}`); closeSwitcher(); }} className="w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl hover:bg-white/5 active:bg-white/10 transition-colors">
                        <div className="relative flex-shrink-0">
                          <img src={displayCurrent.profileImage} alt={displayCurrent.username} className="w-14 h-14 rounded-full object-cover ring-2 ring-primary" loading="lazy" />
                          <span className="absolute bottom-0.5 right-0.5 w-3.5 h-3.5 bg-green-500 rounded-full ring-2 ring-[#1a1a1a]" />
                        </div>
                        <div className="flex-1 text-left min-w-0">
                          <p className="font-semibold text-white text-[15px] truncate">{displayCurrent.username}</p>
                          <p className="text-[13px] text-white/50 truncate">{displayCurrent.displayName}</p>
                        </div>
                        <Check className="w-5 h-5 text-primary flex-shrink-0" />
                      </motion.button>
                    )}

                    {otherAccounts.length > 0 && <div className="mx-4 my-1 border-t border-white/5" />}

                    <AnimatePresence>
                      {otherAccounts.map((account) => (
                        <motion.div key={account.uid} initial={{ opacity: 1, height: 'auto' }} animate={{ opacity: removingId === account.uid ? 0 : 1, height: removingId === account.uid ? 0 : 'auto' }} transition={{ duration: 0.25 }} className="overflow-hidden">
                          <button onClick={() => handleSwitch(account)} className="w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl hover:bg-white/5 active:bg-white/10 transition-colors group">
                            <div className="relative flex-shrink-0">
                              <img src={account.profileImage} alt={account.username} className="w-14 h-14 rounded-full object-cover ring-2 ring-white/10" loading="lazy" />
                            </div>
                            <div className="flex-1 text-left min-w-0">
                              <p className="font-semibold text-white text-[15px] truncate">{account.username}</p>
                              <p className="text-[13px] text-white/50 truncate">{account.displayName}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <div onClick={(e) => handleRemove(e, account.uid)} className="p-1.5 rounded-full text-white/30 hover:text-white/70 hover:bg-white/10 opacity-0 group-hover:opacity-100 transition-all z-10 cursor-pointer">
                                <X className="w-4 h-4" />
                              </div>
                              <ChevronRight className="w-4 h-4 text-white/20" />
                            </div>
                          </button>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>

                  <div className="px-4 pb-2 pt-1 space-y-1 border-t border-white/5">
                    <button onClick={handleAddAccount} className="w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl hover:bg-white/5 active:bg-white/10 transition-colors">
                      <div className="w-14 h-14 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0"><Plus className="w-7 h-7 text-white/70" /></div>
                      <div className="text-left"><p className="font-semibold text-white text-[15px]">Add account</p></div>
                    </button>
                    <button onClick={handleLogout} className="w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl hover:bg-white/5 active:bg-white/10 transition-colors">
                      <div className="w-14 h-14 rounded-full bg-white/5 flex items-center justify-center flex-shrink-0"><LogOut className="w-6 h-6 text-white/40" /></div>
                      <div className="text-left"><p className="font-semibold text-white/70 text-[15px]">Log out</p></div>
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            <div className="flex items-center justify-center gap-2 py-4 pb-8"><span className="text-[12px] text-white/20 font-medium tracking-widest uppercase">Netolynk</span></div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
