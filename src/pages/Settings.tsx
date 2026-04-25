import { usePageTitle } from '../hooks/usePageTitle';
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronLeft, Bell, Lock, Shield, Moon, Globe, HelpCircle, LogOut, Star } from 'lucide-react';
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
      console.error('Error signing out:', error);
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
    } else if (label === 'Help & Support') {
      navigate('/support');
    } else if (label === 'NetoLynk Reviews') {
      navigate('/reviews');
    } else {
      setActiveView(label);
    }
  };

  const settingsOptions = [
    { icon: Bell,        label: 'Notifications',    description: 'Manage your alerts' },
    { icon: Lock,        label: 'Privacy',           description: 'Control who sees your content' },
    { icon: Shield,      label: 'Security',          description: 'Password and authentication' },
    { icon: Moon,        label: 'Display',           description: 'Theme and appearance' },
    { icon: Globe,       label: 'Language',          description: 'App language preferences' },
    { icon: HelpCircle,  label: 'Help & Support',    description: 'Report bugs · request features · send feedback' },
    { icon: Star,        label: 'NetoLynk Reviews',  description: 'See what users are saying about NetoLynk' },
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
              <p className="text-sm text-muted-foreground">Send reset link to email</p>
            </button>
          </div>
        );
      case 'Display':
        return (
          <div className="p-4 space-y-4">
            <h3 className="font-bold text-lg mb-4">Display</h3>
            <p className="text-muted-foreground">Appearance settings here.</p>
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
          <motion.div key="subview"
            initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
            {renderSubView()}
          </motion.div>
        ) : (
          <motion.div key="main"
            initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="p-4">
            <div className="space-y-2">
              {settingsOptions.map((option, index) => (
                <button
                  key={index}
                  onClick={() => handleOptionClick(option.label)}
                  className="w-full flex items-center gap-4 p-4 hover:bg-accent/50 rounded-2xl text-left transition-colors"
                >
                  <option.icon className="w-5 h-5 text-primary shrink-0" />
                  <div>
                    <h4 className="font-medium">{option.label}</h4>
                    <p className="text-sm text-muted-foreground">{option.description}</p>
                  </div>
                  <ChevronLeft className="w-4 h-4 text-muted-foreground/50 ml-auto rotate-180" />
                </button>
              ))}

              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-4 p-4 hover:bg-destructive/10 rounded-2xl text-left mt-8 text-destructive transition-colors"
              >
                <LogOut className="w-5 h-5" />
                <h4 className="font-medium">Log Out</h4>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
