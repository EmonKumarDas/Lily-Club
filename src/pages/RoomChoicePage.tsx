import React, { useState, useEffect } from 'react';
import {
  PlusCircle,
  KeyRound,
  ArrowRight,
  Phone,
  MapPin,
  Clock,
  XCircle,
  ShieldOff,
  Ban,
  Trash2,
  CheckCircle2,
} from 'lucide-react';
import { useAuth, type UserRoomItem, type MembershipNotice } from '../context/AuthContext.js';
import { useToast } from '../components/Toast.js';
import { Modal } from '../components/Modal.js';
import { ActionButton, useUnsavedChanges } from '../components/ActionButton.js';
import { ButtonSpinner } from '../components/Loader.js';
import { apiRequest, generateIdempotencyKey } from '../lib/api.js';

export const RoomChoicePage: React.FC<{ onRoomSelected: () => void }> = ({ onRoomSelected }) => {
  const {
    userRooms,
    membershipNotices,
    dismissNotice,
    switchRoom,
    refreshAuth,
    language,
    t,
  } = useAuth();
  const { showSuccess, showError } = useToast();
  const isBn = language === 'bn';

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [joinModalOpen, setJoinModalOpen] = useState(false);

  // Create Room Form State (persists on failure)
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [defaultLang, setDefaultLang] = useState<'bn' | 'en'>(language);
  const [createIdemKey, setCreateIdemKey] = useState(() => generateIdempotencyKey('room-create'));

  // Join Room Form State
  const [joinCode, setJoinCode] = useState('');
  const [joinIdemKey, setJoinIdemKey] = useState(() => generateIdempotencyKey('room-join'));

  const isDirty =
    (createModalOpen && Boolean(name.trim() || address.trim() || phone.trim())) ||
    (joinModalOpen && Boolean(joinCode.trim()));
  useUnsavedChanges(isDirty);

  const pendingRooms = userRooms.filter((r) => r.member_status === 'PENDING');
  const activeRooms = userRooms.filter((r) => r.member_status === 'ACTIVE');

  // Section 1 #6: While user has a PENDING join request, poll every 5s so approval/rejection updates automatically!
  useEffect(() => {
    if (pendingRooms.length === 0) return;
    const timer = setInterval(() => {
      void refreshAuth();
    }, 5000);
    return () => clearInterval(timer);
  }, [pendingRooms.length, refreshAuth]);

  const handleCreateRoom = async () => {
    if (!name.trim() || !address.trim() || !phone.trim()) {
      showError(isBn ? 'অনুগ্রহ করে সকল প্রয়োজনীয় ঘর পূরণ করুন।' : 'Please fill in all required fields.');
      return;
    }

    try {
      const res = await apiRequest<{ success: boolean; room: any }>('/api/rooms', {
        method: 'POST',
        idempotencyKey: createIdemKey,
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
        setCreateIdemKey(generateIdempotencyKey('room-create'));
        await refreshAuth();
        onRoomSelected();
      }
    } catch (err: any) {
      // Keep form data intact on error; generate new idempotency key only if validation error
      if (err.status && err.status >= 400 && err.status < 500) {
        setCreateIdemKey(generateIdempotencyKey('room-create'));
      }
      showError((isBn ? err.messageBn : err.messageEn) || err.message || 'Failed to create room');
    }
  };

  const handleJoinRoom = async () => {
    const cleanCode = joinCode.trim().toUpperCase();
    if (!cleanCode) {
      showError(isBn ? 'সঠিক রুম আইডি লিখুন।' : 'Please enter a Room ID.');
      return;
    }

    try {
      const res = await apiRequest<{
        success: boolean;
        status: 'ACTIVE' | 'PENDING';
        messageBn?: string;
        messageEn?: string;
      }>('/api/rooms/join', {
        method: 'POST',
        idempotencyKey: joinIdemKey,
        body: JSON.stringify({ joinCode: cleanCode }),
      });

      if (res.success) {
        setJoinModalOpen(false);
        setJoinCode('');
        setJoinIdemKey(generateIdempotencyKey('room-join'));
        await refreshAuth();
        if (res.status === 'ACTIVE') {
          showSuccess((isBn ? res.messageBn : res.messageEn) || t('toastJoinedSuccess'));
          onRoomSelected();
        } else {
          showSuccess((isBn ? res.messageBn : res.messageEn) || t('toastRequestSent'));
        }
      }
    } catch (err: any) {
      if (err.status && err.status >= 400 && err.status < 500) {
        setJoinIdemKey(generateIdempotencyKey('room-join'));
      }
      showError((isBn ? err.messageBn : err.messageEn) || err.message || 'Invalid code or request not allowed.');
    }
  };

  const handleCancelPending = async (roomId: string) => {
    try {
      await apiRequest(`/api/rooms/${roomId}/cancel-request`, {
        method: 'DELETE',
      });
      showSuccess(isBn ? 'যোগদানের আবেদনটি বাতিল করা হয়েছে।' : 'Join request cancelled.');
      await refreshAuth();
    } catch (err: any) {
      showError((isBn ? err.messageBn : err.messageEn) || err.message);
    }
  };

  const handleEnterRoom = async (room: UserRoomItem) => {
    if (room.member_status !== 'ACTIVE') return;
    await switchRoom(room.id);
    onRoomSelected();
  };

  const renderNoticeBanner = (notice: MembershipNotice) => {
    const configMap = {
      REJECTED: {
        icon: <XCircle className="w-6 h-6 text-rose-600 shrink-0" />,
        titleBn: 'যোগদানের আবেদন প্রত্যাখ্যাত হয়েছে',
        titleEn: 'Join Request Declined',
        descBn: `"${notice.room_name}" রুমে আপনার যোগদানের অনুরোধটি রুমের মালিক অনুমোদন করেননি।`,
        descEn: `Your request to join "${notice.room_name}" was not approved by the room owner.`,
      },
      REMOVED: {
        icon: <ShieldOff className="w-6 h-6 text-rose-600 shrink-0" />,
        titleBn: 'রুম থেকে সদস্যপদ প্রত্যাহার করা হয়েছে',
        titleEn: 'Removed from Room',
        descBn: `"${notice.room_name}" রুমে আপনার প্রবেশাধিকার সমাপ্ত হয়েছে।`,
        descEn: `Your membership in "${notice.room_name}" has been removed by the owner.`,
      },
      SUSPENDED: {
        icon: <Ban className="w-6 h-6 text-amber-600 shrink-0" />,
        titleBn: 'সদস্যপদ সাময়িকভাবে স্থগিত (Suspended)',
        titleEn: 'Membership Suspended',
        descBn: `"${notice.room_name}" রুমে আপনার অ্যাক্সেস সাময়িকভাবে স্থগিত করা হয়েছে। ওনারের সাথে যোগাযোগ করুন।`,
        descEn: `Your access to "${notice.room_name}" is currently suspended. Please contact the room owner.`,
      },
      ROOM_DELETED: {
        icon: <Trash2 className="w-6 h-6 text-stone-600 shrink-0" />,
        titleBn: 'রুমটি মুছে ফেলা হয়েছে',
        titleEn: 'Room Deleted',
        descBn: `"${notice.room_name}" রুমটি মালিক কর্তৃক বন্ধ বা মুছে ফেলা হয়েছে।`,
        descEn: `The room "${notice.room_name}" has been deleted by its owner.`,
      },
    }[notice.status];

    return (
      <div
        key={notice.room_id}
        role="alert"
        className="max-w-2xl mx-auto p-5 rounded-3xl bg-white dark:bg-[#1D1820] border-2 border-rose-200 dark:border-rose-900/60 shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-4"
      >
        <div className="flex items-start gap-3.5">
          {configMap.icon}
          <div className="space-y-1">
            <h3 className="text-sm sm:text-base font-extrabold text-stone-900 dark:text-stone-100">
              {isBn ? configMap.titleBn : configMap.titleEn}
            </h3>
            <p className="text-xs sm:text-sm text-stone-600 dark:text-stone-300 leading-relaxed">
              {isBn ? configMap.descBn : configMap.descEn}
            </p>
          </div>
        </div>
        <ActionButton
          variant="ghost"
          onClick={() => dismissNotice(notice.room_id)}
          className="shrink-0"
        >
          {isBn ? 'ঠিক আছে' : 'Dismiss'}
        </ActionButton>
      </div>
    );
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-8">
      {/* 1. Membership Status Screens (Rejected / Removed / Suspended / Room Deleted) */}
      {membershipNotices.length > 0 && (
        <div className="space-y-4">{membershipNotices.map(renderNoticeBanner)}</div>
      )}

      {/* 2. Dedicated Pending Approval Screen (No room operational data leaked!) */}
      {pendingRooms.length > 0 && activeRooms.length === 0 ? (
        <div className="max-w-xl mx-auto p-7 sm:p-10 rounded-[2rem] bg-white dark:bg-[#1D1820] border border-amber-300/80 dark:border-amber-800/70 shadow-xl text-center space-y-6">
          <div className="w-16 h-16 mx-auto rounded-3xl bg-amber-100 dark:bg-amber-950/70 flex items-center justify-center text-amber-600 dark:text-amber-400">
            <Clock className="w-8 h-8" />
          </div>
          <div className="space-y-2">
            <h1 className="text-xl sm:text-2xl font-extrabold text-stone-900 dark:text-stone-100">
              {isBn ? 'মালিকের অনুমোদনের অপেক্ষায়' : "Waiting for the owner's approval"}
            </h1>
            <p className="text-xs sm:text-sm text-stone-600 dark:text-stone-400 leading-relaxed">
              {isBn
                ? 'আপনার যোগদানের অনুরোধটি পাঠানো হয়েছে। রুমের মালিক (Owner) অনুমোদন করলেই এই স্ক্রিনটি স্বয়ংক্রিয়ভাবে খুলে যাবে।'
                : 'Your join request has been submitted. This screen will update automatically in real time as soon as the Owner approves or responds.'}
            </p>
          </div>

          <div className="space-y-3">
            {pendingRooms.map((pr) => (
              <div
                key={pr.id}
                className="p-4 rounded-2xl bg-[#FAF4F0] dark:bg-stone-900 border border-stone-200 dark:border-stone-800 flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-2.5 text-left">
                  <ButtonSpinner className="w-4 h-4 text-amber-600" label="Waiting" />
                  <span className="text-xs font-bold text-amber-800 dark:text-amber-300">
                    {isBn ? 'অনুমোদন অপেক্ষমাণ (Pending)' : 'Pending Owner Approval'}
                  </span>
                </div>
                <ActionButton
                  variant="danger"
                  onClick={() => handleCancelPending(pr.id)}
                  className="px-3.5 py-1.5 text-xs"
                >
                  {isBn ? 'আবেদন বাতিল করুন' : 'Cancel Request'}
                </ActionButton>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <>
          {/* 3. Welcome Title */}
          <div className="text-center max-w-2xl mx-auto space-y-2">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-stone-900 dark:text-stone-100 tracking-tight">
              {t('roomChoiceTitle')}
            </h1>
            <p className="text-xs sm:text-sm text-stone-600 dark:text-stone-400 leading-relaxed">
              {t('roomChoiceSubtitle')}
            </p>
          </div>

          {/* 4. Two Welcome Cards ONLY when user has no active rooms ("Create a Room" & "Join with Room ID") */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
            <button
              type="button"
              onClick={() => setCreateModalOpen(true)}
              className="group p-6 sm:p-8 rounded-[2rem] bg-white dark:bg-[#1D1820] border-2 border-stone-200/90 dark:border-stone-800 hover:border-[#4A2545] dark:hover:border-[#C5A059] shadow-lg hover:shadow-xl transition-all text-left flex flex-col justify-between cursor-pointer min-h-[210px]"
            >
              <div>
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#4A2545] to-[#331930] flex items-center justify-center text-white mb-5 shadow-md group-hover:scale-105 transition-transform">
                  <PlusCircle className="w-7 h-7 text-[#C5A059]" />
                </div>
                <h2 className="text-lg sm:text-xl font-extrabold text-stone-900 dark:text-stone-100 mb-2">
                  {t('createRoomCardTitle')}
                </h2>
                <p className="text-xs sm:text-sm text-stone-600 dark:text-stone-400 leading-relaxed">
                  {t('createRoomCardDesc')}
                </p>
              </div>

              <div className="flex items-center gap-2 mt-6 text-xs sm:text-sm font-bold text-[#4A2545] dark:text-[#C5A059]">
                <span>{t('createRoomCardTitle')}</span>
                <ArrowRight className="w-4 h-4" />
              </div>
            </button>

            <button
              type="button"
              onClick={() => setJoinModalOpen(true)}
              className="group p-6 sm:p-8 rounded-[2rem] bg-white dark:bg-[#1D1820] border-2 border-stone-200/90 dark:border-stone-800 hover:border-[#0E8A44] dark:hover:border-emerald-400 shadow-lg hover:shadow-xl transition-all text-left flex flex-col justify-between cursor-pointer min-h-[210px]"
            >
              <div>
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#0E8A44] to-[#0A6230] flex items-center justify-center text-white mb-5 shadow-md group-hover:scale-105 transition-transform">
                  <KeyRound className="w-7 h-7 text-emerald-100" />
                </div>
                <h2 className="text-lg sm:text-xl font-extrabold text-stone-900 dark:text-stone-100 mb-2">
                  {t('joinRoomCardTitle')}
                </h2>
                <p className="text-xs sm:text-sm text-stone-600 dark:text-stone-400 leading-relaxed">
                  {t('joinRoomCardDesc')}
                </p>
              </div>

              <div className="flex items-center gap-2 mt-6 text-xs sm:text-sm font-bold text-[#0E8A44] dark:text-emerald-400">
                <span>{t('joinRoomCardTitle')}</span>
                <ArrowRight className="w-4 h-4" />
              </div>
            </button>
          </div>

          {/* 5. Multi-Room Switcher Section (Shown ONLY when user already belongs to >=1 active room!) */}
          {activeRooms.length > 0 && (
            <div className="max-w-4xl mx-auto space-y-4 pt-4">
              <div className="flex items-center justify-between border-b border-stone-200 dark:border-stone-800 pb-3">
                <h3 className="text-base sm:text-lg font-bold text-stone-900 dark:text-stone-100">
                  {t('myRoomsListTitle')}
                </h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {userRooms.map((room) => {
                  const isPending = room.member_status === 'PENDING';
                  return (
                    <div
                      key={room.id}
                      className="p-5 rounded-3xl bg-white dark:bg-[#1D1820] border border-stone-200 dark:border-stone-800 shadow-xs flex flex-col justify-between gap-4"
                    >
                      <div className="space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="text-sm sm:text-base font-bold text-stone-900 dark:text-stone-100 truncate">
                            {room.name}
                          </h4>
                          <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-[#FAF4F0] dark:bg-stone-800 text-[#4A2545] dark:text-[#C5A059] border border-[#4A2545]/20 shrink-0">
                            {t(`role_${room.role}` as any)}
                          </span>
                        </div>

                        {!isPending && (
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
                        )}
                      </div>

                      <div className="pt-2 border-t border-stone-100 dark:border-stone-800/80 flex items-center justify-between gap-2">
                        {isPending ? (
                          <>
                            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-600 dark:text-amber-400">
                              <Clock className="w-3.5 h-3.5" />
                              <span>{t('status_PENDING')}</span>
                            </span>
                            <ActionButton
                              variant="ghost"
                              onClick={() => handleCancelPending(room.id)}
                              className="px-3 py-1.5 text-xs"
                            >
                              {isBn ? 'বাতিল' : 'Cancel'}
                            </ActionButton>
                          </>
                        ) : (
                          <ActionButton
                            variant="primary"
                            onClick={() => handleEnterRoom(room)}
                            className="w-full"
                            icon={<CheckCircle2 className="w-4 h-4 text-[#C5A059]" />}
                          >
                            {t('enterRoom')}
                          </ActionButton>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {/* Modal: Create Room */}
      <Modal
        isOpen={createModalOpen}
        onClose={() => {
          if (isDirty && !window.confirm(isBn ? 'অসংরক্ষিত তথ্য বাতিল করতে চান?' : 'Discard unsaved changes?')) {
            return;
          }
          setCreateModalOpen(false);
        }}
        title={t('createRoomModalTitle')}
        maxWidth="md"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleCreateRoom();
          }}
          className="space-y-4"
        >
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
              className="w-full px-3.5 py-2.5 min-h-[44px] rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-xs sm:text-sm text-stone-900 dark:text-stone-100"
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
              className="w-full px-3.5 py-2.5 min-h-[44px] rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-xs sm:text-sm text-stone-900 dark:text-stone-100"
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
              className="w-full px-3.5 py-2.5 min-h-[44px] rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-xs sm:text-sm text-stone-900 dark:text-stone-100"
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
                className={`min-h-[44px] py-2 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                  defaultLang === 'bn'
                    ? 'bg-[#4A2545] text-white border-[#4A2545]'
                    : 'bg-stone-50 dark:bg-stone-800 text-stone-700 dark:text-stone-300 border-stone-200 dark:border-stone-700'
                }`}
              >
                বাংলা (বাং)
              </button>
              <button
                type="button"
                onClick={() => setDefaultLang('en')}
                className={`min-h-[44px] py-2 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                  defaultLang === 'en'
                    ? 'bg-[#4A2545] text-white border-[#4A2545]'
                    : 'bg-stone-50 dark:bg-stone-800 text-stone-700 dark:text-stone-300 border-stone-200 dark:border-stone-700'
                }`}
              >
                English (EN)
              </button>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-3">
            <ActionButton variant="ghost" onClick={() => setCreateModalOpen(false)}>
              {t('cancel')}
            </ActionButton>
            <ActionButton
              variant="primary"
              onClick={handleCreateRoom}
              loadingLabel={t('saving')}
            >
              {t('createRoomBtn')}
            </ActionButton>
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
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleJoinRoom();
          }}
          className="space-y-4"
        >
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
              className="w-full px-3.5 py-2.5 min-h-[44px] rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-sm font-mono tracking-widest text-center uppercase text-stone-900 dark:text-stone-100"
            />
            <p className="text-[11px] text-stone-500 dark:text-stone-400 mt-1.5 leading-relaxed">
              {t('roomJoinCodeCardDesc')}
            </p>
          </div>

          <div className="flex items-center justify-end gap-3 pt-3">
            <ActionButton variant="ghost" onClick={() => setJoinModalOpen(false)}>
              {t('cancel')}
            </ActionButton>
            <ActionButton
              variant="primary"
              onClick={handleJoinRoom}
              loadingLabel={t('loading')}
            >
              {t('joinRoomBtn')}
            </ActionButton>
          </div>
        </form>
      </Modal>
    </div>
  );
};
