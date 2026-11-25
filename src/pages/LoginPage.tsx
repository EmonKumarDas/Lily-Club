import React, { useState } from 'react';
import { ShieldCheck, ArrowRight, UserCheck, Sparkles, Building2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext.js';
import { useToast } from '../components/Toast.js';
import { DateBadge } from '../components/DateBadge.js';
import { apiRequest } from '../lib/api.js';

export const LoginPage: React.FC = () => {
  const { language, setLanguage, t, refreshAuth } = useAuth();
  const { showError, showSuccess } = useToast();
  const [loading, setLoading] = useState(false);

  // Google OAuth Trigger
  const handleGoogleLogin = async () => {
    setLoading(true);
    try {
      const res = await apiRequest<{ url: string }>('/api/auth/google/url');
      if (res.url) {
        window.location.href = res.url;
      }
    } catch (err: any) {
      showError(err.message || 'Failed to initialize Google Sign-In');
      setLoading(false);
    }
  };

  // Developer Quick Test Login (Development only)
  const handleDevLogin = async (role: 'OWNER' | 'MANAGER' | 'STAFF' | 'VIEWER') => {
    setLoading(true);
    try {
      const devUsers = {
        OWNER: { email: 'owner@lilycc.local', name: 'Al-Amin Hossain (Owner)' },
        MANAGER: { email: 'manager@lilycc.local', name: 'Tanzina Begum (Manager)' },
        STAFF: { email: 'staff@lilycc.local', name: 'Rakib Hasan (Staff)' },
        VIEWER: { email: 'viewer@lilycc.local', name: 'Shamsul Alam (Viewer)' },
      };

      const selected = devUsers[role];
      const res = await apiRequest('/api/auth/dev-login', {
        method: 'POST',
        body: JSON.stringify({
          email: selected.email,
          name: selected.name,
          googleId: `dev-${role.toLowerCase()}-123`,
        }),
      });

      if (res.success) {
        showSuccess(`Logged in as ${selected.name}`);
        await refreshAuth();
      }
    } catch (err: any) {
      showError(err.message || 'Dev login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 sm:p-6 bg-gradient-to-br from-[#FDFBF9] via-[#FAF4F0] to-[#F5ECE8] dark:from-[#151216] dark:via-[#19151A] dark:to-[#1E1920] transition-colors">
      {/* Top Bar Floating Controls */}
      <div className="fixed top-4 right-4 sm:top-6 sm:right-6 flex items-center gap-2">
        <DateBadge showTime={false} className="hidden sm:inline-flex" />
        <button
          onClick={() => setLanguage(language === 'bn' ? 'en' : 'bn')}
          className="px-3 py-1.5 rounded-xl bg-white/80 dark:bg-stone-800/80 backdrop-blur-md border border-stone-200 dark:border-stone-700 text-xs font-bold text-stone-800 dark:text-stone-200 shadow-xs hover:bg-stone-100 transition-colors"
        >
          {language === 'bn' ? 'EN' : 'বাং'}
        </button>
      </div>

      <div className="max-w-md w-full bg-white dark:bg-[#1E1920] border border-stone-200/90 dark:border-stone-800 rounded-3xl shadow-2xl p-6 sm:p-8 space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-3">
          <div className="inline-flex w-28 h-28 rounded-3xl bg-white border border-[#0E8A44]/20 items-center justify-center shadow-lg shadow-[#0E8A44]/10 mx-auto p-2 overflow-hidden">
            <img src="/logo.png" alt="Lily Community Center" className="w-full h-full object-contain" />
          </div>

          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-stone-900 dark:text-stone-100 tracking-tight">
              {t('appName')}
            </h1>
            <p className="text-xs font-medium text-[#582C4D] dark:text-[#C5A059] mt-0.5">
              {t('appTagline')}
            </p>
          </div>

          <p className="text-xs sm:text-sm text-stone-600 dark:text-stone-400 leading-relaxed max-w-sm mx-auto">
            {t('loginWelcomeSubtitle')}
          </p>
        </div>

        {/* Date Display */}
        <div className="flex justify-center">
          <DateBadge />
        </div>

        {/* Google Sign-In Action */}
        <div className="pt-2">
          <button
            onClick={handleGoogleLogin}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 py-3.5 px-4 rounded-2xl bg-[#582C4D] hover:bg-[#6C375F] text-white text-sm font-semibold shadow-lg shadow-[#582C4D]/25 transition-all transform active:scale-98 disabled:opacity-60 cursor-pointer"
          >
            {/* Google G icon */}
            <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
              <path
                fill="#EA4335"
                d="M12 5c1.5 0 2.8.5 3.9 1.5l2.9-2.9C17 1.9 14.7 1 12 1 7.5 1 3.7 3.6 1.9 7.3l3.6 2.8C6.4 7.2 8.9 5 12 5z"
              />
              <path
                fill="#4285F4"
                d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5 3.7-8.8z"
              />
              <path
                fill="#FBBC05"
                d="M5.5 14.9c-.3-.8-.4-1.8-.4-2.9s.1-2.1.4-2.9L1.9 6.3C.7 8.7 0 10.3 0 12s.7 3.3 1.9 5.7l3.6-2.8z"
              />
              <path
                fill="#34A853"
                d="M12 23c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3.1 0-5.6-2.2-6.5-5.1L1.9 16C3.7 19.7 7.5 23 12 23z"
              />
            </svg>
            <span>{t('continueWithGoogle')}</span>
            <ArrowRight className="w-4 h-4 ml-1" />
          </button>

          <div className="flex items-center justify-center gap-1.5 mt-4 text-[11px] text-stone-500 dark:text-stone-400 text-center">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span>{t('loginNotice')}</span>
          </div>
        </div>

        {/* Development Helper Switcher */}
        <div className="border-t border-stone-200 dark:border-stone-800 pt-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-bold text-stone-700 dark:text-stone-300">
              <Sparkles className="w-3.5 h-3.5 text-[#C5A059]" />
              <span>{t('devQuickLoginTitle')}</span>
            </div>
            <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
              Local Dev Only
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <button
              onClick={() => handleDevLogin('OWNER')}
              className="p-2.5 text-left rounded-xl bg-stone-50 dark:bg-stone-800/80 hover:bg-[#582C4D]/10 hover:text-[#582C4D] dark:hover:text-[#C5A059] border border-stone-200 dark:border-stone-700 font-semibold transition-all"
            >
              👑 {t('signInAsOwner')}
            </button>
            <button
              onClick={() => handleDevLogin('MANAGER')}
              className="p-2.5 text-left rounded-xl bg-stone-50 dark:bg-stone-800/80 hover:bg-[#582C4D]/10 hover:text-[#582C4D] dark:hover:text-[#C5A059] border border-stone-200 dark:border-stone-700 font-semibold transition-all"
            >
              💼 {t('signInAsManager')}
            </button>
            <button
              onClick={() => handleDevLogin('STAFF')}
              className="p-2.5 text-left rounded-xl bg-stone-50 dark:bg-stone-800/80 hover:bg-[#582C4D]/10 hover:text-[#582C4D] dark:hover:text-[#C5A059] border border-stone-200 dark:border-stone-700 font-semibold transition-all"
            >
              📝 {t('signInAsStaff')}
            </button>
            <button
              onClick={() => handleDevLogin('VIEWER')}
              className="p-2.5 text-left rounded-xl bg-stone-50 dark:bg-stone-800/80 hover:bg-[#582C4D]/10 hover:text-[#582C4D] dark:hover:text-[#C5A059] border border-stone-200 dark:border-stone-700 font-semibold transition-all"
            >
              👁️ {t('signInAsViewer')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
