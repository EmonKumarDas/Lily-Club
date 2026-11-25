import React, { useState, useEffect } from 'react';
import {
  Building2,
  Plus,
  Edit3,
  Power,
  Trash2,
  Users,
  CheckCircle2,
  XCircle,
  Sparkles,
  Image as ImageIcon,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.js';
import { useToast } from '../components/Toast.js';
import { Modal } from '../components/Modal.js';
import { LoadingSkeleton } from '../components/LoadingSkeleton.js';
import { EmptyState } from '../components/EmptyState.js';
import { SlotBadge } from '../components/SlotBadge.js';
import { formatCurrency, formatNumberByLanguage, formatDualDate } from '../lib/dateUtils.js';
import { apiRequest } from '../lib/api.js';

export interface HallItem {
  id: string;
  room_id: string;
  name: string;
  capacity: number;
  day_price: number;
  night_price: number;
  full_price: number;
  photos: string[];
  facilities: string[];
  is_active: number;
  is_demo: number;
  created_at: number;
  updated_at: number;
  booking_count?: number;
}

export const HallsPage: React.FC = () => {
  const { activeRoom, activeMember, language, t } = useAuth();
  const { showSuccess, showError } = useToast();

  const [halls, setHalls] = useState<HallItem[]>([]);
  const [loading, setLoading] = useState(true);

  const canManage = activeMember?.role === 'OWNER' || activeMember?.role === 'MANAGER';

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingHall, setEditingHall] = useState<HallItem | null>(null);
  const [name, setName] = useState('');
  const [capacity, setCapacity] = useState(300);
  const [dayPrice, setDayPrice] = useState(25000);
  const [nightPrice, setNightPrice] = useState(35000);
  const [fullPrice, setFullPrice] = useState(55000);
  const [facilitiesText, setFacilitiesText] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (activeRoom) {
      fetchHalls();
    }
  }, [activeRoom]);

  const fetchHalls = async () => {
    if (!activeRoom) return;
    setLoading(true);
    try {
      const res = await apiRequest<{ halls: HallItem[] }>(`/api/rooms/${activeRoom.id}/halls`);
      setHalls(res.halls || []);
    } catch (err: any) {
      showError(err.messageBn || err.messageEn || 'Failed to load halls');
    } finally {
      setLoading(false);
    }
  };

  const openAddModal = () => {
    setEditingHall(null);
    setName('');
    setCapacity(300);
    setDayPrice(30000);
    setNightPrice(40000);
    setFullPrice(65000);
    setFacilitiesText('Central AC / কেন্দ্রীয় এসি, Bridal Stage / স্টেজ, Generator / জেনারেটর');
    setPhotoUrl('');
    setIsActive(true);
    setModalOpen(true);
  };

  const openEditModal = (hall: HallItem) => {
    setEditingHall(hall);
    setName(hall.name);
    setCapacity(hall.capacity);
    setDayPrice(hall.day_price);
    setNightPrice(hall.night_price);
    setFullPrice(hall.full_price);
    setFacilitiesText(hall.facilities.join(', '));
    setPhotoUrl(hall.photos[0] || '');
    setIsActive(hall.is_active === 1);
    setModalOpen(true);
  };

  const handleSaveHall = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeRoom || saving) return;
    setSaving(true);

    const facilities = facilitiesText
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const photos = photoUrl.trim() ? [photoUrl.trim()] : [];

    try {
      if (editingHall) {
        const res = await apiRequest(`/api/rooms/${activeRoom.id}/halls/${editingHall.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            name: name.trim(),
            capacity: Number(capacity),
            day_price: Number(dayPrice),
            night_price: Number(nightPrice),
            full_price: Number(fullPrice),
            facilities,
            photos,
            is_active: isActive,
          }),
        });
        showSuccess(language === 'bn' ? res.messageBn : res.messageEn);
      } else {
        const res = await apiRequest(`/api/rooms/${activeRoom.id}/halls`, {
          method: 'POST',
          body: JSON.stringify({
            name: name.trim(),
            capacity: Number(capacity),
            day_price: Number(dayPrice),
            night_price: Number(nightPrice),
            full_price: Number(fullPrice),
            facilities,
            photos,
            is_active: isActive,
          }),
        });
        showSuccess(language === 'bn' ? res.messageBn : res.messageEn);
      }
      setModalOpen(false);
      await fetchHalls();
    } catch (err: any) {
      showError(language === 'bn' ? err.messageBn || err.message : err.messageEn || err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (hall: HallItem) => {
    if (!activeRoom || !canManage) return;
    try {
      const res = await apiRequest(`/api/rooms/${activeRoom.id}/halls/${hall.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ is_active: hall.is_active !== 1 }),
      });
      showSuccess(language === 'bn' ? res.messageBn : res.messageEn);
      await fetchHalls();
    } catch (err: any) {
      showError(language === 'bn' ? err.messageBn : err.messageEn);
    }
  };

  const handleDeleteOrDeactivate = async (hall: HallItem) => {
    if (!activeRoom || !canManage) return;
    try {
      const res = await apiRequest(`/api/rooms/${activeRoom.id}/halls/${hall.id}`, {
        method: 'DELETE',
      });
      showSuccess(language === 'bn' ? res.messageBn : res.messageEn);
      await fetchHalls();
    } catch (err: any) {
      showError(language === 'bn' ? err.messageBn : err.messageEn);
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-stone-200 dark:border-stone-800 pb-5">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-stone-900 dark:text-stone-100 flex items-center gap-2.5">
            <Building2 className="w-6 h-6 text-[#582C4D] dark:text-[#C5A059]" />
            <span>{t('hallsPageTitle')}</span>
          </h1>
          <p className="text-xs sm:text-sm text-stone-500 dark:text-stone-400 mt-1">
            {t('hallsPageSubtitle')}
          </p>
        </div>

        {canManage && (
          <button
            onClick={openAddModal}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#582C4D] hover:bg-[#6C375F] text-white text-xs sm:text-sm font-bold shadow-md transition-all cursor-pointer self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            <span>{t('addHallBtn')}</span>
          </button>
        )}
      </div>

      {/* Content */}
      {loading ? (
        <LoadingSkeleton rows={4} />
      ) : halls.length === 0 ? (
        <EmptyState
          icon={Building2}
          title={language === 'bn' ? 'কোনো হল এখনও যুক্ত করা হয়নি' : 'No halls added yet'}
          description={
            language === 'bn'
              ? 'নতুন বুকিং নেওয়ার পূর্বে আপনার কমিউনিটি সেন্টারের হল বা স্পেস যুক্ত করুন।'
              : 'Add your community center halls or spaces with Day, Night, and Full slot prices.'
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {halls.map((hall) => (
            <div
              key={hall.id}
              className={`rounded-3xl bg-white dark:bg-[#1E1920] border transition-all overflow-hidden shadow-sm flex flex-col ${
                hall.is_active === 1
                  ? 'border-stone-200 dark:border-stone-800'
                  : 'border-stone-200/60 dark:border-stone-800/50 opacity-75'
              }`}
            >
              {/* Hall Banner / Photo */}
              <div className="h-44 bg-gradient-to-br from-[#582C4D]/15 via-[#C5A059]/15 to-stone-100 dark:from-[#582C4D]/30 dark:to-stone-900 relative flex items-center justify-center overflow-hidden">
                {hall.photos && hall.photos[0] ? (
                  <img
                    src={hall.photos[0]}
                    alt={hall.name}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                ) : (
                  <Building2 className="w-12 h-12 text-[#582C4D]/30 dark:text-[#C5A059]/30" />
                )}

                <div className="absolute top-3 left-3 flex items-center gap-2">
                  {hall.is_active === 1 ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-600 text-white shadow-sm">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>{t('activeHallBadge')}</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-stone-700 text-stone-200 shadow-sm">
                      <XCircle className="w-3.5 h-3.5" />
                      <span>{t('inactiveHallBadge')}</span>
                    </span>
                  )}

                  {hall.is_demo === 1 && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-500 text-white">
                      DEMO
                    </span>
                  )}
                </div>

                <div className="absolute bottom-3 right-3 px-3 py-1 rounded-full bg-black/70 backdrop-blur-xs text-white text-xs font-bold flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-[#C5A059]" />
                  <span>
                    {formatNumberByLanguage(hall.capacity, language)} {t('guestsUnit')}
                  </span>
                </div>
              </div>

              {/* Body */}
              <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                <div className="space-y-3">
                  <h3 className="text-base sm:text-lg font-bold text-stone-900 dark:text-stone-100 break-words leading-snug">
                    {hall.name}
                  </h3>

                  {/* 3-Slot Base Pricing Grid */}
                  <div className="grid grid-cols-3 gap-2 pt-1">
                    <div className="p-2.5 rounded-2xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/70 dark:border-amber-900/50">
                      <SlotBadge slot="DAY" size="xs" />
                      <div className="text-xs sm:text-sm font-extrabold text-stone-900 dark:text-stone-100 mt-1.5">
                        {formatCurrency(hall.day_price, language)}
                      </div>
                    </div>

                    <div className="p-2.5 rounded-2xl bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200/70 dark:border-indigo-900/50">
                      <SlotBadge slot="NIGHT" size="xs" />
                      <div className="text-xs sm:text-sm font-extrabold text-stone-900 dark:text-stone-100 mt-1.5">
                        {formatCurrency(hall.night_price, language)}
                      </div>
                    </div>

                    <div className="p-2.5 rounded-2xl bg-purple-50/70 dark:bg-purple-950/30 border border-purple-200/70 dark:border-purple-900/50">
                      <SlotBadge slot="FULL" size="xs" />
                      <div className="text-xs sm:text-sm font-extrabold text-stone-900 dark:text-stone-100 mt-1.5">
                        {formatCurrency(hall.full_price, language)}
                      </div>
                    </div>
                  </div>

                  {/* Facilities tags */}
                  {hall.facilities.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {hall.facilities.map((fac, idx) => (
                        <span
                          key={idx}
                          className="px-2.5 py-0.5 rounded-lg text-[11px] font-medium bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300"
                        >
                          {fac}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Footer Info & Actions */}
                <div className="pt-3 border-t border-stone-100 dark:border-stone-800 flex flex-wrap items-center justify-between gap-2 text-xs text-stone-500">
                  <div>
                    <span className="font-semibold">
                      {language === 'bn' ? 'মোট বুকিং:' : 'Bookings:'}{' '}
                      {formatNumberByLanguage(hall.booking_count || 0, language)}
                    </span>
                    <div className="text-[10px] text-stone-400 mt-0.5">
                      {formatDualDate(hall.created_at)}
                    </div>
                  </div>

                  {canManage && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => openEditModal(hall)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 text-stone-700 dark:text-stone-200 font-bold transition-colors cursor-pointer"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>{language === 'bn' ? 'সম্পাদনা' : 'Edit'}</span>
                      </button>

                      <button
                        onClick={() => handleToggleActive(hall)}
                        className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-xl font-bold transition-colors cursor-pointer ${
                          hall.is_active === 1
                            ? 'bg-amber-100/80 text-amber-800 hover:bg-amber-200 dark:bg-amber-950/50 dark:text-amber-300'
                            : 'bg-emerald-100/80 text-emerald-800 hover:bg-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300'
                        }`}
                      >
                        <Power className="w-3.5 h-3.5" />
                        <span>
                          {hall.is_active === 1
                            ? language === 'bn'
                              ? 'নিষ্ক্রিয় করুন'
                              : 'Deactivate'
                            : language === 'bn'
                            ? 'সক্রিয় করুন'
                            : 'Activate'}
                        </span>
                      </button>

                      {(hall.booking_count || 0) === 0 && (
                        <button
                          onClick={() => handleDeleteOrDeactivate(hall)}
                          className="p-1.5 rounded-xl text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                          title={t('delete')}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit Hall Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingHall ? t('editHallTitle') : t('addHallBtn')}
        maxWidth="lg"
      >
        <form onSubmit={handleSaveHall} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 mb-1">
                {t('hallNameLabel')} *
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={language === 'bn' ? 'যেমন: শাপলা গ্র্যান্ড বলরুম' : 'e.g. Shapla Grand Ballroom'}
                className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-xs sm:text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 mb-1">
                {t('hallCapacityLabel')} *
              </label>
              <input
                type="number"
                required
                min={1}
                value={capacity}
                onChange={(e) => setCapacity(parseInt(e.target.value, 10) || 1)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-xs sm:text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 mb-1">
                {t('status')}
              </label>
              <select
                value={isActive ? '1' : '0'}
                onChange={(e) => setIsActive(e.target.value === '1')}
                className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-xs sm:text-sm"
              >
                <option value="1">{t('activeHallBadge')}</option>
                <option value="0">{t('inactiveHallBadge')}</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-amber-800 dark:text-amber-300 mb-1">
                ☀️ {t('dayPriceLabel')} (৳) *
              </label>
              <input
                type="number"
                required
                min={0}
                value={dayPrice}
                onChange={(e) => setDayPrice(parseFloat(e.target.value) || 0)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50/40 dark:bg-amber-950/20 text-xs sm:text-sm font-bold"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-indigo-800 dark:text-indigo-300 mb-1">
                🌙 {t('nightPriceLabel')} (৳) *
              </label>
              <input
                type="number"
                required
                min={0}
                value={nightPrice}
                onChange={(e) => setNightPrice(parseFloat(e.target.value) || 0)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-indigo-300 dark:border-indigo-800 bg-indigo-50/40 dark:bg-indigo-950/20 text-xs sm:text-sm font-bold"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-purple-800 dark:text-purple-300 mb-1">
                ☀️🌙 {t('fullPriceLabel')} (৳) *
              </label>
              <input
                type="number"
                required
                min={0}
                value={fullPrice}
                onChange={(e) => setFullPrice(parseFloat(e.target.value) || 0)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-purple-300 dark:border-purple-800 bg-purple-50/40 dark:bg-purple-950/20 text-xs sm:text-sm font-bold"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 mb-1">
                {t('facilitiesLabel')}
              </label>
              <input
                type="text"
                value={facilitiesText}
                onChange={(e) => setFacilitiesText(e.target.value)}
                placeholder="AC, Stage, Sound, Parking..."
                className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-xs sm:text-sm"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 mb-1">
                {t('photoUrlLabel')}
              </label>
              <input
                type="url"
                value={photoUrl}
                onChange={(e) => setPhotoUrl(e.target.value)}
                placeholder="https://images.unsplash.com/..."
                className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-xs sm:text-sm"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-stone-100 dark:border-stone-800">
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
    </div>
  );
};
