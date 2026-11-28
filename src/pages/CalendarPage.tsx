import React, { useState, useEffect, useMemo } from 'react';
import {
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  Sun,
  Moon,
  Plus,
  Clock,
  Building2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.js';
import { useToast } from '../components/Toast.js';
import { Modal } from '../components/Modal.js';
import { SectionLoader } from '../components/Loader.js';
import { SlotBadge, SlotIcon, type SlotType } from '../components/SlotBadge.js';
import {
  getBengaliDate,
  parseEventDateToDhakaDate,
  formatDualDateFromYMD,
  formatFullDualDateWithWeekdayFromYMD,
  formatDualMonthHeader,
  formatTimeString12,
  formatNumberByLanguage,
  getNextDayYMD,
  getTodayDhakaYMD,
  isNightCrossingMidnight,
  GREGORIAN_MONTHS_EN,
  GREGORIAN_MONTHS_BN,
  WEEKDAYS,
  toBanglaDigits,
} from '../lib/dateUtils.js';
import { apiRequest } from '../lib/api.js';
import type { HallItem } from './HallsPage.js';
import type { BookingFormInitialData } from '../components/BookingWizardModal.js';

interface CalendarPageProps {
  onStartBookingFromSlot: (prefill: BookingFormInitialData) => void;
  onOpenBookingDetail: (bookingId: string) => void;
}

export const CalendarPage: React.FC<CalendarPageProps> = ({
  onStartBookingFromSlot,
  onOpenBookingDetail,
}) => {
  const { activeRoom, activeMember, language, t } = useAuth();
  const { showError } = useToast();

  const [viewMode, setViewMode] = useState<'month' | 'week' | 'list'>('month');
  const todayYMD = useMemo(() => getTodayDhakaYMD(), []);

  const [currentYear, setCurrentYear] = useState(() => parseInt(todayYMD.slice(0, 4), 10));
  const [currentMonth, setCurrentMonth] = useState(() => parseInt(todayYMD.slice(5, 7), 10) - 1); // 0-11
  const [weekAnchorYMD, setWeekAnchorYMD] = useState(() => todayYMD);

  // Filters
  const [halls, setHalls] = useState<HallItem[]>([]);
  const [selectedHallId, setSelectedHallId] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [slotFilter, setSlotFilter] = useState<string>('');

  // Bookings in range
  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Day Inspection Modal when tapping a day cell
  const [selectedDayYMD, setSelectedDayYMD] = useState<string | null>(null);

  const canCreate =
    activeMember?.role === 'OWNER' ||
    activeMember?.role === 'MANAGER' ||
    activeMember?.role === 'STAFF';

  useEffect(() => {
    if (!activeRoom) return;
    apiRequest<{ halls: HallItem[] }>(`/api/rooms/${activeRoom.id}/halls`)
      .then((res) => {
        const list = res.halls || [];
        setHalls(list);
      })
      .catch(() => {});
  }, [activeRoom]);

  // Compute dateFrom and dateTo for current month
  const { dateFrom, dateTo } = useMemo(() => {
    const first = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-01`;
    const numDays = new Date(Date.UTC(currentYear, currentMonth + 1, 0)).getUTCDate();
    const last = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(numDays).padStart(2, '0')}`;
    return { dateFrom: first, dateTo: last };
  }, [currentYear, currentMonth]);

  useEffect(() => {
    if (!activeRoom) return;
    fetchMonthBookings();
  }, [activeRoom, dateFrom, dateTo, selectedHallId, statusFilter, slotFilter]);

  const fetchMonthBookings = async () => {
    if (!activeRoom) return;
    setLoading(true);
    setFetchError(null);
    try {
      const params = new URLSearchParams({
        dateFrom,
        dateTo,
        hallId: selectedHallId,
        status: statusFilter,
        slot: slotFilter,
        sortBy: 'event_date_asc',
        limit: '200',
      });
      const res = await apiRequest<{ bookings: any[] }>(
        `/api/rooms/${activeRoom.id}/bookings?${params.toString()}`
      );
      const activeList = (res.bookings || []).filter((b) =>
        statusFilter === 'CANCELLED' ? true : b.status !== 'CANCELLED'
      );
      setBookings(activeList);
    } catch (err: any) {
      const msg = (language === 'bn' ? err.messageBn : err.messageEn) || err.message || 'Failed to load calendar';
      setFetchError(msg);
      showError(msg);
    } finally {
      setLoading(false);
    }
  };

  // Group bookings by YYYY-MM-DD into Day half and Night half
  // Remember: FULL booking occupies BOTH Day half and Night half of its starting date!
  // Night bookings that end after midnight stay strictly on their starting date!
  const bookingsByDate = useMemo(() => {
    const map: Record<
      string,
      {
        dayBookings: any[];
        nightBookings: any[];
      }
    > = {};

    for (const b of bookings) {
      if (!map[b.event_date]) {
        map[b.event_date] = { dayBookings: [], nightBookings: [] };
      }
      if (b.slot === 'DAY' || b.slot === 'FULL') {
        map[b.event_date].dayBookings.push(b);
      }
      if (b.slot === 'NIGHT' || b.slot === 'FULL') {
        map[b.event_date].nightBookings.push(b);
      }
    }
    return map;
  }, [bookings]);

  // Build Month Grid cells
  const monthCells = useMemo(() => {
    const firstDt = new Date(Date.UTC(currentYear, currentMonth, 1, 6, 0, 0));
    const startWeekday = firstDt.getUTCDay();
    const numDays = new Date(Date.UTC(currentYear, currentMonth + 1, 0)).getUTCDate();

    const list: Array<{
      ymd: string;
      gDay: number;
      gDayBn: string;
      bDay: number;
      bDayBn: string;
      bMonthBn: string;
      bMonthEn: string;
    } | null> = [];

    for (let i = 0; i < startWeekday; i++) list.push(null);

    for (let d = 1; d <= numDays; d++) {
      const ymd = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const bInfo = getBengaliDate(parseEventDateToDhakaDate(ymd));
      list.push({
        ymd,
        gDay: d,
        gDayBn: toBanglaDigits(d),
        bDay: bInfo.day,
        bDayBn: bInfo.dayBn,
        bMonthBn: bInfo.monthBn,
        bMonthEn: bInfo.monthEn,
      });
    }
    return list;
  }, [currentYear, currentMonth]);

  const firstVisibleCellIdx = useMemo(
    () => monthCells.findIndex((c) => c !== null),
    [monthCells]
  );

  // Build 7-day Week View cells around weekAnchorYMD
  const weekDays = useMemo(() => {
    const [y, m, d] = weekAnchorYMD.split('-').map(Number);
    const anchor = new Date(Date.UTC(y, m - 1, d, 6, 0, 0));
    const dayOfWeek = anchor.getUTCDay(); // 0 (Sun)
    const result: Array<{
      ymd: string;
      gDay: number;
      bDayBn: string;
      bMonthBn: string;
      weekdayBn: string;
      weekdayEn: string;
    }> = [];

    for (let i = 0; i < 7; i++) {
      const dt = new Date(Date.UTC(y, m - 1, d - dayOfWeek + i, 6, 0, 0));
      const ymd = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(
        dt.getUTCDate()
      ).padStart(2, '0')}`;
      const bInfo = getBengaliDate(parseEventDateToDhakaDate(ymd));
      const wd = WEEKDAYS[dt.getUTCDay()];
      result.push({
        ymd,
        gDay: dt.getUTCDate(),
        bDayBn: bInfo.dayBn,
        bMonthBn: bInfo.monthBn,
        weekdayBn: wd.shortBn,
        weekdayEn: wd.shortEn,
      });
    }
    return result;
  }, [weekAnchorYMD]);

  const bengaliMonthHeader = useMemo(() => {
    const bFirst = getBengaliDate(parseEventDateToDhakaDate(dateFrom));
    const bLast = getBengaliDate(parseEventDateToDhakaDate(dateTo));
    if (bFirst.monthBn === bLast.monthBn) {
      return `${bFirst.monthBn} ${bFirst.yearBn} বঙ্গাব্দ (${bFirst.monthEn} ${bFirst.year})`;
    }
    return `${bFirst.monthBn} – ${bLast.monthBn} ${bLast.yearBn} বঙ্গাব্দ`;
  }, [dateFrom, dateTo]);

  const handlePrev = () => {
    if (viewMode === 'week') {
      const [y, m, d] = weekAnchorYMD.split('-').map(Number);
      const dt = new Date(Date.UTC(y, m - 1, d - 7));
      const ny = dt.getUTCFullYear();
      const nm = dt.getUTCMonth();
      setCurrentYear(ny);
      setCurrentMonth(nm);
      setWeekAnchorYMD(
        `${ny}-${String(nm + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`
      );
      return;
    }
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear((y) => y - 1);
    } else {
      setCurrentMonth((m) => m - 1);
    }
  };

  const handleNext = () => {
    if (viewMode === 'week') {
      const [y, m, d] = weekAnchorYMD.split('-').map(Number);
      const dt = new Date(Date.UTC(y, m - 1, d + 7));
      const ny = dt.getUTCFullYear();
      const nm = dt.getUTCMonth();
      setCurrentYear(ny);
      setCurrentMonth(nm);
      setWeekAnchorYMD(
        `${ny}-${String(nm + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`
      );
      return;
    }
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear((y) => y + 1);
    } else {
      setCurrentMonth((m) => m + 1);
    }
  };

  // Determine half-cell status styling: free (green), tentative (amber), confirmed (maroon/purple)
  const getHalfCellStatus = (halfBookings: any[]) => {
    if (!halfBookings || halfBookings.length === 0) {
      return {
        state: 'FREE' as const,
        className:
          'bg-emerald-50/70 hover:bg-emerald-100/80 dark:bg-emerald-950/25 dark:hover:bg-emerald-900/40 text-emerald-900 dark:text-emerald-200 border-emerald-200/80 dark:border-emerald-900/50',
      };
    }
    const hasConfirmed = halfBookings.some(
      (b) => b.status === 'CONFIRMED' || b.status === 'COMPLETED'
    );
    const hasFull = halfBookings.some((b) => b.slot === 'FULL');

    if (hasConfirmed) {
      return {
        state: 'CONFIRMED' as const,
        className: hasFull
          ? 'bg-purple-600/90 hover:bg-purple-700 text-white border-purple-700'
          : 'bg-[#582C4D] hover:bg-[#6C375F] text-white border-[#582C4D]',
      };
    }
    return {
      state: 'TENTATIVE' as const,
      className:
        'bg-amber-400/90 hover:bg-amber-500 text-stone-950 border-amber-500 font-bold',
    };
  };

  const handleHalfClick = (
    e: React.MouseEvent,
    ymd: string,
    halfSlot: 'DAY' | 'NIGHT',
    halfBookings: any[]
  ) => {
    e.stopPropagation();
    if (halfBookings.length === 0 && canCreate) {
      // Rule: Tap an empty half to open New Booking with the date and slot prefilled!
      onStartBookingFromSlot({
        event_date: ymd,
        slot: halfSlot,
        hall_id: selectedHallId || undefined,
      });
    } else {
      setSelectedDayYMD(ymd);
    }
  };

  const selectedDayData = selectedDayYMD
    ? bookingsByDate[selectedDayYMD] || { dayBookings: [], nightBookings: [] }
    : { dayBookings: [], nightBookings: [] };

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-stone-200 dark:border-stone-800 pb-5">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-stone-900 dark:text-stone-100 flex items-center gap-2.5">
            <CalendarRange className="w-6 h-6 text-[#582C4D] dark:text-[#C5A059]" />
            <span>{t('calendarPageTitle')}</span>
          </h1>
          <p className="text-xs sm:text-sm text-stone-500 dark:text-stone-400 mt-1">
            {t('calendarPageSubtitle')}
          </p>
        </div>

        {/* View Switcher: Month / Week / List */}
        <div className="flex p-1 bg-stone-100 dark:bg-stone-800 rounded-2xl border border-stone-200 dark:border-stone-700 self-start">
          {(['month', 'week', 'list'] as const).map((vm) => (
            <button
              key={vm}
              onClick={() => setViewMode(vm)}
              className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                viewMode === vm
                  ? 'bg-white dark:bg-[#1E1920] text-[#582C4D] dark:text-[#C5A059] shadow-xs'
                  : 'text-stone-600 dark:text-stone-400'
              }`}
            >
              {vm === 'month'
                ? t('viewMonth')
                : vm === 'week'
                ? t('viewWeek')
                : t('viewList')}
            </button>
          ))}
        </div>
      </div>

      {/* Filters & Color Legend Bar */}
      <div className="p-4 rounded-2xl bg-white dark:bg-[#1E1920] border border-stone-200 dark:border-stone-800 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 flex-1">
          <select
            value={selectedHallId}
            onChange={(e) => setSelectedHallId(e.target.value)}
            className="px-3 py-2 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-900 text-xs font-bold"
          >
            <option value="">{language === 'bn' ? 'সকল হল (All Halls)' : 'All Halls'}</option>
            {halls.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
              </option>
            ))}
          </select>

          <select
            value={slotFilter}
            onChange={(e) => setSlotFilter(e.target.value)}
            className="px-3 py-2 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-900 text-xs font-bold"
          >
            <option value="">{language === 'bn' ? 'সকল স্লট (দিন/রাত/দিন ও রাত)' : 'All Slots'}</option>
            <option value="DAY">☀️ {t('slot_DAY')} (Day)</option>
            <option value="NIGHT">🌙 {t('slot_NIGHT')} (Night)</option>
            <option value="FULL">☀️🌙 {t('slot_FULL')} (Full)</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-900 text-xs font-bold"
          >
            <option value="">{language === 'bn' ? 'সক্রিয় বুকিং (Confirmed + Tentative)' : 'Active Bookings'}</option>
            <option value="CONFIRMED">{t('bStatus_CONFIRMED')}</option>
            <option value="TENTATIVE">{t('bStatus_TENTATIVE')}</option>
          </select>
        </div>

        {/* Color Legend */}
        <div className="flex flex-wrap items-center gap-3 text-xs font-semibold">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-emerald-100 border border-emerald-400 inline-block" />
            <span>{t('slotFree')}</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-amber-400 inline-block" />
            <span>{t('bStatus_TENTATIVE')}</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-[#582C4D] inline-block" />
            <span>{t('bStatus_CONFIRMED')}</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-purple-600 inline-block" />
            <span>
              ☀️🌙 {t('slot_FULL')} ({language === 'bn' ? 'উভয় অংশ' : 'Both Halves'})
            </span>
          </span>
        </div>
      </div>

      {/* Month & Bengali Year Navigation Bar (Section 8: "November 2026 | কার্তিক–অগ্রহায়ণ ১৪৩৩") */}
      <div className="flex items-center justify-between p-4 rounded-2xl bg-white dark:bg-[#1D1820] border border-stone-200 dark:border-stone-800 shadow-xs">
        <button
          onClick={handlePrev}
          aria-label="Previous month"
          className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 text-stone-700 dark:text-stone-200 cursor-pointer"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        <div className="text-center px-2">
          <h2 className="text-sm sm:text-lg font-extrabold text-stone-900 dark:text-stone-100">
            {formatDualMonthHeader(currentYear, currentMonth, language)}
          </h2>
          <p className="text-[11px] font-semibold text-[#4A2545] dark:text-[#C5A059] mt-0.5">
            {bengaliMonthHeader}
          </p>
        </div>

        <button
          onClick={handleNext}
          aria-label="Next month"
          className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 text-stone-700 dark:text-stone-200 cursor-pointer"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      <SectionLoader
        loading={loading}
        error={fetchError}
        onRetry={fetchMonthBookings}
        language={language}
      >
        {viewMode === 'month' ? (
        /* ======================== MONTH VIEW (Split Day / Night Cells) ======================== */
        <div className="bg-white dark:bg-[#1D1820] border border-stone-200 dark:border-stone-800 rounded-3xl p-2 sm:p-4 shadow-xs">
          {/* Weekday Headers in BOTH Languages */}
          <div className="grid grid-cols-7 gap-1 sm:gap-2 text-center pb-2 mb-2 border-b border-stone-100 dark:border-stone-800">
            {WEEKDAYS.map((w) => (
              <div key={w.shortEn} className="text-[11px] font-bold text-stone-500">
                <div>{w.shortBn}</div>
                <div className="text-[10px] opacity-75">{w.shortEn}</div>
              </div>
            ))}
          </div>

          {/* Calendar Cells Grid */}
          <div className="grid grid-cols-7 gap-1 sm:gap-2">
            {monthCells.map((cell, idx) => {
              if (!cell) {
                return <div key={`blank-${idx}`} className="min-h-[104px] sm:min-h-[124px]" />;
              }

              const dayInfo = bookingsByDate[cell.ymd] || {
                dayBookings: [],
                nightBookings: [],
              };
              const dayStyle = getHalfCellStatus(dayInfo.dayBookings);
              const nightStyle = getHalfCellStatus(dayInfo.nightBookings);
              const isToday = cell.ymd === todayYMD;
              // Section 8: Show Bangla month name inside cell on 1st day of each Bangla month AND 1st visible day of grid!
              const showBanglaMonthInCell = cell.bDay === 1 || idx === firstVisibleCellIdx;

              return (
                <div
                  key={cell.ymd}
                  onClick={() => setSelectedDayYMD(cell.ymd)}
                  className={`min-h-[104px] sm:min-h-[126px] rounded-2xl border p-1 sm:p-1.5 flex flex-col justify-between transition-all cursor-pointer ${
                    isToday
                      ? 'border-2 border-[#4A2545] dark:border-[#C5A059] bg-[#4A2545]/5'
                      : 'border-stone-200/80 dark:border-stone-800 bg-stone-50/40 dark:bg-stone-900/30'
                  }`}
                >
                  {/* Section 8: English day number (large) AND Bangla day number (small) + Bangla month on 1st of month / 1st visible day */}
                  <div className="flex items-start justify-between gap-0.5 px-1 pb-1">
                    <span
                      className="text-sm sm:text-base font-extrabold text-stone-900 dark:text-stone-100 leading-none"
                      title={`English Day: ${cell.gDay}`}
                    >
                      {cell.gDay}
                    </span>
                    <span
                      className={`text-[10px] sm:text-xs font-extrabold text-right leading-tight ${
                        showBanglaMonthInCell
                          ? 'px-1 py-0.5 rounded-md bg-[#4A2545]/10 dark:bg-[#C5A059]/20 text-[#4A2545] dark:text-[#C5A059]'
                          : 'text-[#4A2545] dark:text-[#C5A059]'
                      }`}
                      title={`বাংলা তারিখ: ${cell.bDayBn} ${cell.bMonthBn}`}
                    >
                      {cell.bDayBn}
                      {showBanglaMonthInCell && (
                        <span className="ml-0.5 text-[8px] sm:text-[9px] font-bold">
                          {cell.bMonthBn}
                        </span>
                      )}
                    </span>
                  </div>

                  {/* TWO HALVES: Top = DAY (Sun), Bottom = NIGHT (Moon) */}
                  <div className="flex-1 flex flex-col gap-1">
                    {/* Top Half: DAY */}
                    <button
                      type="button"
                      onClick={(e) => handleHalfClick(e, cell.ymd, 'DAY', dayInfo.dayBookings)}
                      className={`flex-1 w-full px-1.5 py-1 rounded-lg border text-[10px] flex items-center justify-between gap-1 transition-colors cursor-pointer ${dayStyle.className}`}
                      title={
                        dayInfo.dayBookings.length === 0
                          ? language === 'bn'
                            ? 'দিন (Day) স্লট খালি — বুকিং নিতে ট্যাপ করুন'
                            : 'Day slot free — Tap to book'
                          : `${dayInfo.dayBookings[0].customer_name} (${dayInfo.dayBookings[0].booking_number})`
                      }
                    >
                      <div className="flex items-center gap-1 min-w-0">
                        <Sun className="w-3 h-3 shrink-0" />
                        <span className="font-bold truncate">
                          {dayInfo.dayBookings.length === 0
                            ? t('slot_DAY')
                            : dayInfo.dayBookings[0].slot === 'FULL'
                            ? `${t('slot_FULL')}`
                            : dayInfo.dayBookings[0].customer_name}
                        </span>
                      </div>
                      {dayInfo.dayBookings.length > 0 && (
                        <span className="text-[9px] font-mono shrink-0 opacity-90 hidden sm:inline">
                          {dayInfo.dayBookings.length > 1
                            ? `+${dayInfo.dayBookings.length}`
                            : ''}
                        </span>
                      )}
                    </button>

                    {/* Bottom Half: NIGHT */}
                    <button
                      type="button"
                      onClick={(e) => handleHalfClick(e, cell.ymd, 'NIGHT', dayInfo.nightBookings)}
                      className={`flex-1 w-full px-1.5 py-1 rounded-lg border text-[10px] flex items-center justify-between gap-1 transition-colors cursor-pointer ${nightStyle.className}`}
                      title={
                        dayInfo.nightBookings.length === 0
                          ? language === 'bn'
                            ? 'রাত (Night) স্লট খালি — বুকিং নিতে ট্যাপ করুন'
                            : 'Night slot free — Tap to book'
                          : `${dayInfo.nightBookings[0].customer_name} (${dayInfo.nightBookings[0].booking_number})`
                      }
                    >
                      <div className="flex items-center gap-1 min-w-0">
                        <Moon className="w-3 h-3 shrink-0" />
                        <span className="font-bold truncate">
                          {dayInfo.nightBookings.length === 0
                            ? t('slot_NIGHT')
                            : dayInfo.nightBookings[0].slot === 'FULL'
                            ? `${t('slot_FULL')}`
                            : dayInfo.nightBookings[0].customer_name}
                        </span>
                      </div>
                      {dayInfo.nightBookings.length > 0 &&
                        isNightCrossingMidnight(
                          dayInfo.nightBookings[0].start_time,
                          dayInfo.nightBookings[0].end_time
                        ) && (
                          <span
                            className="text-[8px] px-1 rounded bg-black/25 text-white shrink-0 hidden sm:inline"
                            title="Ends after midnight next day"
                          >
                            +1d
                          </span>
                        )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : viewMode === 'week' ? (
        /* ======================== WEEK VIEW (Explicit Day Row & Night Row) ======================== */
        <div className="bg-white dark:bg-[#1E1920] border border-stone-200 dark:border-stone-800 rounded-3xl p-4 overflow-x-auto shadow-xs">
          <table className="w-full min-w-[720px] border-collapse text-xs">
            <thead>
              <tr className="border-b border-stone-200 dark:border-stone-800">
                <th className="p-3 text-left w-32 font-extrabold text-stone-500">
                  {t('slotLabel')}
                </th>
                {weekDays.map((wd) => (
                  <th
                    key={wd.ymd}
                    onClick={() => setSelectedDayYMD(wd.ymd)}
                    className="p-3 text-center cursor-pointer hover:bg-stone-50 dark:hover:bg-stone-900 rounded-xl"
                  >
                    <div className="text-[11px] text-stone-500">
                      {wd.weekdayBn} / {wd.weekdayEn}
                    </div>
                    <div className="text-sm font-extrabold text-stone-900 dark:text-stone-100 mt-0.5">
                      {wd.gDay} • <span className="text-[#582C4D] dark:text-[#C5A059]">{wd.bDayBn} {wd.bMonthBn}</span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-200 dark:divide-stone-800">
              {/* Row 1: DAY SLOT */}
              <tr>
                <td className="p-3 font-extrabold text-amber-800 dark:text-amber-300 bg-amber-50/40 dark:bg-amber-950/20">
                  <div className="flex items-center gap-1.5">
                    <Sun className="w-4 h-4 text-amber-500" />
                    <span>{t('slot_DAY')} (Day)</span>
                  </div>
                </td>
                {weekDays.map((wd) => {
                  const list = bookingsByDate[wd.ymd]?.dayBookings || [];
                  return (
                    <td key={`week-day-${wd.ymd}`} className="p-2 align-top">
                      {list.length === 0 ? (
                        <button
                          onClick={(e) => handleHalfClick(e, wd.ymd, 'DAY', [])}
                          className="w-full h-24 rounded-xl border border-dashed border-emerald-300 dark:border-emerald-800 bg-emerald-50/40 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-300 text-[11px] font-bold flex flex-col items-center justify-center gap-1 hover:bg-emerald-100/60 cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>{t('slotFree')}</span>
                        </button>
                      ) : (
                        <div className="space-y-1.5">
                          {list.map((b) => (
                            <div
                              key={b.id}
                              onClick={() => onOpenBookingDetail(b.id)}
                              className="p-2 rounded-xl bg-[#582C4D] text-white text-[11px] space-y-1 cursor-pointer shadow-xs"
                            >
                              <div className="font-bold truncate">{b.customer_name}</div>
                              <div className="text-[10px] opacity-90 truncate">{b.hall_name}</div>
                              <SlotBadge slot={b.slot as SlotType} size="xs" />
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>

              {/* Row 2: NIGHT SLOT */}
              <tr>
                <td className="p-3 font-extrabold text-indigo-900 dark:text-indigo-300 bg-indigo-50/40 dark:bg-indigo-950/20">
                  <div className="flex items-center gap-1.5">
                    <Moon className="w-4 h-4 text-indigo-500" />
                    <span>{t('slot_NIGHT')} (Night)</span>
                  </div>
                </td>
                {weekDays.map((wd) => {
                  const list = bookingsByDate[wd.ymd]?.nightBookings || [];
                  return (
                    <td key={`week-night-${wd.ymd}`} className="p-2 align-top">
                      {list.length === 0 ? (
                        <button
                          onClick={(e) => handleHalfClick(e, wd.ymd, 'NIGHT', [])}
                          className="w-full h-24 rounded-xl border border-dashed border-emerald-300 dark:border-emerald-800 bg-emerald-50/40 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-300 text-[11px] font-bold flex flex-col items-center justify-center gap-1 hover:bg-emerald-100/60 cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>{t('slotFree')}</span>
                        </button>
                      ) : (
                        <div className="space-y-1.5">
                          {list.map((b) => {
                            const crosses = isNightCrossingMidnight(b.start_time, b.end_time);
                            return (
                              <div
                                key={b.id}
                                onClick={() => onOpenBookingDetail(b.id)}
                                className="p-2 rounded-xl bg-indigo-900 text-white text-[11px] space-y-1 cursor-pointer shadow-xs"
                              >
                                <div className="font-bold truncate">{b.customer_name}</div>
                                <div className="text-[10px] opacity-90 truncate">{b.hall_name}</div>
                                <SlotBadge slot={b.slot as SlotType} size="xs" />
                                {crosses && (
                                  <div className="text-[10px] text-amber-300 font-bold">
                                    🌙{' '}
                                    {language === 'bn'
                                      ? `পরদিন ${formatTimeString12(b.end_time, 'bn')} এ শেষ`
                                      : `Ends ${formatTimeString12(b.end_time, 'en')} next day`}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
      ) : (
        /* ======================== LIST VIEW ======================== */
        <div className="space-y-3">
          {bookings.length === 0 ? (
            <div className="p-8 text-center text-xs sm:text-sm text-stone-500 bg-white dark:bg-[#1E1920] rounded-2xl border border-stone-200 dark:border-stone-800">
              {language === 'bn'
                ? 'এই মাসে কোনো বুকিং নেই।'
                : 'No bookings scheduled in this month.'}
            </div>
          ) : (
            bookings.map((b) => {
              const crosses =
                (b.slot === 'NIGHT' || b.slot === 'FULL') &&
                isNightCrossingMidnight(b.start_time, b.end_time);
              return (
                <div
                  key={b.id}
                  onClick={() => onOpenBookingDetail(b.id)}
                  className="p-4 rounded-2xl bg-white dark:bg-[#1E1920] border border-stone-200 dark:border-stone-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer hover:border-[#582C4D]"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono font-extrabold text-xs text-[#582C4D] dark:text-[#C5A059]">
                        {b.booking_number}
                      </span>
                      <SlotBadge slot={b.slot as SlotType} size="xs" showDualLang />
                      <span className="text-xs font-bold text-stone-900 dark:text-stone-100">
                        {formatDualDateFromYMD(b.event_date)}
                      </span>
                    </div>
                    <div className="text-xs sm:text-sm font-bold text-stone-900 dark:text-stone-100 break-words">
                      {b.customer_name} — {b.hall_name} ({t(`event_${b.event_type}` as any)})
                    </div>
                    <div className="text-xs text-stone-500">
                      {formatTimeString12(b.start_time, language)} –{' '}
                      {formatTimeString12(b.end_time, language)}
                      {crosses && (
                        <span className="ml-2 font-bold text-indigo-600 dark:text-indigo-400">
                          (
                          {language === 'bn'
                            ? `পরদিন ${formatDualDateFromYMD(getNextDayYMD(b.event_date))} এ শেষ`
                            : `Ends next day ${formatDualDateFromYMD(getNextDayYMD(b.event_date))}`}
                          )
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
      </SectionLoader>

      {/* Day Cell Tap Modal: Shows Full Dual Date with Weekday + Day and Night Bookings */}
      <Modal
        isOpen={Boolean(selectedDayYMD)}
        onClose={() => setSelectedDayYMD(null)}
        title={selectedDayYMD ? formatFullDualDateWithWeekdayFromYMD(selectedDayYMD) : ''}
        maxWidth="md"
      >
        {selectedDayYMD && (
          <div className="space-y-5">
            {/* DAY Half Section */}
            <div className="p-4 rounded-2xl bg-amber-50/60 dark:bg-amber-950/25 border border-amber-200 dark:border-amber-800 space-y-3">
              <div className="flex items-center justify-between">
                <SlotBadge slot="DAY" size="sm" showDualLang />
                {canCreate && (
                  <button
                    onClick={() => {
                      const ymd = selectedDayYMD;
                      setSelectedDayYMD(null);
                      onStartBookingFromSlot({
                        event_date: ymd,
                        slot: 'DAY',
                        hall_id: selectedHallId || undefined,
                      });
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-[#582C4D] text-white text-xs font-bold cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{language === 'bn' ? 'দিন স্লট বুক করুন' : 'Book Day Slot'}</span>
                  </button>
                )}
              </div>

              {selectedDayData.dayBookings.length === 0 ? (
                <p className="text-xs text-emerald-700 dark:text-emerald-300 font-semibold">
                  ✓ {language === 'bn' ? 'দিনের স্লট খালি আছে' : 'Day slot is free'}
                </p>
              ) : (
                <div className="space-y-2">
                  {selectedDayData.dayBookings.map((b) => (
                    <div
                      key={b.id}
                      onClick={() => {
                        setSelectedDayYMD(null);
                        onOpenBookingDetail(b.id);
                      }}
                      className="p-3 rounded-xl bg-white dark:bg-stone-900 border border-amber-200 dark:border-amber-800 text-xs space-y-1 cursor-pointer hover:border-[#582C4D]"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-bold text-[#582C4D] dark:text-[#C5A059]">
                          {b.booking_number}
                        </span>
                        <SlotBadge slot={b.slot as SlotType} size="xs" />
                      </div>
                      <div className="font-bold text-stone-900 dark:text-stone-100 break-words">
                        {b.customer_name} ({b.customer_phone})
                      </div>
                      <div className="text-stone-500">
                        🏛️ {b.hall_name} • {formatTimeString12(b.start_time, language)} –{' '}
                        {formatTimeString12(b.end_time, language)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* NIGHT Half Section */}
            <div className="p-4 rounded-2xl bg-indigo-50/60 dark:bg-indigo-950/25 border border-indigo-200 dark:border-indigo-800 space-y-3">
              <div className="flex items-center justify-between">
                <SlotBadge slot="NIGHT" size="sm" showDualLang />
                {canCreate && (
                  <button
                    onClick={() => {
                      const ymd = selectedDayYMD;
                      setSelectedDayYMD(null);
                      onStartBookingFromSlot({
                        event_date: ymd,
                        slot: 'NIGHT',
                        hall_id: selectedHallId || undefined,
                      });
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-[#582C4D] text-white text-xs font-bold cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{language === 'bn' ? 'রাত স্লট বুক করুন' : 'Book Night Slot'}</span>
                  </button>
                )}
              </div>

              {selectedDayData.nightBookings.length === 0 ? (
                <p className="text-xs text-emerald-700 dark:text-emerald-300 font-semibold">
                  ✓ {language === 'bn' ? 'রাতের স্লট খালি আছে' : 'Night slot is free'}
                </p>
              ) : (
                <div className="space-y-2">
                  {selectedDayData.nightBookings.map((b) => {
                    const crosses = isNightCrossingMidnight(b.start_time, b.end_time);
                    return (
                      <div
                        key={b.id}
                        onClick={() => {
                          setSelectedDayYMD(null);
                          onOpenBookingDetail(b.id);
                        }}
                        className="p-3 rounded-xl bg-white dark:bg-stone-900 border border-indigo-200 dark:border-indigo-800 text-xs space-y-1 cursor-pointer hover:border-[#582C4D]"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono font-bold text-[#582C4D] dark:text-[#C5A059]">
                            {b.booking_number}
                          </span>
                          <SlotBadge slot={b.slot as SlotType} size="xs" />
                        </div>
                        <div className="font-bold text-stone-900 dark:text-stone-100 break-words">
                          {b.customer_name} ({b.customer_phone})
                        </div>
                        <div className="text-stone-500">
                          🏛️ {b.hall_name} • {formatTimeString12(b.start_time, language)} –{' '}
                          {formatTimeString12(b.end_time, language)}
                        </div>
                        {crosses && (
                          <div className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400">
                            🌙{' '}
                            {language === 'bn'
                              ? `পরদিন (${formatDualDateFromYMD(getNextDayYMD(b.event_date))}) ${formatTimeString12(b.end_time, 'bn')} এ শেষ`
                              : `Ends ${formatTimeString12(b.end_time, 'en')} next day (${formatDualDateFromYMD(getNextDayYMD(b.event_date))})`}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
