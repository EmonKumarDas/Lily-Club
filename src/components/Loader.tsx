import React, { useState, useEffect, useRef } from 'react';
import { AlertTriangle, WifiOff, RefreshCw } from 'lucide-react';
import { toBanglaDigits } from '../lib/dateUtils.js';

export interface DelayedLoaderOptions {
  delayMs?: number;
  minVisibleMs?: number;
  timeoutMs?: number;
}

/**
 * Reusable anti-flicker & timeout hook (Section 3):
 * - Delays showing spinner for ~150ms so cached/instant reads never flash
 * - Keeps spinner visible for at least ~400ms once shown
 * - Transitions to timedOut after ~15s so no spinner runs forever
 * - Tracks online/offline status live
 */
export function useDelayedLoader(
  isLoading: boolean,
  options: DelayedLoaderOptions = {}
): {
  showSpinner: boolean;
  timedOut: boolean;
  isOffline: boolean;
  resetTimeout: () => void;
} {
  const { delayMs = 150, minVisibleMs = 400, timeoutMs = 15000 } = options;

  const [showSpinner, setShowSpinner] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [isOffline, setIsOffline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine === false : false
  );
  const shownAtRef = useRef<number | null>(null);
  const [retryTick, setRetryTick] = useState(0);

  useEffect(() => {
    const onOnline = () => setIsOffline(false);
    const onOffline = () => setIsOffline(true);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  useEffect(() => {
    let delayTimer: ReturnType<typeof setTimeout> | null = null;
    let hideTimer: ReturnType<typeof setTimeout> | null = null;
    let maxTimer: ReturnType<typeof setTimeout> | null = null;

    if (isLoading) {
      setTimedOut(false);
      delayTimer = setTimeout(() => {
        shownAtRef.current = Date.now();
        setShowSpinner(true);
      }, delayMs);

      maxTimer = setTimeout(() => {
        setTimedOut(true);
      }, timeoutMs);
    } else {
      setTimedOut(false);
      if (shownAtRef.current !== null) {
        const elapsed = Date.now() - shownAtRef.current;
        const remaining = Math.max(0, minVisibleMs - elapsed);
        if (remaining > 0) {
          hideTimer = setTimeout(() => {
            shownAtRef.current = null;
            setShowSpinner(false);
          }, remaining);
        } else {
          shownAtRef.current = null;
          setShowSpinner(false);
        }
      } else {
        setShowSpinner(false);
      }
    }

    return () => {
      if (delayTimer) clearTimeout(delayTimer);
      if (hideTimer) clearTimeout(hideTimer);
      if (maxTimer) clearTimeout(maxTimer);
    };
  }, [isLoading, delayMs, minVisibleMs, timeoutMs, retryTick]);

  const resetTimeout = () => {
    setTimedOut(false);
    setRetryTick((n) => n + 1);
  };

  return { showSpinner, timedOut, isOffline, resetTimeout };
}

export const ButtonSpinner: React.FC<{ className?: string; label?: string }> = ({
  className = 'w-4 h-4',
  label = 'Loading',
}) => (
  <span role="status" aria-live="polite" className="inline-flex items-center justify-center shrink-0">
    <svg
      className={`animate-spin ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="3"
      />
      <path
        className="opacity-90"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V1C5.925 1 1 5.925 1 12h3z"
      />
    </svg>
    <span className="sr-only">{label}</span>
  </span>
);

export const FullScreenLoader: React.FC<{
  language?: 'bn' | 'en';
  messageBn?: string;
  messageEn?: string;
  onRetry?: () => void;
}> = ({
  language = 'bn',
  messageBn = 'যাচাই ও লোড হচ্ছে...',
  messageEn = 'Verifying session & loading...',
  onRetry,
}) => {
  const { timedOut, isOffline, resetTimeout } = useDelayedLoader(true, {
    delayMs: 0, // Auth check at app open shows immediately with zero flash of unauth UI
    minVisibleMs: 400,
    timeoutMs: 15000,
  });

  return (
    <div
      role="status"
      aria-busy={!timedOut}
      aria-live="polite"
      className="min-h-screen flex flex-col items-center justify-center p-6 bg-[#FDFBF9] dark:bg-[#141115] text-stone-900 dark:text-stone-100 transition-colors"
    >
      <div className="max-w-sm w-full p-8 rounded-3xl bg-white dark:bg-[#1D1820] border border-stone-200/90 dark:border-stone-800 shadow-xl text-center space-y-5">
        <div className="w-20 h-20 mx-auto rounded-2xl bg-[#FAF4F0] dark:bg-stone-900 border border-[#4A2545]/15 dark:border-[#C5A059]/25 p-2.5 flex items-center justify-center shadow-sm">
          <img src="/logo.png" alt="Lily Community Center" className="w-full h-full object-contain" />
        </div>

        {timedOut || isOffline ? (
          <div className="space-y-3">
            <div className="w-11 h-11 mx-auto rounded-full bg-rose-100 dark:bg-rose-950/60 flex items-center justify-center text-rose-600 dark:text-rose-400">
              {isOffline ? <WifiOff className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
            </div>
            <p className="text-sm font-bold text-stone-900 dark:text-stone-100">
              {isOffline
                ? language === 'bn'
                  ? 'আপনি অফলাইনে আছেন। ইন্টারনেট সংযোগ পরীক্ষা করুন।'
                  : 'You appear to be offline. Check your internet connection.'
                : language === 'bn'
                ? `লোড হতে ${toBanglaDigits(15)} সেকেন্ডের বেশি সময় লাগছে।`
                : 'Taking longer than 15 seconds to respond.'}
            </p>
            <button
              type="button"
              onClick={() => {
                resetTimeout();
                if (onRetry) onRetry();
                else window.location.reload();
              }}
              className="inline-flex items-center justify-center gap-2 min-h-[44px] px-5 py-2.5 rounded-xl bg-[#4A2545] hover:bg-[#5D2F57] text-white text-xs font-bold shadow-sm cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
              <span>{language === 'bn' ? 'পুনরায় চেষ্টা করুন' : 'Retry'}</span>
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex justify-center text-[#4A2545] dark:text-[#C5A059]">
              <ButtonSpinner
                className="w-8 h-8"
                label={language === 'bn' ? messageBn : messageEn}
              />
            </div>
            <p className="text-xs sm:text-sm font-semibold text-stone-600 dark:text-stone-300">
              {language === 'bn' ? messageBn : messageEn}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export const SectionLoader: React.FC<{
  loading: boolean;
  error?: string | null;
  onRetry?: () => void;
  language?: 'bn' | 'en';
  labelBn?: string;
  labelEn?: string;
  minHeightClass?: string;
  children: React.ReactNode;
}> = ({
  loading,
  error,
  onRetry,
  language = 'bn',
  labelBn = 'তথ্য লোড হচ্ছে...',
  labelEn = 'Loading data...',
  minHeightClass = 'min-h-[220px]',
  children,
}) => {
  const { showSpinner, timedOut, isOffline, resetTimeout } = useDelayedLoader(loading, {
    delayMs: 150,
    minVisibleMs: 400,
    timeoutMs: 15000,
  });

  if (error || timedOut || (loading && isOffline)) {
    return (
      <div
        role="alert"
        className={`w-full ${minHeightClass} rounded-3xl bg-white dark:bg-[#1D1820] border border-rose-200 dark:border-rose-900/60 p-6 flex flex-col items-center justify-center text-center gap-3 shadow-xs`}
      >
        <div className="w-11 h-11 rounded-2xl bg-rose-100 dark:bg-rose-950/60 flex items-center justify-center text-rose-600 dark:text-rose-400">
          {isOffline ? <WifiOff className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
        </div>
        <div className="space-y-1 max-w-md">
          <h3 className="text-sm font-bold text-stone-900 dark:text-stone-100">
            {isOffline
              ? language === 'bn'
                ? 'ইন্টারনেট সংযোগ বিচ্ছিন্ন'
                : 'You are currently offline'
              : error ||
                (language === 'bn'
                  ? 'সার্ভার থেকে উত্তর পেতে দেরি হচ্ছে (টাইমআউট)'
                  : 'Request timed out after 15 seconds')}
          </h3>
          <p className="text-xs text-stone-500 dark:text-stone-400">
            {language === 'bn'
              ? 'অনুগ্রহ করে ইন্টারনেট সংযোগ পরীক্ষা করে পুনরায় চেষ্টা করুন।'
              : 'Please verify your network connection and try again.'}
          </p>
        </div>
        {onRetry && (
          <button
            type="button"
            onClick={() => {
              resetTimeout();
              onRetry();
            }}
            className="inline-flex items-center gap-2 min-h-[44px] px-5 py-2.5 rounded-xl bg-[#4A2545] hover:bg-[#5D2F57] text-white text-xs font-bold shadow-xs transition-colors cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" />
            <span>{language === 'bn' ? 'আবার চেষ্টা করুন' : 'Retry'}</span>
          </button>
        )}
      </div>
    );
  }

  if (loading || showSpinner) {
    return (
      <div
        role="status"
        aria-busy="true"
        aria-live="polite"
        className={`w-full ${minHeightClass} rounded-3xl bg-white/80 dark:bg-[#1D1820]/80 border border-stone-200/80 dark:border-stone-800 p-8 flex flex-col items-center justify-center gap-3`}
      >
        {showSpinner ? (
          <>
            <div className="text-[#4A2545] dark:text-[#C5A059]">
              <ButtonSpinner
                className="w-7 h-7"
                label={language === 'bn' ? labelBn : labelEn}
              />
            </div>
            <p className="text-xs font-semibold text-stone-600 dark:text-stone-300">
              {language === 'bn' ? labelBn : labelEn}
            </p>
          </>
        ) : (
          <span className="sr-only">{language === 'bn' ? labelBn : labelEn}</span>
        )}
      </div>
    );
  }

  return <>{children}</>;
};
