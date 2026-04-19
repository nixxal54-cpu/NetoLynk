import React, { useState } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../../lib/firebase';
import { toast } from 'sonner';
import { motion } from 'motion/react';
import { useAccountSwitcher, SavedAccount } from '../../context/AccountSwitcherContext';
import { ChevronRight, Eye, EyeOff, Loader2 } from 'lucide-react';
import { OnboardingFlow } from './OnboardingFlow';

export const AuthForm: React.FC = () => {
  const { savedAccounts, addCurrentAccount } = useAccountSwitcher();
  const [showSaved, setShowSaved] = useState(savedAccounts.length > 0);
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  // Saved accounts no longer store passwords. Clicking one pre-fills the email
  // and prompts for a password. Firebase session persistence means this flow
  // only triggers when the user's token has genuinely expired.
  const handleSavedLogin = (acc: SavedAccount) => {
    setSwitchingId(acc.uid);
    setShowSaved(false);
    setEmail(acc.email);
    toast.info(`Enter your password for @${acc.username}`);
    setSwitchingId(null);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await signInWithEmailAndPassword(auth, email, password);
      // Store display data only — no password or secret
      await addCurrentAccount(res.user.uid);
      toast.success('Welcome back!');
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Login failed';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  if (showOnboarding) {
    return <OnboardingFlow onBack={() => setShowOnboarding(false)} />;
  }

  if (showSaved && savedAccounts.length > 0) {
    return (
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full p-8 bg-card rounded-3xl shadow-2xl border border-border">
        <div className="text-center mb-6">
          <div className="flex items-center justify-center mb-2">
            <img src="/netolynk-logo.png" alt="NetoLynk" className="h-14 w-auto object-contain" />
          </div>
          <p className="text-muted-foreground text-sm mt-1">Welcome Back</p>
        </div>
        <div className="space-y-3">
          {savedAccounts.map(acc => (
            <button key={acc.uid} onClick={() => handleSavedLogin(acc)} disabled={switchingId !== null}
              className="w-full flex items-center gap-4 p-4 bg-accent/50 hover:bg-accent rounded-2xl transition-colors group text-left">
              <img src={acc.profileImage} className="w-12 h-12 rounded-full object-cover" alt="Profile" loading="lazy" />
              <div className="flex-1 min-w-0">
                <p className="font-bold truncate">{acc.displayName}</p>
                <p className="text-sm text-muted-foreground truncate">@{acc.username}</p>
              </div>
              {switchingId === acc.uid
                ? <Loader2 className="w-5 h-5 text-primary animate-spin" />
                : <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />}
            </button>
          ))}
        </div>
        <button onClick={() => setShowSaved(false)} className="w-full mt-6 text-primary font-medium hover:underline text-sm">
          Log into another account
        </button>
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 20, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      className="max-w-md w-full p-8 bg-card rounded-3xl shadow-2xl border border-border">
      <div className="text-center mb-8">
        <div className="flex items-center justify-center mb-2">
          <img src="/netolynk-logo.png" alt="NetoLynk" className="h-16 w-auto object-contain" />
        </div>
        <p className="text-muted-foreground mt-1">Sign in to your account</p>
      </div>
      <form onSubmit={handleLogin} className="space-y-4">
        <div>
          <label className="text-sm font-medium ml-1">Email</label>
          <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
            className="w-full mt-1 px-4 py-3 rounded-xl bg-accent/50 border border-border focus:border-primary outline-none"
            placeholder="name@example.com" autoComplete="email" />
        </div>
        <div>
          <label className="text-sm font-medium ml-1">Password</label>
          <div className="relative">
            <input type={showPassword ? 'text' : 'password'} required value={password} onChange={e => setPassword(e.target.value)}
              className="w-full mt-1 px-4 py-3 pr-12 rounded-xl bg-accent/50 border border-border focus:border-primary outline-none"
              placeholder="••••••••" autoComplete="current-password" />
            <button type="button" onClick={() => setShowPassword(s => !s)}
              className="absolute right-4 top-1/2 -translate-y-1/2 mt-0.5 text-muted-foreground hover:text-foreground">
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>
        <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} type="submit" disabled={loading}
          className="w-full py-3 bg-primary text-primary-foreground rounded-xl font-bold hover:opacity-90 disabled:opacity-50">
          {loading ? 'Signing in...' : 'Sign In'}
        </motion.button>
      </form>
      <div className="mt-6 text-center">
        <p className="text-muted-foreground text-sm">
          Don't have an account?{' '}
          <button onClick={() => setShowOnboarding(true)} className="text-primary hover:underline font-semibold">
            Sign up
          </button>
        </p>
      </div>
      {savedAccounts.length > 0 && (
        <button onClick={() => setShowSaved(true)} className="w-full mt-4 text-sm text-muted-foreground hover:text-foreground hover:underline">
          View saved accounts
        </button>
      )}
    </motion.div>
  );
};
