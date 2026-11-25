import React from 'react';
import { LucideIcon, Inbox } from 'lucide-react';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description: string;
  actionText?: string;
  onAction?: () => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon = Inbox,
  title,
  description,
  actionText,
  onAction,
}) => {
  return (
    <div className="flex flex-col items-center justify-center p-8 sm:p-12 text-center bg-stone-50/50 dark:bg-stone-900/30 border border-dashed border-stone-200 dark:border-stone-800 rounded-2xl">
      <div className="p-4 mb-4 rounded-2xl bg-[#582C4D]/10 dark:bg-[#C5A059]/10 text-[#582C4D] dark:text-[#C5A059]">
        <Icon className="w-8 h-8" />
      </div>
      <h3 className="text-base sm:text-lg font-bold text-stone-900 dark:text-stone-100 mb-1">{title}</h3>
      <p className="text-xs sm:text-sm text-stone-500 dark:text-stone-400 max-w-sm mb-6 leading-relaxed">
        {description}
      </p>
      {actionText && onAction && (
        <button
          onClick={onAction}
          className="px-4 py-2 text-xs sm:text-sm font-semibold text-white bg-[#582C4D] hover:bg-[#6C375F] rounded-xl shadow-xs transition-all active:scale-98"
        >
          {actionText}
        </button>
      )}
    </div>
  );
};
