import React, { useState, useRef, useCallback } from 'react';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { doc, setDoc, serverTimestamp, collection, query, where, getDocs, limit } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import imageCompression from 'browser-image-compression';
import { auth, db, storage } from '../../lib/firebase';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';
import { useAccountSwitcher } from '../../context/AccountSwitcherContext';
import {
  ArrowLeft, ArrowRight, Camera, CheckCircle2,
  Eye, EyeOff, Loader2, Lock, Shield, User,
  Mail, AtSign, ChevronRight, Search
} from 'lucide-react';

interface OnboardingData {
  email: string;
  password: string;
  birthday: { day: string; month: string; year: string };
  name: string;
  username: string;
  profileImageFile: File | null;
  profileImagePreview: string;
  privacy: 'private' | 'public';
}

interface OnboardingFlowProps {
  onBack: () => void;
}

// Steps: 0=email, 1=password, 2=birthday, 3=privacy+terms, 4=name, 5=username, 6=pfp, 7=contacts, 8=follow, 9=allset
const TOTAL_STEPS = 10;

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December'
];

const SUGGESTED_ACCOUNTS = [
  { username: 'neas_ting', displayName: "Nea's Ting", avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=neas' },
  { username: 'metalbent_', displayName: 'Metalbent', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=metalbent' },
  { username: '_a.r.t.i.s', displayName: 'A.R.T.I.S.', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=artis' },
  { username: 'mrsovo.1', displayName: 'RIYAH PRIVV', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=mrsovo' },
  { username: 'sempre_makina', displayName: 'Sempre makina', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=sempre' },
  { username: 'techvibes', displayName: 'Tech Vibes', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=techvibes' },
];

export const OnboardingFlow: React.FC<OnboardingFlowProps> = ({ onBack }) => {
  const { addCurrentAccount } = useAccountSwitcher();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [direction, setDirection] = useState<'forward' | 'back'>('forward');
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'taken' | 'available'>('idle');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const usernameDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [data, setData] = useState<OnboardingData>({
    email: '',
    password: '',
    birthday: { day: '', month: 'January', year: '' },
    name: '',
    username: '',
    profileImageFile: null,
    profileImagePreview: '',
    privacy: 'private',
  });

  const [followSelected, setFollowSelected] = useState<Set<string>>(
    new Set(SUGGESTED_ACCOUNTS.slice(0, 5).map(a => a.username))
  );

  const goNext = () => { setDirection('forward'); setStep(s => s + 1); };
  const goBack = () => {
    setDirection('back');
    if (step === 0) onBack();
    else setStep(s => s - 1);
  };

  const checkUsername = useCallback(async (username: string) => {
    if (username.length < 3) { setUsernameStatus('idle'); return; }
    setUsernameStatus('checking');
    try {
      // Always check lowercase since usernames are stored lowercase
      const normalised = username.toLowerCase().replace(/\s/g, '');
      const q = query(collection(db, 'users'), where('username', '==', normalised), limit(1));
      const snap = await getDocs(q);
      setUsernameStatus(snap.empty ? 'available' : 'taken');
    } catch (err) {
      // If Firestore check fails (network issue, index missing, etc.)
      // don't block the user — mark as available and let the server
      // reject on final account creation if truly taken.
      console.warn('Username check failed, assuming available:', err);
      setUsernameStatus('available');
    }
  }, []);

  // Returns true if the user is at least 13 years old
  const ageIsValid = (): boolean => {
    const { day, month, year } = data.birthday;
    if (!day || !year || year.length !== 4) return false;
    const monthIndex = MONTHS.indexOf(month);
    const dob = new Date(Number(year), monthIndex, Number(day));
    const thirteenYearsAgo = new Date();
    thirteenYearsAgo.setFullYear(thirteenYearsAgo.getFullYear() - 13);
    return dob <= thirteenYearsAgo;
  };

  const handleImagePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setData(d => ({ ...d, profileImageFile: file, profileImagePreview: URL.createObjectURL(file) }));
  };

  const handleFinish = async () => {
    setLoading(true);
    try {
      // 1. Create Firebase Auth user
      const userCredential = await createUserWithEmailAndPassword(auth, data.email, data.password);
      const user = userCredential.user;

      // 2. Upload profile image if selected (compressed)
      let profileImageUrl = `https://api.dicebear.com/7.x/avataaars/svg?seed=${data.username}`;
      if (data.profileImageFile) {
        const compressed = await imageCompression(data.profileImageFile, {
          maxSizeMB: 0.5,
          maxWidthOrHeight: 512,
          useWebWorker: true,
        });
        const storageRef = ref(storage, `users/${user.uid}/profile`);
        await uploadBytes(storageRef, compressed);
        profileImageUrl = await getDownloadURL(storageRef);
      }

      // 3. Update Firebase Auth profile
      await updateProfile(user, { displayName: data.name, photoURL: profileImageUrl });

      // 4. Write Firestore user document
      const monthIndex = MONTHS.indexOf(data.birthday.month) + 1;
      const birthday = `${data.birthday.year}-${String(monthIndex).padStart(2,'0')}-${String(data.birthday.day).padStart(2,'0')}`;

      await setDoc(doc(db, 'users', user.uid), {
        uid: user.uid,
        username: data.username.toLowerCase().replace(/\s/g, ''),
        displayName: data.name,
        email: data.email,
        bio: '',
        birthday,
        privacy: data.privacy,
        profileImage: profileImageUrl,
        coverImage: 'https://picsum.photos/seed/netolynk/1200/400',
        followersCount: 0,
        followingCount: 0,
        postsCount: 0,
        createdAt: new Date().toISOString(),
        serverCreatedAt: serverTimestamp(),
      });

      // 5. Save to account switcher (display data only — no password stored)
      await addCurrentAccount(user.uid);

      // 6. Proceed to All Set page
      goNext();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Account creation failed';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const variants = {
    enter: (dir: 'forward' | 'back') => ({ x: dir === 'forward' ? 40 : -40, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (dir: 'forward' | 'back') => ({ x: dir === 'forward' ? -40 : 40, opacity: 0 }),
  };

  // Shared classes — NetoLynk brand: dark bg, white text, red accent
  const bg = 'min-h-screen w-full flex flex-col bg-[#050505] text-white';
  const input = 'w-full px-4 py-3.5 rounded-xl bg-[#1C1C1E] border border-[#27272a] focus:border-[#FF3B30] outline-none transition-colors text-white placeholder:text-white/30 text-base';
  const label = 'block text-sm font-medium text-white/50 mb-1.5 ml-0.5';
  const btnPrimary = 'w-full py-4 bg-[#FF3B30] hover:bg-[#e63429] disabled:opacity-30 disabled:cursor-not-allowed rounded-xl font-bold text-base transition-colors text-white';
  const btnGhost = 'w-full py-3 text-white/40 hover:text-white/70 font-medium transition-colors text-sm';

  const canProceed = () => {
    switch (step) {
      case 0: return data.email.includes('@') && data.email.includes('.');
      case 1: return data.password.length >= 6;
      case 2: return ageIsValid();
      case 4: return data.name.trim().length >= 2;
      case 5: return data.username.trim().length >= 3 && (usernameStatus === 'available' || usernameStatus === 'checking');
      default: return true;
    }
  };

  const progressSteps = TOTAL_STEPS - 1; // don't count "all set" in progress

  return (
    <div className={bg}>
      {/* Progress bar — hidden on all-set page */}
      {step < TOTAL_STEPS - 1 && (
        <div className="w-full h-[2px] bg-[#1C1C1E]">
          <motion.div
            className="h-full bg-[#FF3B30]"
            animate={{ width: `${Math.round((step / (progressSteps - 1)) * 100)}%` }}
            transition={{ duration: 0.35 }}
          />
        </div>
      )}

      {/* Top bar */}
      {step < TOTAL_STEPS - 1 && (
        <div className="flex items-center px-4 pt-4 pb-2 shrink-0">
          <button onClick={goBack} className="p-2 hover:bg-white/10 rounded-full transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1 flex justify-center">
            <img src="/netolynk-logo.png" alt="NetoLynk" className="h-8 w-auto object-contain" />
          </div>
          <div className="w-9" />
        </div>
      )}

      <AnimatePresence mode="wait" custom={direction}>
        <motion.div
          key={step}
          custom={direction}
          variants={variants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ duration: 0.22, ease: 'easeInOut' }}
          className="flex-1 flex flex-col px-6 pt-6 pb-10 max-w-sm mx-auto w-full"
        >

          {/* ── STEP 0: Email ── */}
          {step === 0 && (
            <div className="flex flex-col h-full">
              <div className="mb-8">
                <div className="w-10 h-10 rounded-xl bg-[#FF3B30]/15 flex items-center justify-center mb-5">
                  <Mail className="w-5 h-5 text-[#FF3B30]" />
                </div>
                <h1 className="text-2xl font-bold mb-1.5">What's your email?</h1>
                <p className="text-white/40 text-sm">Enter the email for your NetoLynk account.</p>
              </div>
              <div>
                <label className={label}>Email address</label>
                <input type="email" value={data.email} autoFocus
                  onChange={e => setData(d => ({ ...d, email: e.target.value }))}
                  className={input} placeholder="you@example.com" />
              </div>
              <div className="flex-1" />
              <button onClick={goNext} disabled={!canProceed()} className={btnPrimary}>
                Next
              </button>
            </div>
          )}

          {/* ── STEP 1: Password ── */}
          {step === 1 && (
            <div className="flex flex-col h-full">
              <div className="mb-8">
                <div className="w-10 h-10 rounded-xl bg-[#FF3B30]/15 flex items-center justify-center mb-5">
                  <Lock className="w-5 h-5 text-[#FF3B30]" />
                </div>
                <h1 className="text-2xl font-bold mb-1.5">Create a password</h1>
                <p className="text-white/40 text-sm">At least 6 characters.</p>
              </div>
              <div>
                <label className={label}>Password</label>
                <div className="relative">
                  <input type={showPassword ? 'text' : 'password'} value={data.password} autoFocus
                    onChange={e => setData(d => ({ ...d, password: e.target.value }))}
                    className={input + ' pr-12'} placeholder="••••••••" />
                  <button type="button" onClick={() => setShowPassword(s => !s)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60">
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {data.password.length > 0 && (
                  <div className="flex gap-1 mt-2">
                    {[1,2,3,4].map(i => (
                      <div key={i} className={`h-0.5 flex-1 rounded-full transition-colors ${
                        data.password.length >= i * 3
                          ? i <= 1 ? 'bg-[#FF3B30]' : i === 2 ? 'bg-orange-400' : i === 3 ? 'bg-yellow-400' : 'bg-green-500'
                          : 'bg-[#27272a]'
                      }`} />
                    ))}
                  </div>
                )}
              </div>
              <div className="flex-1" />
              <button onClick={goNext} disabled={!canProceed()} className={btnPrimary}>Next</button>
            </div>
          )}

          {/* ── STEP 2: Birthday ── */}
          {step === 2 && (
            <div className="flex flex-col h-full">
              <div className="mb-8">
                <div className="w-10 h-10 rounded-xl bg-[#FF3B30]/15 flex items-center justify-center mb-5">
                  <span className="text-[#FF3B30] text-base font-bold">BD</span>
                </div>
                <h1 className="text-2xl font-bold mb-1.5">What's your birthday?</h1>
                <p className="text-white/40 text-sm">This won't be part of your public profile.</p>
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className={label}>Month</label>
                  <select value={data.birthday.month}
                    onChange={e => setData(d => ({ ...d, birthday: { ...d.birthday, month: e.target.value } }))}
                    className={input + ' appearance-none'}>
                    {MONTHS.map(m => <option key={m} value={m} className="bg-[#121212]">{m}</option>)}
                  </select>
                </div>
                <div className="w-[72px]">
                  <label className={label}>Day</label>
                  <input type="number" min="1" max="31" value={data.birthday.day} placeholder="DD"
                    onChange={e => setData(d => ({ ...d, birthday: { ...d.birthday, day: e.target.value } }))}
                    className={input} />
                </div>
                <div className="w-[88px]">
                  <label className={label}>Year</label>
                  <input type="number" min="1900" max={new Date().getFullYear()} value={data.birthday.year} placeholder="YYYY"
                    onChange={e => setData(d => ({ ...d, birthday: { ...d.birthday, year: e.target.value } }))}
                    className={input} />
                </div>
              </div>
              <p className="text-white/25 text-xs mt-3 leading-relaxed">
                You need to enter the birthday of the person using this account.
                {data.birthday.day && data.birthday.year.length === 4 && !ageIsValid() && (
                  <span className="block mt-2 text-[#FF3B30]">You must be at least 13 years old to create an account.</span>
                )}
              </p>
              <div className="flex-1" />
              <button onClick={goNext} disabled={!canProceed()} className={btnPrimary}>Next</button>
            </div>
          )}

          {/* ── STEP 3: Privacy & Terms ── */}
          {step === 3 && (
            <div className="flex flex-col h-full">
              <div className="mb-6">
                <div className="w-10 h-10 rounded-xl bg-[#FF3B30]/15 flex items-center justify-center mb-5">
                  <Shield className="w-5 h-5 text-[#FF3B30]" />
                </div>
                <h1 className="text-2xl font-bold mb-1.5">Privacy & Terms</h1>
                <p className="text-white/40 text-sm">Choose your privacy setting and review our terms.</p>
              </div>

              {/* Privacy toggle */}
              <div className="bg-[#1C1C1E] rounded-xl border border-[#27272a] overflow-hidden mb-4">
                <p className="text-xs font-semibold text-white/40 uppercase tracking-wider px-4 pt-4 pb-2">Account Privacy</p>
                {([
                  { val: 'private', Icon: Lock, title: 'Private', desc: 'Only confirmed followers can see what you share.' },
                  { val: 'public', Icon: Shield, title: 'Public', desc: 'Anyone on or off NetoLynk can see what you share.' },
                ] as const).map(({ val, Icon, title, desc }) => (
                  <button key={val} onClick={() => setData(d => ({ ...d, privacy: val }))}
                    className={`w-full flex items-center gap-3 px-4 py-3 transition-colors last:border-t last:border-[#27272a] ${
                      data.privacy === val ? 'bg-[#FF3B30]/10' : 'hover:bg-white/5'
                    }`}>
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center ${
                      data.privacy === val ? 'bg-[#FF3B30]/20' : 'bg-[#27272a]'
                    }`}>
                      <Icon className={`w-4 h-4 ${data.privacy === val ? 'text-[#FF3B30]' : 'text-white/40'}`} />
                    </div>
                    <div className="flex-1 text-left">
                      <p className="font-semibold text-sm">{title}</p>
                      <p className="text-xs text-white/40">{desc}</p>
                    </div>
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                      data.privacy === val ? 'border-[#FF3B30]' : 'border-[#27272a]'
                    }`}>
                      {data.privacy === val && <div className="w-2.5 h-2.5 rounded-full bg-[#FF3B30]" />}
                    </div>
                  </button>
                ))}
                <p className="text-white/25 text-xs px-4 py-3">You can change this anytime in Settings.</p>
              </div>

              {/* Terms links */}
              <div className="bg-[#1C1C1E] rounded-xl border border-[#27272a] overflow-hidden">
                {[
                  { title: 'Terms of Service', desc: 'Community guidelines and usage terms' },
                  { title: 'Privacy Policy', desc: 'How we collect and use your data' },
                  { title: 'Cookie Policy', desc: 'How we use cookies' },
                ].map((item, i) => (
                  <button key={item.title}
                    className={`w-full flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors text-left ${i > 0 ? 'border-t border-[#27272a]' : ''}`}>
                    <div>
                      <p className="font-medium text-sm">{item.title}</p>
                      <p className="text-xs text-white/30">{item.desc}</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-white/20 shrink-0" />
                  </button>
                ))}
              </div>

              <div className="flex-1" />
              <p className="text-white/25 text-xs text-center mb-3">
                By tapping "I Agree" you accept NetoLynk's Terms and Privacy Policy.
              </p>
              <button onClick={goNext} className={btnPrimary}>I Agree</button>
            </div>
          )}

          {/* ── STEP 4: Name ── */}
          {step === 4 && (
            <div className="flex flex-col h-full">
              <div className="mb-8">
                <div className="w-10 h-10 rounded-xl bg-[#FF3B30]/15 flex items-center justify-center mb-5">
                  <User className="w-5 h-5 text-[#FF3B30]" />
                </div>
                <h1 className="text-2xl font-bold mb-1.5">What's your name?</h1>
                <p className="text-white/40 text-sm">This is how people will find you on NetoLynk.</p>
              </div>
              <div>
                <label className={label}>Full name</label>
                <input type="text" value={data.name} autoFocus placeholder="Your full name"
                  onChange={e => setData(d => ({ ...d, name: e.target.value }))}
                  className={input} />
              </div>
              <div className="flex-1" />
              <button onClick={goNext} disabled={!canProceed()} className={btnPrimary}>Next</button>
            </div>
          )}

          {/* ── STEP 5: Username ── */}
          {step === 5 && (
            <div className="flex flex-col h-full">
              <div className="mb-8">
                <div className="w-10 h-10 rounded-xl bg-[#FF3B30]/15 flex items-center justify-center mb-5">
                  <AtSign className="w-5 h-5 text-[#FF3B30]" />
                </div>
                <h1 className="text-2xl font-bold mb-1.5">Create a username</h1>
                <p className="text-white/40 text-sm">You can always change this later.</p>
              </div>
              <div>
                <label className={label}>Username</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30">@</span>
                  <input type="text" value={data.username} autoFocus placeholder="yourhandle"
                    onChange={e => {
                      const val = e.target.value.replace(/\s/g,'').toLowerCase();
                      setData(d => ({ ...d, username: val }));
                      setUsernameStatus('idle');
                      if (usernameDebounceRef.current) clearTimeout(usernameDebounceRef.current);
                      if (val.length >= 3) {
                        usernameDebounceRef.current = setTimeout(() => checkUsername(val), 400);
                      }
                    }}
                    className={input + ' pl-8'} />
                </div>
                {usernameStatus === 'checking' && (
                  <p className="text-xs text-white/40 mt-2 ml-0.5">Checking availability…</p>
                )}
                {usernameStatus === 'available' && (
                  <p className="flex items-center gap-1.5 text-xs text-green-400 mt-2 ml-0.5">
                    <CheckCircle2 className="w-3.5 h-3.5" /> @{data.username} is available
                  </p>
                )}
                {usernameStatus === 'taken' && (
                  <p className="text-xs text-[#FF3B30] mt-2 ml-0.5">
                    @{data.username} is already taken — try another
                  </p>
                )}
              </div>
              <div className="flex-1" />
              <button
                onClick={async () => {
                  if (usernameStatus === 'checking') {
                    // Wait for the in-flight debounce to finish
                    await checkUsername(data.username);
                  }
                  if (usernameStatus !== 'taken') goNext();
                }}
                disabled={data.username.trim().length < 3 || usernameStatus === 'taken'}
                className={btnPrimary}
              >
                {usernameStatus === 'checking' ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" /> Checking…
                  </span>
                ) : 'Next'}
              </button>
            </div>
          )}

          {/* ── STEP 6: Profile photo ── */}
          {step === 6 && (
            <div className="flex flex-col items-center h-full">
              <div className="mb-8 text-center w-full">
                <div className="w-10 h-10 rounded-xl bg-[#FF3B30]/15 flex items-center justify-center mb-5 mx-auto">
                  <Camera className="w-5 h-5 text-[#FF3B30]" />
                </div>
                <h1 className="text-2xl font-bold mb-1.5">Add a profile photo</h1>
                <p className="text-white/40 text-sm">So your friends know it's you.</p>
              </div>

              <button onClick={() => fileInputRef.current?.click()}
                className="relative w-32 h-32 rounded-full border-2 border-dashed border-[#27272a] hover:border-[#FF3B30] transition-colors overflow-hidden group">
                {data.profileImagePreview ? (
                  <img src={data.profileImagePreview} alt="Preview" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center bg-[#1C1C1E]">
                    <Camera className="w-8 h-8 text-white/20 mb-1" />
                    <span className="text-xs text-white/20">Add photo</span>
                  </div>
                )}
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <Camera className="w-7 h-7 text-white" />
                </div>
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImagePick} className="hidden" />

              {data.profileImagePreview && (
                <p className="flex items-center gap-1.5 text-xs text-green-400 mt-3">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Photo selected
                </p>
              )}

              <div className="flex-1" />
              <div className="w-full space-y-2">
                <button onClick={handleFinish} disabled={loading} className={btnPrimary}>
                  {loading
                    ? <span className="flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Creating account...</span>
                    : 'Add Photo & Continue'}
                </button>
                <button onClick={handleFinish} disabled={loading} className={btnGhost}>Skip for now</button>
              </div>
            </div>
          )}

          {/* ── STEP 7: Contacts sync ── */}
          {step === 7 && (
            <div className="flex flex-col h-full">
              <h1 className="text-2xl font-bold mb-6 leading-snug">
                Next, you can allow access to your contacts to make it easier to find your friends on NetoLynk
              </h1>
              <div className="space-y-5">
                <div className="flex gap-3 items-start">
                  <div className="w-8 h-8 rounded-full bg-[#1C1C1E] border border-[#27272a] flex items-center justify-center shrink-0 mt-0.5">
                    <ArrowRight className="w-3.5 h-3.5 text-white/40 rotate-45" />
                  </div>
                  <p className="text-white/50 text-sm leading-relaxed">
                    Your contacts will be periodically synced and stored securely on our servers so we can help recommend people and things relevant to you.
                  </p>
                </div>
                <div className="flex gap-3 items-start">
                  <div className="w-8 h-8 rounded-full bg-[#1C1C1E] border border-[#27272a] flex items-center justify-center shrink-0 mt-0.5">
                    <Shield className="w-3.5 h-3.5 text-white/40" />
                  </div>
                  <p className="text-white/50 text-sm">
                    You can turn off syncing at any time in Settings.{' '}
                    <span className="text-[#FF3B30]">Learn more.</span>
                  </p>
                </div>
              </div>
              <div className="flex-1" />
              <p className="text-white/25 text-xs text-center mb-3">
                By tapping Next, you can choose to sync your contacts or skip this step.
              </p>
              <button onClick={goNext} className={btnPrimary}>Next</button>
            </div>
          )}

          {/* ── STEP 8: Follow suggestions ── */}
          {step === 8 && (
            <div className="flex flex-col h-full">
              <div className="flex items-center justify-between mb-4 shrink-0">
                <h1 className="text-xl font-bold">Follow 5 or more people</h1>
                <button onClick={goNext} className="text-white/40 hover:text-white text-sm transition-colors">Skip</button>
              </div>
              <div className="relative mb-4 shrink-0">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                <input type="text" placeholder="Search"
                  className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-[#1C1C1E] border border-[#27272a] text-white placeholder:text-white/30 outline-none text-sm" />
              </div>
              <div className="flex-1 overflow-y-auto -mx-1 px-1">
                {SUGGESTED_ACCOUNTS.map(acc => (
                  <button key={acc.username}
                    onClick={() => setFollowSelected(s => {
                      const n = new Set(s);
                      n.has(acc.username) ? n.delete(acc.username) : n.add(acc.username);
                      return n;
                    })}
                    className="w-full flex items-center gap-3 px-2 py-2.5 hover:bg-[#1C1C1E] rounded-xl transition-colors">
                    <img src={acc.avatar} alt={acc.displayName} className="w-11 h-11 rounded-full bg-[#1C1C1E] shrink-0" />
                    <div className="flex-1 text-left min-w-0">
                      <p className="font-semibold text-sm truncate">{acc.displayName}</p>
                      <p className="text-white/35 text-xs">@{acc.username}</p>
                    </div>
                    <div className={`w-5 h-5 rounded border-2 shrink-0 flex items-center justify-center transition-colors ${
                      followSelected.has(acc.username) ? 'bg-[#FF3B30] border-[#FF3B30]' : 'border-[#27272a]'
                    }`}>
                      {followSelected.has(acc.username) && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
                    </div>
                  </button>
                ))}
              </div>
              <p className="text-white/25 text-xs text-center py-3 shrink-0">
                Following isn't required but is recommended for a personalized experience.
              </p>
              <button onClick={goNext} disabled={followSelected.size < 5} className={btnPrimary}>
                Follow {followSelected.size >= 5 ? `(${followSelected.size})` : `— select ${5 - followSelected.size} more`}
              </button>
            </div>
          )}

          {/* ── STEP 9: All Set ── */}
          {step === 9 && (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <motion.div
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 180, damping: 14 }}
                className="w-28 h-28 rounded-full overflow-hidden border-4 border-[#FF3B30] mb-6 shadow-[0_0_40px_rgba(255,59,48,0.3)]"
              >
                <img
                  src={data.profileImagePreview || `https://api.dicebear.com/7.x/avataaars/svg?seed=${data.username}`}
                  alt="Profile" className="w-full h-full object-cover"
                />
              </motion.div>

              <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
                <h1 className="text-3xl font-black tracking-tight mb-2">Welcome,<br />{data.name}</h1>
                <p className="text-white/40 text-sm mb-1">Your account is ready.</p>
                <p className="text-[#FF3B30] font-semibold text-sm">@{data.username}</p>
              </motion.div>

              <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45 }}
                className="mt-10 w-full">
                <div className="grid grid-cols-3 gap-3 mb-8">
                  {[
                    { label: 'Connect', sub: 'Find friends' },
                    { label: 'Share', sub: 'Post moments' },
                    { label: 'Explore', sub: 'Discover more' },
                  ].map(item => (
                    <div key={item.label} className="bg-[#1C1C1E] rounded-xl p-3 border border-[#27272a]">
                      <p className="font-bold text-sm">{item.label}</p>
                      <p className="text-white/30 text-xs mt-0.5">{item.sub}</p>
                    </div>
                  ))}
                </div>
                <button onClick={() => window.location.reload()}
                  className="w-full py-4 bg-[#FF3B30] hover:bg-[#e63429] text-white rounded-xl font-bold text-base transition-colors">
                  Start Exploring
                </button>
              </motion.div>
            </div>
          )}

        </motion.div>
      </AnimatePresence>
    </div>
  );
};
