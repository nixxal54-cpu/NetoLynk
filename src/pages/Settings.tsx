import { usePageTitle } from '../hooks/usePageTitle';
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronLeft, Bell, Lock, Shield, Moon, Globe, HelpCircle, LogOut, ExternalLink } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { auth } from '../lib/firebase';
import { sendPasswordResetEmail } from 'firebase/auth';
import { toast } from 'sonner';

export const Settings: React.FC = () => {
  usePageTitle('Settings');
  const navigate = useNavigate();
  const { user } = useAuth();
  const [activeView, setActiveView] = useState<string | null>(null);

  const handleLogout = async () => {
    try {
      await auth.signOut();
      navigate('/login');
    } catch (error) {
      console.error("Error signing out:", error);
    }
  };

  const handlePasswordReset = async () => {
    if (!auth.currentUser?.email) return;
    try {
      await sendPasswordResetEmail(auth, auth.currentUser.email);
      toast.success('Password reset email sent — check your inbox');
    } catch {
      toast.error('Failed to send reset email');
    }
  };

  const handleOptionClick = (label: string) => {
    if (label === 'Notifications') {
      navigate('/notifications');
    } else {
      setActiveView(label);
    }
  };

  const settingsOptions = [
    { icon: Bell, label: 'Notifications', description: 'Manage your alerts' },
    { icon: Lock, label: 'Privacy', description: 'Control who sees your content' },
    { icon: Shield, label: 'Security', description: 'Password and authentication' },
    { icon: Moon, label: 'Display', description: 'Theme and appearance' },
    { icon: Globe, label: 'Language', description: 'App language preferences' },
    { icon: HelpCircle, label: 'Help & Support', description: 'Get assistance' },
  ];

  const renderSubView = () => {
    switch (activeView) {
      case 'Privacy':
        return (
          <div className="p-4 space-y-4">
            <h3 className="font-bold text-lg mb-4">Privacy Settings</h3>
            <div className="flex items-center justify-between p-4 bg-accent/20 rounded-2xl">
              <div>
                <p className="font-medium">Private Account</p>
                <p className="text-sm text-muted-foreground">Only approved followers can see your posts.</p>
              </div>
              <input type="checkbox" className="toggle toggle-primary" />
            </div>
            <div className="flex items-center justify-between p-4 bg-accent/20 rounded-2xl">
              <div>
                <p className="font-medium">Activity Status</p>
                <p className="text-sm text-muted-foreground">Show when you are active.</p>
              </div>
              <input type="checkbox" className="toggle toggle-primary" defaultChecked />
            </div>
          </div>
        );
      case 'Security':
        return (
          <div className="p-4 space-y-4">
            <h3 className="font-bold text-lg mb-4">Security</h3>
            <button
              onClick={handlePasswordReset}
              className="w-full p-4 bg-accent/20 rounded-2xl text-left hover:bg-accent/40 transition-colors"
            >
              <p className="font-medium">Change Password</p>
              <p className="text-sm text-muted-foreground">Send a reset link to {auth.currentUser?.email}</p>
            </button>
            <div className="w-full p-4 bg-accent/20 rounded-2xl text-left opacity-60 cursor-not-allowed select-none">
              <div className="flex items-center justify-between">
                <p className="font-medium">Two-Factor Authentication</p>
                <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">Coming soon</span>
              </div>
              <p className="text-sm text-muted-foreground mt-1">Add an extra layer of security.</p>
            </div>
          </div>
        );
      case 'Display':
        return (
          <div className="p-4 space-y-4">
            <h3 className="font-bold text-lg mb-4">Display & Theme</h3>
            <div className="grid grid-cols-2 gap-4">
              <button className="p-4 border-2 border-primary rounded-2xl bg-background text-center">
                <div className="w-8 h-8 rounded-full bg-background border border-border mx-auto mb-2" />
                <p className="font-medium">Dark Mode</p>
                <p className="text-xs text-muted-foreground">Active</p>
              </button>
              <div className="p-4 border-2 border-transparent bg-accent/20 rounded-2xl text-center opacity-50 cursor-not-allowed select-none">
                <div className="w-8 h-8 rounded-full bg-white border border-border mx-auto mb-2" />
                <p className="font-medium">Light Mode</p>
                <p className="text-xs text-muted-foreground">Coming soon</p>
              </div>
            </div>
          </div>
        );
      case 'Language':
        return (
          <div className="p-4 space-y-4">
            <h3 className="font-bold text-lg mb-4">Language Preferences</h3>
            <div className="w-full p-4 bg-accent/20 rounded-2xl flex justify-between items-center">
              <span className="font-medium">English (US)</span>
              <div className="w-3 h-3 rounded-full bg-primary" />
            </div>
            <p className="text-sm text-muted-foreground px-1">Additional languages coming soon.</p>
          </div>
        );
      case 'Help & Support':
        return (
          <div className="p-4 space-y-4">
            <h3 className="font-bold text-lg mb-4">Help & Support</h3>
            <a
              href="mailto:support@netolynk.app"
              className="w-full p-4 bg-accent/20 rounded-2xl text-left hover:bg-accent/40 transition-colors flex items-center justify-between"
            >
              <div>
                <p className="font-medium">Contact Us</p>
                <p className="text-sm text-muted-foreground">support@netolynk.app</p>
              </div>
              <ExternalLink className="w-4 h-4 text-muted-foreground" />
            </a>
            <button
              onClick={() => { toast.info('Problem reported — thank you!'); }}
              className="w-full p-4 bg-accent/20 rounded-2xl text-left hover:bg-accent/40 transition-colors"
            >
              <p className="font-medium">Report a Problem</p>
              <p className="text-sm text-muted-foreground">Let us know if something is broken.</p>
            </button>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="flex-1 max-w-2xl border-x border-border min-h-screen bg-background pb-40 overflow-y-auto"
    >
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-md border-b border-border p-4 flex items-center gap-4">
        <button 
          onClick={() => activeView ? setActiveView(null) : navigate(-1)} 
          className="p-2 hover:bg-accent rounded-full transition-colors"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
        <h2 className="text-xl font-bold">{activeView || 'Settings'}</h2>
      </header>

      <AnimatePresence mode="wait">
        {activeView ? (
          <motion.div
            key="subview"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
          >
            {renderSubView()}
          </motion.div>
        ) : (
          <motion.div
            key="main"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="p-4"
          >
            <div className="mb-6 p-4 bg-accent/20 rounded-2xl flex items-center gap-4 border border-border/50">
              <img 
                src={user?.profileImage || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user?.username}`} 
                alt="Profile" 
                className="w-16 h-16 rounded-full object-cover border-2 border-primary"
                loading="lazy"
              />
              <div>
                <h3 className="font-bold text-lg">{user?.displayName}</h3>
                <p className="text-muted-foreground">@{user?.username}</p>
              </div>
            </div>

            <div className="space-y-2">
              {settingsOptions.map((option, index) => (
                <button 
                  key={index}
                  onClick={() => handleOptionClick(option.label)}
                  className="w-full flex items-center gap-4 p-4 hover:bg-accent/50 rounded-2xl transition-colors text-left border border-transparent hover:border-border/50"
                >
                  <div className="p-3 bg-accent/50 rounded-full text-primary">
                    <option.icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-medium">{option.label}</h4>
                    <p className="text-sm text-muted-foreground">{option.description}</p>
                  </div>
                </button>
              ))}

              <button 
                onClick={handleLogout}
                className="w-full flex items-center gap-4 p-4 hover:bg-destructive/10 rounded-2xl transition-colors text-left mt-8 text-destructive border border-transparent hover:border-destructive/20"
              >
                <div className="p-3 bg-destructive/10 rounded-full">
                  <LogOut className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <h4 className="font-medium">Log Out</h4>
                  <p className="text-sm opacity-80">Sign out of your account</p>
                </div>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export const Settings: React.FC = () => {
  usePageTitle('Settings');
  const navigate = useNavigate();
  const { user } = useAuth();
  const [activeView, setActiveView] = useState<string | null>(null);

  const handleLogout = async () => {
    try {
      await auth.signOut();
      navigate('/login');
    } catch (error) {
      console.error("Error signing out:", error);
    }
  };

  const handleOptionClick = (label: string) => {
    if (label === 'Notifications') {
      navigate('/notifications');
    } else {
      setActiveView(label);
    }
  };

  const settingsOptions = [
    { icon: Bell, label: 'Notifications', description: 'Manage your alerts' },
    { icon: Lock, label: 'Privacy', description: 'Control who sees your content' },
    { icon: Shield, label: 'Security', description: 'Password and authentication' },
    { icon: Moon, label: 'Display', description: 'Theme and appearance' },
    { icon: Globe, label: 'Language', description: 'App language preferences' },
    { icon: HelpCircle, label: 'Help & Support', description: 'Get assistance' },
  ];

  const renderSubView = () => {
    switch (activeView) {
      case 'Privacy':
        return (
          <div className="p-4 space-y-4">
            <h3 className="font-bold text-lg mb-4">Privacy Settings</h3>
            <div className="flex items-center justify-between p-4 bg-accent/20 rounded-2xl">
              <div>
                <p className="font-medium">Private Account</p>
                <p className="text-sm text-muted-foreground">Only approved followers can see your posts.</p>
              </div>
              <input type="checkbox" className="toggle toggle-primary" />
            </div>
            <div className="flex items-center justify-between p-4 bg-accent/20 rounded-2xl">
              <div>
                <p className="font-medium">Activity Status</p>
                <p className="text-sm text-muted-foreground">Show when you are active.</p>
              </div>
              <input type="checkbox" className="toggle toggle-primary" defaultChecked />
            </div>
          </div>
        );
      case 'Security':
        return (
          <div className="p-4 space-y-4">
            <h3 className="font-bold text-lg mb-4">Security</h3>
            <button className="w-full p-4 bg-accent/20 rounded-2xl text-left hover:bg-accent/40 transition-colors">
              <p className="font-medium">Change Password</p>
              <p className="text-sm text-muted-foreground">Update your account password.</p>
            </button>
            <button className="w-full p-4 bg-accent/20 rounded-2xl text-left hover:bg-accent/40 transition-colors">
              <p className="font-medium">Two-Factor Authentication</p>
              <p className="text-sm text-muted-foreground">Add an extra layer of security.</p>
            </button>
          </div>
        );
      case 'Display':
        return (
          <div className="p-4 space-y-4">
            <h3 className="font-bold text-lg mb-4">Display & Theme</h3>
            <div className="grid grid-cols-2 gap-4">
              <button className="p-4 border-2 border-primary rounded-2xl bg-background text-center">
                <div className="w-8 h-8 rounded-full bg-background border border-border mx-auto mb-2" />
                <p className="font-medium">Dark Mode</p>
                <p className="text-xs text-muted-foreground">Obsidian-Crimson</p>
              </button>
              <button className="p-4 border-2 border-transparent bg-accent/20 rounded-2xl text-center opacity-50 cursor-not-allowed">
                <div className="w-8 h-8 rounded-full bg-white border border-border mx-auto mb-2" />
                <p className="font-medium">Light Mode</p>
                <p className="text-xs text-muted-foreground">Coming soon</p>
              </button>
            </div>
          </div>
        );
      case 'Language':
        return (
          <div className="p-4 space-y-4">
            <h3 className="font-bold text-lg mb-4">Language Preferences</h3>
            {['English (US)', 'Spanish', 'French', 'German', 'Japanese'].map((lang) => (
              <button key={lang} className="w-full p-4 bg-accent/20 rounded-2xl text-left hover:bg-accent/40 transition-colors flex justify-between items-center">
                <span className="font-medium">{lang}</span>
                {lang === 'English (US)' && <div className="w-3 h-3 rounded-full bg-primary" />}
              </button>
            ))}
          </div>
        );
      case 'Help & Support':
        return (
          <div className="p-4 space-y-4">
            <h3 className="font-bold text-lg mb-4">Help & Support</h3>
            <button className="w-full p-4 bg-accent/20 rounded-2xl text-left hover:bg-accent/40 transition-colors">
              <p className="font-medium">Help Center</p>
              <p className="text-sm text-muted-foreground">Read FAQs and guides.</p>
            </button>
            <button className="w-full p-4 bg-accent/20 rounded-2xl text-left hover:bg-accent/40 transition-colors">
              <p className="font-medium">Contact Us</p>
              <p className="text-sm text-muted-foreground">Get in touch with our team.</p>
            </button>
            <button className="w-full p-4 bg-accent/20 rounded-2xl text-left hover:bg-accent/40 transition-colors">
              <p className="font-medium">Report a Problem</p>
              <p className="text-sm text-muted-foreground">Let us know if something is broken.</p>
            </button>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="flex-1 max-w-2xl border-x border-border min-h-screen bg-background pb-40 overflow-y-auto"
    >
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-md border-b border-border p-4 flex items-center gap-4">
        <button 
          onClick={() => activeView ? setActiveView(null) : navigate(-1)} 
          className="p-2 hover:bg-accent rounded-full transition-colors"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
        <h2 className="text-xl font-bold">{activeView || 'Settings'}</h2>
      </header>

      <AnimatePresence mode="wait">
        {activeView ? (
          <motion.div
            key="subview"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
          >
            {renderSubView()}
          </motion.div>
        ) : (
          <motion.div
            key="main"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="p-4"
          >
            <div className="mb-6 p-4 bg-accent/20 rounded-2xl flex items-center gap-4 border border-border/50">
              <img 
                src={user?.profileImage || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user?.username}`} 
                alt="Profile" 
                className="w-16 h-16 rounded-full object-cover border-2 border-primary"
              />
              <div>
                <h3 className="font-bold text-lg">{user?.displayName}</h3>
                <p className="text-muted-foreground">@{user?.username}</p>
              </div>
            </div>

            <div className="space-y-2">
              {settingsOptions.map((option, index) => (
                <button 
                  key={index}
                  onClick={() => handleOptionClick(option.label)}
                  className="w-full flex items-center gap-4 p-4 hover:bg-accent/50 rounded-2xl transition-colors text-left border border-transparent hover:border-border/50"
                >
                  <div className="p-3 bg-accent/50 rounded-full text-primary">
                    <option.icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-medium">{option.label}</h4>
                    <p className="text-sm text-muted-foreground">{option.description}</p>
                  </div>
                </button>
              ))}

              <button 
                onClick={handleLogout}
                className="w-full flex items-center gap-4 p-4 hover:bg-destructive/10 rounded-2xl transition-colors text-left mt-8 text-destructive border border-transparent hover:border-destructive/20"
              >
                <div className="p-3 bg-destructive/10 rounded-full">
                  <LogOut className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <h4 className="font-medium">Log Out</h4>
                  <p className="text-sm opacity-80">Sign out of your account</p>
                </div>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
