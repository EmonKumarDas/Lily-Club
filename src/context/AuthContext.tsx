import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { apiRequest } from '../lib/api.js';
import { formatBilingualText, type Language, type TranslationKey } from '../lib/i18n.js';
import { clearFirebaseClientState } from '../../client/src/firebase.js';

export interface User {
  id: string;
  email: string;
  name: string;
  picture: string | null;
  preferred_language: Language;
}

export interface Room {
  id: string;
  name: string;
  logo: string | null;
  address: string;
  phone: string;
  default_language: Language;
  join_code?: string;
  join_approval_required: number;
  allow_staff_costs?: number;
  day_start_time?: string;
  day_end_time?: string;
  night_start_time?: string;
  night_end_time?: string;
  buffer_enabled?: number;
  buffer_minutes?: number;
}

export interface RoomMember {
  id: string;
  room_id: string;
  user_id: string;
  role: 'OWNER' | 'MANAGER' | 'STAFF' | 'VIEWER';
  status: 'ACTIVE' | 'PENDING' | 'REJECTED';
}

export interface UserRoomItem extends Room {
  role: 'OWNER' | 'MANAGER' | 'STAFF' | 'VIEWER';
  member_status: 'ACTIVE' | 'PENDING' | 'REJECTED';
}

export interface MembershipNotice {
  room_id: string;
  user_id: string;
  room_name: string;
  role: string;
  status: 'REJECTED' | 'REMOVED' | 'SUSPENDED' | 'ROOM_DELETED';
  updated_at: number;
}

interface AuthContextType {
  user: User | null;
  activeRoom: Room | null;
  activeMember: RoomMember | null;
  userRooms: UserRoomItem[];
  membershipNotices: MembershipNotice[];
  roomSwitchEpoch: number;
  sessionExpiredBanner: boolean;
  clearSessionExpiredBanner: () => void;
  language: Language;
  setLanguage: (lang: Language) => Promise<void>;
  loading: boolean;
  refreshAuth: () => Promise<void>;
  switchRoom: (roomId: string) => Promise<void>;
  dismissNotice: (roomId: string) => Promise<void>;
  deleteAccount: () => Promise<void>;
  logout: () => Promise<void>;
  logoutAll: () => Promise<void>;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}

const AuthContext = createContext<AuthContextType | null>(null);

function purgeClientRoomCache() {
  try {
    sessionStorage.clear();
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k !== 'lily_lang' && k !== 'lily_theme' && k !== 'lily_dismissed_update_version') {
        keysToRemove.push(k);
      }
    }
    for (const k of keysToRemove) {
      localStorage.removeItem(k);
    }
  } catch {}
}

