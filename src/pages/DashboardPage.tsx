import React, { useState, useEffect, useMemo } from 'react';
import {
  Plus,
  CreditCard,
  UserPlus,
  CalendarRange,
  CalendarDays,
  Clock,
  Sun,
  Moon,
  Building2,
  AlertTriangle,
  BellRing,
  BarChart3,
  PieChart,
  History,
  Sparkles,
  ArrowRight,
  Receipt,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.js';
import { useToast } from '../components/Toast.js';
import { Modal } from '../components/Modal.js';
import { SectionLoader } from '../components/Loader.js';
import { ActionButton, useUnsavedChanges } from '../components/ActionButton.js';
import { DualDatePicker } from '../components/DualDatePicker.js';
import { SlotBadge, type SlotType } from '../components/SlotBadge.js';
import {
  getDhakaParts,
  getBengaliDate,
  parseEventDateToDhakaDate,
  formatDualDate,
  formatDualDateFromYMD,
  formatFullDualDateWithWeekdayFromYMD,
  formatDualMonthHeader,
  formatCurrency,
  formatNumberByLanguage,
  formatTimeString12,
  getTodayDhakaYMD,
  isNightCrossingMidnight,
  WEEKDAYS,
} from '../lib/dateUtils.js';
import { apiRequest, generateIdempotencyKey } from '../lib/api.js';
import type { ActiveTab } from '../components/Sidebar.js';
import type { BookingFormInitialData } from '../components/BookingWizardModal.js';
import type { ExpenseCategory } from './ExpensesPage.js';

const HOME_COST_CATEGORIES: ExpenseCategory[] = [
  'ELECTRICITY',
  'SALARY',
  'REPAIR',
  'CLEANING',
  'DECORATION_MATERIAL',
  'FOOD',
  'OTHER',
];

interface DashboardPageProps {
  onNavigateTab: (tab: ActiveTab) => void;
  onOpenNewBooking: (prefill?: BookingFormInitialData) => void;
  onOpenBookingDetail: (bookingId: string) => void;
  onNavigateBookingsFilter?: (filter: {
    status?: string;
    dateFrom?: string;
    dateTo?: string;
    slot?: string;
  }) => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  onNavigateTab,
  onOpenNewBooking,
  onOpenBookingDetail,
  onNavigateBookingsFilter,
}) => {
  const { user, activeRoom, activeMember, language, t } = useAuth();
  const { showSuccess, showError } = useToast();

  const [dashboard, setDashboard] = useState<any | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [seedingDemo, setSeedingDemo] = useState<boolean>(false);

  // Record Payment quick action modal (pick booking to record payment on)
  const [recordPayModalOpen, setRecordPayModalOpen] = useState(false);

  // Add Customer quick action modal
  const [addCustModalOpen, setAddCustModalOpen] = useState(false);
  const [newCustName, setNewCustName] = useState('');
  const [newCustPhone, setNewCustPhone] = useState('');
  const [newCustAddress, setNewCustAddress] = useState('');
  const [custIdemKey, setCustIdemKey] = useState('');
  const [savingCust, setSavingCust] = useState(false);

  // Quick "Add Cost" modal directly from Home (Section 6)
  const [addCostModalOpen, setAddCostModalOpen] = useState(false);
  const [costCategory, setCostCategory] = useState<ExpenseCategory>('ELECTRICITY');
  const [costAmount, setCostAmount] = useState<string>('');
  const [costDate, setCostDate] = useState<string>(() => getTodayDhakaYMD());
  const [costNote, setCostNote] = useState<string>('');
  const [costReceiptBase64, setCostReceiptBase64] = useState<string | null>(null);
  const [costReceiptFileName, setCostReceiptFileName] = useState<string>('');
  const [costIdemKey, setCostIdemKey] = useState<string>('');
  const [savingCost, setSavingCost] = useState<boolean>(false);

  // Mini Calendar day inspection modal
  const [selectedMiniDateYMD, setSelectedMiniDateYMD] = useState<string | null>(null);

  const role = activeMember?.role;
  const canCreate = role === 'OWNER' || role === 'MANAGER' || role === 'STAFF';
  const canSeeMoney = role === 'OWNER' || role === 'MANAGER';
  const canAddCost =
    role === 'OWNER' ||
    role === 'MANAGER' ||
    (role === 'STAFF' && Number(activeRoom?.allow_staff_costs || 0) === 1);

  const isCustDirty =
    addCustModalOpen &&
    (newCustName.trim().length > 0 ||
      newCustPhone.trim().length > 0 ||
      newCustAddress.trim().length > 0);
  const isCostDirty =
    addCostModalOpen &&
    (costAmount.trim().length > 0 ||
      costNote.trim().length > 0 ||
      Boolean(costReceiptBase64));

  useUnsavedChanges(isCustDirty || isCostDirty);

  useEffect(() => {
    if (activeRoom) {
      fetchDashboard();
    }
  }, [activeRoom?.id, role]);

  const fetchDashboard = async () => {
    if (!activeRoom) return;
    setLoading(true);
    setFetchError(null);
    try {
      const res = await apiRequest<{ dashboard: any }>(
        `/api/rooms/${activeRoom.id}/dashboard`
      );
      setDashboard(res.dashboard);
    } catch (err: any) {
      const msg =
        language === 'bn'
          ? err.messageBn || 'ড্যাশবোর্ড লোড করতে সমস্যা হয়েছে। ইন্টারনেট সংযোগ যাচাই করুন।'
          : err.messageEn || 'Failed to load dashboard. Please check your connection and retry.';
      setFetchError(msg);
      showError(msg);
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
        idempotencyKey: generateIdempotencyKey('seed-demo'),
      });
      showSuccess(language === 'bn' ? res.messageBn : res.messageEn);
      await fetchDashboard();
    } catch (err: any) {
      showError(language === 'bn' ? err.messageBn : err.messageEn);
    } finally {
      setSeedingDemo(false);
    }
  };

  const openQuickAddCustomerModal = () => {
    setNewCustName('');
    setNewCustPhone('');
    setNewCustAddress('');
    setCustIdemKey(generateIdempotencyKey('home-cust'));
    setAddCustModalOpen(true);
  };

  const handleCloseAddCustomerModal = () => {
    if (isCustDirty && !savingCust) {
      const msg =
        language === 'bn'
          ? 'অসংরক্ষিত গ্রাহকের তথ্য রয়েছে। আপনি কি নিশ্চিতভাবে বন্ধ করতে চান?'
          : 'You have unsaved customer details. Discard changes?';
      if (!window.confirm(msg)) return;
    }
    setAddCustModalOpen(false);
  };

  const handleQuickAddCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeRoom || savingCust) return;
    setSavingCust(true);
    try {
      const res = await apiRequest(`/api/rooms/${activeRoom.id}/customers`, {
        method: 'POST',
        idempotencyKey: custIdemKey || generateIdempotencyKey('home-cust'),
        body: JSON.stringify({
          name: newCustName.trim(),
          phone: newCustPhone.trim(),
          address: newCustAddress.trim() || null,
        }),
      });
      showSuccess(language === 'bn' ? res.messageBn : res.messageEn);
      setAddCustModalOpen(false);
      setNewCustName('');
      setNewCustPhone('');
      setNewCustAddress('');
      await fetchDashboard();
    } catch (err: any) {
      showError(language === 'bn' ? err.messageBn || err.message : err.messageEn || err.message);
    } finally {
      setSavingCust(false);
    }
  };

  const openQuickAddCostModal = () => {
    setCostCategory('ELECTRICITY');
    setCostAmount('');
    setCostDate(getTodayDhakaYMD());
    setCostNote('');
    setCostReceiptBase64(null);
    setCostReceiptFileName('');
    setCostIdemKey(generateIdempotencyKey('home-cost'));
    setAddCostModalOpen(true);
  };

  const handleCloseAddCostModal = () => {
    if (isCostDirty && !savingCost) {
      const msg =
        language === 'bn'
          ? 'অসংরক্ষিত খরচের তথ্য রয়েছে। আপনি কি নিশ্চিতভাবে বন্ধ করতে চান?'
          : 'You have unsaved cost details. Discard changes?';
      if (!window.confirm(msg)) return;
    }
    setAddCostModalOpen(false);
  };

  const handleCostReceiptFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      setCostReceiptBase64(null);
      setCostReceiptFileName('');
      return;
    }

    if (!['image/png', 'image/jpeg', 'image/jpg', 'image/webp'].includes(file.type)) {
      showError(
        language === 'bn'
          ? 'শুধুমাত্র PNG, JPG অথবা WebP ফরম্যাটের ছবি আপলোড করা যাবে।'
          : 'Only PNG, JPEG, or WebP images are permitted.'
      );
      e.target.value = '';
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      showError(
        language === 'bn'
          ? 'ছবির আকার সর্বোচ্চ ২ মেগাবাইট (2MB) হতে পারবে।'
          : 'Image size must not exceed 2 MB.'
      );
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setCostReceiptBase64(reader.result);
        setCostReceiptFileName(file.name);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleQuickSaveCost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeRoom || savingCost) return;

    const amt = parseFloat(costAmount);
    if (isNaN(amt) || amt <= 0) {
      showError(
        language === 'bn'
          ? 'খরচের পরিমাণ অবশ্যই শূন্যের চেয়ে বেশি হতে হবে।'
          : 'Cost amount must be greater than zero.'
      );
      return;
    }

    setSavingCost(true);
    try {
      const key = costIdemKey || generateIdempotencyKey('home-cost');
      const res = await apiRequest(`/api/rooms/${activeRoom.id}/expenses`, {
        method: 'POST',
        idempotencyKey: key,
        body: JSON.stringify({
          category: costCategory,
          amount: amt,
          expense_date: costDate,
          note: costNote.trim() || null,
          receipt_image_base64: costReceiptBase64,
          idempotency_key: key,
        }),
      });
      showSuccess(language === 'bn' ? res.messageBn : res.messageEn);
      setAddCostModalOpen(false);
      setCostAmount('');
      setCostNote('');
      setCostReceiptBase64(null);
      setCostReceiptFileName('');
      await fetchDashboard();
    } catch (err: any) {
      // Form keeps all user input intact on save failure so they can retry!
      showError(language === 'bn' ? err.messageBn || err.message : err.messageEn || err.message);
    } finally {
      setSavingCost(false);
    }
  };

  // Greeting based on current hour in Asia/Dhaka
  const greetingText = useMemo(() => {
    const parts = getDhakaParts(new Date());
    const hr = parts.hour;
    const name = user?.name || '';
    if (hr < 12) return t('greetingMorning', { name });
    if (hr < 17) return t('greetingAfternoon', { name });
    return t('greetingEvening', { name });
  }, [user?.name, language, t]);

  // Mini Calendar Cells for current month (every cell shows English + Bangla day, and Bangla month name on ১ and first visible cell)
  const miniCalCells = useMemo(() => {
    if (!dashboard?.currentMonthYM) return [];
    const [y, m] = dashboard.currentMonthYM.split('-').map(Number);
    const firstDt = new Date(Date.UTC(y, m - 1, 1, 6, 0, 0));
    const startWeekday = firstDt.getUTCDay();
    const numDays = new Date(Date.UTC(y, m, 0)).getUTCDate();

    const byDate: Record<string, { day: any[]; night: any[] }> = {};
    for (const b of dashboard.miniCalendarBookings || []) {
      if (!byDate[b.event_date]) byDate[b.event_date] = { day: [], night: [] };
      if (b.slot === 'DAY' || b.slot === 'FULL') byDate[b.event_date].day.push(b);
      if (b.slot === 'NIGHT' || b.slot === 'FULL') byDate[b.event_date].night.push(b);
    }

    const cells: Array<{
      ymd: string;
      gDay: number;
      bDay: number;
      bDayBn: string;
      bMonthBn: string;
      isFirstVisible: boolean;
      dayList: any[];
      nightList: any[];
    } | null> = [];

    for (let i = 0; i < startWeekday; i++) cells.push(null);
    for (let d = 1; d <= numDays; d++) {
      const ymd = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const bInfo = getBengaliDate(parseEventDateToDhakaDate(ymd));
      cells.push({
        ymd,
        gDay: d,
        bDay: bInfo.day,
        bDayBn: bInfo.dayBn,
        bMonthBn: bInfo.monthBn,
        isFirstVisible: d === 1,
        dayList: byDate[ymd]?.day || [],
        nightList: byDate[ymd]?.night || [],
      });
    }
    return cells;
  }, [dashboard]);

  const miniCalDualHeader = useMemo(() => {
    if (!dashboard?.currentMonthYM) return '';
    const [y, m] = dashboard.currentMonthYM.split('-').map(Number);
    return formatDualMonthHeader(y, m - 1, language);
  }, [dashboard?.currentMonthYM, language]);

  const getMiniHalfColor = (list: any[]) => {
    if (!list || list.length === 0) {
      return 'bg-emerald-100/85 dark:bg-emerald-950/45 text-emerald-900 dark:text-emerald-200';
    }
    const hasFull = list.some((b) => b.slot === 'FULL');
    const hasConfirmed = list.some((b) => b.status === 'CONFIRMED' || b.status === 'COMPLETED');
    if (hasConfirmed) {
      return hasFull ? 'bg-purple-600 text-white' : 'bg-[#4A2545] text-white';
    }
    return 'bg-amber-400 text-stone-950 font-bold';
  };

  const sc = dashboard?.summaryCards;
  const maxMonthBookings = Math.max(
    1,
    ...(dashboard?.charts?.monthlySeries || []).map((m: any) => m.bookingsCount || 0)
  );

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-8 space-y-8">
      <SectionLoader
        loading={loading || (!dashboard && !fetchError)}
        error={fetchError}
        onRetry={fetchDashboard}
        language={language}
        labelBn="হোম ড্যাশবোর্ড লোড হচ্ছে..."
        labelEn="Loading home dashboard..."
        minHeightClass="min-h-[60vh]"
      >
        {dashboard && sc && (
          <div className="space-y-8">
            {/* a) Hero Greeting + Primary Action Stack (New Booking on top, Cost directly below at exact same width) */}
            <div className="p-6 sm:p-7 rounded-3xl bg-gradient-to-br from-[#4A2545] via-[#3B1D37] to-[#261224] text-white shadow-lg border border-[#C5A059]/20 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
              <div className="space-y-2 min-w-0">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 text-[#C5A059] text-xs font-bold border border-[#C5A059]/25">
                  <Sparkles className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{activeRoom?.name}</span>
                </div>
                <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight leading-snug">
                  {greetingText}
                </h1>
                <p className="text-xs sm:text-sm text-stone-200 font-semibold leading-relaxed">
                  📅 {formatFullDualDateWithWeekdayFromYMD(dashboard.todayYMD)}
                </p>
              </div>

              {/* b) Quick Action Area: Primary Stack (New Booking + Cost directly below, exact same width) + Secondary Shortcuts */}
              <div className="flex flex-col sm:flex-row sm:items-start lg:items-center gap-3 w-full lg:w-auto">
                {(canCreate || canAddCost) && (
                  <div className="flex flex-col gap-2.5 w-full sm:w-56 shrink-0">
                    {canCreate && (
                      <ActionButton
                        variant="gold"
                        onClick={() => onOpenNewBooking()}
                        icon={<Plus className="w-4 h-4 shrink-0" />}
                        className="w-full justify-center"
                      >
                        {t('newBookingBtn')}
                      </ActionButton>
                    )}

                    {canAddCost && (
                      <ActionButton
                        variant="secondary"
                        onClick={openQuickAddCostModal}
                        icon={<Receipt className="w-4 h-4 shrink-0" />}
                        className="w-full justify-center !bg-white/95 dark:!bg-[#1D1820] !text-[#4A2545] dark:!text-[#C5A059] !border-[#C5A059]/60 hover:!bg-[#FAF4F0]"
                      >
                        {language === 'bn' ? 'খরচ' : 'Cost'}
                      </ActionButton>
                    )}
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2.5">
                  {canSeeMoney && (
                    <ActionButton
                      variant="ghost"
                      onClick={() => setRecordPayModalOpen(true)}
                      icon={<CreditCard className="w-4 h-4 text-[#C5A059]" />}
                      className="!bg-white/12 hover:!bg-white/22 !text-white !border-white/20"
                    >
                      {t('recordPaymentBtn')}
                    </ActionButton>
                  )}

                  {canCreate && (
                    <ActionButton
                      variant="ghost"
                      onClick={openQuickAddCustomerModal}
                      icon={<UserPlus className="w-4 h-4 text-[#C5A059]" />}
                      className="!bg-white/12 hover:!bg-white/22 !text-white !border-white/20"
                    >
                      {t('addCustomerBtn')}
                    </ActionButton>
                  )}

                  <ActionButton
                    variant="ghost"
                    onClick={() => onNavigateTab('calendar')}
                    icon={<CalendarRange className="w-4 h-4 text-[#C5A059]" />}
                    className="!bg-white/12 hover:!bg-white/22 !text-white !border-white/20"
                  >
                    {t('openCalendarBtn')}
                  </ActionButton>
                </div>
              </div>
            </div>

            {/* Empty Room Onboarding Helper if no halls exist yet */}
            {dashboard.todayAtAGlance.length === 0 && canSeeMoney && (
              <div className="p-5 rounded-3xl bg-amber-50/80 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <h3 className="text-sm font-extrabold text-amber-950 dark:text-amber-200">
                    {language === 'bn'
                      ? 'স্বাগতম! শুরু করতে ডেমো ডেটা লোড করুন অথবা নতুন হল যুক্ত করুন'
                      : 'Welcome! Load sample Demo Data or add your first Hall to get started'}
                  </h3>
                  <p className="text-xs text-amber-800 dark:text-amber-300">
                    {language === 'bn'
                      ? 'এক ক্লিকে ৩টি হল, ৪ জন গ্রাহক এবং দিন/রাত/দিন ও রাত স্লটের নমুনা বুকিং লোড করতে পারেন।'
                      : 'Seed clearly marked demo halls, customers, bookings (Day, Night & Full), payments, and expenses in one click.'}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <ActionButton
                    variant="gold"
                    loading={seedingDemo}
                    onClick={handleSeedDemoData}
                    icon={<Sparkles className="w-4 h-4" />}
                  >
                    {t('seedDemoBtn')}
                  </ActionButton>
                  <ActionButton
                    variant="secondary"
                    onClick={() => onNavigateTab('halls')}
                  >
                    {t('addHallBtn')}
                  </ActionButton>
                </div>
              </div>
            )}

            {/* c) Tappable Summary Cards (Money cards hidden for Staff & Viewer on both server and UI; zero Expense Breakdown on Home) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Card 1: Today's Events */}
              <button
                type="button"
                onClick={() => {
                  if (onNavigateBookingsFilter) {
                    onNavigateBookingsFilter({
                      dateFrom: dashboard.todayYMD,
                      dateTo: dashboard.todayYMD,
                    });
                  }
                  onNavigateTab('bookings');
                }}
                className="p-5 rounded-3xl bg-white dark:bg-[#1D1820] border border-stone-200/90 dark:border-stone-800 hover:border-[#4A2545] dark:hover:border-[#C5A059] shadow-xs text-left transition-all cursor-pointer flex items-center justify-between"
              >
                <div>
                  <div className="text-xs font-bold text-stone-500 dark:text-stone-400">
                    {t('cardTodaysEvents')}
                  </div>
                  <div className="text-2xl font-extrabold text-stone-900 dark:text-stone-100 mt-1">
                    {formatNumberByLanguage(sc.todaysEventsCount, language)}
                  </div>
                  <div className="text-[11px] text-stone-500 dark:text-stone-400 mt-1">
                    {formatDualDateFromYMD(dashboard.todayYMD)}
                  </div>
                </div>
                <div className="w-11 h-11 rounded-2xl bg-[#4A2545]/10 dark:bg-[#C5A059]/15 flex items-center justify-center text-[#4A2545] dark:text-[#C5A059]">
                  <CalendarDays className="w-5 h-5" />
                </div>
              </button>

              {/* Card 2: Upcoming This Week */}
              <button
                type="button"
                onClick={() => {
                  if (onNavigateBookingsFilter) {
                    onNavigateBookingsFilter({
                      dateFrom: dashboard.todayYMD,
                    });
                  }
                  onNavigateTab('bookings');
                }}
                className="p-5 rounded-3xl bg-white dark:bg-[#1D1820] border border-stone-200/90 dark:border-stone-800 hover:border-[#4A2545] dark:hover:border-[#C5A059] shadow-xs text-left transition-all cursor-pointer flex items-center justify-between"
              >
                <div>
                  <div className="text-xs font-bold text-stone-500 dark:text-stone-400">
                    {t('cardUpcomingWeek')}
                  </div>
                  <div className="text-2xl font-extrabold text-stone-900 dark:text-stone-100 mt-1">
                    {formatNumberByLanguage(sc.upcomingWeekCount, language)}
                  </div>
                  <div className="text-[11px] text-stone-500 dark:text-stone-400 mt-1">
                    {language === 'bn' ? 'আগামী ৭ দিনের সক্রিয় বুকিং' : 'Active events in next 7 days'}
                  </div>
                </div>
                <div className="w-11 h-11 rounded-2xl bg-sky-100 dark:bg-sky-950/50 flex items-center justify-center text-sky-700 dark:text-sky-300">
                  <Clock className="w-5 h-5" />
                </div>
              </button>

              {/* Card 3: Pending (Tentative) Bookings */}
              <button
                type="button"
                onClick={() => {
                  if (onNavigateBookingsFilter) {
                    onNavigateBookingsFilter({ status: 'TENTATIVE' });
                  }
                  onNavigateTab('bookings');
                }}
                className="p-5 rounded-3xl bg-white dark:bg-[#1D1820] border border-stone-200/90 dark:border-stone-800 hover:border-[#4A2545] dark:hover:border-[#C5A059] shadow-xs text-left transition-all cursor-pointer flex items-center justify-between"
              >
                <div>
                  <div className="text-xs font-bold text-amber-700 dark:text-amber-300">
                    {t('cardPendingTentative')}
                  </div>
                  <div className="text-2xl font-extrabold text-amber-600 dark:text-amber-400 mt-1">
                    {formatNumberByLanguage(sc.pendingTentativeCount, language)}
                  </div>
                  <div className="text-[11px] text-stone-500 dark:text-stone-400 mt-1">
                    {language === 'bn' ? 'চূড়ান্ত নিশ্চিতকরণের অপেক্ষায়' : 'Awaiting confirmation'}
                  </div>
                </div>
                <div className="w-11 h-11 rounded-2xl bg-amber-100 dark:bg-amber-950/50 flex items-center justify-center text-amber-700 dark:text-amber-300">
                  <AlertTriangle className="w-5 h-5" />
                </div>
              </button>

              {/* Card 4: Free Slots This Month (Day slots free & Night slots free shown separately!) */}
              <button
                type="button"
                onClick={() => onNavigateTab('calendar')}
                className="p-5 rounded-3xl bg-white dark:bg-[#1D1820] border border-stone-200/90 dark:border-stone-800 hover:border-[#4A2545] dark:hover:border-[#C5A059] shadow-xs text-left transition-all cursor-pointer flex flex-col justify-between gap-2"
              >
                <div className="flex items-center justify-between w-full">
                  <span className="text-xs font-bold text-stone-500 dark:text-stone-400">
                    {t('cardFreeSlotsThisMonth')}
                  </span>
                  <CalendarRange className="w-4 h-4 text-[#0E8A44]" />
                </div>
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div className="p-2 rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/70 dark:border-amber-900">
                    <div className="text-[11px] font-bold text-amber-900 dark:text-amber-200 flex items-center gap-1">
                      <Sun className="w-3 h-3 text-amber-500" />
                      <span>{t('slot_DAY')}</span>
                    </div>
                    <div className="text-base font-extrabold text-stone-900 dark:text-stone-100 mt-0.5">
                      {formatNumberByLanguage(sc.freeDaySlotsThisMonth, language)}{' '}
                      <span className="text-[10px] font-normal text-stone-500">
                        {t('slotFree')}
                      </span>
                    </div>
                  </div>
                  <div className="p-2 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200/70 dark:border-indigo-900">
                    <div className="text-[11px] font-bold text-indigo-900 dark:text-indigo-200 flex items-center gap-1">
                      <Moon className="w-3 h-3 text-indigo-500" />
                      <span>{t('slot_NIGHT')}</span>
                    </div>
                    <div className="text-base font-extrabold text-stone-900 dark:text-stone-100 mt-0.5">
                      {formatNumberByLanguage(sc.freeNightSlotsThisMonth, language)}{' '}
                      <span className="text-[10px] font-normal text-stone-500">
                        {t('slotFree')}
                      </span>
                    </div>
                  </div>
                </div>
              </button>

              {/* Card 5 & 6: Money Cards (Strictly Owner & Manager only, omitted on server for Staff & Viewer) */}
              {canSeeMoney && sc.thisMonthRevenue !== undefined && (
                <button
                  type="button"
                  onClick={() => onNavigateTab('reports')}
                  className="p-5 rounded-3xl bg-white dark:bg-[#1D1820] border border-stone-200/90 dark:border-stone-800 hover:border-[#4A2545] dark:hover:border-[#C5A059] shadow-xs text-left transition-all cursor-pointer flex items-center justify-between"
                >
                  <div>
                    <div className="text-xs font-bold text-[#0E8A44] dark:text-emerald-300">
                      {t('cardThisMonthRevenue')}
                    </div>
                    <div className="text-2xl font-extrabold text-[#0E8A44] dark:text-emerald-400 mt-1">
                      {formatCurrency(sc.thisMonthRevenue, language)}
                    </div>
                    <div className="text-[11px] text-stone-500 dark:text-stone-400 mt-1">
                      {language === 'bn' ? 'বাতিল বুকিং ব্যতীত মোট রাজস্ব' : 'Excludes cancelled bookings'}
                    </div>
                  </div>
                  <div className="w-11 h-11 rounded-2xl bg-emerald-100 dark:bg-emerald-950/50 flex items-center justify-center text-[#0E8A44] dark:text-emerald-300">
                    <BarChart3 className="w-5 h-5" />
                  </div>
                </button>
              )}

              {canSeeMoney && sc.totalDueAmount !== undefined && (
                <button
                  type="button"
                  onClick={() => onNavigateTab('reports')}
                  className="p-5 rounded-3xl bg-white dark:bg-[#1D1820] border border-stone-200/90 dark:border-stone-800 hover:border-[#4A2545] dark:hover:border-[#C5A059] shadow-xs text-left transition-all cursor-pointer flex items-center justify-between"
                >
                  <div>
                    <div className="text-xs font-bold text-rose-700 dark:text-rose-300">
                      {t('cardTotalDue')}
                    </div>
                    <div className="text-2xl font-extrabold text-rose-600 dark:text-rose-400 mt-1">
                      {formatCurrency(sc.totalDueAmount, language)}
                    </div>
                    <div className="text-[11px] text-stone-500 dark:text-stone-400 mt-1">
                      {language === 'bn' ? 'বকেয়া তালিকা দেখতে ট্যাপ করুন' : 'Tap to view outstanding dues'}
                    </div>
                  </div>
                  <div className="w-11 h-11 rounded-2xl bg-rose-100 dark:bg-rose-950/50 flex items-center justify-center text-rose-700 dark:text-rose-300">
                    <CreditCard className="w-5 h-5" />
                  </div>
                </button>
              )}
            </div>

            {/* d) "Today at a glance" strip per hall: Day status and Night status (free, tentative, confirmed) */}
            <div className="p-5 sm:p-6 rounded-3xl bg-white dark:bg-[#1D1820] border border-stone-200/90 dark:border-stone-800 shadow-xs space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm sm:text-base font-extrabold text-stone-900 dark:text-stone-100 flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-[#4A2545] dark:text-[#C5A059]" />
                  <span>{t('todayAtAGlanceTitle')}</span>
                </h2>
                <span className="text-xs font-semibold text-stone-500 dark:text-stone-400">
                  {formatDualDateFromYMD(dashboard.todayYMD)}
                </span>
              </div>

              {dashboard.todayAtAGlance.length === 0 ? (
                <p className="text-xs text-stone-500 py-2">
                  {language === 'bn' ? 'কোনো সক্রিয় হল নেই।' : 'No active halls configured yet.'}
                </p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {dashboard.todayAtAGlance.map((hg: any) => (
                    <div
                      key={hg.hall_id}
                      className="p-4 rounded-2xl bg-[#FAF4F0]/60 dark:bg-stone-900/60 border border-stone-200 dark:border-stone-800 space-y-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="text-xs sm:text-sm font-extrabold text-stone-900 dark:text-stone-100 truncate">
                          {hg.hall_name}
                        </h3>
                        <span className="text-[11px] text-stone-500 shrink-0">
                          {formatNumberByLanguage(hg.capacity, language)} {t('guestsUnit')}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs">
                        {/* DAY STATUS */}
                        <button
                          type="button"
                          onClick={() => {
                            if (hg.day_holder) {
                              onOpenBookingDetail(hg.day_holder.booking_id);
                            } else if (canCreate) {
                              onOpenNewBooking({
                                event_date: dashboard.todayYMD,
                                slot: 'DAY',
                                hall_id: hg.hall_id,
                              });
                            }
                          }}
                          className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                            hg.day_status === 'FREE'
                              ? 'bg-emerald-50/80 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
                              : hg.day_status === 'TENTATIVE'
                              ? 'bg-amber-100/90 dark:bg-amber-950/50 border-amber-400 text-amber-950 dark:text-amber-200'
                              : 'bg-[#4A2545] text-white border-[#4A2545]'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-extrabold flex items-center gap-1">
                              <Sun className="w-3.5 h-3.5" />
                              {t('slot_DAY')}
                            </span>
                            <span className="text-[10px] font-bold">
                              {hg.day_status === 'FREE'
                                ? t('slotFree')
                                : t(`bStatus_${hg.day_status}` as any)}
                            </span>
                          </div>
                          <div className="text-[11px] truncate mt-1 opacity-90">
                            {hg.day_holder ? hg.day_holder.customer_name : '+ ' + t('newBookingBtn')}
                          </div>
                        </button>

                        {/* NIGHT STATUS */}
                        <button
                          type="button"
                          onClick={() => {
                            if (hg.night_holder) {
                              onOpenBookingDetail(hg.night_holder.booking_id);
                            } else if (canCreate) {
                              onOpenNewBooking({
                                event_date: dashboard.todayYMD,
                                slot: 'NIGHT',
                                hall_id: hg.hall_id,
                              });
                            }
                          }}
                          className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                            hg.night_status === 'FREE'
                              ? 'bg-emerald-50/80 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
                              : hg.night_status === 'TENTATIVE'
                              ? 'bg-amber-100/90 dark:bg-amber-950/50 border-amber-400 text-amber-950 dark:text-amber-200'
                              : 'bg-indigo-900 text-white border-indigo-900'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-extrabold flex items-center gap-1">
                              <Moon className="w-3.5 h-3.5" />
                              {t('slot_NIGHT')}
                            </span>
                            <span className="text-[10px] font-bold">
                              {hg.night_status === 'FREE'
                                ? t('slotFree')
                                : t(`bStatus_${hg.night_status}` as any)}
                            </span>
                          </div>
                          <div className="text-[11px] truncate mt-1 opacity-90">
                            {hg.night_holder ? hg.night_holder.customer_name : '+ ' + t('newBookingBtn')}
                          </div>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* e) & f) Two-Column Grid: Upcoming Events (Next 7 Days + Today Grouped Day/Night) & Mini Calendar */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* e) Upcoming Events Next 7 Days (7 columns) */}
              <div className="lg:col-span-7 p-5 sm:p-6 rounded-3xl bg-white dark:bg-[#1D1820] border border-stone-200/90 dark:border-stone-800 shadow-xs space-y-5">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm sm:text-base font-extrabold text-stone-900 dark:text-stone-100 flex items-center gap-2">
                    <CalendarDays className="w-5 h-5 text-[#4A2545] dark:text-[#C5A059]" />
                    <span>{t('upcomingNext7DaysTitle')}</span>
                  </h2>
                  <button
                    onClick={() => onNavigateTab('bookings')}
                    className="text-xs font-bold text-[#4A2545] dark:text-[#C5A059] hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <span>{language === 'bn' ? 'সব দেখুন' : 'View All'}</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Today's Events Explicitly Grouped as DAY and NIGHT */}
                <div className="p-4 rounded-2xl bg-[#FAF4F0]/60 dark:bg-stone-900/60 border border-stone-200 dark:border-stone-800 space-y-3">
                  <div className="text-xs font-extrabold text-stone-700 dark:text-stone-300">
                    {t('cardTodaysEvents')} ({formatDualDateFromYMD(dashboard.todayYMD)})
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Today's Day Group */}
                    <div className="p-3 rounded-xl bg-white dark:bg-stone-900 border border-amber-200 dark:border-amber-900/50 space-y-2">
                      <SlotBadge slot="DAY" size="xs" showDualLang />
                      {dashboard.todaysEventsGrouped.DAY.length === 0 ? (
                        <p className="text-[11px] text-stone-400">
                          {language === 'bn' ? 'আজ দিনে কোনো অনুষ্ঠান নেই' : 'No Day events today'}
                        </p>
                      ) : (
                        dashboard.todaysEventsGrouped.DAY.map((b: any) => (
                          <div
                            key={`td-day-${b.id}`}
                            onClick={() => onOpenBookingDetail(b.id)}
                            className="p-2 rounded-lg bg-amber-50/60 dark:bg-amber-950/30 text-xs cursor-pointer hover:bg-amber-100/70"
                          >
                            <div className="font-bold text-stone-900 dark:text-stone-100 break-words">
                              {b.customer_name}
                            </div>
                            <div className="text-[11px] text-stone-500">
                              {b.hall_name} • {formatTimeString12(b.start_time, language)} –{' '}
                              {formatTimeString12(b.end_time, language)}
                            </div>
                          </div>
                        ))
                      )}
                    </div>

                    {/* Today's Night Group */}
                    <div className="p-3 rounded-xl bg-white dark:bg-stone-900 border border-indigo-200 dark:border-indigo-900/50 space-y-2">
                      <SlotBadge slot="NIGHT" size="xs" showDualLang />
                      {dashboard.todaysEventsGrouped.NIGHT.length === 0 ? (
                        <p className="text-[11px] text-stone-400">
                          {language === 'bn' ? 'আজ রাতে কোনো অনুষ্ঠান নেই' : 'No Night events today'}
                        </p>
                      ) : (
                        dashboard.todaysEventsGrouped.NIGHT.map((b: any) => (
                          <div
                            key={`td-night-${b.id}`}
                            onClick={() => onOpenBookingDetail(b.id)}
                            className="p-2 rounded-lg bg-indigo-50/60 dark:bg-indigo-950/30 text-xs cursor-pointer hover:bg-indigo-100/70"
                          >
                            <div className="font-bold text-stone-900 dark:text-stone-100 break-words">
                              {b.customer_name}
                            </div>
                            <div className="text-[11px] text-stone-500">
                              {b.hall_name} • {formatTimeString12(b.start_time, language)} –{' '}
                              {formatTimeString12(b.end_time, language)}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>

                {/* Full Next 7 Days List */}
                {dashboard.upcomingNext7Days.length === 0 ? (
                  <p className="text-xs text-stone-500 text-center py-6">
                    {language === 'bn'
                      ? 'আগামী ৭ দিনে কোনো নির্ধারিত অনুষ্ঠান নেই।'
                      : 'No upcoming events scheduled in the next 7 days.'}
                  </p>
                ) : (
                  <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
                    {dashboard.upcomingNext7Days.map((b: any) => {
                      const crosses =
                        (b.slot === 'NIGHT' || b.slot === 'FULL') &&
                        isNightCrossingMidnight(b.start_time, b.end_time);
                      return (
                        <div
                          key={b.id}
                          onClick={() => onOpenBookingDetail(b.id)}
                          className="p-3.5 rounded-2xl bg-stone-50/80 dark:bg-stone-900/50 border border-stone-200/80 dark:border-stone-800 hover:border-[#4A2545] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 cursor-pointer transition-all"
                        >
                          <div className="space-y-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-mono text-xs font-extrabold text-[#4A2545] dark:text-[#C5A059]">
                                {b.booking_number}
                              </span>
                              <SlotBadge slot={b.slot as SlotType} size="xs" />
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                  b.status === 'CONFIRMED'
                                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                    : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                                }`}
                              >
                                {t(`bStatus_${b.status}` as any)}
                              </span>
                            </div>

                            <div className="text-xs sm:text-sm font-bold text-stone-900 dark:text-stone-100 break-words">
                              {b.customer_name} — {b.hall_name}
                            </div>

                            <div className="text-[11px] text-stone-500">
                              📅 {formatDualDateFromYMD(b.event_date)} • ⏰{' '}
                              {formatTimeString12(b.start_time, language)} –{' '}
                              {formatTimeString12(b.end_time, language)}
                              {crosses && (
                                <span className="ml-1 font-bold text-indigo-600 dark:text-indigo-400">
                                  ({language === 'bn' ? 'পরদিন শেষ' : 'ends next day'})
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* f) Mini Calendar for Current Month (Split Day/Night halves + Bangla date & month transitions) */}
              <div className="lg:col-span-5 p-5 sm:p-6 rounded-3xl bg-white dark:bg-[#1D1820] border border-stone-200/90 dark:border-stone-800 shadow-xs space-y-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h2 className="text-sm sm:text-base font-extrabold text-stone-900 dark:text-stone-100 flex items-center gap-2">
                      <CalendarRange className="w-5 h-5 text-[#4A2545] dark:text-[#C5A059]" />
                      <span>{t('miniCalendarTitle')}</span>
                    </h2>
                    {miniCalDualHeader && (
                      <p className="text-[11px] font-semibold text-stone-500 dark:text-stone-400 mt-0.5">
                        {miniCalDualHeader}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => onNavigateTab('calendar')}
                    className="text-xs font-bold text-[#4A2545] dark:text-[#C5A059] hover:underline cursor-pointer shrink-0"
                  >
                    {t('openCalendarBtn')}
                  </button>
                </div>

                {/* Weekday header */}
                <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold text-stone-500">
                  {WEEKDAYS.map((w) => (
                    <div key={w.shortEn}>{language === 'bn' ? w.shortBn : w.shortEn}</div>
                  ))}
                </div>

                {/* Split-cell Mini Grid */}
                <div className="grid grid-cols-7 gap-1">
                  {miniCalCells.map((cell, idx) => {
                    if (!cell) return <div key={`mc-blank-${idx}`} className="h-14" />;
                    const isToday = cell.ymd === dashboard.todayYMD;
                    const showMonthLabel = cell.bDay === 1 || cell.isFirstVisible;
                    return (
                      <button
                        key={cell.ymd}
                        type="button"
                        onClick={() => setSelectedMiniDateYMD(cell.ymd)}
                        className={`h-14 rounded-xl border p-0.5 flex flex-col justify-between transition-all cursor-pointer overflow-hidden ${
                          isToday
                            ? 'border-2 border-[#4A2545] dark:border-[#C5A059] bg-[#FAF4F0]/50 dark:bg-stone-900'
                            : 'border-stone-200 dark:border-stone-800'
                        }`}
                        title={formatFullDualDateWithWeekdayFromYMD(cell.ymd)}
                      >
                        <div className="px-0.5 w-full leading-tight">
                          <div className="flex items-center justify-between w-full text-[10px] font-extrabold">
                            <span className="text-stone-900 dark:text-stone-100">{cell.gDay}</span>
                            <span className="text-[#4A2545] dark:text-[#C5A059] bengali-text">
                              {cell.bDayBn}
                            </span>
                          </div>
                          {showMonthLabel && (
                            <div className="text-[8px] font-bold text-[#0E8A44] dark:text-emerald-400 truncate text-right leading-none">
                              {cell.bMonthBn}
                            </div>
                          )}
                        </div>
                        <div className="w-full flex flex-col gap-0.5 px-0.5 pb-0.5">
                          <div
                            className={`h-2.5 w-full rounded-xs text-[8px] flex items-center justify-center ${getMiniHalfColor(
                              cell.dayList
                            )}`}
                          >
                            ☀️
                          </div>
                          <div
                            className={`h-2.5 w-full rounded-xs text-[8px] flex items-center justify-center ${getMiniHalfColor(
                              cell.nightList
                            )}`}
                          >
                            🌙
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>

                <div className="flex flex-wrap items-center justify-center gap-3 pt-2 text-[11px] text-stone-500">
                  <span className="inline-flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-xs bg-emerald-200 inline-block" />
                    {t('slotFree')}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-xs bg-amber-400 inline-block" />
                    {t('bStatus_TENTATIVE')}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-xs bg-[#4A2545] inline-block" />
                    {t('bStatus_CONFIRMED')}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-xs bg-purple-600 inline-block" />
                    {t('slot_FULL')}
                  </span>
                </div>
              </div>
            </div>

            {/* g) Alerts Panel: Tentative Holds Expiring Soon, Dues within 7 days, Pending Join Requests */}
            <div className="p-5 sm:p-6 rounded-3xl bg-white dark:bg-[#1D1820] border border-stone-200/90 dark:border-stone-800 shadow-xs space-y-4">
              <h2 className="text-sm sm:text-base font-extrabold text-stone-900 dark:text-stone-100 flex items-center gap-2">
                <BellRing className="w-5 h-5 text-amber-500" />
                <span>{t('alertsPanelTitle')}</span>
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* 1. Tentative Holds Expiring Soon */}
                <div className="p-4 rounded-2xl bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50 space-y-2.5">
                  <div className="text-xs font-extrabold text-amber-900 dark:text-amber-200">
                    ⏳{' '}
                    {language === 'bn'
                      ? 'অস্থায়ী হোল্ড মেয়াদোত্তীর্ণ হচ্ছে (স্লট রিলিজ সতর্কতা)'
                      : 'Tentative Holds Expiring Soon'}
                  </div>
                  {(dashboard.alerts?.expiringHolds || []).length === 0 ? (
                    <p className="text-xs text-stone-500">
                      {language === 'bn' ? 'কোনো অস্থায়ী হোল্ড ঝুঁকিতে নেই।' : 'No tentative holds expiring soon.'}
                    </p>
                  ) : (
                    dashboard.alerts.expiringHolds.map((eh: any) => (
                      <div
                        key={eh.booking_id}
                        onClick={() => onOpenBookingDetail(eh.booking_id)}
                        className="p-2.5 rounded-xl bg-white dark:bg-stone-900 border border-amber-200 dark:border-amber-800 text-xs space-y-1 cursor-pointer"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono font-bold text-[#4A2545] dark:text-[#C5A059]">
                            {eh.booking_number}
                          </span>
                          <SlotBadge slot={eh.slot as SlotType} size="xs" showDualLang />
                        </div>
                        <div className="font-bold">{eh.customer_name} — {eh.hall_name}</div>
                        <div className="text-[11px] text-stone-500">
                          {formatDualDateFromYMD(eh.event_date)}
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* 2. Dues for Events within 7 Days (Hidden for Staff & Viewer) */}
                {canSeeMoney && (
                  <div className="p-4 rounded-2xl bg-rose-50/50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/50 space-y-2.5">
                    <div className="text-xs font-extrabold text-rose-900 dark:text-rose-200">
                      💳{' '}
                      {language === 'bn'
                        ? 'আগামী ৭ দিনের অনুষ্ঠানের বকেয়া তালিকা'
                        : 'Dues for Events Within 7 Days'}
                    </div>
                    {(dashboard.alerts?.duesWithin7Days || []).length === 0 ? (
                      <p className="text-xs text-stone-500">
                        {language === 'bn'
                          ? 'আগামী ৭ দিনের কোনো ইভেন্টে বকেয়া নেই।'
                          : 'No outstanding dues for events within 7 days.'}
                      </p>
                    ) : (
                      dashboard.alerts.duesWithin7Days.map((dw: any) => (
                        <div
                          key={dw.booking_id}
                          onClick={() => onOpenBookingDetail(dw.booking_id)}
                          className="p-2.5 rounded-xl bg-white dark:bg-stone-900 border border-rose-200 dark:border-rose-800 text-xs space-y-1 cursor-pointer"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-mono font-bold">{dw.booking_number}</span>
                            <span className="font-extrabold text-rose-600">
                              {formatCurrency(dw.due_amount, language)}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="font-bold truncate">{dw.customer_name}</span>
                            <SlotBadge slot={dw.slot as SlotType} size="xs" />
                          </div>
                          <div className="text-[11px] text-stone-500">
                            {formatDualDateFromYMD(dw.event_date)}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {/* 3. Pending Join Requests (Owner only) */}
                {role === 'OWNER' && (
                  <div className="p-4 rounded-2xl bg-sky-50/50 dark:bg-sky-950/20 border border-sky-200 dark:border-sky-900/50 space-y-2.5">
                    <div className="text-xs font-extrabold text-sky-900 dark:text-sky-200">
                      👥 {t('pendingRequestsSection')}
                    </div>
                    {(dashboard.alerts?.pendingJoinRequests || []).length === 0 ? (
                      <p className="text-xs text-stone-500">{t('noPendingRequests')}</p>
                    ) : (
                      dashboard.alerts.pendingJoinRequests.map((pj: any) => (
                        <div
                          key={pj.member_id}
                          onClick={() => onNavigateTab('members_settings')}
                          className="p-2.5 rounded-xl bg-white dark:bg-stone-900 border border-sky-200 dark:border-sky-800 text-xs space-y-1 cursor-pointer"
                        >
                          <div className="font-bold">{pj.user_name}</div>
                          <div className="text-[11px] text-stone-500">{pj.user_email}</div>
                          <div className="text-[10px] text-sky-700 dark:text-sky-300">
                            {formatDualDate(pj.created_at)}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* h) Charts with Accessible Table / Text Alternatives (NO Expense Breakdown on Home!) */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Chart 1: Monthly Bookings & Revenue */}
              <div className="p-5 rounded-3xl bg-white dark:bg-[#1D1820] border border-stone-200/90 dark:border-stone-800 shadow-xs space-y-4">
                <h3 className="text-sm font-extrabold text-stone-900 dark:text-stone-100 flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-[#4A2545] dark:text-[#C5A059]" />
                  <span>
                    {language === 'bn'
                      ? 'মাসিক বুকিং প্রবণতা (বিগত ৬ মাস)'
                      : 'Monthly Bookings Trend (Last 6 Months)'}
                  </span>
                </h3>

                <div className="space-y-2.5">
                  {(dashboard.charts?.monthlySeries || []).map((ms: any) => {
                    const pct = Math.round(((ms.bookingsCount || 0) / maxMonthBookings) * 100);
                    return (
                      <div key={ms.month} className="space-y-1 text-xs">
                        <div className="flex justify-between font-semibold">
                          <span className="font-mono">{ms.month}</span>
                          <span>
                            {formatNumberByLanguage(ms.bookingsCount, language)}{' '}
                            {language === 'bn' ? 'টি' : 'bookings'}
                            {canSeeMoney && ms.revenue !== undefined
                              ? ` • ${formatCurrency(ms.revenue, language)}`
                              : ''}
                          </span>
                        </div>
                        <div className="w-full h-2.5 rounded-full bg-stone-100 dark:bg-stone-800 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-[#4A2545] dark:bg-[#C5A059] transition-all"
                            style={{ width: `${Math.max(6, pct)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Chart 2: Day vs Night vs Full Bookings This Month */}
              <div className="p-5 rounded-3xl bg-white dark:bg-[#1D1820] border border-stone-200/90 dark:border-stone-800 shadow-xs space-y-4">
                <h3 className="text-sm font-extrabold text-stone-900 dark:text-stone-100 flex items-center gap-2">
                  <PieChart className="w-4 h-4 text-[#4A2545] dark:text-[#C5A059]" />
                  <span>
                    {language === 'bn'
                      ? 'চলতি মাসে দিন বনাম রাত বনাম দিন ও রাত'
                      : 'Day vs Night vs Full Bookings This Month'}
                  </span>
                </h3>

                <div className="space-y-3">
                  {(['DAY', 'NIGHT', 'FULL'] as SlotType[]).map((sType) => {
                    const info = dashboard.charts?.slotSplitThisMonth?.[sType] || { count: 0 };
                    return (
                      <div
                        key={sType}
                        className="p-3 rounded-2xl bg-stone-50 dark:bg-stone-900/60 border border-stone-200 dark:border-stone-800 flex items-center justify-between text-xs"
                      >
                        <SlotBadge slot={sType} size="sm" showDualLang />
                        <div className="text-right">
                          <div className="font-extrabold text-sm text-stone-900 dark:text-stone-100">
                            {formatNumberByLanguage(info.count, language)}{' '}
                            {language === 'bn' ? 'টি বুকিং' : 'Bookings'}
                          </div>
                          {canSeeMoney && info.revenue !== undefined && (
                            <div className="text-[11px] font-bold text-[#4A2545] dark:text-[#C5A059]">
                              {formatCurrency(info.revenue, language)}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Chart 3: Event Type Split */}
              <div className="p-5 rounded-3xl bg-white dark:bg-[#1D1820] border border-stone-200/90 dark:border-stone-800 shadow-xs space-y-4">
                <h3 className="text-sm font-extrabold text-stone-900 dark:text-stone-100 flex items-center gap-2">
                  <PieChart className="w-4 h-4 text-[#4A2545] dark:text-[#C5A059]" />
                  <span>
                    {language === 'bn'
                      ? 'অনুষ্ঠানের ধরন অনুযায়ী বিভাজন'
                      : 'Event Type Split This Month'}
                  </span>
                </h3>

                {(dashboard.charts?.eventTypeSplit || []).length === 0 ? (
                  <p className="text-xs text-stone-400 py-8 text-center">
                    {language === 'bn'
                      ? 'এই মাসে কোনো সক্রিয় অনুষ্ঠান নেই।'
                      : 'No active events recorded for this month yet.'}
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="border-b border-stone-200 dark:border-stone-800 text-stone-500 font-bold">
                        <tr>
                          <th className="py-2">{t('eventTypeLabel')}</th>
                          <th className="py-2 text-right">
                            {language === 'bn' ? 'সংখ্যা' : 'Count'}
                          </th>
                          {canSeeMoney && (
                            <th className="py-2 text-right">
                              {language === 'bn' ? 'রাজস্ব' : 'Revenue'}
                            </th>
                          )}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
                        {dashboard.charts.eventTypeSplit.map((ev: any) => (
                          <tr key={ev.event_type}>
                            <td className="py-2 font-bold">{t(`event_${ev.event_type}` as any)}</td>
                            <td className="py-2 text-right font-extrabold">
                              {formatNumberByLanguage(ev.count, language)}
                            </td>
                            {canSeeMoney && (
                              <td className="py-2 text-right font-bold text-[#4A2545] dark:text-[#C5A059]">
                                {formatCurrency(ev.revenue || 0, language)}
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            {/* i) Recent Activity: Last 10 Actions from Audit Log (Strictly OWNER only) */}
            {role === 'OWNER' && (
              <div className="p-5 sm:p-6 rounded-3xl bg-white dark:bg-[#1D1820] border border-stone-200/90 dark:border-stone-800 shadow-xs space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm sm:text-base font-extrabold text-stone-900 dark:text-stone-100 flex items-center gap-2">
                    <History className="w-5 h-5 text-[#4A2545] dark:text-[#C5A059]" />
                    <span>{t('recentActivityTitle')}</span>
                  </h2>
                  <button
                    onClick={() => onNavigateTab('audit_log')}
                    className="text-xs font-bold text-[#4A2545] dark:text-[#C5A059] hover:underline cursor-pointer"
                  >
                    {t('navAuditLog')}
                  </button>
                </div>

                {(dashboard.recentActivity || []).length === 0 ? (
                  <p className="text-xs text-stone-500">{t('noAuditLogs')}</p>
                ) : (
                  <div className="space-y-2">
                    {dashboard.recentActivity.map((log: any) => (
                      <div
                        key={log.id}
                        className="p-3 rounded-2xl bg-stone-50 dark:bg-stone-900/50 border border-stone-200/70 dark:border-stone-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="px-2 py-0.5 rounded-md font-mono font-bold bg-[#4A2545]/10 text-[#4A2545] dark:bg-[#C5A059]/20 dark:text-[#C5A059]">
                            {log.action}
                          </span>
                          <span className="font-bold text-stone-900 dark:text-stone-100">
                            {log.user_name}
                          </span>
                        </div>
                        <span className="text-[11px] text-stone-500">
                          {formatDualDate(log.created_at, { includeTime: true })}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </SectionLoader>

      {/* Quick Action Modal: Add Cost directly from Home (Section 6) */}
      <Modal
        isOpen={addCostModalOpen}
        onClose={handleCloseAddCostModal}
        title={language === 'bn' ? 'নতুন খরচ যোগ করুন (Add Cost)' : 'Add Cost'}
        maxWidth="md"
      >
        <form onSubmit={handleQuickSaveCost} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 mb-1">
                {language === 'bn' ? 'খরচের খাত (Category) *' : 'Category *'}
              </label>
              <select
                value={costCategory}
                onChange={(e) => setCostCategory(e.target.value as ExpenseCategory)}
                className="w-full px-3 py-2.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-xs font-bold"
              >
                {HOME_COST_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {t(`expCat_${c}` as any)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 mb-1">
                {language === 'bn' ? 'পরিমাণ (৳) *' : 'Amount (BDT) *'}
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                value={costAmount}
                onChange={(e) => setCostAmount(e.target.value)}
                placeholder="0.00"
                className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-xs font-extrabold"
              />
            </div>
          </div>

          <DualDatePicker
            label={language === 'bn' ? 'খরচের তারিখ (বাংলা ও ইংরেজি) *' : 'Date (Bangla & English) *'}
            value={costDate}
            onChange={setCostDate}
          />

          <div>
            <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 mb-1">
              {language === 'bn' ? 'বিবরণ / নোট' : 'Note / Description'}
            </label>
            <textarea
              rows={2}
              value={costNote}
              onChange={(e) => setCostNote(e.target.value)}
              placeholder={
                language === 'bn'
                  ? 'যেমন: বিদ্যুৎ বিল / পরিষ্কার সামগ্রী ক্রয়'
                  : 'e.g. Monthly electricity bill / cleaning supplies'
              }
              className="w-full px-3.5 py-2 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-xs"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 mb-1">
              {language === 'bn'
                ? 'ভাউচার বা রশিদের ছবি (ঐচ্ছিক, সর্বোচ্চ ২MB — PNG/JPG/WebP)'
                : 'Receipt Photo (Optional, Max 2MB — PNG/JPG/WebP)'}
            </label>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={handleCostReceiptFileChange}
              className="w-full text-xs text-stone-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-[#4A2545]/10 file:text-[#4A2545] hover:file:bg-[#4A2545]/20"
            />
            {costReceiptFileName && (
              <p className="text-[11px] text-[#0E8A44] font-semibold mt-1">
                ✓ {costReceiptFileName}
              </p>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-stone-100 dark:border-stone-800">
            <button
              type="button"
              onClick={handleCloseAddCostModal}
              className="px-4 py-2 text-xs font-semibold text-stone-600 dark:text-stone-300"
            >
              {t('cancel')}
            </button>
            <ActionButton
              type="submit"
              loading={savingCost}
              loadingLabel={t('saving')}
              icon={<Receipt className="w-4 h-4" />}
            >
              {t('save')}
            </ActionButton>
          </div>
        </form>
      </Modal>

      {/* Quick Action Modal: Record Payment (Pick an upcoming or due booking) */}
      <Modal
        isOpen={recordPayModalOpen}
        onClose={() => setRecordPayModalOpen(false)}
        title={t('recordPaymentBtn')}
        maxWidth="md"
      >
        <div className="space-y-3">
          <p className="text-xs text-stone-600 dark:text-stone-300">
            {language === 'bn'
              ? 'পেমেন্ট রেকর্ড ও মানি রিসিট তৈরি করতে নিচের বুকিংটি নির্বাচন করুন:'
              : 'Select a booking below to open its Payments & Money Receipt tab:'}
          </p>
          <div className="max-h-72 overflow-y-auto space-y-2">
            {(dashboard?.miniCalendarBookings || []).length === 0 ? (
              <p className="text-xs text-stone-400 py-4 text-center">
                {language === 'bn' ? 'কোনো বুকিং পাওয়া যায়নি।' : 'No active bookings found.'}
              </p>
            ) : (
              (dashboard?.miniCalendarBookings || []).map((b: any) => (
                <div
                  key={b.id}
                  onClick={() => {
                    setRecordPayModalOpen(false);
                    onOpenBookingDetail(b.id);
                  }}
                  className="p-3 rounded-xl border border-stone-200 dark:border-stone-800 hover:border-[#4A2545] flex items-center justify-between text-xs cursor-pointer"
                >
                  <div>
                    <div className="font-mono font-bold text-[#4A2545] dark:text-[#C5A059]">
                      {b.booking_number} — {b.customer_name}
                    </div>
                    <div className="text-[11px] text-stone-500">
                      {formatDualDateFromYMD(b.event_date)} • {b.hall_name}
                    </div>
                  </div>
                  <SlotBadge slot={b.slot as SlotType} size="xs" />
                </div>
              ))
            )}
          </div>
        </div>
      </Modal>

      {/* Quick Action Modal: Add Customer */}
      <Modal
        isOpen={addCustModalOpen}
        onClose={handleCloseAddCustomerModal}
        title={t('addCustomerBtn')}
        maxWidth="sm"
      >
        <form onSubmit={handleQuickAddCustomer} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 mb-1">
              {t('customerNameLabel')} *
            </label>
            <input
              type="text"
              required
              value={newCustName}
              onChange={(e) => setNewCustName(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-xs"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 mb-1">
              {t('customerPhoneLabel')} *
            </label>
            <input
              type="text"
              required
              value={newCustPhone}
              onChange={(e) => setNewCustPhone(e.target.value)}
              placeholder="01711-XXXXXX"
              className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-xs font-mono"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 mb-1">
              {t('customerAddressLabel')}
            </label>
            <input
              type="text"
              value={newCustAddress}
              onChange={(e) => setNewCustAddress(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-xs"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={handleCloseAddCustomerModal}
              className="px-4 py-2 text-xs font-semibold text-stone-600 dark:text-stone-300"
            >
              {t('cancel')}
            </button>
            <ActionButton
              type="submit"
              loading={savingCust}
              loadingLabel={t('saving')}
            >
              {t('save')}
            </ActionButton>
          </div>
        </form>
      </Modal>

      {/* Mini Calendar Day Inspection Modal */}
      <Modal
        isOpen={Boolean(selectedMiniDateYMD)}
        onClose={() => setSelectedMiniDateYMD(null)}
        title={
          selectedMiniDateYMD ? formatFullDualDateWithWeekdayFromYMD(selectedMiniDateYMD) : ''
        }
        maxWidth="md"
      >
        {selectedMiniDateYMD && dashboard && (
          <div className="space-y-4">
            {(['DAY', 'NIGHT'] as const).map((half) => {
              const list = (dashboard.miniCalendarBookings || []).filter(
                (b: any) =>
                  b.event_date === selectedMiniDateYMD && (b.slot === half || b.slot === 'FULL')
              );
              return (
                <div
                  key={half}
                  className="p-3.5 rounded-2xl bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-800 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <SlotBadge slot={half} size="sm" showDualLang />
                    {canCreate && (
                      <ActionButton
                        onClick={() => {
                          const dt = selectedMiniDateYMD;
                          setSelectedMiniDateYMD(null);
                          onOpenNewBooking({ event_date: dt, slot: half });
                        }}
                        className="!px-3 !py-1.5 !min-h-[36px] !text-xs"
                      >
                        + {t('newBookingBtn')}
                      </ActionButton>
                    )}
                  </div>
                  {list.length === 0 ? (
                    <p className="text-xs text-[#0E8A44] font-semibold">✓ {t('slotFree')}</p>
                  ) : (
                    list.map((b: any) => (
                      <div
                        key={b.id}
                        onClick={() => {
                          setSelectedMiniDateYMD(null);
                          onOpenBookingDetail(b.id);
                        }}
                        className="p-2.5 rounded-xl bg-white dark:bg-stone-950 border border-stone-200 dark:border-stone-800 text-xs cursor-pointer"
                      >
                        <div className="font-bold">
                          {b.booking_number} — {b.customer_name}
                        </div>
                        <div className="text-[11px] text-stone-500">{b.hall_name}</div>
                      </div>
                    ))
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Modal>
    </div>
  );
};
