import React, { useState, useEffect } from 'react';
import {
  Users,
  Search,
  Plus,
  Phone,
  MapPin,
  FileText,
  Edit3,
  Trash2,
  Eye,
  AlertTriangle,
  ShieldAlert,
  Calendar,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.js';
import { useToast } from '../components/Toast.js';
import { Modal } from '../components/Modal.js';
import { LoadingSkeleton } from '../components/LoadingSkeleton.js';
import { EmptyState } from '../components/EmptyState.js';
import { SlotBadge, type SlotType } from '../components/SlotBadge.js';
import {
  formatDualDate,
  formatDualDateFromYMD,
  formatCurrency,
  formatNumberByLanguage,
} from '../lib/dateUtils.js';
import { apiRequest } from '../lib/api.js';

export interface CustomerItem {
  id: string;
  room_id: string;
  name: string;
  phone: string;
  alt_phone: string | null;
  address: string | null;
  notes: string | null;
  is_demo: number;
  created_at: number;
  updated_at: number;
  booking_count?: number;
}

export const CustomersPage: React.FC<{
  onOpenBookingDetail?: (bookingId: string) => void;
}> = ({ onOpenBookingDetail }) => {
  const { activeRoom, activeMember, language, t } = useAuth();
  const { showSuccess, showError } = useToast();

  const [customers, setCustomers] = useState<CustomerItem[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const canEdit = activeMember?.role !== 'VIEWER';
  const canDelete = activeMember?.role === 'OWNER' || activeMember?.role === 'MANAGER';
  const canSeeMoney = activeMember?.role === 'OWNER' || activeMember?.role === 'MANAGER';

  // Add/Edit Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<CustomerItem | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [altPhone, setAltPhone] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [duplicateSuggestion, setDuplicateSuggestion] = useState<CustomerItem | null>(null);
  const [saving, setSaving] = useState(false);

  // Customer Profile Modal
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileCustomer, setProfileCustomer] = useState<CustomerItem | null>(null);
  const [profileBookings, setProfileBookings] = useState<any[]>([]);
  const [loadingProfile, setLoadingProfile] = useState(false);

  useEffect(() => {
    if (activeRoom) {
      fetchCustomers();
    }
  }, [activeRoom, search]);

  const fetchCustomers = async () => {
    if (!activeRoom) return;
    setLoading(true);
    try {
      const res = await apiRequest<{ customers: CustomerItem[]; total: number }>(
        `/api/rooms/${activeRoom.id}/customers?search=${encodeURIComponent(search)}`
      );
      setCustomers(res.customers || []);
    } catch (err: any) {
      showError(err.messageBn || err.messageEn || 'Failed to load customers');
    } finally {
      setLoading(false);
    }
  };

  const openAddModal = () => {
    setEditingCustomer(null);
    setName('');
    setPhone('');
    setAltPhone('');
    setAddress('');
    setNotes('');
    setDuplicateSuggestion(null);
    setModalOpen(true);
  };

  const openEditModal = (c: CustomerItem) => {
    setEditingCustomer(c);
    setName(c.name);
    setPhone(c.phone);
    setAltPhone(c.alt_phone || '');
    setAddress(c.address || '');
    setNotes(c.notes || '');
    setDuplicateSuggestion(null);
    setModalOpen(true);
  };

  // Live check if phone already exists
  const handlePhoneBlur = async () => {
    if (!activeRoom || !phone.trim() || editingCustomer) return;
    try {
      const res = await apiRequest<{ exists: boolean; customer: CustomerItem | null }>(
        `/api/rooms/${activeRoom.id}/customers/check-phone?phone=${encodeURIComponent(phone.trim())}`
      );
      if (res.exists && res.customer) {
        setDuplicateSuggestion(res.customer);
      } else {
        setDuplicateSuggestion(null);
      }
    } catch {}
  };

  const handleSaveCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeRoom || saving) return;
    setSaving(true);
    try {
      if (editingCustomer) {
        const res = await apiRequest(`/api/rooms/${activeRoom.id}/customers/${editingCustomer.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            name: name.trim(),
            phone: phone.trim(),
            alt_phone: altPhone.trim() || null,
            address: address.trim() || null,
            notes: notes.trim() || null,
          }),
        });
        showSuccess(language === 'bn' ? res.messageBn : res.messageEn);
      } else {
        const res = await apiRequest(`/api/rooms/${activeRoom.id}/customers`, {
          method: 'POST',
          body: JSON.stringify({
            name: name.trim(),
            phone: phone.trim(),
            alt_phone: altPhone.trim() || null,
            address: address.trim() || null,
            notes: notes.trim() || null,
          }),
        });
        showSuccess(language === 'bn' ? res.messageBn : res.messageEn);
      }
      setModalOpen(false);
      await fetchCustomers();
    } catch (err: any) {
      if (err.data?.error === 'DUPLICATE_CUSTOMER_PHONE' && err.data?.existingCustomer) {
        setDuplicateSuggestion(err.data.existingCustomer);
      }
      showError(language === 'bn' ? err.messageBn || err.message : err.messageEn || err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCustomer = async (c: CustomerItem) => {
    if (!activeRoom || !canDelete) return;
    try {
      const res = await apiRequest(`/api/rooms/${activeRoom.id}/customers/${c.id}`, {
        method: 'DELETE',
      });
      showSuccess(language === 'bn' ? res.messageBn : res.messageEn);
      await fetchCustomers();
    } catch (err: any) {
      showError(language === 'bn' ? err.messageBn : err.messageEn);
    }
  };

  const openCustomerProfile = async (c: CustomerItem) => {
    if (!activeRoom) return;
    setProfileCustomer(c);
    setProfileOpen(true);
    setLoadingProfile(true);
    try {
      const res = await apiRequest<{ customer: CustomerItem; bookings: any[] }>(
        `/api/rooms/${activeRoom.id}/customers/${c.id}`
      );
      setProfileCustomer(res.customer);
      setProfileBookings(res.bookings || []);
    } catch (err: any) {
      showError(language === 'bn' ? err.messageBn : err.messageEn);
    } finally {
      setLoadingProfile(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-stone-200 dark:border-stone-800 pb-5">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-stone-900 dark:text-stone-100 flex items-center gap-2.5">
            <Users className="w-6 h-6 text-[#582C4D] dark:text-[#C5A059]" />
            <span>{t('customersPageTitle')}</span>
          </h1>
          <p className="text-xs sm:text-sm text-stone-500 dark:text-stone-400 mt-1">
            {t('customersPageSubtitle')}
          </p>
        </div>

        {canEdit && (
          <button
            onClick={openAddModal}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#582C4D] hover:bg-[#6C375F] text-white text-xs sm:text-sm font-bold shadow-md transition-all cursor-pointer self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            <span>{t('addCustomerBtn')}</span>
          </button>
        )}
      </div>

      {/* Search Bar */}
      <div className="relative max-w-md">
        <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={
            language === 'bn'
              ? 'নাম বা ফোন নম্বর দিয়ে গ্রাহক খুঁজুন...'
              : 'Search customer by name or phone...'
          }
          className="w-full pl-10 pr-4 py-2.5 rounded-2xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-[#1E1920] text-xs sm:text-sm focus:outline-hidden focus:ring-2 focus:ring-[#582C4D]"
        />
      </div>

      {/* Customer List */}
      {loading ? (
        <LoadingSkeleton rows={4} />
      ) : customers.length === 0 ? (
        <EmptyState
          icon={Users}
          title={language === 'bn' ? 'কোনো গ্রাহক পাওয়া যায়নি' : 'No customers found'}
          description={
            language === 'bn'
              ? 'নতুন গ্রাহক যুক্ত করুন অথবা অনুসন্ধানের শব্দ পরিবর্তন করুন।'
              : 'Add a new customer or try a different search query.'
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {customers.map((c) => (
            <div
              key={c.id}
              className="p-5 rounded-2xl bg-white dark:bg-[#1E1920] border border-stone-200 dark:border-stone-800 shadow-xs flex flex-col justify-between gap-4"
            >
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="text-sm sm:text-base font-bold text-stone-900 dark:text-stone-100 break-words leading-snug">
                      {c.name}
                    </h3>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-stone-600 dark:text-stone-300 mt-1 font-mono">
                      <span className="inline-flex items-center gap-1">
                        <Phone className="w-3.5 h-3.5 text-[#582C4D] dark:text-[#C5A059]" />
                        {c.phone}
                      </span>
                      {c.alt_phone && <span className="text-stone-400">• {c.alt_phone}</span>}
                    </div>
                  </div>

                  <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-[#582C4D]/10 dark:bg-[#C5A059]/15 text-[#582C4D] dark:text-[#C5A059] shrink-0">
                    {formatNumberByLanguage(c.booking_count || 0, language)}{' '}
                    {language === 'bn' ? 'টি বুকিং' : 'Bookings'}
                  </span>
                </div>

                {c.address && (
                  <p className="text-xs text-stone-500 dark:text-stone-400 flex items-start gap-1.5 break-words">
                    <MapPin className="w-3.5 h-3.5 shrink-0 mt-0.5 text-stone-400" />
                    <span>{c.address}</span>
                  </p>
                )}

                {c.notes && (
                  <p className="text-xs text-stone-500 dark:text-stone-400 flex items-start gap-1.5 italic">
                    <FileText className="w-3.5 h-3.5 shrink-0 mt-0.5 text-stone-400" />
                    <span>{c.notes}</span>
                  </p>
                )}
              </div>

              <div className="pt-3 border-t border-stone-100 dark:border-stone-800 flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] text-stone-400">
                  {formatDualDate(c.created_at)}
                </span>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => openCustomerProfile(c)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#582C4D]/10 dark:bg-[#C5A059]/15 text-[#582C4D] dark:text-[#C5A059] hover:bg-[#582C4D]/20 text-xs font-bold transition-colors cursor-pointer"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>{t('viewProfileBtn')}</span>
                  </button>

                  {canEdit && (
                    <button
                      onClick={() => openEditModal(c)}
                      className="p-1.5 rounded-xl bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300 hover:bg-stone-200 cursor-pointer"
                      title="Edit"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                  )}

                  {canDelete && (c.booking_count || 0) === 0 && (
                    <button
                      onClick={() => handleDeleteCustomer(c)}
                      className="p-1.5 rounded-xl text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                      title={t('delete')}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit Customer Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={
          editingCustomer
            ? language === 'bn'
              ? 'গ্রাহকের তথ্য সম্পাদনা'
              : 'Edit Customer'
            : t('addCustomerBtn')
        }
        maxWidth="md"
      >
        <form onSubmit={handleSaveCustomer} className="space-y-4">
          {duplicateSuggestion && (
            <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 space-y-2">
              <div className="flex items-start gap-2 text-amber-900 dark:text-amber-200 text-xs font-bold">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span>
                  {language === 'bn'
                    ? `এই ফোন নম্বরে ইতোমধ্যে "${duplicateSuggestion.name}" (${duplicateSuggestion.phone}) নিবন্ধিত আছেন!`
                    : `Existing customer found with this phone: "${duplicateSuggestion.name}" (${duplicateSuggestion.phone})`}
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setModalOpen(false);
                  openCustomerProfile(duplicateSuggestion);
                }}
                className="w-full py-1.5 px-3 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold cursor-pointer"
              >
                {t('useExistingCustomerBtn')} — {duplicateSuggestion.name}
              </button>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 mb-1">
              {t('customerNameLabel')} *
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-xs sm:text-sm"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 mb-1">
                {t('customerPhoneLabel')} *
              </label>
              <input
                type="text"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                onBlur={handlePhoneBlur}
                placeholder="01711-XXXXXX"
                className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-xs sm:text-sm font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 mb-1">
                {t('customerAltPhoneLabel')}
              </label>
              <input
                type="text"
                value={altPhone}
                onChange={(e) => setAltPhone(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-xs sm:text-sm font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 mb-1">
              {t('customerAddressLabel')}
            </label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-xs sm:text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 mb-1">
              {t('customerNotesLabel')}
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-xs sm:text-sm"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-stone-100 dark:border-stone-800">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="px-4 py-2 text-xs font-semibold text-stone-600 dark:text-stone-400 hover:bg-stone-100 rounded-xl"
            >
              {t('cancel')}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2.5 text-xs font-bold text-white bg-[#582C4D] hover:bg-[#6C375F] rounded-xl shadow-md disabled:opacity-50 cursor-pointer"
            >
              {saving ? t('saving') : t('save')}
            </button>
          </div>
        </form>
      </Modal>

      {/* Customer Profile & Booking History Modal */}
      <Modal
        isOpen={profileOpen}
        onClose={() => setProfileOpen(false)}
        title={profileCustomer ? profileCustomer.name : t('viewProfileBtn')}
        maxWidth="lg"
      >
        {profileCustomer && (
          <div className="space-y-5">
            <div className="p-4 rounded-2xl bg-stone-50 dark:bg-stone-900/60 border border-stone-200 dark:border-stone-800 space-y-2 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono font-bold text-sm text-[#582C4D] dark:text-[#C5A059]">
                  📞 {profileCustomer.phone}
                  {profileCustomer.alt_phone ? ` / ${profileCustomer.alt_phone}` : ''}
                </span>
                <span className="text-stone-500">
                  {formatDualDate(profileCustomer.created_at)}
                </span>
              </div>
              {profileCustomer.address && (
                <div className="text-stone-700 dark:text-stone-300">
                  📍 {profileCustomer.address}
                </div>
              )}
              {profileCustomer.notes && (
                <div className="text-stone-500 italic">📝 {profileCustomer.notes}</div>
              )}
            </div>

            {!canSeeMoney && (
              <div className="p-3 rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 flex items-center gap-2 text-xs text-amber-800 dark:text-amber-300">
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <span>{t('moneyHiddenNotice')}</span>
              </div>
            )}

            <div className="space-y-3">
              <h4 className="text-xs sm:text-sm font-bold text-stone-900 dark:text-stone-100">
                {language === 'bn' ? 'বুকিং ইতিহাস' : 'Booking History'} (
                {formatNumberByLanguage(profileBookings.length, language)})
              </h4>

              {loadingProfile ? (
                <LoadingSkeleton rows={2} />
              ) : profileBookings.length === 0 ? (
                <p className="text-xs text-stone-500 py-4 text-center">
                  {language === 'bn' ? 'এই গ্রাহকের কোনো বুকিং নেই।' : 'No bookings for this customer yet.'}
                </p>
              ) : (
                <div className="overflow-x-auto border border-stone-200 dark:border-stone-800 rounded-2xl">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-stone-50 dark:bg-stone-900 border-b border-stone-200 dark:border-stone-800 font-bold text-stone-500">
                      <tr>
                        <th className="px-3 py-2.5">{t('bookingNumberLabel')}</th>
                        <th className="px-3 py-2.5">{t('eventDateLabel')}</th>
                        <th className="px-3 py-2.5">{t('slotLabel')}</th>
                        <th className="px-3 py-2.5">{t('status')}</th>
                        {canSeeMoney && (
                          <>
                            <th className="px-3 py-2.5 text-right">{t('totalAmountLabel')}</th>
                            <th className="px-3 py-2.5 text-right">{t('dueAmountLabel')}</th>
                          </>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
                      {profileBookings.map((b) => (
                        <tr
                          key={b.id}
                          onClick={() => {
                            if (onOpenBookingDetail) {
                              setProfileOpen(false);
                              onOpenBookingDetail(b.id);
                            }
                          }}
                          className="hover:bg-stone-50 dark:hover:bg-stone-900/50 cursor-pointer"
                        >
                          <td className="px-3 py-2.5 font-mono font-bold text-[#582C4D] dark:text-[#C5A059]">
                            {b.booking_number}
                            <div className="text-[10px] font-sans text-stone-500">
                              {b.hall_name}
                            </div>
                          </td>
                          <td className="px-3 py-2.5">
                            {formatDualDateFromYMD(b.event_date)}
                          </td>
                          <td className="px-3 py-2.5">
                            <SlotBadge slot={b.slot as SlotType} size="xs" />
                          </td>
                          <td className="px-3 py-2.5 font-semibold">
                            {t(`bStatus_${b.status}` as any)}
                          </td>
                          {canSeeMoney && (
                            <>
                              <td className="px-3 py-2.5 text-right font-bold">
                                {formatCurrency(b.total_amount || 0, language)}
                              </td>
                              <td className="px-3 py-2.5 text-right font-bold text-rose-600">
                                {formatCurrency(b.due_amount || 0, language)}
                              </td>
                            </>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