async function purgeAllClientStorageOnLogout() {
  try {
    const savedLang = localStorage.getItem('lily_lang');
    const savedTheme = localStorage.getItem('lily_theme');
    localStorage.clear();
    sessionStorage.clear();
    if (savedLang) localStorage.setItem('lily_lang', savedLang);
    if (savedTheme) localStorage.setItem('lily_theme', savedTheme);

    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_ALL_CACHES' });
    }
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch {}
  await clearFirebaseClientState();
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [activeRoom, setActiveRoom] = useState<Room | null>(null);
  const [activeMember, setActiveMember] = useState<RoomMember | null>(null);
  const [userRooms, setUserRooms] = useState<UserRoomItem[]>([]);
  const [membershipNotices, setMembershipNotices] = useState<MembershipNotice[]>([]);
  const [roomSwitchEpoch, setRoomSwitchEpoch] = useState<number>(0);
  const [sessionExpiredBanner, setSessionExpiredBanner] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);

  const [language, setLanguageState] = useState<Language>(() => {
    const saved = localStorage.getItem('lily_lang');
    if (saved === 'bn' || saved === 'en') return saved;
    return 'bn';
  });

  const refreshAuth = useCallback(async () => {
    try {
      const res = await apiRequest<{
        authenticated: boolean;
        user?: User;
        activeRoom?: Room | null;
        activeMember?: RoomMember | null;
        userRooms?: UserRoomItem[];
        membershipNotices?: MembershipNotice[];
      }>('/api/auth/me');

      if (res.authenticated && res.user) {
        setUser(res.user);
        setActiveRoom((prev) => {
          // If user was previously in a room and was removed/suspended/deleted, purge room cache immediately
          if (prev && (!res.activeRoom || prev.id !== res.activeRoom.id)) {
            purgeClientRoomCache();
            setRoomSwitchEpoch((n) => n + 1);
          }
          return res.activeRoom || null;
        });
        setActiveMember(res.activeMember || null);
        setUserRooms(res.userRooms || []);
        setMembershipNotices(res.membershipNotices || []);
        setSessionExpiredBanner(false);

        if (res.user.preferred_language && res.user.preferred_language !== language) {
          setLanguageState(res.user.preferred_language);
          localStorage.setItem('lily_lang', res.user.preferred_language);
          document.documentElement.lang = res.user.preferred_language;
        }
      } else {
        setUser(null);
        setActiveRoom(null);
        setActiveMember(null);
        setUserRooms([]);
        setMembershipNotices([]);
      }
    } catch {
      setUser(null);
      setActiveRoom(null);
      setActiveMember(null);
      setUserRooms([]);
      setMembershipNotices([]);
    } finally {
      setLoading(false);
    }
  }, [language]);

  useEffect(() => {
    refreshAuth();
  }, [refreshAuth]);

  // Live session & membership revocation heartbeat (cuts access immediately when removed/suspended)
  useEffect(() => {
    if (!user) return;
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        void refreshAuth();
      }
    }, 12000);
    const onFocus = () => void refreshAuth();
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, [user, refreshAuth]);

  // Keep form drafts open and show re-sign-in prompt if session expires mid-form
  useEffect(() => {
    const onExpired = () => {
      setSessionExpiredBanner(true);
    };
    window.addEventListener('lily:session-expired', onExpired);
    return () => window.removeEventListener('lily:session-expired', onExpired);
  }, []);

  useEffect(() => {
    document.documentElement.lang = language;
    localStorage.setItem('lily_lang', language);
  }, [language]);

  const setLanguage = async (newLang: Language) => {
    setLanguageState(newLang);
    localStorage.setItem('lily_lang', newLang);
    document.documentElement.lang = newLang;

    if (user) {
      try {
        await apiRequest('/api/auth/preferences/language', {
          method: 'PATCH',
          body: JSON.stringify({ language: newLang }),
        });
        setUser((prev) => (prev ? { ...prev, preferred_language: newLang } : null));
      } catch {}
    }
  };

  const switchRoom = async (roomId: string) => {
    setLoading(true);
    try {
      // Clear previous room's cached drafts and in-memory state BEFORE entering new room
      purgeClientRoomCache();
      setActiveRoom(null);
      setActiveMember(null);
      setRoomSwitchEpoch((n) => n + 1);

      const res = await apiRequest<{
        success: boolean;
        activeRoom: Room;
        activeMember: RoomMember;
      }>('/api/rooms/switch', {
        method: 'POST',
        body: JSON.stringify({ roomId }),
      });

      if (res.success) {
        setActiveRoom(res.activeRoom);
        setActiveMember(res.activeMember);
      }
    } finally {
      setLoading(false);
    }
  };

  const dismissNotice = async (roomId: string) => {
    try {
      await apiRequest(`/api/auth/notices/${roomId}/dismiss`, { method: 'POST' });
    } catch {}
    setMembershipNotices((prev) => prev.filter((n) => n.room_id !== roomId));
  };

  const deleteAccount = async () => {
    await apiRequest('/api/auth/account', { method: 'DELETE' });
    await purgeAllClientStorageOnLogout();
    setUser(null);
    setActiveRoom(null);
    setActiveMember(null);
    setUserRooms([]);
    setMembershipNotices([]);
    window.location.href = '/login';
  };

  const logout = async () => {
    setLoading(true);
    try {
      await apiRequest('/api/auth/logout', { method: 'POST' });
    } catch {
    } finally {
      await purgeAllClientStorageOnLogout();
      setUser(null);
      setActiveRoom(null);
      setActiveMember(null);
      setUserRooms([]);
      setMembershipNotices([]);
      setLoading(false);
      window.location.href = '/login';
    }
  };

  const logoutAll = async () => {
    setLoading(true);
    try {
      await apiRequest('/api/auth/logout-all', { method: 'POST' });
    } catch {
    } finally {
      await purgeAllClientStorageOnLogout();
      setUser(null);
      setActiveRoom(null);
      setActiveMember(null);
      setUserRooms([]);
      setMembershipNotices([]);
      setLoading(false);
      window.location.href = '/login';
    }
  };

  const t = useCallback(
    (key: TranslationKey, params?: Record<string, string | number>) => {
      return formatBilingualText(key, language, params);
    },
    [language]
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        activeRoom,
        activeMember,
        userRooms,
        membershipNotices,
        roomSwitchEpoch,
        sessionExpiredBanner,
        clearSessionExpiredBanner: () => setSessionExpiredBanner(false),
        language,
        setLanguage,
        loading,
        refreshAuth,
        switchRoom,
        dismissNotice,
        deleteAccount,
        logout,
        logoutAll,
        t,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
