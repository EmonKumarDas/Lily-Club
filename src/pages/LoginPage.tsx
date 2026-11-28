import React, { useState } from 'react';
import { ShieldCheck, ArrowRight, Sun, Moon, Globe, FileText, Lock } from 'lucide-react';
import { useAuth } from '../context/AuthContext.js';
import { useTheme } from '../context/ThemeContext.js';
import { useToast } from '../components/Toast.js';
import { DateBadge } from '../components/DateBadge.js';
import { ActionButton } from '../components/ActionButton.js';
import { PrivacyPolicyModal } from '../components/PrivacyAndAccountModal.js';
import { apiRequest } from '../lib/api.js';

export const LoginPage: React.FC = () => {
  const { language, setLanguage, t } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { showError } = useToast();
  const [privacyOpen, setPrivacyOpen] = useState(false);

  // Strict Google-only sign-in (proves identity only; never grants role or data access)
  const handleGoogleLogin = async () => {
    try {
      const res = await apiRequest<{ url: string }>('/api/auth/google/url');
      if (res.url) {
        window.location.href = res.url;
      }
    } catch (err: any) {
      showError(
        language === 'bn'
          ? err.messageBn || 'Google সাইন-ইন শুরু করা যায়নি। পুনরায় চেষ্টা করুন।'
          : err.messageEn || err.message || 'Failed to start Google Sign-In.'
      );
    }
  };

  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center p-4 sm:p-6 overflow-hidden bg-gradient-to-br from-[#FDFBF9] via-[#FAF4F0] to-[#F4EAE4] dark:from-[#120F14] dark:via-[#171319] dark:to-[#1E1821] transition-colors">
      {/* Decorative ambient glows */}
      <div aria-hidden="true" className="pointer-events-none absolute -top-32 -left-32 w-96 h-96 rounded-full bg-[#4A2545]/15 dark:bg-[#4A2545]/30 blur-3xl" />
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-40 -right-24 w-[28rem] h-[28rem] rounded-full bg-[#C5A059]/20 dark:bg-[#C5A059]/15 blur-3xl" />

      {/* Top Bar Controls: Language & Dark/Light Mode */}
      <div className="fixed top-4 right-4 sm:top-6 sm:right-6 flex items-center gap-2 z-20">
        <DateBadge showTime={false} className="hidden sm:inline-flex" />
        <button
          type="button"
          onClick={() => setLanguage(language === 'bn' ? 'en' : 'bn')}
          aria-label={language === 'bn' ? 'Switch to English' : 'বাংলা ভাষায় পরিবর্তন করুন'}
          className="inline-flex items-center gap-1.5 min-h-[44px] px-3.5 py-2 rounded-2xl bg-white/80 dark:bg-[#1D1820]/80 backdrop-blur-md border border-stone-200/80 dark:border-stone-700/80 text-xs font-bold text-stone-800 dark:text-stone-200 shadow-sm hover:-translate-y-0.5 hover:shadow-md transition-all cursor-pointer"
        >
          <Globe className="w-3.5 h-3.5 text-[#4A2545] dark:text-[#C5A059]" />
          <span>{language === 'bn' ? 'EN' : 'বাং'}</span>
        </button>
        <button
          type="button"
          onClick={toggleTheme}
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          className="inline-flex items-center justify-center min-w-[44px] min-h-[44px] rounded-2xl bg-white/80 dark:bg-[#1D1820]/80 backdrop-blur-md border border-stone-200/80 dark:border-stone-700/80 text-stone-700 dark:text-stone-200 shadow-sm hover:-translate-y-0.5 hover:shadow-md transition-all cursor-pointer"
        >
          {theme === 'dark' ? (
            <Sun className="w-4 h-4 text-[#C5A059]" />
          ) : (
            <Moon className="w-4 h-4 text-[#4A2545]" />
          )}
        </button>
      </div>

      {/* Main Lily Brand Login Card */}
      <main className="relative z-10 max-w-md w-full overflow-hidden bg-white/90 dark:bg-[#1D1820]/90 backdrop-blur-xl border border-white/70 dark:border-stone-800/80 rounded-[2rem] shadow-[0_25px_60px_-15px_rgba(74,37,69,0.25)] dark:shadow-[0_25px_60px_-15px_rgba(0,0,0,0.6)] p-6 sm:p-10 space-y-7">
        {/* Accent gradient bar */}
        <div aria-hidden="true" className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-[#4A2545] via-[#C5A059] to-[#4A2545]" />

        <div className="text-center space-y-4">
          <div className="relative inline-flex mx-auto">
            <div aria-hidden="true" className="absolute inset-0 rounded-3xl bg-[#C5A059]/30 blur-xl" />
            <div className="relative inline-flex w-28 h-28 rounded-3xl bg-gradient-to-b from-white to-[#FDFBF9] dark:from-stone-900 dark:to-stone-950 border border-[#4A2545]/15 dark:border-[#C5A059]/25 items-center justify-center shadow-lg p-3 overflow-hidden">
              <img
                src="/logo.png"
                alt="Lily Community Center"
                className="w-full h-full object-contain"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-stone-900 dark:text-stone-100 tracking-tight leading-snug">
              {t('appName')}
            </h1>
            <p className="inline-block px-3 py-1 rounded-full bg-[#4A2545]/8 dark:bg-[#C5A059]/10 text-xs sm:text-sm font-semibold text-[#4A2545] dark:text-[#C5A059]">
              {t('appTagline')}
            </p>
          </div>

          <p className="text-xs sm:text-sm text-stone-600 dark:text-stone-400 leading-relaxed max-w-sm mx-auto">
            {t('loginWelcomeSubtitle')}
          </p>
        </div>

        {/* Dual Calendar Today Badge */}
        <div className="flex justify-center">
          <DateBadge />
        </div>

        {/* Single Google Sign-In Action (Protected by ActionButton Double-Click Guard) */}
        <div className="pt-1 space-y-4">
          <ActionButton
            variant="primary"
            onClick={handleGoogleLogin}
            loadingLabel={language === 'bn' ? 'Google-এ সংযোগ হচ্ছে...' : 'Connecting to Google...'}
            className="w-full py-3.5 rounded-2xl text-sm shadow-lg shadow-[#4A2545]/25 hover:-translate-y-0.5 hover:shadow-xl transition-all"
            icon={
              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-white shadow-sm">
                <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
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
              </span>
            }
          >
            <span className="inline-flex items-center gap-2">
              <span>{t('continueWithGoogle')}</span>
              <ArrowRight className="w-4 h-4" />
            </span>
          </ActionButton>

          <div className="flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-[#0E8A44]/8 dark:bg-[#0E8A44]/15 text-[11px] text-stone-600 dark:text-stone-300 text-center">
            <ShieldCheck className="w-3.5 h-3.5 text-[#0E8A44] shrink-0" />
            <span>{t('loginNotice')}</span>
          </div>

          <div className="flex items-center justify-center gap-1.5 text-[10px] uppercase tracking-widest font-semibold text-stone-400 dark:text-stone-500">
            <Lock className="w-3 h-3" />
            <span>{language === 'bn' ? 'নিরাপদ সাইন-ইন' : 'Secure sign-in'}</span>
          </div>
        </div>

        {/* Footer Privacy Policy Link */}
        <div className="pt-3 border-t border-stone-100 dark:border-stone-800 flex items-center justify-center">
          <button
            type="button"
            onClick={() => setPrivacyOpen(true)}
            className="inline-flex items-center gap-1.5 min-h-[36px] px-3 py-1.5 rounded-xl text-xs font-semibold text-stone-500 hover:text-[#4A2545] hover:bg-[#4A2545]/5 dark:text-stone-400 dark:hover:text-[#C5A059] dark:hover:bg-[#C5A059]/10 transition-colors cursor-pointer"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>{language === 'bn' ? 'গোপনীয়তা নীতি (Privacy Policy)' : 'Privacy Policy'}</span>
          </button>
        </div>
      </main>

      <PrivacyPolicyModal
        isOpen={privacyOpen}
        onClose={() => setPrivacyOpen(false)}
        language={language}
      />
    </div>
  );
};
