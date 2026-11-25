import React, { useState } from 'react';
import {
  PlusCircle,
  KeyRound,
  Building2,
  ArrowRight,
  Shield,
  Phone,
  MapPin,
  Clock,
  Sparkles,
} from 'lucide-react';
import { useAuth, type UserRoomItem } from '../context/AuthContext.js';
import { useToast } from '../components/Toast.js';
import { Modal } from '../components/Modal.js';
import { EmptyState } from '../components/EmptyState.js';
import { apiRequest } from '../lib/api.js';

export const RoomChoicePage: React.FC<{ onRoomSelected: () => void }> = ({ onRoomSelected }) => {
  const { user, userRooms, switchRoom, refreshAuth, language, t } = useAuth();
  const { showSuccess, showError } = useToast();

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [joinModalOpen, setJoinModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  // Form states for Create Room
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [defaultLang, setDefaultLang] = useState<'bn' | 'en'>(language);

  // Form states for Join Room
  const [joinCode, setJoinCode] = useState('');

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !address.trim() || !phone.trim()) {
      showError('Please fill in all required fields.');
      return;
    }

    setLoading(true);
    try {
      const res = await apiRequest<{ success: boolean; room: any }>('/api/rooms', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          address: address.trim(),
          phone: phone.trim(),
          default_language: defaultLang,
        }),
      });

      if (res.success) {
        showSuccess(t('toastRoomCreated'));
        setCreateModalOpen(false);
        setName('');
        setAddress('');
        setPhone('');
        await refreshAuth();
        onRoomSelected();
      }
    } catch (err: any) {
      showError(err.messageBn || err.message || 'Failed to create room');
    } finally {
      setLoading(false);
    }
  };

  const handleJoinRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = joinCode.trim().toUpperCase();
    if (!cleanCode) {
      showError('Please enter a valid Room ID.');
      return;
    }

    setLoading(true);
    try {
      const res = await apiRequest<{
        success: boolean;
        status: 'ACTIVE' | 'PENDING';
        messageBn?: string;
        messageEn?: string;
      }>('/api/rooms/join', {
        method: 'POST',
        body: JSON.stringify({ joinCode: cleanCode }),
      });

      if (res.success) {
        if (res.status === 'ACTIVE') {
          showSuccess(res.messageBn || t('toastJoinedSuccess'));
          setJoinModalOpen(false);
          setJoinCode('');
          await refreshAuth();
          onRoomSelected();
        } else {
          showSuccess(res.messageBn || t('toastRequestSent'));
          setJoinModalOpen(false);
          setJoinCode('');
          await refreshAuth();
        }
      }
    } catch (err: any) {
      showError(err.messageBn || err.messageEn || err.message || 'Failed to join room');
    } finally {
      setLoading(false);
    }
  };

  const handleEnterRoom = async (room: UserRoomItem) => {
    if (room.member_status !== 'ACTIVE') return;
    await switchRoom(room.id);
    onRoomSelected();
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'OWNER':
        return 'bg-amber-100 text-amber-900 dark:bg-amber-950/80 dark:text-amber-300 border-amber-300 dark:border-amber-800';
      case 'MANAGER':
        return 'bg-purple-100 text-purple-900 dark:bg-purple-950/80 dark:text-purple-300 border-purple-300 dark:border-purple-800';
      case 'STAFF':
        return 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950/80 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800';
      default:
        return 'bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-300 border-stone-200 dark:border-stone-700';
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-10">
      {/* Title Header */}
      <div className="text-center max-w-2xl mx-auto space-y-2">
        <h1 className="text-2xl sm:text-3xl font-extrabold text-stone-900 dark:text-stone-100 tracking-tight">
          {t('roomChoiceTitle')}
        </h1>
        <p className="text-xs sm:text-sm text-stone-600 dark:text-stone-400 leading-relaxed">
          {t('roomChoiceSubtitle')}
        </p>
      </div>

      {/* Two Big Action Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
        {/* Create Room Card */}
        <div
          onClick={() => setCreateModalOpen(true)}
          className="group relative p-6 sm:p-8 rounded-3xl bg-white dark:bg-[#1E1920] border-2 border-stone-200/80 dark:border-stone-800 hover:border-[#582C4D] dark:hover:border-[#C5A059] shadow-xl hover:shadow-2xl transition-all duration-200 cursor-pointer flex flex-col justify-between"
        >
          <div>
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#582C4D] to-[#3B1D34] flex items-center justify-center text-white mb-5 shadow-md shadow-[#582C4D]/25 group-hover:scale-105 transition-transform">
              <PlusCircle className="w-7 h-7 text-[#C5A059]" />
            </div>
            <h2 className="text-lg sm:text-xl font-bold text-stone-900 dark:text-stone-100 mb-2">
              {t('createRoomCardTitle')}
            </h2>
            <p className="text-xs sm:text-sm text-stone-600 dark:text-stone-400 leading-relaxed">
              {t('createRoomCardDesc')}
            </p>
          </div>

          <div className="flex items-center gap-2 mt-6 text-xs sm:text-sm font-bold text-[#582C4D] dark:text-[#C5A059] group-hover:translate-x-1 transition-transform">
            <span>{t('createRoomCardTitle')}</span>
            <ArrowRight className="w-4 h-4" />
          </div>
        </div>

        {/* Join Room Card */}
        <div
          onClick={() => setJoinModalOpen(true)}
          className="group relative p-6 sm:p-8 rounded-3xl bg-white dark:bg-[#1E1920] border-2 border-stone-200/80 dark:border-stone-800 hover:border-[#582C4D] dark:hover:border-[#C5A059] shadow-xl hover:shadow-2xl transition-all duration-200 cursor-pointer flex flex-col justify-between"
        >
          <div>
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#2D5A46] to-[#1C3A2D] flex items-center justify-center text-white mb-5 shadow-md shadow-[#2D5A46]/25 group-hover:scale-105 transition-transform">
              <KeyRound className="w-7 h-7 text-emerald-300" />
            </div>
            <h2 className="text-lg sm:text-xl font-bold text-stone-900 dark:text-stone-100 mb-2">
              {t('joinRoomCardTitle')}
            </h2>
            <p className="text-xs sm:text-sm text-stone-600 dark:text-stone-400 leading-relaxed">
              {t('joinRoomCardDesc')}
            </p>
          </div>

          <div className="flex items-center gap-2 mt-6 text-xs sm:text-sm font-bold text-[#2D5A46] dark:text-emerald-400 group-hover:translate-x-1 transition-transform">
            <span>{t('joinRoomCardTitle')}</span>
            <ArrowRight className="w-4 h-4" />
          </div>
        </div>
      </div>

      {/* Accessible Rooms Section */}
      <div className="max-w-4xl mx-auto space-y-4 pt-4">
        <div className="flex items-center justify-between border-b border-stone-200 dark:border-stone-800 pb-3">
          <h3 className="text-base sm:text-lg font-bold text-stone-900 dark:text-stone-100">
            {t('myRoomsListTitle')}
          </h3>
          <span className="text-xs text-stone-500 font-mono">
            {userRooms.length} {language === 'bn' ? 'টি রুম' : 'Rooms'}
          </span>
        </div>

        {userRooms.length === 0 ? (
          <EmptyState
            icon={Building2}
            title={t('noRoomsYet')}
            description={t('roomChoiceSubtitle')}
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {userRooms.map((room) => {
              const isPending = room.member_status === 'PENDING';
              return (
                <div
                  key={room.id}
                  className={`p-5 rounded-2xl bg-white dark:bg-[#1E1920] border border-stone-200 dark:border-stone-800 shadow-sm flex flex-col justify-between gap-4 transition-all ${
                    isPending ? 'opacity-70 bg-stone-50/50' : 'hover:shadow-md'
                  }`}
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="text-sm sm:text-base font-bold text-stone-900 dark:text-stone-100 truncate">
                        {room.name}
                      </h4>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-md border shrink-0 ${getRoleBadge(
                          room.role
                        )}`}
                      >
                        {t(`role_${room.role}` as any)}
                      </span>
                    </div>

                    <div className="space-y-1 text-xs text-stone-500 dark:text-stone-400">
                      <div className="flex items-center gap-1.5 truncate">
                        <MapPin className="w-3.5 h-3.5 shrink-0 text-stone-400" />
                        <span className="truncate">{room.address}</span>
                      </div>
                      <div className="flex items-center gap-1.5 truncate">
                        <Phone className="w-3.5 h-3.5 shrink-0 text-stone-400" />
                        <span>{room.phone}</span>
                      </div>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-stone-100 dark:border-stone-800/80 flex items-center justify-between">
                    {isPending ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                        <Clock className="w-3.5 h-3.5" />
                        <span>{t('status_PENDING')}</span>
                      </span>
                    ) : (
                      <button
                        onClick={() => handleEnterRoom(room)}
                        className="w-full flex items-center justify-center gap-2 py-2 px-3 text-xs font-bold text-white bg-[#582C4D] hover:bg-[#6C375F] rounded-xl shadow-xs transition-all active:scale-98"
                      >
                        <span>{t('enterRoom')}</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal: Create Room */}
      <Modal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        title={t('createRoomModalTitle')}
        maxWidth="md"
      >
        <form onSubmit={handleCreateRoom} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 mb-1">
              {t('roomNameLabel')} *
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('roomNamePlaceholder')}
              className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-xs sm:text-sm text-stone-900 dark:text-stone-100 focus:outline-hidden focus:ring-2 focus:ring-[#582C4D]"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 mb-1">
              {t('roomAddressLabel')} *
            </label>
            <input
              type="text"
              required
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder={t('roomAddressPlaceholder')}
              className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-xs sm:text-sm text-stone-900 dark:text-stone-100 focus:outline-hidden focus:ring-2 focus:ring-[#582C4D]"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 mb-1">
              {t('roomPhoneLabel')} *
            </label>
            <input
              type="text"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder={t('roomPhonePlaceholder')}
              className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-xs sm:text-sm text-stone-900 dark:text-stone-100 focus:outline-hidden focus:ring-2 focus:ring-[#582C4D]"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 mb-1">
              {t('roomDefaultLangLabel')}
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setDefaultLang('bn')}
                className={`py-2 rounded-xl text-xs font-bold border transition-colors ${
                  defaultLang === 'bn'
                    ? 'bg-[#582C4D] text-white border-[#582C4D]'
                    : 'bg-stone-50 dark:bg-stone-800 text-stone-700 dark:text-stone-300 border-stone-200 dark:border-stone-700'
                }`}
              >
                বাংলা (বাং)
              </button>
              <button
                type="button"
                onClick={() => setDefaultLang('en')}
                className={`py-2 rounded-xl text-xs font-bold border transition-colors ${
                  defaultLang === 'en'
                    ? 'bg-[#582C4D] text-white border-[#582C4D]'
                    : 'bg-stone-50 dark:bg-stone-800 text-stone-700 dark:text-stone-300 border-stone-200 dark:border-stone-700'
                }`}
              >
                English (EN)
              </button>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-3">
            <button
              type="button"
              onClick={() => setCreateModalOpen(false)}
              className="px-4 py-2 text-xs font-semibold text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-xl"
            >
              {t('cancel')}
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 text-xs font-bold text-white bg-[#582C4D] hover:bg-[#6C375F] rounded-xl shadow-md transition-all disabled:opacity-60"
            >
              {loading ? t('saving') : t('createRoomBtn')}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Join Room */}
      <Modal
        isOpen={joinModalOpen}
        onClose={() => setJoinModalOpen(false)}
        title={t('joinRoomModalTitle')}
        maxWidth="sm"
      >
        <form onSubmit={handleJoinRoom} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 mb-1">
              {t('joinCodeLabel')}
            </label>
            <input
              type="text"
              required
              maxLength={12}
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder={t('joinCodePlaceholder')}
              className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-sm font-mono tracking-widest text-center uppercase text-stone-900 dark:text-stone-100 focus:outline-hidden focus:ring-2 focus:ring-[#582C4D]"
            />
            <p className="text-[11px] text-stone-500 dark:text-stone-400 mt-1.5 leading-relaxed">
              {t('roomJoinCodeCardDesc')}
            </p>
          </div>

          <div className="flex items-center justify-end gap-3 pt-3">
            <button
              type="button"
              onClick={() => setJoinModalOpen(false)}
              className="px-4 py-2 text-xs font-semibold text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-xl"
            >
              {t('cancel')}
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 text-xs font-bold text-white bg-[#2D5A46] hover:bg-[#396F57] rounded-xl shadow-md transition-all disabled:opacity-60"
            >
              {loading ? t('loading') : t('joinRoomBtn')}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
