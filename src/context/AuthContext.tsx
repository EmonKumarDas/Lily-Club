import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { apiRequest } from '../lib/api.js';
import { translations, getTranslation, formatBilingualText, type Language, type TranslationKey } from '../lib/i18n.js';

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
  join_code: string;
  join_approval_required: number;
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

interface AuthContextType {
  user: User | null;
  activeRoom: Room | null;
  activeMember: RoomMember | null;
  userRooms: UserRoomItem[];
  language: Language;
  setLanguage: (lang: Language) => Promise<void>;
  loading: boolean;
  refreshAuth: () => Promise<void>;
  switchRoom: (roomId: string) => Promise<void>;
  logout: () => Promise<void>;
  logoutAll: () => Promise<void>;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [activeRoom, setActiveRoom] = useState<Room | null>(null);
  const [activeMember, setActiveMember] = useState<RoomMember | null>(null);
  const [userRooms, setUserRooms] = useState<UserRoomItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Initialize language from localStorage or default 'bn'
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
      }>('/api/auth/me');

      if (res.authenticated && res.user) {
        setUser(res.user);
        setActiveRoom(res.activeRoom || null);
        setActiveMember(res.activeMember || null);
        setUserRooms(res.userRooms || []);

        // Sync user preference if set
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
      }
    } catch {
      setUser(null);
      setActiveRoom(null);
      setActiveMember(null);
      setUserRooms([]);
    } finally {
      setLoading(false);
    }
  }, [language]);

  useEffect(() => {
    refreshAuth();
  }, [refreshAuth]);

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
      } catch (err) {
        console.error('Failed to save language preference to server:', err);
      }
    }
  };

  const switchRoom = async (roomId: string) => {
    setLoading(true);
    try {
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

  const logout = async () => {
    setLoading(true);
    try {
      await apiRequest('/api/auth/logout', { method: 'POST' });
    } finally {
      setUser(null);
      setActiveRoom(null);
      setActiveMember(null);
      setUserRooms([]);
      setLoading(false);
      window.location.href = '/login';
    }
  };

  const logoutAll = async () => {
    setLoading(true);
    try {
      await apiRequest('/api/auth/logout-all', { method: 'POST' });
    } finally {
      setUser(null);
      setActiveRoom(null);
      setActiveMember(null);
      setUserRooms([]);
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
        language,
        setLanguage,
        loading,
        refreshAuth,
        switchRoom,
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
