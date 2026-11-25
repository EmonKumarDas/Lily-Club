import React, { useState, useEffect } from 'react';
import { Calendar, Clock } from 'lucide-react';
import { formatDualDate, formatTime12 } from '../lib/dateUtils.js';
import { useAuth } from '../context/AuthContext.js';

export const DateBadge: React.FC<{ showTime?: boolean; className?: string }> = ({
  showTime = true,
  className = '',
}) => {
  const { language } = useAuth();
  const [currentDate, setCurrentDate] = useState(() => new Date());

  useEffect(() => {
    // Tick every minute to keep time fresh
    const timer = setInterval(() => {
      setCurrentDate(new Date());
    }, 30000);
    return () => clearInterval(timer);
  }, []);

  const dualDate = formatDualDate(currentDate);
  const timeStr = formatTime12(currentDate, language);

  return (
    <div
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium bg-stone-100 dark:bg-stone-800/80 text-stone-700 dark:text-stone-300 border border-stone-200/80 dark:border-stone-700 shadow-xs ${className}`}
      title="বাংলাদেশ সংশোধিত বর্ষপঞ্জি ও গ্রেগরিয়ান তারিখ (এশিয়া/ঢাকা সময়)"
    >
      <Calendar className="w-3.5 h-3.5 text-[#582C4D] dark:text-[#C5A059] shrink-0" />
      <span className="font-semibold tracking-wide">{dualDate}</span>
      {showTime && (
        <>
          <span className="text-stone-400 dark:text-stone-500">•</span>
          <span className="inline-flex items-center gap-1 text-stone-600 dark:text-stone-400">
            <Clock className="w-3 h-3 text-stone-400 shrink-0" />
            <span>{timeStr}</span>
          </span>
        </>
      )}
    </div>
  );
};
