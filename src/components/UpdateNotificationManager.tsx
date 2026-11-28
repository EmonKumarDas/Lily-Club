import React, { useState, useEffect, useCallback } from 'react';
import { Download, RefreshCw, ShieldAlert, Sparkles, X } from 'lucide-react';
import { CLIENT_APP_VERSION } from '../lib/api.js';
import { Modal } from './Modal.js';
import { ActionButton } from './ActionButton.js';

interface VersionConfig {
  latestVersion: string;
  minSupportedVersion: string;
  updateUrl: string;
  releaseNotesBn: string;
  releaseNotesEn: string;
}

function compareSemver(a: string, b: string): number {
  const pa = (a || '0.0.0').split('.').map((n) => parseInt(n, 10) || 0);
  const pb = (b || '0.0.0').split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return 1;
    if ((pa[i] || 0) < (pb[i] || 0)) return -1;
  }
  return 0;
}

function isCapacitorApk(): boolean {
  if (typeof window === 'undefined') return false;
  const cap = (window as any).Capacitor;
  return Boolean(cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform());
}

export const UpdateNotificationManager: React.FC<{ language: 'bn' | 'en' }> = ({ language }) => {
  const isBn = language === 'bn';
  const [versionInfo, setVersionInfo] = useState<VersionConfig | null>(null);
  const [forceBlocking, setForceBlocking] = useState(false);
  const [optionalOpen, setOptionalOpen] = useState(false);
  const [swWaiting, setSwWaiting] = useState<ServiceWorker | null>(null);
  const [swBannerVisible, setSwBannerVisible] = useState(false);

  const checkRemoteVersion = useCallback(async () => {
    try {
      const res = await fetch('/api/app-version', {
        headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
      });
      if (!res.ok) return;
      const data = (await res.json()) as VersionConfig;
      if (!data?.latestVersion || !data?.minSupportedVersion) return;

      setVersionInfo(data);

      if (compareSemver(CLIENT_APP_VERSION, data.minSupportedVersion) < 0) {
        setForceBlocking(true);
        setOptionalOpen(false);
        return;
      }

      if (compareSemver(CLIENT_APP_VERSION, data.latestVersion) < 0) {
        const dismissedVer = localStorage.getItem('lily_dismissed_update_version');
        if (dismissedVer !== data.latestVersion) {
          setOptionalOpen(true);
        }
      }
    } catch {
      // Section 5 rule: Never crash if the version check fails
    }
  }, []);

  useEffect(() => {
    checkRemoteVersion();

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        checkRemoteVersion();
      }
    };
    const onServer426 = (ev: Event) => {
      const detail = (ev as CustomEvent)?.detail || {};
      setVersionInfo((prev) => ({
        latestVersion: detail.latestVersion || prev?.latestVersion || CLIENT_APP_VERSION,
        minSupportedVersion: detail.minSupportedVersion || prev?.minSupportedVersion || '99.0.0',
        updateUrl: detail.updateUrl || prev?.updateUrl || window.location.origin,
        releaseNotesBn:
          prev?.releaseNotesBn || 'নিরাপত্তা আপডেট প্রয়োগ করা হয়েছে। অনুগ্রহ করে অ্যাপ আপডেট করুন।',
        releaseNotesEn:
          prev?.releaseNotesEn || 'Important security updates are required to continue.',
      }));
      setForceBlocking(true);
    };

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', checkRemoteVersion);
    window.addEventListener('lily:update-required', onServer426);

    // PWA / Service Worker update detection
    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
      navigator.serviceWorker.getRegistration().then((reg) => {
        if (!reg) return;
        if (reg.waiting) {
          setSwWaiting(reg.waiting);
          setSwBannerVisible(true);
        }
        reg.addEventListener('updatefound', () => {
          const installing = reg.installing;
          if (!installing) return;
          installing.addEventListener('statechange', () => {
            if (installing.state === 'installed' && navigator.serviceWorker.controller) {
              setSwWaiting(installing);
              setSwBannerVisible(true);
            }
          });
        });
      }).catch(() => {});
    }

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', checkRemoteVersion);
      window.removeEventListener('lily:update-required', onServer426);
    };
  }, [checkRemoteVersion]);

  const handleUpdateAction = () => {
    if (isCapacitorApk() && versionInfo?.updateUrl) {
      window.open(versionInfo.updateUrl, '_blank', 'noopener,noreferrer');
      return;
    }
    if (swWaiting) {
      swWaiting.postMessage({ type: 'SKIP_WAITING' });
      setTimeout(() => window.location.reload(), 250);
      return;
    }
    if (versionInfo?.updateUrl && versionInfo.updateUrl !== window.location.origin) {
      window.location.href = versionInfo.updateUrl;
    } else {
      window.location.reload();
    }
  };

  const handleDismissOptional = () => {
    if (versionInfo?.latestVersion) {
      localStorage.setItem('lily_dismissed_update_version', versionInfo.latestVersion);
    }
    setOptionalOpen(false);
  };

  // 1. Non-dismissible Blocking "Update Required" Screen
  if (forceBlocking) {
    return (
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="update-required-title"
        className="fixed inset-0 z-[100] bg-[#141115]/95 backdrop-blur-md flex items-center justify-center p-4"
      >
        <div className="max-w-md w-full rounded-3xl bg-white dark:bg-[#1D1820] border-2 border-rose-500/60 p-6 sm:p-8 shadow-2xl text-center space-y-5">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-rose-100 dark:bg-rose-950/70 flex items-center justify-center text-rose-600 dark:text-rose-400">
            <ShieldAlert className="w-7 h-7" />
          </div>
          <div className="space-y-2">
            <h2
              id="update-required-title"
              className="text-xl font-extrabold text-stone-900 dark:text-stone-100"
            >
              {isBn ? 'আপডেট করা আবশ্যক (Update Required)' : 'Update Required'}
            </h2>
            <p className="text-xs sm:text-sm text-stone-600 dark:text-stone-300 leading-relaxed">
              {isBn
                ? `আপনার বর্তমান সংস্করণ (${CLIENT_APP_VERSION}) আর সমর্থিত নয়। নিরাপত্তার স্বার্থে সর্বনিম্ন সংস্করণ ${versionInfo?.minSupportedVersion || ''} এ আপডেট করুন।`
                : `Your installed version (${CLIENT_APP_VERSION}) is below the minimum supported version (${versionInfo?.minSupportedVersion || ''}). Please update now to continue safely.`}
            </p>
          </div>

          {versionInfo && (
            <div className="p-3.5 rounded-2xl bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-800 text-left text-xs text-stone-700 dark:text-stone-300">
              <div className="font-bold mb-1">
                {isBn ? 'নতুন পরিবর্তনসমূহ:' : "What's new:"}
              </div>
              <p>{isBn ? versionInfo.releaseNotesBn : versionInfo.releaseNotesEn}</p>
            </div>
          )}

          <ActionButton
            variant="primary"
            onClick={handleUpdateAction}
            icon={isCapacitorApk() ? <Download className="w-4 h-4" /> : <RefreshCw className="w-4 h-4" />}
            className="w-full"
          >
            {isCapacitorApk()
              ? isBn
                ? 'নতুন APK ডাউনলোড করুন'
                : 'Download Latest APK'
              : isBn
              ? 'এখনই আপডেট করুন'
              : 'Update Now'}
          </ActionButton>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* 2. PWA / Web Service Worker Banner ("New version available, Reload") */}
      {swBannerVisible && (
        <div
          role="status"
          className="fixed bottom-20 md:bottom-5 left-4 right-4 md:left-auto md:right-6 md:max-w-md z-50 rounded-2xl bg-[#4A2545] text-white p-3.5 shadow-2xl border border-[#C5A059]/40 flex items-center justify-between gap-3"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <Sparkles className="w-4 h-4 text-[#C5A059] shrink-0" />
            <span className="text-xs font-bold truncate">
              {isBn ? 'নতুন সংস্করণ এসেছে — রিলোড করুন' : 'New version available — Reload'}
            </span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={handleUpdateAction}
              className="px-3 py-1.5 min-h-[36px] rounded-xl bg-[#C5A059] text-stone-950 text-xs font-extrabold cursor-pointer"
            >
              {isBn ? 'রিলোড' : 'Reload'}
            </button>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => setSwBannerVisible(false)}
              className="p-1.5 rounded-lg hover:bg-white/10 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* 3. Optional Remote Update Dialog (shown once per version) */}
      <Modal
        isOpen={optionalOpen}
        onClose={handleDismissOptional}
        title={isBn ? 'নতুন আপডেট পাওয়া গেছে' : 'Update Available'}
        maxWidth="sm"
      >
        <div className="space-y-4">
          <p className="text-xs sm:text-sm text-stone-600 dark:text-stone-300 leading-relaxed">
            {isBn
              ? `লিলি কমিউনিটি সেন্টারের নতুন সংস্করণ (${versionInfo?.latestVersion}) এখন ব্যবহারের জন্য প্রস্তুত।`
              : `A newer version (${versionInfo?.latestVersion}) of Lily Community Center is available.`}
          </p>

          {versionInfo && (
            <div className="p-3.5 rounded-2xl bg-[#FAF4F0] dark:bg-stone-900 border border-stone-200 dark:border-stone-800 text-xs text-stone-700 dark:text-stone-300 space-y-1">
              <div className="font-bold text-[#4A2545] dark:text-[#C5A059]">
                {isBn ? 'রিলিজ নোট:' : 'Release notes:'}
              </div>
              <p>{isBn ? versionInfo.releaseNotesBn : versionInfo.releaseNotesEn}</p>
            </div>
          )}

          <div className="flex items-center justify-end gap-2.5 pt-2">
            <ActionButton variant="ghost" onClick={handleDismissOptional}>
              {isBn ? 'পরে (Later)' : 'Later'}
            </ActionButton>
            <ActionButton
              variant="primary"
              onClick={handleUpdateAction}
              icon={isCapacitorApk() ? <Download className="w-4 h-4" /> : <RefreshCw className="w-4 h-4" />}
            >
              {isBn ? 'এখনই আপডেট করুন' : 'Update Now'}
            </ActionButton>
          </div>
        </div>
      </Modal>
    </>
  );
};
