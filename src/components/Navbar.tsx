import React, { useState, useRef, useEffect } from 'react';
import {
  Building2,
  ChevronDown,
  Globe,
  Sun,
  Moon,
  Bell,
  LogOut,
  ShieldAlert,
  Plus,
  Check,
  CheckCheck,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.js';
import { useTheme } from '../context/ThemeContext.js';
import { DateBadge } from './DateBadge.js';
import { Modal } from './Modal.js';
import { ActionButton } from './ActionButton.js';
import { PrivacyPolicyModal, DeleteAccountModal } from './PrivacyAndAccountModal.js';
import { useToast } from './Toast.js';
import { SlotBadge, type SlotType } from './SlotBadge.js';
import {
  formatDualDate,
  formatDualDateFromYMD,
  formatNumberByLanguage,
} from '../lib/dateUtils.js';
import { apiRequest } from '../lib/api.js';

export const Navbar: React.FC<{
  onNavigateToRooms: () => void;
  onOpenBookingFromNotif?: (bookingId: string) => void;
}> = ({ onNavigateToRooms, onOpenBookingFromNotif }) => {
  const {
    user,
    activeRoom,
    activeMember,
    userRooms,
    language,
    setLanguage,
    switchRoom,
    deleteAccount,
    logout,
    logoutAll,
    t,
  } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { showError, showSuccess } = useToast();

  const [roomDropdownOpen, setRoomDropdownOpen] = useState(false);
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const [notifDropdownOpen, setNotifDropdownOpen] = useState(false);
  const [logoutAllModalOpen, setLogoutAllModalOpen] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [deleteAccountOpen, setDeleteAccountOpen] = useState(false);

  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);

  const roomMenuRef = useRef<HTMLDivElement>(null);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const notifMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (roomMenuRef.current && !roomMenuRef.current.contains(e.target as Node)) {
        setRoomDropdownOpen(false);
      }
      if (profileMenuRef.current && !profileMenuRef.current.contains(e.target as Node)) {
        setProfileDropdownOpen(false);
      }
      if (notifMenuRef.current && !notifMenuRef.current.contains(e.target as Node)) {
        setNotifDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchNotifications = async () => {
    if (!activeRoom || !user) return;
    try {
      const res = await apiRequest<{ notifications: any[]; unreadCount: number }>(
        `/api/rooms/${activeRoom.id}/notifications`
      );
      setNotifications(res.notifications || []);
      setUnreadCount(res.unreadCount || 0);
    } catch {}
  };

  useEffect(() => {
    if (!activeRoom || !user) return;
    fetchNotifications();
    const timer = setInterval(fetchNotifications, 25000);
    return () => clearInterval(timer);
  }, [activeRoom, user, activeMember?.role]);

  const handleMarkRead = async (notif: any) => {
    if (!activeRoom) return;
    try {
      if (!notif.is_read) {
        await apiRequest(`/api/rooms/${activeRoom.id}/notifications/${notif.id}/read`, {
          method: 'POST',
        });
      }
      await fetchNotifications();
      if (notif.booking_id && onOpenBookingFromNotif) {
        setNotifDropdownOpen(false);
        onOpenBookingFromNotif(notif.booking_id);
      }
    } catch {}
  };

  const handleMarkAllRead = async () => {
    if (!activeRoom) return;
    try {
      await apiRequest(`/api/rooms/${activeRoom.id}/notifications/read-all`, {
        method: 'POST',
      });
      await fetchNotifications();
    } catch {}
  };

  const getRoleBadgeColor = (role?: string) => {
    switch (role) {
      case 'OWNER':
        return 'bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 border-amber-300 dark:border-amber-800';
      case 'MANAGER':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-950/80 dark:text-purple-300 border-purple-300 dark:border-purple-800';
      case 'STAFF':
        return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800';
      default:
        return 'bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-300 border-stone-200 dark:border-stone-700';
    }
  };

  return (
    <>
      <header className="sticky top-0 z-40 w-full bg-white/90 dark:bg-[#161317]/90 backdrop-blur-md border-b border-stone-200 dark:border-stone-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          {/* Left Brand & Active Room Switcher */}
          <div className="flex items-center gap-3 sm:gap-6 min-w-0">
            <div
              className="flex items-center gap-2.5 shrink-0 cursor-pointer"
              onClick={onNavigateToRooms}
            >
              <div className="w-12 h-12 rounded-xl bg-white border border-[#0E8A44]/25 flex items-center justify-center shadow-sm overflow-hidden p-0.5">
                <img src="/logo.png" alt="Lily Community Center" className="w-full h-full object-contain" />
              </div>
              <div className="hidden sm:block">
                <h1 className="text-base font-bold text-stone-900 dark:text-stone-100 leading-tight">
                  {t('appName')}
                </h1>
                <p className="text-[10px] text-stone-500 dark:text-stone-400 font-medium">
                  {activeRoom ? activeRoom.name : t('appTagline')}
                </p>
              </div>
            </div>

            {/* Room Switcher Dropdown */}
            {activeRoom && (
              <div className="relative" ref={roomMenuRef}>
                <button
                  onClick={() => setRoomDropdownOpen(!roomDropdownOpen)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-stone-100/90 dark:bg-stone-800/90 hover:bg-stone-200/80 dark:hover:bg-stone-700/80 text-xs sm:text-sm font-semibold text-stone-800 dark:text-stone-200 border border-stone-200/80 dark:border-stone-700 transition-colors cursor-pointer"
                >
                  <Building2 className="w-4 h-4 text-[#582C4D] dark:text-[#C5A059] shrink-0" />
                  <span className="truncate max-w-[110px] sm:max-w-[160px]">{activeRoom.name}</span>
                  <ChevronDown className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                </button>

                {roomDropdownOpen && (
                  <div className="absolute left-0 mt-2 w-64 sm:w-72 bg-white dark:bg-[#1E1920] border border-stone-200 dark:border-stone-800 rounded-2xl shadow-xl p-2 z-50">
                    <div className="px-3 py-2 text-[11px] font-bold text-stone-400 uppercase tracking-wider">
                      {t('myRoomsListTitle')}
                    </div>
                    <div className="space-y-1 max-h-56 overflow-y-auto">
                      {userRooms.map((r) => {
                        const isActive = r.id === activeRoom.id;
                        return (
                          <button
                            key={r.id}
                            disabled={r.member_status !== 'ACTIVE'}
                            onClick={() => {
                              if (!isActive && r.member_status === 'ACTIVE') {
                                switchRoom(r.id);
                              }
                              setRoomDropdownOpen(false);
                            }}
                            className={`w-full flex items-center justify-between p-2.5 rounded-xl text-left text-xs sm:text-sm transition-colors ${
                              isActive
                                ? 'bg-[#582C4D]/10 dark:bg-[#C5A059]/15 text-[#582C4D] dark:text-[#C5A059] font-bold'
                                : r.member_status === 'ACTIVE'
                                ? 'hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-700 dark:text-stone-300'
                                : 'opacity-60 cursor-not-allowed text-stone-400'
                            }`}
                          >
                            <div className="truncate pr-2">
                              <p className="truncate font-medium">{r.name}</p>
                              <span className="text-[10px] opacity-75 font-normal">
                                {t(`role_${r.role}` as any)}
                              </span>
                            </div>
                            {isActive && (
                              <Check className="w-4 h-4 text-[#582C4D] dark:text-[#C5A059] shrink-0" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                    <div className="border-t border-stone-100 dark:border-stone-800 mt-2 pt-2">
                      <button
                        onClick={() => {
                          setRoomDropdownOpen(false);
                          onNavigateToRooms();
                        }}
                        className="w-full flex items-center justify-center gap-2 p-2 rounded-xl text-xs font-semibold text-[#582C4D] dark:text-[#C5A059] hover:bg-[#582C4D]/5 dark:hover:bg-[#C5A059]/10 transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>{t('roomChoiceTitle')}</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Center Date Badge */}
          <div className="hidden lg:flex items-center justify-center">
            <DateBadge />
          </div>

          {/* Right Controls: Language, Theme, Notifications, Profile */}
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={() => setLanguage(language === 'bn' ? 'en' : 'bn')}
              className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 dark:hover:bg-stone-700 text-xs sm:text-sm font-bold text-stone-800 dark:text-stone-200 transition-colors cursor-pointer"
              title={language === 'bn' ? 'Switch to English' : 'বাংলা ভাষায় পরিবর্তন করুন'}
            >
              <Globe className="w-3.5 h-3.5 text-[#582C4D] dark:text-[#C5A059]" />
              <span>{language === 'bn' ? 'EN' : 'বাং'}</span>
            </button>

            <button
              onClick={toggleTheme}
              className="p-2 rounded-xl text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors cursor-pointer"
              title={theme === 'dark' ? t('themeLight') : t('themeDark')}
            >
              {theme === 'dark' ? (
                <Sun className="w-4 h-4 text-amber-400" />
              ) : (
                <Moon className="w-4 h-4 text-[#582C4D]" />
              )}
            </button>

            {/* Part 3: Live In-App Notification Centre with Unread Count Badge */}
            {activeRoom && (
              <div className="relative" ref={notifMenuRef}>
                <button
                  onClick={() => {
                    const next = !notifDropdownOpen;
                    setNotifDropdownOpen(next);
                    if (next) fetchNotifications();
                  }}
                  className="p-2 rounded-xl text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors relative cursor-pointer"
                  aria-label="Notifications"
                >
                  <Bell className="w-4 h-4" />
                  {unreadCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-600 text-white text-[10px] font-extrabold flex items-center justify-center shadow-xs">
                      {formatNumberByLanguage(unreadCount, language)}
                    </span>
                  )}
                </button>

                {notifDropdownOpen && (
                  <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white dark:bg-[#1E1920] border border-stone-200 dark:border-stone-800 rounded-2xl shadow-2xl p-3 z-50">
                    <div className="flex items-center justify-between pb-2.5 border-b border-stone-100 dark:border-stone-800 mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs sm:text-sm font-extrabold text-stone-900 dark:text-stone-100">
                          {t('notifications')}
                        </span>
                        {unreadCount > 0 && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300">
                            {formatNumberByLanguage(unreadCount, language)}
                          </span>
                        )}
                      </div>

                      {unreadCount > 0 && (
                        <button
                          onClick={handleMarkAllRead}
                          className="inline-flex items-center gap-1 text-[11px] font-bold text-[#582C4D] dark:text-[#C5A059] hover:underline cursor-pointer"
                        >
                          <CheckCheck className="w-3.5 h-3.5" />
                          <span>{t('markAllRead')}</span>
                        </button>
                      )}
                    </div>

                    {notifications.length === 0 ? (
                      <div className="py-6 text-center text-xs text-stone-500 dark:text-stone-400">
                        {t('noNotifications')}
                      </div>
                    ) : (
                      <div className="max-h-80 overflow-y-auto space-y-2 pr-1">
                        {notifications.map((n) => (
                          <div
                            key={n.id}
                            onClick={() => handleMarkRead(n)}
                            className={`p-3 rounded-xl border text-left transition-all cursor-pointer space-y-1 ${
                              n.is_read
                                ? 'bg-stone-50/60 dark:bg-stone-900/40 border-stone-200/70 dark:border-stone-800 opacity-75'
                                : 'bg-[#582C4D]/5 dark:bg-[#C5A059]/10 border-[#582C4D]/25 dark:border-[#C5A059]/30'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <span className="text-xs font-extrabold text-stone-900 dark:text-stone-100 leading-snug">
                                {language === 'bn' ? n.title_bn : n.title_en}
                              </span>
                              {n.slot && <SlotBadge slot={n.slot as SlotType} size="xs" />}
                            </div>

                            <p className="text-[11px] text-stone-600 dark:text-stone-300 leading-relaxed">
                              {language === 'bn' ? n.message_bn : n.message_en}
                            </p>

                            <div className="text-[10px] text-stone-400 pt-1 flex flex-col gap-0.5">
                              {n.event_date && (
                                <span className="font-semibold text-[#582C4D] dark:text-[#C5A059]">
                                  📅 {formatDualDateFromYMD(n.event_date)}
                                </span>
                              )}
                              <span>{formatDualDate(n.created_at, { includeTime: true })}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* User Profile Dropdown */}
            {user && (
              <div className="relative" ref={profileMenuRef}>
                <button
                  onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
                  className="flex items-center gap-2 p-1 pl-1.5 rounded-full hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors cursor-pointer"
                >
                  {user.picture ? (
                    <img
                      src={user.picture}
                      alt={user.name}
                      className="w-8 h-8 rounded-full object-cover ring-2 ring-[#582C4D]/20 dark:ring-[#C5A059]/30"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-[#582C4D] text-[#C5A059] flex items-center justify-center font-bold text-xs ring-2 ring-[#582C4D]/20">
                      {user.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <ChevronDown className="w-3.5 h-3.5 text-stone-400 hidden sm:block" />
                </button>

                {profileDropdownOpen && (
                  <div className="absolute right-0 mt-2 w-64 bg-white dark:bg-[#1E1920] border border-stone-200 dark:border-stone-800 rounded-2xl shadow-xl p-2 z-50">
                    <div className="p-3 border-b border-stone-100 dark:border-stone-800">
                      <p className="text-sm font-bold text-stone-900 dark:text-stone-100 truncate">
                        {user.name}
                      </p>
                      <p className="text-xs text-stone-500 dark:text-stone-400 truncate">
                        {user.email}
                      </p>
                      {activeMember && (
                        <div className="mt-2">
                          <span
                            className={`inline-block px-2 py-0.5 text-[11px] font-bold rounded-md border ${getRoleBadgeColor(
                              activeMember.role
                            )}`}
                          >
                            {t(`role_${activeMember.role}` as any)}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="pt-2 space-y-1">
                      <button
                        onClick={() => {
                          setProfileDropdownOpen(false);
                          setPrivacyOpen(true);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-xl transition-colors cursor-pointer"
                      >
                        <Globe className="w-4 h-4 text-[#4A2545] dark:text-[#C5A059]" />
                        <span>{language === 'bn' ? 'গোপনীয়তা নীতি' : 'Privacy Policy'}</span>
                      </button>

                      <button
                        onClick={() => {
                          setProfileDropdownOpen(false);
                          logout();
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl transition-colors cursor-pointer"
                      >
                        <LogOut className="w-4 h-4" />
                        <span>{t('signOut')}</span>
                      </button>

                      <button
                        onClick={() => {
                          setProfileDropdownOpen(false);
                          setLogoutAllModalOpen(true);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-xl transition-colors cursor-pointer"
                      >
                        <ShieldAlert className="w-4 h-4 text-amber-500" />
                        <span>{t('signOutAllDevices')}</span>
                      </button>

                      <button
                        onClick={() => {
                          setProfileDropdownOpen(false);
                          setDeleteAccountOpen(true);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl transition-colors cursor-pointer"
                      >
                        <ShieldAlert className="w-4 h-4 text-rose-600" />
                        <span>{language === 'bn' ? 'অ্যাকাউন্ট মুছে ফেলুন' : 'Delete Account'}</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      <Modal
        isOpen={logoutAllModalOpen}
        onClose={() => setLogoutAllModalOpen(false)}
        title={t('signOutAllDevices')}
        maxWidth="sm"
      >
        <div className="space-y-4">
          <p className="text-xs sm:text-sm text-stone-600 dark:text-stone-300 leading-relaxed">
            {t('signOutAllConfirm')}
          </p>
          <div className="flex items-center justify-end gap-3 pt-3">
            <ActionButton variant="ghost" onClick={() => setLogoutAllModalOpen(false)}>
              {t('cancel')}
            </ActionButton>
            <ActionButton
              variant="danger"
              onClick={async () => {
                setLogoutAllModalOpen(false);
                await logoutAll();
              }}
            >
              {t('signOutAllDevices')}
            </ActionButton>
          </div>
        </div>
      </Modal>

      <PrivacyPolicyModal
        isOpen={privacyOpen}
        onClose={() => setPrivacyOpen(false)}
        language={language}
      />

      <DeleteAccountModal
        isOpen={deleteAccountOpen}
        onClose={() => setDeleteAccountOpen(false)}
        language={language}
        onConfirmDelete={async () => {
          try {
            await deleteAccount();
            showSuccess(language === 'bn' ? 'অ্যাকাউন্ট মুছে ফেলা হয়েছে।' : 'Account deleted.');
          } catch (err: any) {
            showError((language === 'bn' ? err.messageBn : err.messageEn) || err.message);
          }
        }}
      />
    </>
  );
};
