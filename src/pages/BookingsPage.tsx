import React, { useState, useEffect } from 'react';
import {
  CalendarDays,
  Search,
  Plus,
  Filter,
  Sparkles,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Users,
  Eye,
  Building2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.js';
import { useToast } from '../components/Toast.js';
import { LoadingSkeleton } from '../components/LoadingSkeleton.js';
import { EmptyState } from '../components/EmptyState.js';
import { SlotBadge, type SlotType } from '../components/SlotBadge.js';
import {
  BookingWizardModal,
  type BookingFormInitialData,
} from '../components/BookingWizardModal.js';
import { BookingDetailModal } from '../components/BookingDetailModal.js';
import {
  formatDualDateFromYMD,
  formatCurrency,
  formatNumberByLanguage,
  formatTimeString12,
  getNextDayYMD,
  isNightCrossingMidnight,
} from '../lib/dateUtils.js';
import { apiRequest } from '../lib/api.js';
import type { HallItem } from './HallsPage.js';

export interface BookingsExternalFilter {
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  slot?: string;
}

interface BookingsPageProps {
  externalWizardData?: BookingFormInitialData | null;
  onClearExternalWizard?: () => void;
  externalDetailBookingId?: string | null;
  onClearExternalDetail?: () => void;
  externalFilter?: BookingsExternalFilter | null;
  onClearExternalFilter?: () => void;
}

export const BookingsPage: React.FC<BookingsPageProps> = ({
  externalWizardData,
  onClearExternalWizard,
  externalDetailBookingId,
  onClearExternalDetail,
  externalFilter,
  onClearExternalFilter,
}) => {
  const { activeRoom, activeMember, language, t } = useAuth();
  const { showSuccess, showError } = useToast();

  const [bookings, setBookings] = useState<any[]>([]);
  const [halls, setHalls] = useState<HallItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [slotFilter, setSlotFilter] = useState('');
  const [hallFilter, setHallFilter] = useState('');
  const [eventTypeFilter, setEventTypeFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sortBy, setSortBy] = useState('event_date_desc');

  // Modals
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardInitialData, setWizardInitialData] = useState<BookingFormInitialData | null>(null);
  const [detailBookingId, setDetailBookingId] = useState<string | null>(null);
  const [seedingDemo, setSeedingDemo] = useState(false);

  const role = activeMember?.role;
  const canCreate = role === 'OWNER' || role === 'MANAGER' || role === 'STAFF';
  const canManageDemo = role === 'OWNER' || role === 'MANAGER';
  const canSeeMoney = role === 'OWNER' || role === 'MANAGER';

  useEffect(() => {
    if (activeRoom) {
      apiRequest<{ halls: HallItem[] }>(`/api/rooms/${activeRoom.id}/halls`)
        .then((res) => setHalls(res.halls || []))
        .catch(() => { });
    }
  }, [activeRoom]);

  useEffect(() => {
    if (activeRoom) {
      fetchBookings();
    }
  }, [
    activeRoom,
    search,
    statusFilter,
    slotFilter,
    hallFilter,
    eventTypeFilter,
    dateFrom,
    dateTo,
    sortBy,
    page,
  ]);

  useEffect(() => {
    if (externalWizardData) {
      setWizardInitialData(externalWizardData);
      setWizardOpen(true);
      if (onClearExternalWizard) onClearExternalWizard();
    }
  }, [externalWizardData]);

  useEffect(() => {
    if (externalDetailBookingId) {
      setDetailBookingId(externalDetailBookingId);
      if (onClearExternalDetail) onClearExternalDetail();
    }
  }, [externalDetailBookingId]);

  useEffect(() => {
    if (externalFilter) {
      setStatusFilter(externalFilter.status || '');
      setDateFrom(externalFilter.dateFrom || '');
      setDateTo(externalFilter.dateTo || '');
      setSlotFilter(externalFilter.slot || '');
      setPage(1);
      if (onClearExternalFilter) onClearExternalFilter();
    }
  }, [externalFilter]);

  const fetchBookings = async () => {
    if (!activeRoom) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        search,
        status: statusFilter,
        slot: slotFilter,
        hallId: hallFilter,
        eventType: eventTypeFilter,
        dateFrom,
        dateTo,
        sortBy,
        page: String(page),
        limit: '15',
      });
      const res = await apiRequest<{
        bookings: any[];
        total: number;
        page: number;
        totalPages: number;
      }>(`/api/rooms/${activeRoom.id}/bookings?${params.toString()}`);

      setBookings(res.bookings || []);
      setTotal(res.total || 0);
      setTotalPages(res.totalPages || 1);
    } catch (err: any) {
      showError(language === 'bn' ? err.messageBn : err.messageEn);
    } finally {
      setLoading(false);
    }
  };

  const handleSeedDemoData = async () => {
    if (!activeRoom || seedingDemo) return;
    setSeedingDemo(true);
    try {
      const res = await apiRequest(`/api/rooms/${activeRoom.id}/demo-data/seed`, {
        method: 'POST',
      });
      showSuccess(language === 'bn' ? res.messageBn : res.messageEn);
      const hRes = await apiRequest<{ halls: HallItem[] }>(`/api/rooms/${activeRoom.id}/halls`);
      setHalls(hRes.halls || []);
      await fetchBookings();
    } catch (err: any) {
      showError(language === 'bn' ? err.messageBn : err.messageEn);
    } finally {
      setSeedingDemo(false);
    }
  };

  const handleClearDemoData = async () => {
    if (!activeRoom || seedingDemo) return;
    setSeedingDemo(true);
    try {
      const res = await apiRequest(`/api/rooms/${activeRoom.id}/demo-data`, {
        method: 'DELETE',
      });
      showSuccess(language === 'bn' ? res.messageBn : res.messageEn);
      const hRes = await apiRequest<{ halls: HallItem[] }>(`/api/rooms/${activeRoom.id}/halls`);
      setHalls(hRes.halls || []);
      await fetchBookings();
    } catch (err: any) {
      showError(language === 'bn' ? err.messageBn : err.messageEn);
    } finally {
      setSeedingDemo(false);
    }
  };

  const openEditWizard = (b: any) => {
    setWizardInitialData({
      bookingId: b.id,
      event_date: b.event_date,
      slot: b.slot,
      hall_id: b.hall_id,
      customer_id: b.customer_id,
      event_type: b.event_type,
      start_time: b.start_time,
      end_time: b.end_time,
      guest_count: b.guest_count,
      package_name: b.package_name,
      extra_services: b.extra_services,
      hall_rent: b.hall_rent,
      advance_amount: b.advance_amount,
      status: b.status === 'TENTATIVE' ? 'TENTATIVE' : 'CONFIRMED',
      notes: b.notes,
    });
    setWizardOpen(true);
  };

  const getStatusChip = (status: string) => {
    const map: Record<string, string> = {
      CONFIRMED:
        'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/70 dark:text-emerald-300 dark:border-emerald-800',
      TENTATIVE:
        'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/70 dark:text-amber-300 dark:border-amber-800',
      COMPLETED:
        'bg-sky-100 text-sky-800 border-sky-300 dark:bg-sky-950/70 dark:text-sky-300 dark:border-sky-800',
      CANCELLED:
        'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950/70 dark:text-rose-300 dark:border-rose-800',
      NO_SHOW:
        'bg-stone-200 text-stone-700 border-stone-300 dark:bg-stone-800 dark:text-stone-300',
    };
    return (
      <span
        className={`inline-flex px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${map[status] || map.NO_SHOW
          }`}
      >
        {t(`bStatus_${status}` as any)}
      </span>
    );
  };

  const hasDemoBookings = bookings.some((b) => b.is_demo === 1);

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-stone-200 dark:border-stone-800 pb-5">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-stone-900 dark:text-stone-100 flex items-center gap-2.5">
            <CalendarDays className="w-6 h-6 text-[#582C4D] dark:text-[#C5A059]" />
            <span>{t('bookingsPageTitle')}</span>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300 font-mono">
              {formatNumberByLanguage(total, language)}
            </span>
          </h1>
          <p className="text-xs sm:text-sm text-stone-500 dark:text-stone-400 mt-1">
            {t('bookingsPageSubtitle')}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canManageDemo && (
            <>
              <button
                onClick={handleSeedDemoData}
                disabled={seedingDemo}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-100 hover:bg-amber-200 dark:bg-amber-950/60 dark:hover:bg-amber-900/70 text-amber-900 dark:text-amber-200 border border-amber-300 dark:border-amber-800 text-xs font-bold transition-colors cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>{t('seedDemoBtn')}</span>
              </button>

              {hasDemoBookings && (
                <button
                  onClick={handleClearDemoData}
                  disabled={seedingDemo}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 text-xs font-bold transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{t('clearDemoBtn')}</span>
                </button>
              )}
            </>
          )}

          {canCreate && (
            <button
              onClick={() => {
                setWizardInitialData(null);
                setWizardOpen(true);
              }}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#582C4D] hover:bg-[#6C375F] text-white text-xs sm:text-sm font-bold shadow-md transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>{t('newBookingBtn')}</span>
            </button>
          )}
        </div>
      </div>

      {/* Search & Filters Bar */}
      <div className="p-4 rounded-2xl bg-white dark:bg-[#1E1920] border border-stone-200 dark:border-stone-800 shadow-xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Search input */}
          <div className="relative sm:col-span-2">
            <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder={
                language === 'bn'
                  ? 'বুকিং নম্বর (LCC-2026-...), গ্রাহকের নাম বা ফোন নম্বর...'
                  : 'Search booking number (LCC-2026-...), customer name or phone...'
              }
              className="w-full pl-10 pr-4 py-2 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-900 text-xs sm:text-sm"
            />
          </div>

          {/* Slot Filter */}
          <select
            value={slotFilter}
            onChange={(e) => {
              setSlotFilter(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-900 text-xs font-bold"
          >
            <option value="">{language === 'bn' ? 'সকল স্লট (দিন/রাত/দিন ও রাত)' : 'All Slots (Day/Night/Full)'}</option>
            <option value="DAY">☀️ {t('slot_DAY')} (Day)</option>
            <option value="NIGHT">🌙 {t('slot_NIGHT')} (Night)</option>
            <option value="FULL">☀️🌙 {t('slot_FULL')} (Full)</option>
          </select>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-900 text-xs font-bold"
          >
            <option value="">{language === 'bn' ? 'সকল অবস্থা (All Statuses)' : 'All Statuses'}</option>
            <option value="CONFIRMED">{t('bStatus_CONFIRMED')}</option>
            <option value="TENTATIVE">{t('bStatus_TENTATIVE')}</option>
            <option value="COMPLETED">{t('bStatus_COMPLETED')}</option>
            <option value="CANCELLED">{t('bStatus_CANCELLED')}</option>
            <option value="NO_SHOW">{t('bStatus_NO_SHOW')}</option>
          </select>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Hall Filter */}
          <select
            value={hallFilter}
            onChange={(e) => {
              setHallFilter(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-900 text-xs font-semibold"
          >
            <option value="">{language === 'bn' ? 'সকল হল (All Halls)' : 'All Halls'}</option>
            {halls.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
              </option>
            ))}
          </select>

          {/* Event Type Filter */}
          <select
            value={eventTypeFilter}
            onChange={(e) => {
              setEventTypeFilter(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-900 text-xs font-semibold"
          >
            <option value="">{language === 'bn' ? 'সকল অনুষ্ঠানের ধরন' : 'All Event Types'}</option>
            {['WEDDING', 'HOLUD', 'RECEPTION', 'ENGAGEMENT', 'BIRTHDAY', 'AQIQAH', 'MEETING', 'OTHER'].map(
              (ev) => (
                <option key={ev} value={ev}>
                  {t(`event_${ev}` as any)}
                </option>
              )
            )}
          </select>

          {/* Date From */}
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => {
              setDateFrom(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-900 text-xs font-mono"
            title="From Date"
          />

          {/* Date To */}
          <input
            type="date"
            value={dateTo}
            onChange={(e) => {
              setDateTo(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-900 text-xs font-mono"
            title="To Date"
          />

          {/* Sort By */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="px-3 py-2 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-900 text-xs font-semibold"
          >
            <option value="event_date_desc">
              {language === 'bn' ? 'তারিখ (নতুন থেকে পুরাতন)' : 'Event Date (Newest)'}
            </option>
            <option value="event_date_asc">
              {language === 'bn' ? 'তারিখ (আসন্ন আগে)' : 'Event Date (Oldest/Upcoming)'}
            </option>
            <option value="created_desc">
              {language === 'bn' ? 'তৈরির সময় (সর্বশেষ আগে)' : 'Created Time (Latest)'}
            </option>
            <option value="booking_number">
              {language === 'bn' ? 'বুকিং নম্বর অনুযায়ী' : 'Booking Number'}
            </option>
          </select>
        </div>
      </div>

      {/* Bookings List: Table on Desktop, Card View on Mobile */}
      {loading ? (
        <LoadingSkeleton rows={5} />
      ) : bookings.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title={language === 'bn' ? 'কোনো বুকিং পাওয়া যায়নি' : 'No bookings found'}
          description={
            language === 'bn'
              ? 'নতুন বুকিং তৈরি করুন অথবা উপরের "ডেমো ডেটা লোড করুন" বাটনে ক্লিক করে দিন/রাত/দিন ও রাত স্লটের নমুনা বুকিং দেখুন।'
              : 'Create a new booking or click "Seed Demo Data" above to explore Day, Night, and Full slot bookings.'
          }
        />
      ) : (
        <>
          {/* Desktop Table View */}
          <div className="hidden md:block bg-white dark:bg-[#1E1920] border border-stone-200 dark:border-stone-800 rounded-2xl overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-stone-50 dark:bg-stone-900/70 border-b border-stone-200 dark:border-stone-800 font-bold text-stone-500 uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-3.5">{t('bookingNumberLabel')}</th>
                    <th className="px-4 py-3.5">{t('eventDateLabel')}</th>
                    <th className="px-4 py-3.5">{t('slotLabel')}</th>
                    <th className="px-4 py-3.5">{language === 'bn' ? 'হল ও অনুষ্ঠান' : 'Hall & Event'}</th>
                    <th className="px-4 py-3.5">{language === 'bn' ? 'গ্রাহক' : 'Customer'}</th>
                    <th className="px-4 py-3.5">{t('status')}</th>
                    {canSeeMoney && (
                      <>
                        <th className="px-4 py-3.5 text-right">{t('totalAmountLabel')}</th>
                        <th className="px-4 py-3.5 text-right">{t('dueAmountLabel')}</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 dark:divide-stone-800/80">
                  {bookings.map((b) => {
                    const crossesMidnight =
                      (b.slot === 'NIGHT' || b.slot === 'FULL') &&
                      isNightCrossingMidnight(b.start_time, b.end_time);

                    return (
                      <tr
                        key={b.id}
                        onClick={() => setDetailBookingId(b.id)}
                        className="hover:bg-stone-50/70 dark:hover:bg-stone-900/50 transition-colors cursor-pointer"
                      >
                        <td className="px-4 py-3.5">
                          <div className="font-mono font-extrabold text-sm text-[#582C4D] dark:text-[#C5A059] flex items-center gap-1.5">
                            <span>{b.booking_number}</span>
                            {b.is_demo === 1 && (
                              <span className="px-1.5 py-0.2 rounded text-[9px] font-sans font-bold bg-amber-500 text-white">
                                DEMO
                              </span>
                            )}
                          </div>
                        </td>

                        <td className="px-4 py-3.5">
                          <div className="font-bold text-stone-900 dark:text-stone-100">
                            {formatDualDateFromYMD(b.event_date)}
                          </div>
                          <div className="text-[11px] text-stone-500 mt-0.5">
                            {formatTimeString12(b.start_time, language)} –{' '}
                            {formatTimeString12(b.end_time, language)}
                            {crossesMidnight && (
                              <span className="ml-1 font-bold text-indigo-600 dark:text-indigo-400">
                                ({language === 'bn' ? 'পরদিন শেষ' : 'ends next day'})
                              </span>
                            )}
                          </div>
                        </td>

                        <td className="px-4 py-3.5">
                          <SlotBadge slot={b.slot as SlotType} size="sm" />
                        </td>

                        <td className="px-4 py-3.5">
                          <div className="font-bold text-stone-900 dark:text-stone-100">
                            {b.hall_name}
                          </div>
                          <div className="text-[11px] text-stone-500">
                            {t(`event_${b.event_type}` as any)} •{' '}
                            {formatNumberByLanguage(b.guest_count, language)} {t('guestsUnit')}
                          </div>
                        </td>

                        <td className="px-4 py-3.5 max-w-[220px]">
                          <div className="font-bold text-stone-900 dark:text-stone-100 break-words leading-snug">
                            {b.customer_name}
                          </div>
                          <div className="text-[11px] font-mono text-stone-500">
                            {b.customer_phone}
                          </div>
                        </td>

                        <td className="px-4 py-3.5">{getStatusChip(b.status)}</td>

                        {canSeeMoney && (
                          <>
                            <td className="px-4 py-3.5 text-right font-bold text-stone-900 dark:text-stone-100">
                              {formatCurrency(b.total_amount || 0, language)}
                            </td>

                            <td className="px-4 py-3.5 text-right font-extrabold text-rose-600 dark:text-rose-400">
                              {formatCurrency(b.due_amount || 0, language)}
                            </td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile Card View (<768px, tested down to 360px) */}
          <div className="md:hidden space-y-3">
            {bookings.map((b) => {
              const crossesMidnight =
                (b.slot === 'NIGHT' || b.slot === 'FULL') &&
                isNightCrossingMidnight(b.start_time, b.end_time);

              return (
                <div
                  key={b.id}
                  onClick={() => setDetailBookingId(b.id)}
                  className="p-4 rounded-2xl bg-white dark:bg-[#1E1920] border border-stone-200 dark:border-stone-800 shadow-xs space-y-2.5 cursor-pointer"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-extrabold text-sm text-[#582C4D] dark:text-[#C5A059]">
                        {b.booking_number}
                      </span>
                      <SlotBadge slot={b.slot as SlotType} size="xs" />
                    </div>
                    {getStatusChip(b.status)}
                  </div>

                  <div className="text-xs font-bold text-stone-900 dark:text-stone-100 break-words">
                    {b.customer_name} ({b.customer_phone})
                  </div>

                  <div className="text-xs text-stone-600 dark:text-stone-300">
                    <div>📅 {formatDualDateFromYMD(b.event_date)}</div>
                    <div className="mt-0.5">
                      ⏰ {formatTimeString12(b.start_time, language)} –{' '}
                      {formatTimeString12(b.end_time, language)}
                      {crossesMidnight && (
                        <span className="ml-1 font-bold text-indigo-600 dark:text-indigo-400">
                          ({language === 'bn' ? 'পরদিন শেষ' : 'ends next day'})
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5">
                      🏛️ {b.hall_name} • {t(`event_${b.event_type}` as any)}
                    </div>
                  </div>

                  {canSeeMoney && (
                    <div className="pt-2 border-t border-stone-100 dark:border-stone-800 flex items-center justify-between text-xs">
                      <span>
                        {t('totalAmountLabel')}:{' '}
                        <strong>{formatCurrency(b.total_amount || 0, language)}</strong>
                      </span>
                      <span className="text-rose-600 font-bold">
                        {t('dueAmountLabel')}: {formatCurrency(b.due_amount || 0, language)}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Pagination Bar */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <span className="text-xs text-stone-500">
                {language === 'bn'
                  ? `পৃষ্ঠা ${formatNumberByLanguage(page, 'bn')} / ${formatNumberByLanguage(totalPages, 'bn')}`
                  : `Page ${page} of ${totalPages}`}
              </span>
              <div className="flex items-center gap-2">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="p-2 rounded-xl border border-stone-200 dark:border-stone-700 disabled:opacity-40 cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="p-2 rounded-xl border border-stone-200 dark:border-stone-700 disabled:opacity-40 cursor-pointer"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Multi-Step Booking Wizard Modal */}
      <BookingWizardModal
        isOpen={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onSaved={(savedId) => {
          fetchBookings();
          setDetailBookingId(savedId);
        }}
        initialData={wizardInitialData}
      />

      {/* Booking Detail & Print Slip Modal */}
      <BookingDetailModal
        bookingId={detailBookingId}
        isOpen={Boolean(detailBookingId)}
        onClose={() => setDetailBookingId(null)}
        onEditBooking={(b) => openEditWizard(b)}
        onUpdated={fetchBookings}
      />
    </div>
  );
};
