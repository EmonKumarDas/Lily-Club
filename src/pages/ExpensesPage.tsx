import React, { useState, useEffect } from 'react';
import {
  CreditCard,
  Plus,
  RotateCcw,
  Image as ImageIcon,
  Shield,
  Receipt,
  Calendar,
  FileText,
  ExternalLink,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.js';
import { useToast } from '../components/Toast.js';
import { Modal } from '../components/Modal.js';
import { SectionLoader } from '../components/Loader.js';
import { ActionButton, useUnsavedChanges } from '../components/ActionButton.js';
import { EmptyState } from '../components/EmptyState.js';
import { DualDatePicker } from '../components/DualDatePicker.js';
import {
  formatDualDateFromYMD,
  formatDualDate,
  formatCurrency,
  formatNumberByLanguage,
  getTodayDhakaYMD,
} from '../lib/dateUtils.js';
import { apiRequest, generateIdempotencyKey } from '../lib/api.js';

export type ExpenseCategory =
  | 'ELECTRICITY'
  | 'SALARY'
  | 'REPAIR'
  | 'CLEANING'
  | 'DECORATION_MATERIAL'
  | 'FOOD'
  | 'OTHER';

export interface ExpenseItem {
  id: string;
  room_id: string;
  expense_number: string;
  category: ExpenseCategory;
  entry_type: 'EXPENSE' | 'REVERSAL';
  amount: number;
  expense_date: string;
  note: string | null;
  receipt_photo: string | null;
  reverses_expense_id: string | null;
  is_reversed: number;
  reversed_by_expense_id: string | null;
  recorded_by_user_id: string;
  recorded_by_name: string;
  created_at: number;
}

const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  'ELECTRICITY',
  'SALARY',
  'REPAIR',
  'CLEANING',
  'DECORATION_MATERIAL',
  'FOOD',
  'OTHER',
];

