import React, { useState, useMemo } from 'react';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  getBengaliDate,
  formatDualDateFromYMD,
  parseEventDateToDhakaDate,
  GREGORIAN_MONTHS_EN,
  GREGORIAN_MONTHS_BN,
  WEEKDAYS,
  toBanglaDigits,
} from '../lib/dateUtils.js';
import { useAuth } from '../context/AuthContext.js';

interface DualDatePickerProps {
  value: string; // YYYY-MM-DD
  onChange: (newYMD: string) => void;
  label?: string;
  className?: string;
}

export const DualDatePicker: React.FC<DualDatePickerProps> = ({
  value,
  onChange,
  label,
  className = '',
}) => {
  const { language } = useAuth();
  const [open, setOpen] = useState(false);

  const initialDate = useMemo(() => {
    try {
      return parseEventDateToDhakaDate(value);
    } catch {
      return new Date();
    }
  }, [value]);

  const [viewYear, setViewYear] = useState(() => initialDate.getUTCFullYear());
  const [viewMonth, setViewMonth] = useState(() => initialDate.getUTCMonth()); // 0-11

  const daysInMonth = useMemo(() => {
    const firstDay = new Date(Date.UTC(viewYear, viewMonth, 1, 6, 0, 0));
    const startWeekday = firstDay.getUTCDay(); // 0 (Sun) - 6 (Sat)
    const numDays = new Date(Date.UTC(viewYear, viewMonth + 1, 0)).getUTCDate();

    const cells: Array<{
      ymd: string;
      gDay: number;
      gDayBn: string;
      bDayBn: string;
      bMonthBn: string;
      bMonthEn: string;
      bYearBn: string;
    } | null> = [];

    for (let i = 0; i < startWeekday; i++) {
      cells.push(null);
    }

    for (let d = 1; d <= numDays; d++) {
      const ymd = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dt = parseEventDateToDhakaDate(ymd);
      const bInfo = getBengaliDate(dt);
      cells.push({
        ymd,
        gDay: d,
        gDayBn: toBanglaDigits(d),
        bDayBn: bInfo.dayBn,
        bMonthBn: bInfo.monthBn,
        bMonthEn: bInfo.monthEn,
        bYearBn: bInfo.yearBn,
      });
    }

    return cells;
  }, [viewYear, viewMonth]);

  // Get Bengali months spanned by this Gregorian month
  const bengaliHeaderSummary = useMemo(() => {
    const firstYmd = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-01`;
    const lastDay = new Date(Date.UTC(viewYear, viewMonth + 1, 0)).getUTCDate();
    const lastYmd = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    const bFirst = getBengaliDate(parseEventDateToDhakaDate(firstYmd));
    const bLast = getBengaliDate(parseEventDateToDhakaDate(lastYmd));

    if (bFirst.monthBn === bLast.monthBn) {
      return `${bFirst.monthBn} ${bFirst.yearBn} (${bFirst.monthEn} ${bFirst.year})`;
    }
    return `${bFirst.monthBn} – ${bLast.monthBn} ${bLast.yearBn} বঙ্গাব্দ`;
  }, [viewYear, viewMonth]);

  const handlePrevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  return (
    <div className={`relative ${className}`}>
      {label && (
        <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 mb-1.5">
          {label}
        </label>
      )}

      {/* Dual Date Display Trigger + Native Input side by side */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex-1 flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-left hover:border-[#582C4D] dark:hover:border-[#C5A059] transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <Calendar className="w-4 h-4 text-[#582C4D] dark:text-[#C5A059] shrink-0" />
            <div className="truncate">
              <div className="text-xs sm:text-sm font-bold text-stone-900 dark:text-stone-100 truncate">
                {value ? formatDualDateFromYMD(value) : language === 'bn' ? 'তারিখ নির্বাচন করুন' : 'Select Date'}
              </div>
            </div>
          </div>
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-[#582C4D]/10 dark:bg-[#C5A059]/15 text-[#582C4D] dark:text-[#C5A059] shrink-0">
            {language === 'bn' ? 'বাংলা / EN ক্যালেন্ডার' : 'Bangla / EN Picker'}
          </span>
        </button>

        <input
          type="date"
          value={value}
          onChange={(e) => {
            if (e.target.value) {
              onChange(e.target.value);
              const [y, m] = e.target.value.split('-').map(Number);
              if (y && m) {
                setViewYear(y);
                setViewMonth(m - 1);
              }
            }
          }}
          className="px-3 py-2.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-xs font-mono text-stone-800 dark:text-stone-200"
          aria-label="Gregorian Date Input"
        />
      </div>

      {/* Interactive Dual Bangla + English Calendar Popover */}
      {open && (
        <div className="mt-2 p-4 rounded-2xl bg-white dark:bg-[#1E1920] border border-stone-200 dark:border-stone-700 shadow-2xl z-30">
          <div className="flex items-center justify-between pb-3 mb-3 border-b border-stone-100 dark:border-stone-800">
            <button
              type="button"
              onClick={handlePrevMonth}
              className="p-1.5 rounded-xl hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-600 dark:text-stone-300"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <div className="text-center">
              <div className="text-xs sm:text-sm font-bold text-stone-900 dark:text-stone-100">
                {GREGORIAN_MONTHS_BN[viewMonth]} {toBanglaDigits(viewYear)} • {GREGORIAN_MONTHS_EN[viewMonth]} {viewYear}
              </div>
              <div className="text-[11px] font-semibold text-[#582C4D] dark:text-[#C5A059]">
                {bengaliHeaderSummary}
              </div>
            </div>

            <button
              type="button"
              onClick={handleNextMonth}
              className="p-1.5 rounded-xl hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-600 dark:text-stone-300"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Weekday Headers */}
          <div className="grid grid-cols-7 gap-1 text-center mb-1.5">
            {WEEKDAYS.map((w) => (
              <div
                key={w.shortEn}
                className="text-[10px] font-bold text-stone-500 dark:text-stone-400 py-1"
              >
                <div>{w.shortBn}</div>
                <div className="text-[9px] opacity-75">{w.shortEn}</div>
              </div>
            ))}
          </div>

          {/* Days Grid showing BOTH English and Bangla Date side-by-side */}
          <div className="grid grid-cols-7 gap-1">
            {daysInMonth.map((cell, idx) => {
              if (!cell) {
                return <div key={`empty-${idx}`} className="h-12" />;
              }
              const isSelected = cell.ymd === value;
              return (
                <button
                  key={cell.ymd}
                  type="button"
                  onClick={() => {
                    onChange(cell.ymd);
                    setOpen(false);
                  }}
                  className={`h-13 p-1 rounded-xl border text-left flex flex-col justify-between transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-[#582C4D] text-white border-[#582C4D] shadow-md'
                      : 'bg-stone-50/70 dark:bg-stone-900/50 border-stone-200/70 dark:border-stone-800 hover:border-[#582C4D] dark:hover:border-[#C5A059]'
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <span className={`text-xs font-extrabold ${isSelected ? 'text-white' : 'text-stone-900 dark:text-stone-100'}`}>
                      {cell.gDay}
                    </span>
                    <span className={`text-[10px] font-bold ${isSelected ? 'text-[#C5A059]' : 'text-[#582C4D] dark:text-[#C5A059]'}`}>
                      {cell.bDayBn}
                    </span>
                  </div>
                  <div className={`text-[9px] truncate leading-tight ${isSelected ? 'text-stone-200' : 'text-stone-500 dark:text-stone-400'}`}>
                    {cell.bMonthBn}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
