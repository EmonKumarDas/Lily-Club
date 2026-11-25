import React from 'react';

export const LoadingSkeleton: React.FC<{ rows?: number; className?: string }> = ({
  rows = 3,
  className = '',
}) => {
  return (
    <div className={`space-y-4 animate-pulse ${className}`}>
      <div className="h-8 bg-stone-200 dark:bg-stone-800 rounded-lg w-1/3" />
      <div className="space-y-2">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="h-14 bg-stone-100 dark:bg-stone-800/60 rounded-xl w-full" />
        ))}
      </div>
    </div>
  );
};