export const ExpensesPage: React.FC = () => {
  const { activeRoom, activeMember, language, t } = useAuth();
  const { showSuccess, showError } = useToast();

  const canManage = activeMember?.role === 'OWNER' || activeMember?.role === 'MANAGER';

  const [expenses, setExpenses] = useState<ExpenseItem[]>([]);
  const [netTotalAmount, setNetTotalAmount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Filters
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');

  // Create Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [category, setCategory] = useState<ExpenseCategory>('ELECTRICITY');
  const [amount, setAmount] = useState<string>('');
  const [expenseDate, setExpenseDate] = useState<string>(() => getTodayDhakaYMD());
  const [note, setNote] = useState<string>('');
  const [receiptBase64, setReceiptBase64] = useState<string | null>(null);
  const [receiptFileName, setReceiptFileName] = useState<string>('');
  const [idempotencyKey, setIdempotencyKey] = useState<string>('');
  const [saving, setSaving] = useState<boolean>(false);

  // Reversal state
  const [reversingId, setReversingId] = useState<string | null>(null);
  const [reversalReason, setReversalReason] = useState<string>('');
  const [reversingSaving, setReversingSaving] = useState<boolean>(false);

  useUnsavedChanges(
    modalOpen && (amount.trim().length > 0 || note.trim().length > 0 || Boolean(receiptBase64))
  );

  useEffect(() => {
    if (activeRoom && canManage) {
      fetchExpenses();
    } else {
      setLoading(false);
    }
  }, [activeRoom, canManage, categoryFilter, dateFrom, dateTo]);

  const fetchExpenses = async () => {
    if (!activeRoom) return;
    setLoading(true);
    setFetchError(null);
    try {
      const params = new URLSearchParams({
        category: categoryFilter,
        dateFrom,
        dateTo,
      });
      const res = await apiRequest<{
        expenses: ExpenseItem[];
        total: number;
        netTotalAmount: number;
      }>(`/api/rooms/${activeRoom.id}/expenses?${params.toString()}`);

      setExpenses(res.expenses || []);
      setNetTotalAmount(res.netTotalAmount || 0);
    } catch (err: any) {
      const msg = language === 'bn' ? err.messageBn || 'খরচের তালিকা লোড করতে সমস্যা হয়েছে।' : err.messageEn || 'Failed to load expenses.';
      setFetchError(msg);
      showError(msg);
    } finally {
      setLoading(false);
    }
  };

  const openNewExpenseModal = () => {
    setCategory('ELECTRICITY');
    setAmount('');
    setExpenseDate(getTodayDhakaYMD());
    setNote('');
    setReceiptBase64(null);
    setReceiptFileName('');
    setIdempotencyKey(generateIdempotencyKey('exp'));
    setModalOpen(true);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      setReceiptBase64(null);
      setReceiptFileName('');
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
        setReceiptBase64(reader.result);
        setReceiptFileName(file.name);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSaveExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeRoom || saving) return;

    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) {
      showError(
        language === 'bn'
          ? 'খরচের পরিমাণ অবশ্যই শূন্যের চেয়ে বেশি হতে হবে।'
          : 'Expense amount must be greater than zero.'
      );
      return;
    }

    setSaving(true);
    try {
      const key = idempotencyKey || generateIdempotencyKey('exp');
      const res = await apiRequest(`/api/rooms/${activeRoom.id}/expenses`, {
        method: 'POST',
        idempotencyKey: key,
        body: JSON.stringify({
          category,
          amount: amt,
          expense_date: expenseDate,
          note: note.trim() || null,
          receipt_image_base64: receiptBase64,
          idempotency_key: key,
        }),
      });
      showSuccess(language === 'bn' ? res.messageBn : res.messageEn);
      setModalOpen(false);
      await fetchExpenses();
    } catch (err: any) {
      showError(language === 'bn' ? err.messageBn || err.message : err.messageEn || err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleReverseExpense = async (expenseId: string) => {
    if (!activeRoom || reversingSaving) return;
    if (reversalReason.trim().length < 2) {
      showError(
        language === 'bn'
          ? 'খরচ রিভার্স করার কারণ লিখুন।'
          : 'Please enter a reason to reverse this expense.'
      );
      return;
    }

    setReversingSaving(true);
    try {
      const res = await apiRequest(`/api/rooms/${activeRoom.id}/expenses/${expenseId}/reverse`, {
        method: 'POST',
        idempotencyKey: generateIdempotencyKey('exp-rev'),
        body: JSON.stringify({
          reason: reversalReason.trim(),
          expense_date: getTodayDhakaYMD(),
        }),
      });
      showSuccess(language === 'bn' ? res.messageBn : res.messageEn);
      setReversingId(null);
      setReversalReason('');
      await fetchExpenses();
    } catch (err: any) {
      showError(language === 'bn' ? err.messageBn : err.messageEn);
    } finally {
      setReversingSaving(false);
    }
  };

  if (!canManage) {
    return (
      <div className="p-8 max-w-xl mx-auto">
        <EmptyState
          icon={Shield}
          title={t('moneyHiddenNotice')}
          description={
            language === 'bn'
              ? 'খরচ ও হিসাবের পাতাটি শুধুমাত্র ওনার ও ম্যানেজারের জন্য সংরক্ষিত।'
              : 'Expenses and financial management are strictly restricted to Owner and Manager roles.'
          }
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
            <CreditCard className="w-6 h-6 text-[#582C4D] dark:text-[#C5A059]" />
            <span>
              {language === 'bn'
                ? 'ক্লাব খরচ ও ব্যয় ব্যবস্থাপনা (Expenses)'
                : 'Club Expenses & Reversal Ledger'}
            </span>
          </h1>
          <p className="text-xs sm:text-sm text-stone-500 dark:text-stone-400 mt-1">
            {language === 'bn'
              ? 'বিদ্যুৎ, বেতন, মেরামত, পরিষ্কার ও অন্যান্য খরচ রশিদের ছবিসহ সংরক্ষণ করুন। কোনো এন্ট্রি গোপনে মোছা যায় না।'
              : 'Record club expenses with optional receipt photos. Corrections use immutable reversal entries.'}
          </p>
        </div>

        <ActionButton
          onClick={openNewExpenseModal}
          icon={<Plus className="w-4 h-4" />}
        >
          {language === 'bn' ? 'নতুন খরচ যুক্ত করুন' : 'Record Expense'}
        </ActionButton>
      </div>

      {/* Filters & Net Total Summary */}
      <div className="p-4 rounded-2xl bg-white dark:bg-[#1E1920] border border-stone-200 dark:border-stone-800 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 flex-1">
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-3 py-2 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-900 text-xs font-bold"
          >
            <option value="">
              {language === 'bn' ? 'সকল খরচের খাত (All Categories)' : 'All Categories'}
            </option>
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {t(`expCat_${c}` as any)}
              </option>
            ))}
          </select>

          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="px-3 py-2 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-900 text-xs font-mono"
            title="Date From"
          />

          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="px-3 py-2 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-900 text-xs font-mono"
            title="Date To"
          />
        </div>

        <div className="px-4 py-2.5 rounded-2xl bg-rose-50/80 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 text-right shrink-0">
          <div className="text-[11px] font-bold text-rose-700 dark:text-rose-300">
            {language === 'bn' ? 'নিট মোট খরচ (Net Expenses)' : 'Net Total Expenses'}
          </div>
          <div className="text-base sm:text-lg font-extrabold text-rose-600 dark:text-rose-400">
            {formatCurrency(netTotalAmount, language)}
          </div>
        </div>
      </div>

      {/* Expense List */}
      <SectionLoader
        loading={loading}
        error={fetchError}
        onRetry={fetchExpenses}
        language={language}
        labelBn="খরচের তথ্য লোড হচ্ছে..."
        labelEn="Loading expenses..."
      >
        {expenses.length === 0 ? (
        <EmptyState
          icon={CreditCard}
          title={language === 'bn' ? 'কোনো খরচের রেকর্ড নেই' : 'No expenses recorded yet'}
          description={
            language === 'bn'
              ? 'উপরের "নতুন খরচ যুক্ত করুন" বাটনে ক্লিক করে সেন্টারের ব্যয় লিপিবদ্ধ করুন।'
              : 'Click "Record Expense" above to log electricity, salary, repair, cleaning, or other costs.'
          }
        />
      ) : (
        <div className="space-y-3">
          {expenses.map((exp) => {
            const isReversal = exp.entry_type === 'REVERSAL';
            return (
              <div
                key={exp.id}
                className={`p-4 sm:p-5 rounded-2xl border shadow-xs space-y-2.5 ${
                  isReversal
                    ? 'bg-emerald-50/40 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/60'
                    : exp.is_reversed === 1
                    ? 'bg-stone-100/70 dark:bg-stone-900/40 border-stone-200 dark:border-stone-800 opacity-80'
                    : 'bg-white dark:bg-[#1E1920] border-stone-200 dark:border-stone-800'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-extrabold text-[#582C4D] dark:text-[#C5A059]">
                      {exp.expense_number}
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-stone-100 dark:bg-stone-800 text-stone-800 dark:text-stone-200">
                      {t(`expCat_${exp.category}` as any)}
                    </span>
                    {isReversal && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800">
                        {language === 'bn' ? 'রিভার্সাল এন্ট্রি' : 'Reversal Entry'}
                      </span>
                    )}
                    {exp.is_reversed === 1 && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-100 text-amber-900">
                        {language === 'bn' ? 'রিভার্সড (Reversed)' : 'Reversed'}
                      </span>
                    )}
                  </div>

                  <div
                    className={`text-sm sm:text-base font-extrabold ${
                      isReversal ? 'text-emerald-600' : 'text-rose-600 dark:text-rose-400'
                    }`}
                  >
                    {isReversal ? '' : ''}
                    {formatCurrency(exp.amount, language)}
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-stone-500">
                  <span>📅 {formatDualDateFromYMD(exp.expense_date)}</span>
                  <span>
                    {language === 'bn' ? 'এন্ট্রি করেছেন:' : 'Recorded by:'}{' '}
                    <strong>{exp.recorded_by_name}</strong> ({formatDualDate(exp.created_at)})
                  </span>
                </div>

                {exp.note && (
                  <p className="text-xs text-stone-700 dark:text-stone-300">{exp.note}</p>
                )}

                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-stone-100 dark:border-stone-800">
                  <div>
                    {exp.receipt_photo && (
                      <a
                        href={exp.receipt_photo}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs font-bold text-[#582C4D] dark:text-[#C5A059] hover:underline"
                      >
                        <ImageIcon className="w-3.5 h-3.5" />
                        <span>
                          {language === 'bn' ? 'রশিদের ছবি দেখুন' : 'View Receipt Photo'}
                        </span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>

                  {exp.entry_type === 'EXPENSE' && exp.is_reversed === 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setReversingId(reversingId === exp.id ? null : exp.id);
                        setReversalReason('');
                      }}
                      className="inline-flex items-center gap-1 px-3 py-1 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 text-xs font-bold hover:bg-rose-100 cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>{language === 'bn' ? 'রিভার্স (সংশোধন)' : 'Reverse Expense'}</span>
                    </button>
                  )}
                </div>

                {reversingId === exp.id && (
                  <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 space-y-2 mt-2">
                    <input
                      type="text"
                      value={reversalReason}
                      onChange={(e) => setReversalReason(e.target.value)}
                      placeholder={
                        language === 'bn'
                          ? 'খরচ রিভার্স করার কারণ লিখুন...'
                          : 'Enter reason for reversing this expense...'
                      }
                      className="w-full px-3 py-1.5 rounded-lg border border-rose-300 bg-white dark:bg-stone-900 text-xs"
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setReversingId(null)}
                        className="px-3 py-1 text-xs font-semibold text-stone-600"
                      >
                        {t('cancel')}
                      </button>
                      <ActionButton
                        variant="danger"
                        loading={reversingSaving}
                        onClick={() => handleReverseExpense(exp.id)}
                        className="!px-3.5 !py-1.5 !min-h-[36px] !text-xs"
                      >
                        {language === 'bn' ? 'রিভার্সাল নিশ্চিত করুন' : 'Confirm Reversal'}
                      </ActionButton>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        )}
      </SectionLoader>

      {/* New Expense Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={language === 'bn' ? 'নতুন খরচ রেকর্ড করুন' : 'Record New Expense'}
        maxWidth="md"
      >
        <form onSubmit={handleSaveExpense} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 mb-1">
                {language === 'bn' ? 'খরচের খাত (Category) *' : 'Category *'}
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
                className="w-full px-3 py-2.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-xs font-bold"
              >
                {EXPENSE_CATEGORIES.map((c) => (
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
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-xs font-extrabold"
              />
            </div>
          </div>

          <DualDatePicker
            label={language === 'bn' ? 'খরচের তারিখ (বাংলা ও ইংরেজি) *' : 'Expense Date *'}
            value={expenseDate}
            onChange={setExpenseDate}
          />

          <div>
            <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 mb-1">
              {language === 'bn' ? 'বিবরণ / নোট' : 'Note / Description'}
            </label>
            <textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={
                language === 'bn'
                  ? 'যেমন: নভেম্বর মাসের বিদ্যুৎ বিল / ডেকোরেশন কাপড় ক্রয়'
                  : 'e.g. Monthly electricity bill / stage floral supplies'
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
              onChange={handleFileChange}
              className="w-full text-xs text-stone-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-[#582C4D]/10 file:text-[#582C4D] hover:file:bg-[#582C4D]/20"
            />
            {receiptFileName && (
              <p className="text-[11px] text-emerald-600 font-semibold mt-1">
                ✓ {receiptFileName}
              </p>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-stone-100 dark:border-stone-800">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="px-4 py-2 text-xs font-semibold text-stone-600"
            >
              {t('cancel')}
            </button>
            <ActionButton
              type="submit"
              loading={saving}
              loadingLabel={t('saving')}
            >
              {t('save')}
            </ActionButton>
          </div>
        </form>
      </Modal>
    </div>
  );
};
