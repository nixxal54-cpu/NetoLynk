import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Toaster } from 'sonner';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { AccountSwitcherProvider } from './context/AccountSwitcherContext';
import { AccountSwitcher } from './components/AccountSwitcher';
import { Sidebar, BottomNav, TopHeader } from './components/Layout/Navigation';
import { AuthForm } from './components/Auth/AuthForm';
import { Home } from './pages/Home';
import { Profile } from './pages/Profile';
import { Explore } from './pages/Explore';
import { Notifications } from './pages/Notifications';
import { Messages } from './pages/Messages';
import { CreatePostPage } from './pages/CreatePostPage';
import { EditProfilePage } from './pages/EditProfilePage';
import { PostDetails } from './pages/PostDetails';
import { Settings } from './pages/Settings';
import { Activity } from './pages/Activity';
import { SupportPage } from './pages/SupportPage';
import { ReviewsPage } from './pages/ReviewsPage';
import LynksPage from './pages/LynksPage';
import CreateLynkPage from './pages/CreateLynkPage';
import CreateBlinkPage from './components/Blinks/CreateBlinkPage';
import LynkHashtagPage from './pages/LynkHashtagPage';
import { Loader2 } from 'lucide-react';
import { usePushNotifications } from './hooks/usePushNotifications';

const AppContent: React.FC = () => {
  const { firebaseUser, loading } = useAuth();
  const location = useLocation();
  usePushNotifications();

  const isLynksPage = location.pathname.startsWith('/lynks');

  if (loading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <img src="/netolynk-logo.png" alt="NetoLynk" className="h-16 w-auto object-contain mx-auto mb-4" />
          <Loader2 className="w-10 h-10 animate-spin text-primary mx-auto" />
        </div>
      </div>
    );
  }

  if (!firebaseUser) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-background p-4">
        <AuthForm />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen w-full overflow-x-hidden bg-background text-foreground max-w-7xl mx-auto">
      <Sidebar />

      <main className={`flex-1 flex flex-col min-w-0 ${isLynksPage ? 'pt-0' : 'pt-14'} md:pt-0`}>
        {/* Mobile top header — hidden on Lynks page */}
        {!isLynksPage && <TopHeader />}

        <Routes>
          <Route path="/"                  element={<Home />} />
          <Route path="/explore"           element={<Explore />} />
          <Route path="/notifications"     element={<Notifications />} />
          <Route path="/messages"          element={<Messages />} />
          <Route path="/profile/:username" element={<Profile />} />
          <Route path="/post/:id"          element={<PostDetails />} />
          <Route path="/create"            element={<CreatePostPage />} />
          <Route path="/edit-profile"      element={<EditProfilePage />} />
          <Route path="/settings"          element={<Settings />} />
          <Route path="/activity"          element={<Activity />} />
          <Route path="/support"           element={<SupportPage />} />
          <Route path="/reviews"           element={<ReviewsPage />} />
          {/* ── Lynks routes ── */}
          <Route path="/lynks"             element={<LynksPage />} />
          <Route path="/lynks/:lynkId"     element={<LynksPage />} />
          <Route path="/lynks/tag/:tag"    element={<LynkHashtagPage />} />
          <Route path="/create-lynk"       element={<CreateLynkPage />} />
          <Route path="/create-blink"      element={<CreateBlinkPage />} />
          <Route path="*"                  element={<Navigate to="/" />} />
        </Routes>
      </main>

      {/* Desktop right panel */}
      <div className="hidden lg:block w-80 p-4 sticky top-0 h-screen overflow-y-auto border-l border-border flex-shrink-0">
        <div className="bg-accent/30 rounded-2xl p-4 mb-4">
          <h3 className="font-bold text-lg mb-2">What's happening</h3>
          <div className="space-y-4">
            <div className="group cursor-pointer">
              <p className="text-xs text-muted-foreground">Trending in Technology</p>
              <p className="font-bold">#NGAI</p>
              <p className="text-xs text-muted-foreground">12.5K posts</p>
            </div>
            <div className="group cursor-pointer">
              <p className="text-xs text-muted-foreground">Trending in Global</p>
              <p className="font-bold">#Netolynk</p>
              <p className="text-xs text-muted-foreground">8.2K posts</p>
            </div>
          </div>
        </div>
        <div className="bg-accent/30 rounded-2xl p-4">
          <h3 className="font-bold text-lg mb-2">Who to follow</h3>
          <p className="text-sm text-muted-foreground">Suggestions will appear here</p>
        </div>
      </div>

      <AccountSwitcher />
      <BottomNav />
    </div>
  );
};

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AccountSwitcherProvider>
          <Router>
            <AppContent />
            <Toaster position="top-center" richColors />
          </Router>
        </AccountSwitcherProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
