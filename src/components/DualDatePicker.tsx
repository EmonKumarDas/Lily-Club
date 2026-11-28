import React, { useState, useMemo } from 'react';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  getBengaliDate,
  formatDualDateFromYMD,
  formatDualMonthHeader,
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
  const isBn = language === 'bn';
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
    const startWeekday = firstDay.getUTCDay();
    const numDays = new Date(Date.UTC(viewYear, viewMonth + 1, 0)).getUTCDate();

    const cells: Array<{
      ymd: string;
      gDay: number;
      gDayBn: string;
      bDay: number;
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
        bDay: bInfo.day,
        bDayBn: bInfo.dayBn,
        bMonthBn: bInfo.monthBn,
        bMonthEn: bInfo.monthEn,
        bYearBn: bInfo.yearBn,
      });
    }

    return cells;
  }, [viewYear, viewMonth]);

  const firstVisibleIdx = useMemo(
    () => daysInMonth.findIndex((c) => c !== null),
    [daysInMonth]
  );

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

      {/* Dual Date Display Trigger + Native Input */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex-1 flex items-center justify-between gap-2 min-h-[44px] px-3.5 py-2.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-left hover:border-[#4A2545] dark:hover:border-[#C5A059] transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <Calendar className="w-4 h-4 text-[#4A2545] dark:text-[#C5A059] shrink-0" />
            <div className="truncate">
              <div className="text-xs sm:text-sm font-bold text-stone-900 dark:text-stone-100 truncate">
                {value ? formatDualDateFromYMD(value) : isBn ? 'তারিখ নির্বাচন করুন' : 'Select Date'}
              </div>
            </div>
          </div>
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-[#4A2545]/10 dark:bg-[#C5A059]/15 text-[#4A2545] dark:text-[#C5A059] shrink-0">
            {isBn ? 'বাংলা + EN ক্যালেন্ডার' : 'Side-by-Side Picker'}
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
          className="px-3 py-2.5 min-h-[44px] rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-xs font-mono text-stone-800 dark:text-stone-200"
          aria-label="Gregorian Date Input"
        />
      </div>

      {/* Side-by-Side Gregorian + Bangladesh Revised Bengali Calendar Popover (Section 8) */}
      {open && (
        <div className="mt-2 p-4 rounded-3xl bg-white dark:bg-[#1D1820] border border-stone-200 dark:border-stone-700 shadow-2xl z-30 space-y-3">
          <div className="flex items-center justify-between pb-2.5 border-b border-stone-100 dark:border-stone-800">
            <button
              type="button"
              onClick={handlePrevMonth}
              aria-label="Previous month"
              className="min-w-[38px] min-h-[38px] flex items-center justify-center rounded-xl hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-600 dark:text-stone-300 cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <div className="text-center text-xs sm:text-sm font-extrabold text-stone-900 dark:text-stone-100">
              {formatDualMonthHeader(viewYear, viewMonth, language)}
            </div>

            <button
              type="button"
              onClick={handleNextMonth}
              aria-label="Next month"
              className="min-w-[38px] min-h-[38px] flex items-center justify-center rounded-xl hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-600 dark:text-stone-300 cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Left Calendar: Gregorian (with small Bangla day) */}
            <div className="p-2.5 rounded-2xl bg-stone-50/70 dark:bg-stone-900/50 border border-stone-200/70 dark:border-stone-800">
              <div className="text-center text-xs font-extrabold text-stone-700 dark:text-stone-200 mb-2">
                {GREGORIAN_MONTHS_EN[viewMonth]} {viewYear} ({GREGORIAN_MONTHS_BN[viewMonth]})
              </div>
              <div className="grid grid-cols-7 gap-1 text-center mb-1">
                {WEEKDAYS.map((w) => (
                  <div key={`g-${w.shortEn}`} className="text-[10px] font-bold text-stone-500">
                    {w.shortEn}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {daysInMonth.map((cell, idx) => {
                  if (!cell) return <div key={`ge-${idx}`} className="h-10" />;
                  const isSelected = cell.ymd === value;
                  return (
                    <button
                      key={`g-${cell.ymd}`}
                      type="button"
                      onClick={() => {
                        onChange(cell.ymd);
                        setOpen(false);
                      }}
                      className={`h-10 px-1 rounded-xl border flex flex-col items-center justify-center transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-[#4A2545] text-white border-[#4A2545] font-extrabold'
                          : 'bg-white dark:bg-[#1D1820] border-stone-200/70 dark:border-stone-800 hover:border-[#4A2545]'
                      }`}
                    >
                      <span className="text-xs font-extrabold leading-none">{cell.gDay}</span>
                      <span
                        className={`text-[9px] font-semibold leading-none mt-0.5 ${
                          isSelected ? 'text-[#C5A059]' : 'text-stone-400'
                        }`}
                      >
                        {cell.bDayBn}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Right Calendar: Bangladesh Revised Bengali Calendar */}
            <div className="p-2.5 rounded-2xl bg-[#FAF4F0]/80 dark:bg-stone-900/50 border border-[#4A2545]/15 dark:border-stone-800">
              <div className="text-center text-xs font-extrabold text-[#4A2545] dark:text-[#C5A059] mb-2">
                বাংলা বর্ষপঞ্জি (সংশোধিত)
              </div>
              <div className="grid grid-cols-7 gap-1 text-center mb-1">
                {WEEKDAYS.map((w) => (
                  <div key={`b-${w.shortEn}`} className="text-[10px] font-bold text-stone-500">
                    {w.shortBn}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {daysInMonth.map((cell, idx) => {
                  if (!cell) return <div key={`be-${idx}`} className="h-10" />;
                  const isSelected = cell.ymd === value;
                  const showMonth = cell.bDay === 1 || idx === firstVisibleIdx;
                  return (
                    <button
                      key={`b-${cell.ymd}`}
                      type="button"
                      onClick={() => {
                        onChange(cell.ymd);
                        setOpen(false);
                      }}
                      className={`h-10 px-0.5 rounded-xl border flex flex-col items-center justify-center transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-[#4A2545] text-white border-[#4A2545] font-extrabold'
                          : showMonth
                          ? 'bg-[#C5A059]/15 dark:bg-[#C5A059]/20 border-[#C5A059]/50 hover:border-[#4A2545]'
                          : 'bg-white dark:bg-[#1D1820] border-stone-200/70 dark:border-stone-800 hover:border-[#4A2545]'
                      }`}
                    >
                      <span className="text-xs font-extrabold leading-none">{cell.bDayBn}</span>
                      <span
                        className={`text-[8px] truncate max-w-full leading-none mt-0.5 ${
                          isSelected
                            ? 'text-[#C5A059]'
                            : showMonth
                            ? 'text-[#4A2545] dark:text-[#C5A059] font-bold'
                            : 'text-stone-400'
                        }`}
                      >
                        {showMonth ? cell.bMonthBn : cell.gDay}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
