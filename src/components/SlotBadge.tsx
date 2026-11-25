import React from 'react';
import { Sun, Moon } from 'lucide-react';
import { useAuth } from '../context/AuthContext.js';

export type SlotType = 'DAY' | 'NIGHT' | 'FULL';

export const SlotIcon: React.FC<{ slot: SlotType; className?: string }> = ({
  slot,
  className = 'w-3.5 h-3.5',
}) => {
  if (slot === 'DAY') {
    return <Sun className={`${className} text-amber-500`} />;
  }
  if (slot === 'NIGHT') {
    return <Moon className={`${className} text-indigo-500 dark:text-indigo-400`} />;
  }
  return (
    <span className="inline-flex items-center -space-x-1">
      <Sun className={`${className} text-amber-500`} />
      <Moon className={`${className} text-indigo-500 dark:text-indigo-400`} />
    </span>
  );
};

export const SlotBadge: React.FC<{
  slot: SlotType;
  size?: 'xs' | 'sm' | 'md';
  showDualLang?: boolean;
}> = ({ slot, size = 'sm', showDualLang = false }) => {
  const { language } = useAuth();

  const labelBn = slot === 'DAY' ? 'দিন' : slot === 'NIGHT' ? 'রাত' : 'দিন ও রাত';
  const labelEn = slot === 'DAY' ? 'Day' : slot === 'NIGHT' ? 'Night' : 'Full';

  const label = showDualLang
    ? `${labelBn} (${labelEn})`
    : language === 'bn'
    ? labelBn
    : labelEn;

  const colorClasses =
    slot === 'DAY'
      ? 'bg-amber-50 text-amber-900 border-amber-300 dark:bg-amber-950/60 dark:text-amber-200 dark:border-amber-800'
      : slot === 'NIGHT'
      ? 'bg-indigo-50 text-indigo-900 border-indigo-300 dark:bg-indigo-950/60 dark:text-indigo-200 dark:border-indigo-800'
      : 'bg-purple-50 text-purple-900 border-purple-300 dark:bg-purple-950/60 dark:text-purple-200 dark:border-purple-800';

  const sizeClasses =
    size === 'xs'
      ? 'px-1.5 py-0.5 text-[10px] gap-1'
      : size === 'sm'
      ? 'px-2.5 py-0.5 text-xs gap-1.5'
      : 'px-3 py-1 text-xs sm:text-sm gap-2';

  return (
    <span
      className={`inline-flex items-center font-bold rounded-full border ${colorClasses} ${sizeClasses} whitespace-nowrap`}
    >
      <SlotIcon slot={slot} className={size === 'xs' ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
      <span>{label}</span>
    </span>
  );
};
