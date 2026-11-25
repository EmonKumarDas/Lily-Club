import React, { useState, useEffect } from 'react';
import {
  FileCheck2,
  Shield,
  RefreshCw,
  KeyRound,
  UserCheck,
  UserMinus,
  ShieldAlert,
  Sliders,
  Receipt,
  CreditCard,
  Download,
  RotateCcw,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.js';
import { useToast } from '../components/Toast.js';
import { LoadingSkeleton } from '../components/LoadingSkeleton.js';
import { EmptyState } from '../components/EmptyState.js';
import { DualDatePicker } from '../components/DualDatePicker.js';
import { formatDualDate } from '../lib/dateUtils.js';
import { apiRequest } from '../lib/api.js';

interface AuditLogItem {
  id: string;
  room_id: string;
  user_id: string;
  user_email: string;
  user_name: string;
  action: string;
  details: string;
  ip_address: string | null;
  created_at: number;
}

const AUDIT_ACTIONS = [
  'ROOM_CREATE',
  'ROOM_ID_REGENERATE',
  'JOIN_REQUEST',
  'JOIN_APPROVE',
  'JOIN_REJECT',
  'JOIN_DIRECT',
  'ROLE_CHANGE',
  'MEMBER_REMOVE',
  'SETTINGS_UPDATE',
  'HALL_CREATE',
  'HALL_UPDATE',
  'HALL_PRICE_CHANGE',
  'HALL_DEACTIVATE',
  'HALL_DELETE',
  'CUSTOMER_CREATE',
  'CUSTOMER_UPDATE',
  'CUSTOMER_DELETE',
  'BOOKING_CREATE',
  'BOOKING_EDIT',
  'BOOKING_CANCEL',
  'SLOT_CHANGE',
  'PRICE_CHANGE',
  'STATUS_CHANGE',
  'BOOKING_HOLD_EXPIRED',
  'PAYMENT_CREATE',
  'PAYMENT_REFUND',
  'PAYMENT_REVERSE',
  'EXPENSE_CREATE',
  'EXPENSE_REVERSE',
  'REPORT_EXPORT',
];

export const AuditLogPage: React.FC = () => {
  const { activeRoom, activeMember, language, t } = useAuth();
  const { showError } = useToast();

  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters: User, Action, Date Range
  const [userFilter, setUserFilter] = useState<string>('');
  const [actionFilter, setActionFilter] = useState<string>('');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');

  const isOwner = activeMember?.role === 'OWNER';

  useEffect(() => {
    if (activeRoom && isOwner) {
      apiRequest<{ members: any[] }>(`/api/rooms/${activeRoom.id}/members`)
        .then((res) => setMembers(res.members || []))
        .catch(() => {});
    }
  }, [activeRoom, isOwner]);

  useEffect(() => {
    if (activeRoom && isOwner) {
      fetchAuditLogs();
    }
  }, [activeRoom, isOwner, userFilter, actionFilter, dateFrom, dateTo]);

  const fetchAuditLogs = async () => {
    if (!activeRoom) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        userId: userFilter,
        action: actionFilter,
        dateFrom,
        dateTo,
        limit: '100',
      });
      const res = await apiRequest<{ logs: AuditLogItem[] }>(
        `/api/rooms/${activeRoom.id}/audit-logs?${params.toString()}`
      );
      setLogs(res.logs || []);
    } catch (err: any) {
      showError(err.messageBn || err.messageEn || 'Failed to load audit logs');
    } finally {
      setLoading(false);
    }
  };

  const getActionBadge = (action: string) => {
    switch (action) {
      case 'ROOM_CREATE':
        return {
          icon: Shield,
          color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border-emerald-300',
          labelBn: 'রুম তৈরি',
          labelEn: 'Room Created',
        };
      case 'ROOM_ID_REGENERATE':
        return {
          icon: KeyRound,
          color: 'bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 border-amber-300',
          labelBn: 'রুম কোড পরিবর্তন',
          labelEn: 'Room ID Regenerated',
        };
      case 'JOIN_APPROVE':
      case 'JOIN_DIRECT':
        return {
          icon: UserCheck,
          color: 'bg-sky-100 text-sky-800 dark:bg-sky-950/80 dark:text-sky-300 border-sky-300',
          labelBn: 'যোগদান অনুমোদন',
          labelEn: 'Join Approved',
        };
      case 'JOIN_REJECT':
      case 'MEMBER_REMOVE':
        return {
          icon: UserMinus,
          color: 'bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300 border-rose-300',
          labelBn: action === 'JOIN_REJECT' ? 'যোগদান বাতিল' : 'সদস্য অপসারণ',
          labelEn: action === 'JOIN_REJECT' ? 'Join Rejected' : 'Member Removed',
        };
      case 'ROLE_CHANGE':
        return {
          icon: ShieldAlert,
          color: 'bg-purple-100 text-purple-800 dark:bg-purple-950/80 dark:text-purple-300 border-purple-300',
          labelBn: 'পদবি পরিবর্তন',
          labelEn: 'Role Changed',
        };
      case 'SETTINGS_UPDATE':
        return {
          icon: Sliders,
          color: 'bg-stone-100 text-stone-800 dark:bg-stone-800 dark:text-stone-300 border-stone-300',
          labelBn: 'সেটিংস আপডেট',
          labelEn: 'Settings Updated',
        };
      case 'BOOKING_CREATE':
        return {
          icon: FileCheck2,
          color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border-emerald-300',
          labelBn: 'নতুন বুকিং তৈরি',
          labelEn: 'Booking Created',
        };
      case 'BOOKING_EDIT':
        return {
          icon: Sliders,
          color: 'bg-sky-100 text-sky-800 dark:bg-sky-950/80 dark:text-sky-300 border-sky-300',
          labelBn: 'বুকিং সম্পাদনা',
          labelEn: 'Booking Edited',
        };
      case 'BOOKING_CANCEL':
        return {
          icon: UserMinus,
          color: 'bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300 border-rose-300',
          labelBn: 'বুকিং বাতিল',
          labelEn: 'Booking Cancelled',
        };
      case 'SLOT_CHANGE':
        return {
          icon: RefreshCw,
          color: 'bg-purple-100 text-purple-800 dark:bg-purple-950/80 dark:text-purple-300 border-purple-300',
          labelBn: 'স্লট পরিবর্তন',
          labelEn: 'Slot Changed',
        };
      case 'PRICE_CHANGE':
      case 'HALL_PRICE_CHANGE':
        return {
          icon: ShieldAlert,
          color: 'bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 border-amber-300',
          labelBn: 'ভাড়া ও মূল্য পরিবর্তন',
          labelEn: 'Price Changed',
        };
      case 'STATUS_CHANGE':
        return {
          icon: UserCheck,
          color: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/80 dark:text-indigo-300 border-indigo-300',
          labelBn: 'বুকিং স্ট্যাটাস পরিবর্তন',
          labelEn: 'Booking Status Changed',
        };
      case 'PAYMENT_CREATE':
        return {
          icon: Receipt,
          color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border-emerald-300',
          labelBn: 'পেমেন্ট গ্রহণ ও মানি রিসিট',
          labelEn: 'Payment Recorded',
        };
      case 'PAYMENT_REFUND':
        return {
          icon: RotateCcw,
          color: 'bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 border-amber-300',
          labelBn: 'পেমেন্ট রিফান্ড',
          labelEn: 'Payment Refunded',
        };
      case 'PAYMENT_REVERSE':
        return {
          icon: RotateCcw,
          color: 'bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300 border-rose-300',
          labelBn: 'পেমেন্ট রিভার্সাল',
          labelEn: 'Payment Reversed',
        };
      case 'EXPENSE_CREATE':
        return {
          icon: CreditCard,
          color: 'bg-orange-100 text-orange-800 dark:bg-orange-950/80 dark:text-orange-300 border-orange-300',
          labelBn: 'নতুন খরচ এন্ট্রি',
          labelEn: 'Expense Recorded',
        };
      case 'EXPENSE_REVERSE':
        return {
          icon: RotateCcw,
          color: 'bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300 border-rose-300',
          labelBn: 'খরচ রিভার্সাল',
          labelEn: 'Expense Reversed',
        };
      case 'REPORT_EXPORT':
        return {
          icon: Download,
          color: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/80 dark:text-indigo-300 border-indigo-300',
          labelBn: 'প্রতিবেদন এক্সপোর্ট (PDF/CSV)',
          labelEn: 'Report Exported',
        };
      default:
        return {
          icon: Shield,
          color: 'bg-stone-100 text-stone-800 dark:bg-stone-800 dark:text-stone-300 border-stone-300',
          labelBn: action,
          labelEn: action,
        };
    }
  };

  if (!isOwner) {
    return (
      <div className="p-8 max-w-xl mx-auto">
        <EmptyState
          icon={Shield}
          title={t('roleDesc_OWNER')}
          description="Security Audit Logs are strictly restricted to the primary Room Owner."
        />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-stone-200 dark:border-stone-800 pb-5">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-stone-900 dark:text-stone-100 flex items-center gap-2.5">
            <FileCheck2 className="w-6 h-6 text-[#582C4D] dark:text-[#C5A059]" />
            <span>{t('auditLogTitle')}</span>
          </h1>
          <p className="text-xs sm:text-sm text-stone-500 dark:text-stone-400 mt-1">
            {t('auditLogSubtitle')}
          </p>
        </div>

        <button
          onClick={fetchAuditLogs}
          disabled={loading}
          className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-stone-700 dark:text-stone-200 bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 dark:hover:bg-stone-700 rounded-xl transition-colors self-start sm:self-auto cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>{t('refresh')}</span>
        </button>
      </div>

      {/* Security Notice Pill */}
      <div className="p-4 rounded-2xl bg-[#582C4D]/8 dark:bg-[#C5A059]/10 border border-[#582C4D]/15 dark:border-[#C5A059]/20 flex items-center gap-3 text-xs text-stone-700 dark:text-stone-300">
        <Shield className="w-4 h-4 text-[#582C4D] dark:text-[#C5A059] shrink-0" />
        <p className="leading-relaxed">{t('auditLogOwnerOnlyNote')}</p>
      </div>

      {/* Part 3 Filter Bar: Filter by User, Action, and Dual Date Range */}
      <div className="p-4 rounded-2xl bg-white dark:bg-[#1E1920] border border-stone-200 dark:border-stone-800 shadow-xs space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="block text-[11px] font-bold text-stone-600 dark:text-stone-400 mb-1">
              {language === 'bn' ? 'সদস্য / ব্যবহারকারী ফিল্টার' : 'Filter by User'}
            </label>
            <select
              value={userFilter}
              onChange={(e) => setUserFilter(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-900 text-xs font-bold"
            >
              <option value="">{language === 'bn' ? 'সকল সদস্য (All Users)' : 'All Users'}</option>
              {members.map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {m.user_name} ({m.role})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-stone-600 dark:text-stone-400 mb-1">
              {language === 'bn' ? 'পদক্ষেপ (Action) ফিল্টার' : 'Filter by Action'}
            </label>
            <select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-900 text-xs font-bold"
            >
              <option value="">{language === 'bn' ? 'সকল পদক্ষেপ (All Actions)' : 'All Actions'}</option>
              {AUDIT_ACTIONS.map((act) => (
                <option key={act} value={act}>
                  {act}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-stone-600 dark:text-stone-400 mb-1">
              {language === 'bn' ? 'শুরুর তারিখ' : 'From Date'}
            </label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-900 text-xs font-mono"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-stone-600 dark:text-stone-400 mb-1">
              {language === 'bn' ? 'শেষের তারিখ' : 'To Date'}
            </label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-900 text-xs font-mono"
            />
          </div>
        </div>
      </div>

      {/* Logs Table / Cards (Strictly Append-Only: no edit, no delete buttons anywhere) */}
      {loading ? (
        <LoadingSkeleton rows={4} />
      ) : logs.length === 0 ? (
        <EmptyState
          icon={FileCheck2}
          title={t('noAuditLogs')}
          description="Actions performed by the room owner and members will be logged here automatically."
        />
      ) : (
        <div className="space-y-3">
          {logs.map((log) => {
            const badge = getActionBadge(log.action);
            const Icon = badge.icon;
            let parsedDetails: any = null;
            try {
              parsedDetails = JSON.parse(log.details);
            } catch {
              parsedDetails = log.details;
            }

            return (
              <div
                key={log.id}
                className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#1E1920] border border-stone-200 dark:border-stone-800 shadow-xs space-y-3"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border ${badge.color}`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      <span>{language === 'bn' ? badge.labelBn : badge.labelEn}</span>
                    </span>

                    <span className="text-xs font-semibold text-stone-900 dark:text-stone-100 truncate">
                      {log.user_name}
                    </span>
                    <span className="text-xs text-stone-400 truncate">({log.user_email})</span>
                  </div>

                  <div className="text-xs font-medium text-stone-500 dark:text-stone-400">
                    {formatDualDate(log.created_at, { includeTime: true })}
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-stone-50 dark:bg-stone-900/60 border border-stone-100 dark:border-stone-800 font-mono text-xs text-stone-600 dark:text-stone-300 break-all">
                  {typeof parsedDetails === 'object'
                    ? JSON.stringify(parsedDetails, null, 2)
                    : String(parsedDetails)}
                </div>

                {log.ip_address && (
                  <div className="text-[11px] text-stone-400 font-mono">
                    IP: {log.ip_address}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
