import React, { useState, useRef, useCallback, useEffect } from 'react';
import { ButtonSpinner } from './Loader.js';

/**
 * Synchronous useRef-backed action lock (Section 4):
 * Blocks rapid double-clicks / Enter key presses in <1ms before React even re-renders,
 * and unlocks cleanly on completion or failure so the user can retry on error.
 */
export function useActionGuard() {
  const lockedRef = useRef(false);
  const [busy, setBusy] = useState(false);

  const runGuarded = useCallback(async <T,>(fn: () => Promise<T> | T): Promise<T | undefined> => {
    if (lockedRef.current) return undefined;
    lockedRef.current = true;
    setBusy(true);
    try {
      return await fn();
    } finally {
      lockedRef.current = false;
      setBusy(false);
    }
  }, []);

  return { busy, runGuarded, isLockedRef: lockedRef };
}

/**
 * Unsaved-changes browser & modal guard (Section 4):
 * Warns before closing a dirty tab/form and helps keep form state intact on failure.
 */
export function useUnsavedChanges(isDirty: boolean) {
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);
}

export interface ActionButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'> {
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => Promise<any> | any;
  loading?: boolean;
  loadingLabel?: string;
  variant?: 'primary' | 'secondary' | 'gold' | 'danger' | 'ghost';
  icon?: React.ReactNode;
}

const VARIANT_CLASSES: Record<NonNullable<ActionButtonProps['variant']>, string> = {
  primary:
    'bg-[#4A2545] hover:bg-[#5D2F57] text-white shadow-md shadow-[#4A2545]/20 border border-[#4A2545]',
  secondary:
    'bg-white dark:bg-[#1D1820] hover:bg-[#FAF4F0] dark:hover:bg-stone-800 text-[#4A2545] dark:text-[#C5A059] border-2 border-[#4A2545]/30 dark:border-[#C5A059]/40 shadow-xs',
  gold:
    'bg-[#C5A059] hover:bg-[#D1AE6A] text-stone-950 font-extrabold shadow-md shadow-[#C5A059]/25 border border-[#C5A059]',
  danger:
    'bg-rose-600 hover:bg-rose-700 text-white shadow-sm border border-rose-600',
  ghost:
    'bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 dark:hover:bg-stone-700 text-stone-800 dark:text-stone-200 border border-stone-200 dark:border-stone-700',
};

export const ActionButton: React.FC<ActionButtonProps> = ({
  onClick,
  loading: externalLoading = false,
  loadingLabel,
  variant = 'primary',
  icon,
  disabled,
  className = '',
  type = 'button',
  children,
  ...rest
}) => {
  const { busy, runGuarded, isLockedRef } = useActionGuard();
  const isBusy = busy || externalLoading;

  const handleClick = async (e: React.MouseEvent<HTMLButtonElement>) => {
    if (disabled || isBusy || isLockedRef.current) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (!onClick) return;
    await runGuarded(() => onClick(e));
  };

  return (
    <button
      type={type}
      disabled={disabled || isBusy}
      aria-busy={isBusy}
      onClick={handleClick}
      className={`inline-flex items-center justify-center gap-2 min-h-[44px] px-4 py-2.5 rounded-2xl text-xs sm:text-sm font-bold transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C5A059] disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer active:scale-[0.99] ${VARIANT_CLASSES[variant]} ${className}`}
      {...rest}
    >
      {isBusy ? <ButtonSpinner className="w-4 h-4" label={loadingLabel || 'Processing'} /> : icon}
      <span>{isBusy && loadingLabel ? loadingLabel : children}</span>
    </button>
  );
};
