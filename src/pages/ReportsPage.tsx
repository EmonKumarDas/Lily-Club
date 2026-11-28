import React, { useState, useEffect } from 'react';
import {
  BarChart3,
  Download,
  Printer,
  Shield,
  TrendingUp,
  AlertCircle,
  Building2,
  Calendar,
  Percent,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.js';
import { useToast } from '../components/Toast.js';
import { SectionLoader } from '../components/Loader.js';
import { ActionButton } from '../components/ActionButton.js';
import { EmptyState } from '../components/EmptyState.js';
import { SlotBadge, type SlotType } from '../components/SlotBadge.js';
import { DualDatePicker } from '../components/DualDatePicker.js';
import {
  formatDualDateFromYMD,
  formatCurrency,
  formatNumberByLanguage,
  getTodayDhakaYMD,
  toBanglaDigits,
} from '../lib/dateUtils.js';
import { apiRequest, CLIENT_APP_VERSION } from '../lib/api.js';
import type { HallItem } from './HallsPage.js';

export const ReportsPage: React.FC<{
  onOpenBookingDetail?: (bookingId: string) => void;
}> = ({ onOpenBookingDetail }) => {
  const { activeRoom, activeMember, language, t } = useAuth();
  const { showError, showSuccess } = useToast();

  const canViewReports = activeMember?.role === 'OWNER' || activeMember?.role === 'MANAGER';

  const todayYMD = getTodayDhakaYMD();
  const currentYear = todayYMD.slice(0, 4);
  const currentMonth = todayYMD.slice(0, 7);

  const [presetMode, setPresetMode] = useState<'monthly' | 'yearly' | 'custom'>('monthly');
  const [dateFrom, setDateFrom] = useState<string>(() => `${currentMonth}-01`);
  const [dateTo, setDateTo] = useState<string>(() => {
    const [y, m] = currentMonth.split('-').map(Number);
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return `${currentMonth}-${String(lastDay).padStart(2, '0')}`;
  });
  const [slotFilter, setSlotFilter] = useState<string>('');
  const [hallFilter, setHallFilter] = useState<string>('');
  const [halls, setHalls] = useState<HallItem[]>([]);

  const [report, setReport] = useState<any | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [exporting, setExporting] = useState<boolean>(false);

  useEffect(() => {
    if (activeRoom && canViewReports) {
      apiRequest<{ halls: HallItem[] }>(`/api/rooms/${activeRoom.id}/halls`)
        .then((res) => setHalls(res.halls || []))
        .catch(() => {});
    }
  }, [activeRoom, canViewReports]);

  useEffect(() => {
    if (activeRoom && canViewReports) {
      fetchReport();
    } else {
      setLoading(false);
    }
  }, [activeRoom, canViewReports, dateFrom, dateTo, slotFilter, hallFilter]);

  const fetchReport = async () => {
    if (!activeRoom) return;
    setLoading(true);
    setFetchError(null);
    try {
      const params = new URLSearchParams({
        dateFrom,
        dateTo,
        slot: slotFilter,
        hallId: hallFilter,
      });
      const res = await apiRequest<{ report: any }>(
        `/api/rooms/${activeRoom.id}/reports?${params.toString()}`
      );
      setReport(res.report);
    } catch (err: any) {
      const msg = language === 'bn' ? err.messageBn || 'প্রতিবেদন লোড করতে সমস্যা হয়েছে।' : err.messageEn || 'Failed to load report.';
      setFetchError(msg);
      showError(msg);
    } finally {
      setLoading(false);
    }
  };

  const applyPreset = (mode: 'monthly' | 'yearly' | 'custom') => {
    setPresetMode(mode);
    if (mode === 'monthly') {
      const [y, m] = currentMonth.split('-').map(Number);
      const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
      setDateFrom(`${currentMonth}-01`);
      setDateTo(`${currentMonth}-${String(lastDay).padStart(2, '0')}`);
    } else if (mode === 'yearly') {
      setDateFrom(`${currentYear}-01-01`);
      setDateTo(`${currentYear}-12-31`);
    }
  };

  const handleExportCsv = async () => {
    if (!activeRoom || exporting) return;
    setExporting(true);
    try {
      const params = new URLSearchParams({
        dateFrom,
        dateTo,
        slot: slotFilter,
        hallId: hallFilter,
        format: 'csv',
        lang: language,
      });
      const response = await fetch(
        `/api/rooms/${activeRoom.id}/reports/export?${params.toString()}`,
        {
          credentials: 'include',
          headers: { 'X-Client-Version': CLIENT_APP_VERSION },
        }
      );
      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(
          (language === 'bn' ? errJson.messageBn : errJson.messageEn) || 'Export failed'
        );
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `lilycc-report-${dateFrom}-to-${dateTo}-${language}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showSuccess(
        language === 'bn'
          ? 'সিএসভি (CSV) প্রতিবেদন ডাউনলোড সম্পন্ন হয়েছে!'
          : 'CSV report exported and logged in Audit Log!'
      );
    } catch (err: any) {
      showError(err.message);
    } finally {
      setExporting(false);
    }
  };

  const handleExportPdf = async () => {
    if (!activeRoom || !report || exporting) return;
    setExporting(true);
    try {
      const params = new URLSearchParams({
        dateFrom,
        dateTo,
        slot: slotFilter,
        hallId: hallFilter,
        format: 'pdf',
        lang: language,
      });
      // Calls server endpoint so export rate-limit and audit log are recorded
      await apiRequest(`/api/rooms/${activeRoom.id}/reports/export?${params.toString()}`);

      const dualFrom = formatDualDateFromYMD(dateFrom);
      const dualTo = formatDualDateFromYMD(dateTo);
      const isBn = language === 'bn';
      const fmtNum = (val: number | string) => (isBn ? toBanglaDigits(val) : String(val));
      const fmtCurr = (amt: number) => formatCurrency(amt, language);
      const slotName = (s: string) =>
        s === 'DAY'
          ? 'দিন (Day)'
          : s === 'NIGHT'
          ? 'রাত (Night)'
          : s === 'FULL'
          ? 'দিন ও রাত (Full)'
          : 'সকল স্লট (All Slots)';

      const win = window.open('', '_blank', 'width=960,height=900');
      if (!win) {
        window.print();
        return;
      }

      win.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="UTF-8" />
            <title>Financial & Slot Report - ${activeRoom.name}</title>
            <style>
              @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&family=Noto+Sans+Bengali:wght@400;600;800&display=swap');
              body { font-family: 'Noto Sans Bengali', 'Inter', sans-serif; padding: 28px; color: #1c1917; max-width: 900px; margin: 0 auto; }
              .header { text-align: center; border-bottom: 3px solid #582C4D; padding-bottom: 14px; margin-bottom: 18px; }
              .title { font-size: 22px; font-weight: 800; color: #582C4D; margin: 0; }
              .kpi-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 18px; }
              .kpi { border: 1px solid #e7e5e4; border-radius: 10px; padding: 10px; background: #fafaf9; }
              .lbl { font-size: 11px; color: #78716c; font-weight: 700; }
              .val { font-size: 15px; font-weight: 800; margin-top: 3px; }
              table { width: 100%; border-collapse: collapse; margin-top: 12px; margin-bottom: 18px; }
              th, td { border: 1px solid #e7e5e4; padding: 8px; text-align: left; font-size: 12px; }
              th { background: #f5f5f4; font-weight: 800; }
            </style>
          </head>
          <body>
            <div class="header">
              <h1 class="title">লিলি কমিউনিটি সেন্টার | ${activeRoom.name}</h1>
              <div style="font-size:12px; color:#57534e; margin-top:4px;">
                আর্থিক ও স্লট বিশ্লেষণ প্রতিবেদন / FINANCIAL & SLOT ANALYTICS REPORT
              </div>
              <div style="font-size:12px; font-weight:700; margin-top:6px;">
                সময়কাল / Period: ${dualFrom} — ${dualTo} • স্লট / Slot: ${slotName(slotFilter || 'ALL')}
              </div>
            </div>

            <div class="kpi-grid">
              <div class="kpi">
                <div class="lbl">মোট বুকিং / Total Bookings</div>
                <div class="val">${fmtNum(report.totalBookings)}</div>
              </div>
              <div class="kpi">
                <div class="lbl">মোট রাজস্ব / Revenue (Excl. Cancelled)</div>
                <div class="val">${fmtCurr(report.revenue)}</div>
              </div>
              <div class="kpi">
                <div class="lbl">নিট আদায় / Net Collected</div>
                <div class="val" style="color:#047857;">${fmtCurr(report.collected)}</div>
              </div>
              <div class="kpi">
                <div class="lbl">মোট বকেয়া / Outstanding Due</div>
                <div class="val" style="color:#be123c;">${fmtCurr(report.due)}</div>
              </div>
              <div class="kpi">
                <div class="lbl">মোট খরচ / Expenses</div>
                <div class="val">${fmtCurr(report.expenses)}</div>
              </div>
              <div class="kpi">
                <div class="lbl">নিট মুনাফা / Net Profit</div>
                <div class="val" style="color:#582C4D;">${fmtCurr(report.profit)}</div>
              </div>
            </div>

            <h3 style="font-size:14px;">স্লট ভিত্তিক বিশ্লেষণ / Slot Breakdown (Day / Night / Full)</h3>
            <table>
              <thead>
                <tr>
                  <th>স্লট / Slot</th>
                  <th>বুকিং সংখ্যা / Bookings</th>
                  <th>রাজস্ব / Revenue</th>
                  <th>আদায় / Collected</th>
                  <th>বকেয়া / Due</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>দিন (Day)</td>
                  <td>${fmtNum(report.slotBreakdown.DAY.count)}</td>
                  <td>${fmtCurr(report.slotBreakdown.DAY.revenue)}</td>
                  <td>${fmtCurr(report.slotBreakdown.DAY.collected)}</td>
                  <td>${fmtCurr(report.slotBreakdown.DAY.due)}</td>
                </tr>
                <tr>
                  <td>রাত (Night)</td>
                  <td>${fmtNum(report.slotBreakdown.NIGHT.count)}</td>
                  <td>${fmtCurr(report.slotBreakdown.NIGHT.revenue)}</td>
                  <td>${fmtCurr(report.slotBreakdown.NIGHT.collected)}</td>
                  <td>${fmtCurr(report.slotBreakdown.NIGHT.due)}</td>
                </tr>
                <tr>
                  <td>দিন ও রাত (Full)</td>
                  <td>${fmtNum(report.slotBreakdown.FULL.count)}</td>
                  <td>${fmtCurr(report.slotBreakdown.FULL.revenue)}</td>
                  <td>${fmtCurr(report.slotBreakdown.FULL.collected)}</td>
                  <td>${fmtCurr(report.slotBreakdown.FULL.due)}</td>
                </tr>
              </tbody>
            </table>

            <h3 style="font-size:14px;">বুকিং তালিকা / Bookings in Period</h3>
            <table>
              <thead>
                <tr>
                  <th>বুকিং নম্বর / No.</th>
                  <th>তারিখ (বাংলা ও ইংরেজি) / Date</th>
                  <th>স্লট / Slot</th>
                  <th>হল ও গ্রাহক / Hall & Customer</th>
                  <th>অবস্থা / Status</th>
                  <th>বিল / Total</th>
                  <th>জমা / Paid</th>
                  <th>বকেয়া / Due</th>
                </tr>
              </thead>
              <tbody>
                ${(report.bookingsInReport || [])
                  .map(
                    (b: any) => `
                  <tr>
                    <td style="font-family:monospace;">${fmtNum(b.booking_number)}</td>
                    <td>${formatDualDateFromYMD(b.event_date)}</td>
                    <td>${slotName(b.slot)}</td>
                    <td>${b.hall_name} — ${b.customer_name}</td>
                    <td>${t(`bStatus_${b.status}` as any)}</td>
                    <td>${fmtCurr(b.status === 'CANCELLED' ? 0 : b.total_amount)}</td>
                    <td>${fmtCurr(b.advance_amount)}</td>
                    <td>${fmtCurr(b.status === 'CANCELLED' ? 0 : b.due_amount)}</td>
                  </tr>`
                  )
                  .join('')}
              </tbody>
            </table>
            <script>window.onload = () => { window.print(); };</script>
          </body>
        </html>
      `);
      win.document.close();
    } catch (err: any) {
      showError(language === 'bn' ? err.messageBn || err.message : err.messageEn || err.message);
    } finally {
      setExporting(false);
    }
  };

  if (!canViewReports) {
    return (
      <div className="p-8 max-w-xl mx-auto">
        <EmptyState
          icon={Shield}
          title={t('moneyHiddenNotice')}
          description={
            language === 'bn'
              ? 'আর্থিক প্রতিবেদন শুধুমাত্র ওনার ও ম্যানেজারের জন্য সংরক্ষিত।'
              : 'Financial reports and occupancy analytics are restricted to Owner and Manager roles.'
          }
        />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-stone-200 dark:border-stone-800 pb-5">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-stone-900 dark:text-stone-100 flex items-center gap-2.5">
            <BarChart3 className="w-6 h-6 text-[#582C4D] dark:text-[#C5A059]" />
            <span>
              {language === 'bn'
                ? 'আর্থিক প্রতিবেদন ও স্লট বিশ্লেষণ (Reports)'
                : 'Financial Reports & Slot Analytics'}
            </span>
          </h1>
          <p className="text-xs sm:text-sm text-stone-500 dark:text-stone-400 mt-1">
            {language === 'bn'
              ? 'দিন, রাত এবং দিন ও রাত (Full) স্লটের রাজস্ব, আদায়, বকেয়া, খরচ, মুনাফা ও অকুপেন্সি বিশ্লেষণ।'
              : 'Revenue, collected payments, dues, expenses, profit, slot breakdown, and hall occupancy.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <ActionButton
            variant="secondary"
            onClick={handleExportCsv}
            loading={exporting}
            disabled={loading}
            icon={<Download className="w-3.5 h-3.5" />}
          >
            {language === 'bn' ? 'CSV এক্সপোর্ট' : 'Export CSV'}
          </ActionButton>

          <ActionButton
            onClick={handleExportPdf}
            loading={exporting}
            disabled={loading}
            icon={<Printer className="w-3.5 h-3.5" />}
          >
            {language === 'bn' ? 'PDF প্রিন্ট / এক্সপোর্ট' : 'Export PDF Report'}
          </ActionButton>
        </div>
      </div>

      {/* Date Range & Slot / Hall Filters */}
      <div className="p-4 rounded-2xl bg-white dark:bg-[#1E1920] border border-stone-200 dark:border-stone-800 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex p-1 bg-stone-100 dark:bg-stone-800 rounded-xl">
            {(['monthly', 'yearly', 'custom'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => applyPreset(m)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  presetMode === m
                    ? 'bg-white dark:bg-[#1E1920] text-[#582C4D] dark:text-[#C5A059] shadow-xs'
                    : 'text-stone-600 dark:text-stone-400'
                }`}
              >
                {m === 'monthly'
                  ? language === 'bn'
                    ? 'চলতি মাস (Monthly)'
                    : 'Monthly View'
                  : m === 'yearly'
                  ? language === 'bn'
                    ? 'চলতি বছর (Yearly)'
                    : 'Yearly View'
                  : language === 'bn'
                  ? 'কাস্টম সীমা'
                  : 'Custom Range'}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={slotFilter}
              onChange={(e) => setSlotFilter(e.target.value)}
              className="px-3 py-2 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-900 text-xs font-bold"
            >
              <option value="">
                {language === 'bn' ? 'সকল স্লট (All Slots)' : 'All Slots (Day / Night / Full)'}
              </option>
              <option value="DAY">☀️ {t('slot_DAY')} (Day)</option>
              <option value="NIGHT">🌙 {t('slot_NIGHT')} (Night)</option>
              <option value="FULL">☀️🌙 {t('slot_FULL')} (Full)</option>
            </select>

            <select
              value={hallFilter}
              onChange={(e) => setHallFilter(e.target.value)}
              className="px-3 py-2 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-900 text-xs font-bold"
            >
              <option value="">{language === 'bn' ? 'সকল হল (All Halls)' : 'All Halls'}</option>
              {halls.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <DualDatePicker
            label={language === 'bn' ? 'শুরুর তারিখ (বাংলা ও ইংরেজি)' : 'Start Date (Bangla & English)'}
            value={dateFrom}
            onChange={(v) => {
              setPresetMode('custom');
              setDateFrom(v);
            }}
          />
          <DualDatePicker
            label={language === 'bn' ? 'শেষের তারিখ (বাংলা ও ইংরেজি)' : 'End Date (Bangla & English)'}
            value={dateTo}
            onChange={(v) => {
              setPresetMode('custom');
              setDateTo(v);
            }}
          />
        </div>
      </div>

      <SectionLoader
        loading={loading || (!report && !fetchError)}
        error={fetchError}
        onRetry={fetchReport}
        language={language}
        labelBn="প্রতিবেদন তৈরি হচ্ছে..."
        labelEn="Generating financial report..."
      >
        {report && (
        <div className="space-y-6">
          {/* Top 7 Financial & Operational KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            <div className="p-4 rounded-2xl bg-white dark:bg-[#1E1920] border border-stone-200 dark:border-stone-800">
              <div className="text-[11px] font-bold text-stone-500">
                {language === 'bn' ? 'মোট বুকিং' : 'Total Bookings'}
              </div>
              <div className="text-lg font-extrabold text-stone-900 dark:text-stone-100 mt-1">
                {formatNumberByLanguage(report.totalBookings, language)}
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-white dark:bg-[#1E1920] border border-stone-200 dark:border-stone-800">
              <div className="text-[11px] font-bold text-stone-500">
                {language === 'bn' ? 'মোট রাজস্ব (Revenue)' : 'Revenue'}
              </div>
              <div className="text-lg font-extrabold text-[#582C4D] dark:text-[#C5A059] mt-1">
                {formatCurrency(report.revenue, language)}
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900">
              <div className="text-[11px] font-bold text-emerald-800 dark:text-emerald-300">
                {language === 'bn' ? 'নিট আদায় (Collected)' : 'Collected'}
              </div>
              <div className="text-lg font-extrabold text-emerald-700 dark:text-emerald-400 mt-1">
                {formatCurrency(report.collected, language)}
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-rose-50/60 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900">
              <div className="text-[11px] font-bold text-rose-800 dark:text-rose-300">
                {language === 'bn' ? 'বকেয়া (Due)' : 'Outstanding Due'}
              </div>
              <div className="text-lg font-extrabold text-rose-600 dark:text-rose-400 mt-1">
                {formatCurrency(report.due, language)}
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-white dark:bg-[#1E1920] border border-stone-200 dark:border-stone-800">
              <div className="text-[11px] font-bold text-stone-500">
                {language === 'bn' ? 'মোট খরচ (Expenses)' : 'Expenses'}
              </div>
              <div className="text-lg font-extrabold text-stone-900 dark:text-stone-100 mt-1">
                {formatCurrency(report.expenses, language)}
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-[#582C4D]/8 dark:bg-[#C5A059]/15 border border-[#582C4D]/25 dark:border-[#C5A059]/30">
              <div className="text-[11px] font-bold text-[#582C4D] dark:text-[#C5A059]">
                {language === 'bn' ? 'নিট মুনাফা (Profit)' : 'Net Profit'}
              </div>
              <div className="text-lg font-extrabold text-stone-900 dark:text-stone-100 mt-1">
                {formatCurrency(report.profit, language)}
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-white dark:bg-[#1E1920] border border-stone-200 dark:border-stone-800">
              <div className="text-[11px] font-bold text-stone-500">
                {language === 'bn' ? 'বাতিল বুকিং' : 'Cancellations'}
              </div>
              <div className="text-lg font-extrabold text-rose-600 mt-1">
                {formatNumberByLanguage(report.cancellationsCount, language)}
              </div>
            </div>
          </div>

          {/* Slot Breakdown Cards (DAY / NIGHT / FULL) */}
          <div className="p-5 rounded-3xl bg-white dark:bg-[#1E1920] border border-stone-200 dark:border-stone-800 shadow-xs space-y-4">
            <h2 className="text-sm sm:text-base font-extrabold text-stone-900 dark:text-stone-100">
              {language === 'bn'
                ? 'স্লট ভিত্তিক বুকিং ও রাজস্ব বিশ্লেষণ (দিন / রাত / দিন ও রাত)'
                : 'Slot Breakdown: Bookings & Revenue (Day / Night / Full)'}
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {(['DAY', 'NIGHT', 'FULL'] as SlotType[]).map((sType) => {
                const sb = report.slotBreakdown[sType];
                return (
                  <div
                    key={sType}
                    className="p-4 rounded-2xl bg-stone-50 dark:bg-stone-900/60 border border-stone-200 dark:border-stone-800 space-y-2.5"
                  >
                    <div className="flex items-center justify-between">
                      <SlotBadge slot={sType} size="sm" showDualLang />
                      <span className="text-xs font-extrabold px-2.5 py-0.5 rounded-full bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700">
                        {formatNumberByLanguage(sb.count, language)}{' '}
                        {language === 'bn' ? 'টি সক্রিয় বুকিং' : 'Active Bookings'}
                      </span>
                    </div>

                    <div className="pt-1 space-y-1 text-xs">
                      <div className="flex justify-between">
                        <span className="text-stone-500">
                          {language === 'bn' ? 'রাজস্ব (Revenue):' : 'Revenue:'}
                        </span>
                        <span className="font-extrabold text-stone-900 dark:text-stone-100">
                          {formatCurrency(sb.revenue, language)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-stone-500">
                          {language === 'bn' ? 'নিট আদায় (Collected):' : 'Collected:'}
                        </span>
                        <span className="font-bold text-emerald-600">
                          {formatCurrency(sb.collected, language)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-stone-500">
                          {language === 'bn' ? 'বকেয়া (Due):' : 'Due:'}
                        </span>
                        <span className="font-bold text-rose-600">
                          {formatCurrency(sb.due, language)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Hall Occupancy & Monthly Occupancy (Full booking counts once for Day and once for Night) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="p-5 rounded-3xl bg-white dark:bg-[#1E1920] border border-stone-200 dark:border-stone-800 shadow-xs space-y-3">
              <h3 className="text-sm font-extrabold text-stone-900 dark:text-stone-100 flex items-center gap-2">
                <Building2 className="w-4 h-4 text-[#582C4D] dark:text-[#C5A059]" />
                <span>
                  {language === 'bn'
                    ? 'হল ভিত্তিক স্লট অকুপেন্সি (%)'
                    : 'Occupancy per Hall (Day % vs Night %)'}
                </span>
              </h3>
              <p className="text-[11px] text-stone-500">
                {language === 'bn'
                  ? 'নোট: একটি "দিন ও রাত (Full)" বুকিং দিনের জন্য ১ বার এবং রাতের জন্য ১ বার গণ্য হয় (কখনোই দ্বিগুণ নয়)।'
                  : 'Note: A Full booking counts once for Day and once for Night, never double.'}
              </p>

              <div className="space-y-2.5">
                {(report.occupancyByHall || []).map((oh: any) => (
                  <div
                    key={oh.hall_id}
                    className="p-3 rounded-2xl bg-stone-50 dark:bg-stone-900/60 border border-stone-200 dark:border-stone-800 text-xs space-y-1.5"
                  >
                    <div className="font-bold text-stone-900 dark:text-stone-100">
                      {oh.hall_name}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <span className="text-stone-500">☀️ {t('slot_DAY')}: </span>
                        <strong>
                          {formatNumberByLanguage(oh.day_occupancy_pct, language)}%
                        </strong>{' '}
                        ({formatNumberByLanguage(oh.day_slots_booked, language)}/
                        {formatNumberByLanguage(oh.total_days_in_range, language)})
                      </div>
                      <div>
                        <span className="text-stone-500">🌙 {t('slot_NIGHT')}: </span>
                        <strong>
                          {formatNumberByLanguage(oh.night_occupancy_pct, language)}%
                        </strong>{' '}
                        ({formatNumberByLanguage(oh.night_slots_booked, language)}/
                        {formatNumberByLanguage(oh.total_days_in_range, language)})
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Busiest Months & Popular Event Types */}
            <div className="p-5 rounded-3xl bg-white dark:bg-[#1E1920] border border-stone-200 dark:border-stone-800 shadow-xs space-y-4">
              <div className="space-y-2">
                <h3 className="text-sm font-extrabold text-stone-900 dark:text-stone-100">
                  {language === 'bn'
                    ? 'মাসিক অকুপেন্সি ও ব্যস্ততম মাসসমূহ'
                    : 'Monthly Occupancy & Busiest Months'}
                </h3>
                {(report.occupancyByMonth || []).length === 0 ? (
                  <p className="text-xs text-stone-400">
                    {language === 'bn' ? 'কোনো সক্রিয় বুকিং নেই' : 'No active bookings in period'}
                  </p>
                ) : (
                  <div className="space-y-2">
                    {report.occupancyByMonth.map((om: any) => (
                      <div
                        key={om.month}
                        className="p-2.5 rounded-xl bg-stone-50 dark:bg-stone-900/60 border border-stone-200 dark:border-stone-800 flex flex-wrap items-center justify-between gap-2 text-xs"
                      >
                        <span className="font-mono font-bold text-[#582C4D] dark:text-[#C5A059]">
                          {om.month}
                        </span>
                        <span>
                          ☀️ {formatNumberByLanguage(om.day_occupancy_pct, language)}% ({formatNumberByLanguage(om.day_slots_booked, language)})
                        </span>
                        <span>
                          🌙 {formatNumberByLanguage(om.night_occupancy_pct, language)}% ({formatNumberByLanguage(om.night_slots_booked, language)})
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="pt-2 border-t border-stone-100 dark:border-stone-800 space-y-2">
                <h3 className="text-sm font-extrabold text-stone-900 dark:text-stone-100">
                  {language === 'bn' ? 'জনপ্রিয় অনুষ্ঠানের ধরন' : 'Popular Event Types'}
                </h3>
                <div className="flex flex-wrap gap-2">
                  {(report.popularEventTypes || []).map((pe: any) => (
                    <span
                      key={pe.event_type}
                      className="px-3 py-1 rounded-xl bg-stone-100 dark:bg-stone-800 text-xs font-bold"
                    >
                      {t(`event_${pe.event_type}` as any)}:{' '}
                      {formatNumberByLanguage(pe.count, language)} (
                      {formatCurrency(pe.revenue, language)})
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Outstanding Dues List */}
          <div className="p-5 rounded-3xl bg-white dark:bg-[#1E1920] border border-stone-200 dark:border-stone-800 shadow-xs space-y-3">
            <h3 className="text-sm sm:text-base font-extrabold text-stone-900 dark:text-stone-100 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600" />
              <span>
                {language === 'bn'
                  ? 'বকেয়া বুকিং তালিকা (Outstanding Dues List)'
                  : 'Outstanding Dues List'}
              </span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 font-mono">
                {formatNumberByLanguage((report.outstandingDuesList || []).length, language)}
              </span>
            </h3>

            {(report.outstandingDuesList || []).length === 0 ? (
              <p className="text-xs text-stone-500 py-3">
                {language === 'bn'
                  ? 'এই সময়কালে কোনো বকেয়া বুকিং নেই।'
                  : 'No bookings with outstanding due balance in this period.'}
              </p>
            ) : (
              <div className="overflow-x-auto border border-stone-200 dark:border-stone-800 rounded-2xl">
                <table className="w-full text-left text-xs">
                  <thead className="bg-stone-50 dark:bg-stone-900 border-b border-stone-200 dark:border-stone-800 font-bold text-stone-500">
                    <tr>
                      <th className="px-3 py-2.5">{t('bookingNumberLabel')}</th>
                      <th className="px-3 py-2.5">{t('eventDateLabel')}</th>
                      <th className="px-3 py-2.5">{t('slotLabel')}</th>
                      <th className="px-3 py-2.5">
                        {language === 'bn' ? 'গ্রাহক ও হল' : 'Customer & Hall'}
                      </th>
                      <th className="px-3 py-2.5 text-right">{t('totalAmountLabel')}</th>
                      <th className="px-3 py-2.5 text-right">{t('advanceAmountLabel')}</th>
                      <th className="px-3 py-2.5 text-right">{t('dueAmountLabel')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
                    {report.outstandingDuesList.map((d: any) => (
                      <tr
                        key={d.booking_id}
                        onClick={() => onOpenBookingDetail && onOpenBookingDetail(d.booking_id)}
                        className="hover:bg-stone-50 dark:hover:bg-stone-900/50 cursor-pointer"
                      >
                        <td className="px-3 py-2.5 font-mono font-bold text-[#582C4D] dark:text-[#C5A059]">
                          {d.booking_number}
                        </td>
                        <td className="px-3 py-2.5">{formatDualDateFromYMD(d.event_date)}</td>
                        <td className="px-3 py-2.5">
                          <SlotBadge slot={d.slot as SlotType} size="xs" />
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="font-bold">{d.customer_name}</div>
                          <div className="text-[11px] text-stone-500">{d.hall_name}</div>
                        </td>
                        <td className="px-3 py-2.5 text-right font-bold">
                          {formatCurrency(d.total_amount, language)}
                        </td>
                        <td className="px-3 py-2.5 text-right font-bold text-emerald-600">
                          {formatCurrency(d.paid_amount, language)}
                        </td>
                        <td className="px-3 py-2.5 text-right font-extrabold text-rose-600">
                          {formatCurrency(d.due_amount, language)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
        )}
      </SectionLoader>
    </div>
  );
};
