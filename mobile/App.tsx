import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  Image,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Modal,
  Alert,
  Linking,
  StatusBar,
  Animated,
  PanResponder,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SplashScreen from 'expo-splash-screen';
import * as ImagePicker from 'expo-image-picker';
import NetInfo from '@react-native-community/netinfo';
import { Ionicons } from '@expo/vector-icons';
import { LIGHT_COLORS, DARK_COLORS, ThemeMode } from './src/theme';
import {
  apiFetch,
  getServerUrl,
  setServerUrl,
  setAuthToken,
  getAuthToken,
  DEFAULT_SERVER_URL,
} from './src/api';
import {
  formatDualDateFromYMD,
  formatTime12,
  formatCurrency,
  toBanglaDigits,
  EN_MONTHS,
  EN_MONTHS_BN,
} from './src/dateUtils';
import { BookingModal } from './src/components/BookingModal';
import { BookingDetailSheet } from './src/components/BookingDetailSheet';
import { DatePickerModal } from './src/components/DatePickerModal';
import { SafeScreen, useResponsiveLayout } from './src/components/ScreenShell';

SplashScreen.preventAutoHideAsync().catch(() => { });

type TabKey = 'home' | 'calendar' | 'bookings' | 'customers' | 'more';

export default function App() {
  const { horizontalPad, summaryCardWidth, calCellSize } = useResponsiveLayout();
  const [themeMode, setThemeMode] = useState<ThemeMode>('light'); // Default white mode; persisted Pure Dark supported
  const [lang, setLang] = useState<'bn' | 'en'>('bn');
  const baseColors = themeMode === 'light' ? LIGHT_COLORS : DARK_COLORS;

  useEffect(() => {
    AsyncStorage.getItem('lily_mobile_theme')
      .then((saved) => {
        if (saved === 'dark' || saved === 'light') setThemeMode(saved);
      })
      .catch(() => {});
  }, []);

  const toggleThemeMode = useCallback(() => {
    setThemeMode((prev) => {
      const next: ThemeMode = prev === 'light' ? 'dark' : 'light';
      AsyncStorage.setItem('lily_mobile_theme', next).catch(() => {});
      return next;
    });
  }, []);

  // Splash & Network State
  const [showSplash, setShowSplash] = useState(true);
  const splashScale = useRef(new Animated.Value(0.65)).current;
  const splashOpacity = useRef(new Animated.Value(0)).current;
  const splashPulse = useRef(new Animated.Value(1)).current;
  const [isOffline, setIsOffline] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [serverUrlState, setServerUrlState] = useState(DEFAULT_SERVER_URL);
  const [serverModalOpen, setServerModalOpen] = useState(false);
  const [serverUrlInput, setServerUrlInput] = useState(DEFAULT_SERVER_URL);

  // Auth & Room State
  const [authLoading, setAuthLoading] = useState(true);
  const [user, setUser] = useState<any | null>(null);
  const [rooms, setRooms] = useState<any[]>([]);
  const [activeRoom, setActiveRoom] = useState<any | null>(null);
  const [lastActiveRoom, setLastActiveRoom] = useState<any | null>(null);
  const [activeRole, setActiveRole] = useState<string>('VIEWER');
  const colors = activeRoom?.primary_color
    ? { ...baseColors, primary: activeRoom.primary_color }
    : baseColors;

  // Navigation & Data State
  const [activeTab, setActiveTab] = useState<TabKey>('home');
  const [tabHistory, setTabHistory] = useState<TabKey[]>([]);
  const [toastMsg, setToastMsg] = useState<{ text: string; type: 'error' | 'info' } | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const showToast = useCallback((text: string, type: 'error' | 'info' = 'info') => {
    setToastMsg({ text, type });
    setTimeout(() => {
      setToastMsg((prev) => (prev?.text === text ? null : prev));
    }, 3200);
  }, []);

  const navigateTab = useCallback(
    (next: TabKey) => {
      if (next === activeTab) return;
      setTabHistory((prev) => [...prev.slice(-10), activeTab]);
      setActiveTab(next);
    },
    [activeTab]
  );

  const goBackTab = useCallback(() => {
    if (tabHistory.length > 0) {
      const prev = tabHistory[tabHistory.length - 1];
      setTabHistory((h) => h.slice(0, -1));
      setActiveTab(prev);
    } else if (activeTab !== 'home') {
      setActiveTab('home');
    } else {
      setActiveRoom(null);
    }
  }, [tabHistory, activeTab]);
  const [dashboard, setDashboard] = useState<any | null>(null);
  const [bookings, setBookings] = useState<any[]>([]);
  const [halls, setHalls] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [report, setReport] = useState<any | null>(null);
  const [expenses, setExpenses] = useState<any[]>([]);

  // Filters & Modals
  const [bookingSearch, setBookingSearch] = useState('');
  const [bookingStatusFilter, setBookingStatusFilter] = useState<string>('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [selectedCalDay, setSelectedCalDay] = useState<string | null>(null);
  const [newBookingOpen, setNewBookingOpen] = useState(false);
  const [newBookingPrefill, setNewBookingPrefill] = useState<{
    date?: string;
    hallId?: string;
    slot?: 'DAY' | 'NIGHT' | 'FULL';
  }>({});
  const [detailBookingId, setDetailBookingId] = useState<string | null>(null);
  const [addCustOpen, setAddCustOpen] = useState(false);
  const [newCustName, setNewCustName] = useState('');
  const [newCustPhone, setNewCustPhone] = useState('');
  const [newCustAddress, setNewCustAddress] = useState('');
  const [clubSettingsOpen, setClubSettingsOpen] = useState(false);
  const [editClubName, setEditClubName] = useState('');
  const [editClubAddress, setEditClubAddress] = useState('');
  const [editClubPhone, setEditClubPhone] = useState('');
  const [editClubEmail, setEditClubEmail] = useState('');
  const [editClubLogo, setEditClubLogo] = useState('');
  const [editClubColor, setEditClubColor] = useState('#0E8A44');
  const [editClubLogoScale, setEditClubLogoScale] = useState<number>(1.0);

  // Bookings Pagination (5 at a time + Load More)
  const [bookingsVisibleCount, setBookingsVisibleCount] = useState<number>(5);

  // Calendar Direct Month & Year Picker Modals
  const [calMonthPickerOpen, setCalMonthPickerOpen] = useState(false);
  const [calYearPickerOpen, setCalYearPickerOpen] = useState(false);

  // Full Cost Modal & Outstanding Dues Modal
  const [costModalOpen, setCostModalOpen] = useState(false);
  const [duesModalOpen, setDuesModalOpen] = useState(false);
  const [allDuesList, setAllDuesList] = useState<any[]>([]);

  // Home Period Filter & Expenses Breakdown State
  const [homePeriod, setHomePeriod] = useState<'DAY' | 'MONTH' | 'YEAR' | 'CUSTOM'>('MONTH');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [datePickerTarget, setDatePickerTarget] = useState<'FROM' | 'TO' | null>(null);
  const [periodReport, setPeriodReport] = useState<any | null>(null);
  const [periodExpenses, setPeriodExpenses] = useState<any[]>([]);
  const [addExpenseOpen, setAddExpenseOpen] = useState(false);
  const [expCategory, setExpCategory] = useState<'ELECTRICITY' | 'SALARY' | 'REPAIR' | 'CLEANING' | 'DECORATION_MATERIAL' | 'FOOD' | 'OTHER'>('ELECTRICITY');
  const [expAmount, setExpAmount] = useState('');
  const [expNote, setExpNote] = useState('');

  // Calendar Month/Year Swipe State
  const [calMonthYM, setCalMonthYM] = useState<string>(new Date().toISOString().slice(0, 7));
  const [calBookings, setCalBookings] = useState<any[]>([]);
  const [calSwipeMode, setCalSwipeMode] = useState<'MONTH' | 'YEAR'>('MONTH');

  // Customer History Modal State
  const [custHistoryOpen, setCustHistoryOpen] = useState(false);
  const [custHistoryData, setCustHistoryData] = useState<any | null>(null);
  const [custHistoryBookings, setCustHistoryBookings] = useState<any[]>([]);
  const [custHistoryLoading, setCustHistoryLoading] = useState(false);
  const [custHistoryFilter, setCustHistoryFilter] = useState<string>('');

  // Logged-in User Personal Profile & Settings Modal State
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [editProfileName, setEditProfileName] = useState('');
  const [editProfilePic, setEditProfilePic] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [createRoomOpen, setCreateRoomOpen] = useState(false);
  const [newRoomName, setNewRoomName] = useState('Lily Community Center');
  const [newRoomAddress, setNewRoomAddress] = useState('দক্ষিণ মধ্য হালিশহর, বন্দর, চট্টগ্রাম');
  const [newRoomPhone, setNewRoomPhone] = useState('01955 66 66 22');
  const [joinCodeInput, setJoinCodeInput] = useState('');

  // Monitor device connectivity
  useEffect(() => {
    const unsub = NetInfo.addEventListener((state) => {
      const offline = state.isConnected === false || state.isInternetReachable === false;
      setIsOffline(offline);
    });
    return () => unsub();
  }, []);

  const loadSession = useCallback(async () => {
    setAuthLoading(true);
    setServerError(null);
    try {
      const url = await getServerUrl();
      setServerUrlState(url);
      setServerUrlInput(url);

      const tok = await getAuthToken();
      if (!tok) {
        setUser(null);
        setActiveRoom(null);
        return;
      }

      const me = await apiFetch<{
        authenticated: boolean;
        user: any;
        userRooms?: any[];
        rooms?: any[];
        activeRoom: any;
        activeMember: any;
      }>('/api/auth/me');

      setUser(me.user);
      setRooms(me.userRooms || me.rooms || []);
      setActiveRoom(me.activeRoom || null);
      setActiveRole(me.activeMember?.role || 'VIEWER');
    } catch (err: any) {
      if (err?.isOffline) {
        setServerError(err.message);
      } else if (err?.status === 401) {
        await setAuthToken(null);
        setUser(null);
        setActiveRoom(null);
      } else {
        setServerError(err?.message || 'Connection error');
      }
    } finally {
      setAuthLoading(false);
    }
  }, []);

  useEffect(() => {
    Animated.parallel([
      Animated.spring(splashScale, { toValue: 1, friction: 5, tension: 70, useNativeDriver: true }),
      Animated.timing(splashOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
    ]).start();
    Animated.loop(
      Animated.sequence([
        Animated.timing(splashPulse, { toValue: 1.08, duration: 650, useNativeDriver: true }),
        Animated.timing(splashPulse, { toValue: 1, duration: 650, useNativeDriver: true }),
      ])
    ).start();
    (async () => {
      await loadSession();
      setTimeout(async () => {
        setShowSplash(false);
        await SplashScreen.hideAsync().catch(() => { });
      }, 1450);
    })();
  }, [loadSession, splashScale, splashOpacity, splashPulse]);

  const loadRoomData = useCallback(async () => {
    if (!activeRoom) return;
    setServerError(null);
    try {
      const [dashRes, bRes, hRes, cRes] = await Promise.all([
        apiFetch<{ dashboard: any }>(`/api/rooms/${activeRoom.id}/dashboard`),
        apiFetch<{ bookings: any[] }>(`/api/rooms/${activeRoom.id}/bookings?limit=200`),
        apiFetch<{ halls: any[] }>(`/api/rooms/${activeRoom.id}/halls`),
        apiFetch<{ customers: any[] }>(`/api/rooms/${activeRoom.id}/customers?limit=150`),
      ]);
      setDashboard(dashRes.dashboard);
      setBookings(bRes.bookings || []);
      setHalls(hRes.halls || []);
      setCustomers(cRes.customers || []);

      if (activeRole === 'OWNER' || activeRole === 'MANAGER') {
        const todayYMD = dashRes.dashboard?.todayYMD || new Date().toISOString().slice(0, 10);
        const ym = todayYMD.slice(0, 7);
        if (!customFrom) setCustomFrom(`${ym}-01`);
        if (!customTo) setCustomTo(todayYMD);
        if (dashRes.dashboard?.currentMonthYM && !calMonthYM) {
          setCalMonthYM(dashRes.dashboard.currentMonthYM);
        }
        const [repRes, expRes, allRepRes] = await Promise.all([
          apiFetch<{ report: any }>(
            `/api/rooms/${activeRoom.id}/reports?dateFrom=${ym}-01&dateTo=${ym}-31`
          ).catch(() => null),
          apiFetch<{ expenses: any[] }>(
            `/api/rooms/${activeRoom.id}/expenses?dateFrom=${ym}-01&dateTo=${ym}-31&limit=100`
          ).catch(() => null),
          apiFetch<{ report: any }>(
            `/api/rooms/${activeRoom.id}/reports?dateFrom=2020-01-01&dateTo=2035-12-31`
          ).catch(() => null),
        ]);
        if (repRes) {
          setReport(repRes.report);
          setPeriodReport(repRes.report);
        }
        if (expRes) {
          setExpenses(expRes.expenses || []);
          setPeriodExpenses(expRes.expenses || []);
        }
        if (allRepRes?.report?.outstandingDuesList) {
          setAllDuesList(allRepRes.report.outstandingDuesList);
        }
      }
    } catch (err: any) {
      if (err?.isOffline) {
        setServerError(err.message);
      }
    }
  }, [activeRoom, activeRole]);

  useEffect(() => {
    if (activeRoom) {
      loadRoomData();
    }
  }, [activeRoom, loadRoomData]);

  // Load Period-Specific Revenue & Expenses for Home Filter (Date / Month / Year / Custom)
  const loadPeriodFinancials = useCallback(async () => {
    if (!activeRoom || (activeRole !== 'OWNER' && activeRole !== 'MANAGER')) return;
    const todayYMD = dashboard?.todayYMD || new Date().toISOString().slice(0, 10);
    const y = todayYMD.slice(0, 4);
    const ym = todayYMD.slice(0, 7);

    let df = `${ym}-01`;
    let dt = `${ym}-31`;
    if (homePeriod === 'DAY') {
      df = todayYMD;
      dt = todayYMD;
    } else if (homePeriod === 'YEAR') {
      df = `${y}-01-01`;
      dt = `${y}-12-31`;
    } else if (homePeriod === 'CUSTOM' && /^\d{4}-\d{2}-\d{2}$/.test(customFrom) && /^\d{4}-\d{2}-\d{2}$/.test(customTo)) {
      df = customFrom;
      dt = customTo;
    }

    try {
      const [repRes, expRes] = await Promise.all([
        apiFetch<{ report: any }>(`/api/rooms/${activeRoom.id}/reports?dateFrom=${df}&dateTo=${dt}`),
        apiFetch<{ expenses: any[] }>(`/api/rooms/${activeRoom.id}/expenses?dateFrom=${df}&dateTo=${dt}&limit=50`),
      ]);
      setPeriodReport(repRes.report);
      setPeriodExpenses(expRes.expenses || []);
    } catch { }
  }, [activeRoom, activeRole, homePeriod, customFrom, customTo, dashboard?.todayYMD]);

  useEffect(() => {
    if (activeRoom) loadPeriodFinancials();
  }, [activeRoom, homePeriod, loadPeriodFinancials]);

  // Load Bookings for Swiped Calendar Month/Year
  useEffect(() => {
    if (!activeRoom || !/^\d{4}-\d{2}$/.test(calMonthYM)) return;
    apiFetch<{ bookings: any[] }>(
      `/api/rooms/${activeRoom.id}/bookings?dateFrom=${calMonthYM}-01&dateTo=${calMonthYM}-31&limit=200`
    )
      .then((res) => setCalBookings(res.bookings || []))
      .catch(() => { });
  }, [activeRoom, calMonthYM, bookings]);

  const shiftCalMonth = useCallback((deltaMonths: number) => {
    setCalMonthYM((prev) => {
      const [y, m] = prev.split('-').map(Number);
      const dt = new Date(Date.UTC(y, m - 1 + deltaMonths, 1));
      return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}`;
    });
  }, []);

  const calPanResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 28 && Math.abs(g.dy) < 28,
      onPanResponderRelease: (_, g) => {
        if (g.dx < -45) {
          shiftCalMonth(calSwipeMode === 'YEAR' ? 12 : 1);
        } else if (g.dx > 45) {
          shiftCalMonth(calSwipeMode === 'YEAR' ? -12 : -1);
        }
      },
    })
  ).current;

  const openCustomerHistory = async (c: any) => {
    if (!activeRoom) return;
    setCustHistoryData(c);
    setCustHistoryFilter('');
    setCustHistoryOpen(true);
    setCustHistoryLoading(true);
    try {
      const res = await apiFetch<{ customer: any; bookings: any[] }>(
        `/api/rooms/${activeRoom.id}/customers/${c.id}`
      );
      setCustHistoryData(res.customer || c);
      setCustHistoryBookings(res.bookings || []);
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setCustHistoryLoading(false);
    }
  };

  const handleAddExpense = async () => {
    const amt = parseFloat(expAmount);
    if (!activeRoom || !amt || amt <= 0) {
      Alert.alert(lang === 'bn' ? 'সঠিক পরিমাণ দিন' : 'Enter valid amount');
      return;
    }
    try {
      await apiFetch(`/api/rooms/${activeRoom.id}/expenses`, {
        method: 'POST',
        body: JSON.stringify({
          category: expCategory,
          amount: amt,
          note: expNote.trim() || null,
          expense_date: dashboard?.todayYMD || new Date().toISOString().slice(0, 10),
        }),
      });
      setExpAmount('');
      setExpNote('');
      setAddExpenseOpen(false);
      await loadPeriodFinancials();
      await loadRoomData();
      showToast(lang === 'bn' ? 'খরচ সংরক্ষণ করা হয়েছে!' : 'Expense saved!', 'info');
    } catch (err: any) {
      Alert.alert('Error', err.message);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadRoomData();
    setRefreshing(false);
  };

  const handleDevLogin = async (role: 'OWNER' | 'MANAGER' | 'STAFF' | 'VIEWER') => {
    const devUsers = {
      OWNER: { email: 'owner@lilycc.local', name: 'Al-Amin Hossain (Owner)' },
      MANAGER: { email: 'manager@lilycc.local', name: 'Tanzina Begum (Manager)' },
      STAFF: { email: 'staff@lilycc.local', name: 'Rakib Hasan (Staff)' },
      VIEWER: { email: 'viewer@lilycc.local', name: 'Shamsul Alam (Viewer)' },
    };
    const chosen = devUsers[role];
    try {
      setAuthLoading(true);
      const res = await apiFetch<{ token: string }>('/api/auth/dev-login', {
        method: 'POST',
        body: JSON.stringify({
          email: chosen.email,
          name: chosen.name,
          googleId: `dev-${role.toLowerCase()}-123`,
        }),
      });
      if (res.token) {
        await setAuthToken(res.token);
      }
      await loadSession();
    } catch (err: any) {
      Alert.alert(lang === 'bn' ? 'লগইন ব্যর্থ' : 'Login Failed', err.message);
      setAuthLoading(false);
    }
  };

  const openRoomSelector = () => {
    if (activeRoom) setLastActiveRoom(activeRoom);
    setActiveRoom(null);
  };

  const handleSwitchRoom = async (roomId: string) => {
    try {
      await apiFetch(`/api/rooms/switch`, {
        method: 'POST',
        body: JSON.stringify({ roomId }),
      });
      await loadSession();
      setActiveTab('home');
    } catch (err: any) {
      Alert.alert('Error', err.message);
    }
  };

  const handleCreateRoom = async () => {
    if (!newRoomName.trim()) return;
    try {
      const res = await apiFetch<{ room: any }>('/api/rooms', {
        method: 'POST',
        body: JSON.stringify({
          name: newRoomName.trim(),
          address: newRoomAddress.trim(),
          phone: newRoomPhone.trim(),
        }),
      });
      setCreateRoomOpen(false);
      await handleSwitchRoom(res.room.id);
    } catch (err: any) {
      Alert.alert('Error', err.message);
    }
  };

  const handleJoinRoom = async () => {
    if (!joinCodeInput.trim()) return;
    try {
      const res = await apiFetch<{ messageBn?: string; messageEn?: string }>('/api/rooms/join', {
        method: 'POST',
        body: JSON.stringify({ joinCode: joinCodeInput.trim().toUpperCase() }),
      });
      setJoinCodeInput('');
      Alert.alert(lang === 'bn' ? 'সফল' : 'Submitted', res.messageBn || res.messageEn || 'Joined');
      await loadSession();
    } catch (err: any) {
      Alert.alert('Error', err.message);
    }
  };

  const handleSeedDemo = async () => {
    if (!activeRoom) return;
    try {
      await apiFetch(`/api/rooms/${activeRoom.id}/demo-data/seed`, { method: 'POST' });
      await loadRoomData();
    } catch (err: any) {
      Alert.alert('Error', err.message);
    }
  };

  const handleAddCustomer = async () => {
    if (!activeRoom || !newCustName.trim() || !newCustPhone.trim()) {
      Alert.alert(lang === 'bn' ? 'নাম ও ফোন দিন' : 'Name & phone required');
      return;
    }
    try {
      await apiFetch(`/api/rooms/${activeRoom.id}/customers`, {
        method: 'POST',
        body: JSON.stringify({
          name: newCustName.trim(),
          phone: newCustPhone.trim(),
          address: newCustAddress.trim() || null,
        }),
      });
      setNewCustName('');
      setNewCustPhone('');
      setNewCustAddress('');
      setAddCustOpen(false);
      await loadRoomData();
    } catch (err: any) {
      Alert.alert('Error', err.message);
    }
  };

  const openProfileModal = () => {
    setEditProfileName(user?.name || '');
    setEditProfilePic(user?.picture || '');
    setProfileModalOpen(true);
  };

  const handleSaveProfile = async () => {
    if (!editProfileName.trim()) {
      Alert.alert(lang === 'bn' ? 'নাম দিন' : 'Name required');
      return;
    }
    setSavingProfile(true);
    try {
      const res = await apiFetch<{ user: any }>('/api/auth/profile', {
        method: 'PATCH',
        body: JSON.stringify({
          name: editProfileName.trim(),
          picture: editProfilePic.trim() || null,
        }),
      });
      await apiFetch('/api/auth/preferences/language', {
        method: 'PATCH',
        body: JSON.stringify({ language: lang }),
      }).catch(() => {});
      if (res.user) setUser(res.user);
      setProfileModalOpen(false);
      showToast(lang === 'bn' ? 'আপনার প্রোফাইল আপডেট হয়েছে!' : 'Profile updated!', 'info');
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setSavingProfile(false);
    }
  };

  const handleLogoutAll = async () => {
    try {
      await apiFetch('/api/auth/logout-all', { method: 'POST' });
    } catch {}
    await setAuthToken(null);
    setUser(null);
    setActiveRoom(null);
    setDashboard(null);
    setProfileModalOpen(false);
  };

  const openClubSettings = () => {
    if (!activeRoom || activeRole !== 'OWNER') return;
    setEditClubName(activeRoom.name || '');
    setEditClubAddress(activeRoom.address || '');
    setEditClubPhone(activeRoom.phone || '');
    setEditClubEmail(activeRoom.email || '');
    setEditClubLogo(activeRoom.logo || '');
    setEditClubColor(activeRoom.primary_color || '#0E8A44');
    setEditClubLogoScale(Number(activeRoom.logo_scale || 1.0));
    setClubSettingsOpen(true);
  };

  const pickLogoFromStorage = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(
          lang === 'bn' ? 'অনুমতি প্রয়োজন' : 'Permission Required',
          lang === 'bn' ? 'গ্যালারি থেকে লোগো ছবি নির্বাচনের অনুমতি দিন।' : 'Allow photo library access to select a logo image.'
        );
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
        base64: true,
      });
      if (res.canceled || !res.assets?.[0]) return;
      const asset = res.assets[0];
      const mime = asset.mimeType || 'image/png';
      if (!/^image\/(png|jpeg|jpg|webp)$/i.test(mime)) {
        Alert.alert(
          lang === 'bn' ? 'শুধুমাত্র ছবি অনুমোদিত' : 'Images Only',
          lang === 'bn' ? 'অনুগ্রহ করে PNG, JPG অথবা WEBP ফরম্যাটের ছবি নির্বাচন করুন।' : 'Please select a PNG, JPG, or WEBP image.'
        );
        return;
      }
      if (!asset.base64) {
        Alert.alert('Error', 'Could not read image data.');
        return;
      }
      setEditClubLogo(`data:${mime};base64,${asset.base64}`);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to pick image');
    }
  };

  const handleSaveClubSettings = async () => {
    if (activeRole !== 'OWNER') return;
    if (!activeRoom || !editClubName.trim() || !editClubAddress.trim() || !editClubPhone.trim()) {
      Alert.alert(lang === 'bn' ? 'তথ্য দিন' : 'Required', lang === 'bn' ? 'ক্লাবের নাম, ঠিকানা ও ফোন দিন।' : 'Club name, address & phone required.');
      return;
    }
    try {
      const res = await apiFetch<{ room: any }>(`/api/rooms/${activeRoom.id}/settings`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: editClubName.trim(),
          address: editClubAddress.trim(),
          phone: editClubPhone.trim(),
          email: editClubEmail.trim() || null,
          logo: editClubLogo.trim() || null,
          primary_color: editClubColor || null,
          logo_scale: Number(editClubLogoScale.toFixed(2)),
        }),
      });
      setActiveRoom(res.room);
      setClubSettingsOpen(false);
      showToast(lang === 'bn' ? 'ক্লাবের তথ্য ও লোগো আপডেট হয়েছে!' : 'Club branding updated!', 'info');
    } catch (err: any) {
      Alert.alert('Error', err.message);
    }
  };

  const handleSaveServerUrl = async () => {
    if (!serverUrlInput.trim()) return;
    await setServerUrl(serverUrlInput.trim());
    setServerUrlState(serverUrlInput.trim().replace(/\/+$/, ''));
    setServerModalOpen(false);
    await loadSession();
  };

  const handleLogout = async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch { }
    await setAuthToken(null);
    setUser(null);
    setActiveRoom(null);
    setDashboard(null);
  };

  // ==================== 1. ANIMATED SPLASH / FLASH SCREEN WITH OFFICIAL LOGO ====================
  if (showSplash) {
    const isDark = themeMode === 'dark';
    return (
      <View style={[styles.splashContainer, { backgroundColor: isDark ? '#000000' : '#FFFFFF' }]}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
        <Animated.View
          style={[
            styles.splashGlowRing,
            {
              backgroundColor: isDark ? '#0B0B0E' : '#F1F9F4',
              borderColor: isDark ? '#22C55E' : '#C6EBD4',
              transform: [{ scale: splashPulse }],
              opacity: splashOpacity,
            },
          ]}
        >
          <Animated.Image
            source={require('./assets/logo.png')}
            style={[styles.splashLogo, { transform: [{ scale: splashScale }] }]}
            resizeMode="contain"
          />
        </Animated.View>
        <Animated.Text style={[styles.splashTitle, { opacity: splashOpacity }]}>
          লিলি কমিউনিটি সেন্টার
        </Animated.Text>
        <Animated.Text style={[styles.splashSub, { opacity: splashOpacity }]}>
          Lily Community Center
        </Animated.Text>
        <ActivityIndicator size="small" color="#0E8A44" style={{ marginTop: 22 }} />
      </View>
    );
  }

  // ==================== REUSABLE OFFLINE BANNER ====================
  const renderOfflineBanner = () => {
    if (!isOffline && !serverError) return null;
    return (
      <View style={[styles.offlineBanner, { backgroundColor: colors.crimsonSoft, borderColor: colors.crimson }]}>
        <Ionicons name="cloud-offline-outline" size={20} color={colors.crimson} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.crimson, fontWeight: '800', fontSize: 12 }}>
            {isOffline
              ? lang === 'bn'
                ? 'আপনি অফলাইনে আছেন — ইন্টারনেট/Wi-Fi সংযোগ নেই'
                : 'You are Offline — No Internet/Wi-Fi'
              : lang === 'bn'
                ? `সার্ভারের সাথে সংযোগ নেই (${serverUrlState})`
                : `Cannot reach server (${serverUrlState})`}
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 11 }}>
            {lang === 'bn'
              ? 'ফোন ও PC একই Wi-Fi তে আছে কিনা দেখুন অথবা Server IP ঠিক করুন।'
              : 'Ensure phone & PC share Wi-Fi or update Server IP.'}
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => (activeRoom ? loadRoomData() : loadSession())}
          style={[styles.retryPill, { backgroundColor: colors.crimson }]}
        >
          <Text style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>
            {lang === 'bn' ? 'পুনরায়' : 'Retry'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setServerModalOpen(true)}
          style={[styles.retryPill, { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}
        >
          <Text style={{ color: colors.text, fontSize: 11, fontWeight: '700' }}>IP</Text>
        </TouchableOpacity>
      </View>
    );
  };

  // ==================== 2. LOGIN SCREEN ====================
  if (!user) {
    return (
      <SafeScreen backgroundColor={colors.bg}>
        <StatusBar
          barStyle={themeMode === 'dark' ? 'light-content' : 'dark-content'}
        />
        {renderOfflineBanner()}
          <ScrollView contentContainerStyle={styles.loginWrap}>
            <View style={styles.loginTopRow}>
              <TouchableOpacity
                onPress={() => setLanguageAndSave(lang, setLang)}
                style={[styles.pillBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
              >
                <Text style={{ color: colors.primary, fontWeight: '800', fontSize: 12 }}>
                  {lang === 'bn' ? 'EN' : 'বাং'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={toggleThemeMode}
                style={[styles.pillBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
              >
                <Ionicons
                  name={themeMode === 'dark' ? 'sunny' : 'moon'}
                  size={16}
                  color={colors.primary}
                />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setServerModalOpen(true)}
                style={[styles.pillBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
              >
                <Ionicons name="server-outline" size={16} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            <View style={[styles.loginCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Image source={require('./assets/logo.png')} style={styles.loginLogo} resizeMode="contain" />
              <Text style={[styles.loginTitle, { color: colors.crimson }]}>
                লিলি <Text style={{ color: colors.text }}>কমিউনিটি সেন্টার</Text>
              </Text>
              <Text style={[styles.loginSub, { color: colors.textMuted }]}>
                {lang === 'bn'
                  ? 'হল বুকিং, দিন/রাত স্লট ও চুক্তিপত্র ব্যবস্থাপনা'
                  : 'Internal Hall Bookings, Day/Night Slots & Cash Memo'}
              </Text>

              {authLoading ? (
                <ActivityIndicator size="large" color={colors.primary} style={{ marginVertical: 20 }} />
              ) : (
                <View style={styles.devLoginGrid}>
                  <Text style={[styles.devHint, { color: colors.primary }]}>
                    {lang === 'bn' ? 'কুইক সাইন-ইন (ডেভেলপমেন্ট)' : 'Quick Sign-In (Development)'}
                  </Text>
                  {(['OWNER', 'MANAGER', 'STAFF', 'VIEWER'] as const).map((r) => (
                    <TouchableOpacity
                      key={r}
                      onPress={() => handleDevLogin(r)}
                      style={[
                        styles.roleLoginBtn,
                        {
                          backgroundColor: r === 'OWNER' ? colors.primary : colors.cardAlt,
                          borderColor: r === 'OWNER' ? colors.primary : colors.border,
                        },
                      ]}
                    >
                      <Ionicons
                        name="person-circle-outline"
                        size={20}
                        color={r === 'OWNER' ? '#fff' : colors.primary}
                      />
                      <Text
                        style={{
                          color: r === 'OWNER' ? '#fff' : colors.text,
                          fontWeight: '800',
                          fontSize: 14,
                        }}
                      >
                        {r}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          </ScrollView>

          {/* Interactive Calendar Date Picker for Custom Date Range */}
        <DatePickerModal
          visible={datePickerTarget !== null}
          title={
            datePickerTarget === 'FROM'
              ? lang === 'bn'
                ? 'শুরুর তারিখ নির্বাচন করুন'
                : 'Select From Date'
              : lang === 'bn'
              ? 'শেষ তারিখ নির্বাচন করুন'
              : 'Select To Date'
          }
          valueYMD={datePickerTarget === 'FROM' ? customFrom : customTo}
          lang={lang}
          colors={colors}
          onClose={() => setDatePickerTarget(null)}
          onSelectYMD={(ymd) => {
            if (datePickerTarget === 'FROM') {
              setCustomFrom(ymd);
              if (customTo && ymd > customTo) setCustomTo(ymd);
            } else {
              setCustomTo(ymd);
              if (customFrom && ymd < customFrom) setCustomFrom(ymd);
            }
          }}
        />

        {renderServerModal(serverModalOpen, setServerModalOpen, serverUrlInput, setServerUrlInput, handleSaveServerUrl, colors, lang)}
      </SafeScreen>
    );
  }

  // ==================== 3. ROOM SELECTION SCREEN ====================
  if (!activeRoom) {
    return (
      <SafeScreen backgroundColor={colors.bg}>
        <StatusBar
          barStyle={themeMode === 'dark' ? 'light-content' : 'dark-content'}
        />
        {renderOfflineBanner()}
          <View style={[styles.header, { backgroundColor: colors.headerBg, borderBottomColor: colors.border }]}>
            <View style={styles.headerBrand}>
              <TouchableOpacity
                onPress={() => (lastActiveRoom ? setActiveRoom(lastActiveRoom) : handleLogout())}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                style={[styles.backIconBtn, { backgroundColor: colors.cardAlt, borderColor: colors.border }]}
              >
                <Ionicons name="chevron-back" size={20} color={colors.text} />
              </TouchableOpacity>
              <Image source={require('./assets/logo.png')} style={styles.headerLogo} resizeMode="contain" />
              <View>
                <Text style={[styles.headerTitle, { color: colors.text }]}>লিলি কমিউনিটি সেন্টার</Text>
                <Text style={{ fontSize: 11, color: colors.textMuted }}>{user.name}</Text>
              </View>
            </View>
            <TouchableOpacity onPress={handleLogout} style={styles.pillBtn}>
              <Ionicons name="log-out-outline" size={20} color={colors.crimson} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.scrollPad}>
            <Text style={[styles.secHeading, { color: colors.text }]}>
              {lang === 'bn' ? 'আপনার রুম নির্বাচন করুন' : 'Select a Room'}
            </Text>

            {rooms.map((r) => (
              <TouchableOpacity
                key={r.id}
                onPress={() => handleSwitchRoom(r.id)}
                style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 16, fontWeight: '800', color: colors.text }}>{r.name}</Text>
                    <Text style={{ fontSize: 12, color: colors.textMuted, marginTop: 2 }}>
                      ID: {r.join_code} • {r.role}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={colors.primary} />
                </View>
              </TouchableOpacity>
            ))}

            <TouchableOpacity
              onPress={() => setCreateRoomOpen(true)}
              style={[styles.primaryFullBtn, { backgroundColor: colors.primary }]}
            >
              <Ionicons name="add-circle-outline" size={20} color="#fff" />
              <Text style={styles.primaryFullBtnText}>
                {lang === 'bn' ? 'নতুন রুম তৈরি করুন' : 'Create New Room'}
              </Text>
            </TouchableOpacity>

            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, marginTop: 8 }]}>
              <Text style={{ fontWeight: '800', color: colors.text, marginBottom: 8 }}>
                {lang === 'bn' ? 'রুম আইডি দিয়ে যোগ দিন' : 'Join with Room ID'}
              </Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TextInput
                  value={joinCodeInput}
                  onChangeText={setJoinCodeInput}
                  placeholder="8K7M2X4P"
                  placeholderTextColor={colors.textMuted}
                  style={[styles.inputInline, { backgroundColor: colors.bg, borderColor: colors.border, color: colors.text }]}
                />
                <TouchableOpacity
                  onPress={handleJoinRoom}
                  style={[styles.joinBtn, { backgroundColor: colors.gold }]}
                >
                  <Text style={{ color: '#fff', fontWeight: '800' }}>{lang === 'bn' ? 'যোগ দিন' : 'Join'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>

          <Modal visible={createRoomOpen} transparent animationType="fade" onRequestClose={() => setCreateRoomOpen(false)}>
            <View style={styles.modalBackdrop}>
              <View style={[styles.modalBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.secHeading, { color: colors.text }]}>
                  {lang === 'bn' ? 'নতুন রুম তৈরি' : 'Create Room'}
                </Text>
                <TextInput
                  value={newRoomName}
                  onChangeText={setNewRoomName}
                  placeholder="Room Name"
                  style={[styles.inputBox, { borderColor: colors.border, color: colors.text }]}
                />
                <TextInput
                  value={newRoomAddress}
                  onChangeText={setNewRoomAddress}
                  placeholder="Address"
                  style={[styles.inputBox, { borderColor: colors.border, color: colors.text }]}
                />
                <TextInput
                  value={newRoomPhone}
                  onChangeText={setNewRoomPhone}
                  placeholder="Phone"
                  style={[styles.inputBox, { borderColor: colors.border, color: colors.text }]}
                />
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                  <TouchableOpacity onPress={() => setCreateRoomOpen(false)} style={[styles.modalBtn, { backgroundColor: colors.cardAlt }]}>
                    <Text style={{ color: colors.text, fontWeight: '700' }}>{lang === 'bn' ? 'বাতিল' : 'Cancel'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={handleCreateRoom} style={[styles.modalBtn, { backgroundColor: colors.primary }]}>
                    <Text style={{ color: '#fff', fontWeight: '800' }}>{lang === 'bn' ? 'তৈরি করুন' : 'Create'}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>
      </SafeScreen>
    );
  }

  // ==================== 4. MAIN APP SHELL (HEADER + 5-TAB BOTTOM BAR) ====================
  const canCreate = activeRole === 'OWNER' || activeRole === 'MANAGER' || activeRole === 'STAFF';
  const canSeeMoney = activeRole === 'OWNER' || activeRole === 'MANAGER';

  const filteredBookings = bookings.filter((b) => {
    if (bookingStatusFilter && b.status !== bookingStatusFilter) return false;
    if (bookingSearch.trim()) {
      const q = bookingSearch.toLowerCase();
      return (
        (b.customer_name || '').toLowerCase().includes(q) ||
        (b.booking_number || '').toLowerCase().includes(q) ||
        (b.hall_name || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  const filteredCustomers = customers.filter((c) => {
    if (!customerSearch.trim()) return true;
    const q = customerSearch.toLowerCase();
    return (c.name || '').toLowerCase().includes(q) || (c.phone || '').toLowerCase().includes(q);
  });

  return (
    <SafeScreen backgroundColor={colors.bg} withKeyboardAvoid={false}>
      <StatusBar
        barStyle={themeMode === 'dark' ? 'light-content' : 'dark-content'}
      />

        {/* Well-Formatted Header with iPhone Back Button */}
        <View style={[styles.header, { backgroundColor: colors.headerBg, borderBottomColor: colors.border }]}>
          <View style={styles.headerBrand}>
            <TouchableOpacity
              onPress={goBackTab}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={[styles.backIconBtn, { backgroundColor: colors.cardAlt, borderColor: colors.border }]}
            >
              <Ionicons name="chevron-back" size={20} color={colors.text} />
            </TouchableOpacity>
            <TouchableOpacity onPress={openRoomSelector} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
              <Image
                source={activeRoom?.logo ? { uri: activeRoom.logo } : require('./assets/logo.png')}
                style={[
                  styles.headerLogo,
                  {
                    width: Math.round(46 * Number(activeRoom?.logo_scale || 1)),
                    height: Math.round(46 * Number(activeRoom?.logo_scale || 1)),
                  },
                ]}
                resizeMode="contain"
              />
              <View style={{ flex: 1 }}>
                <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
                  {activeRoom.name}
                </Text>
                <Text style={{ fontSize: 10, fontWeight: '700', color: colors.primary }} numberOfLines={1}>
                  {activeRole} • ID: {activeRoom.join_code}
                </Text>
              </View>
            </TouchableOpacity>
          </View>

          <View style={styles.headerActions}>
            <TouchableOpacity
              onPress={() => setLanguageAndSave(lang, setLang)}
              hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
              style={[styles.hdrBtn, { backgroundColor: colors.cardAlt, borderColor: colors.border }]}
            >
              <Text style={{ color: colors.primary, fontWeight: '800', fontSize: 12 }}>
                {lang === 'bn' ? 'EN' : 'বাং'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={toggleThemeMode}
              hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
              style={[styles.hdrBtn, { backgroundColor: colors.cardAlt, borderColor: colors.border }]}
            >
              <Ionicons
                name={themeMode === 'dark' ? 'sunny' : 'moon'}
                size={16}
                color={colors.primary}
              />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={openProfileModal}
              hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
              style={[styles.hdrBtn, { backgroundColor: colors.primarySoft, borderColor: colors.primary }]}
            >
              <Ionicons name="person-circle-outline" size={18} color={colors.primary} />
            </TouchableOpacity>
          </View>
        </View>

        {toastMsg && (
          <View
            style={[
              styles.toastBanner,
              {
                backgroundColor: toastMsg.type === 'error' ? colors.crimsonSoft : colors.primarySoft,
                borderColor: toastMsg.type === 'error' ? colors.crimson : colors.primary,
              },
            ]}
          >
            <Ionicons
              name={toastMsg.type === 'error' ? 'alert-circle' : 'information-circle'}
              size={18}
              color={toastMsg.type === 'error' ? colors.crimson : colors.primary}
            />
            <Text
              style={{
                flex: 1,
                fontSize: 12,
                fontWeight: '800',
                color: toastMsg.type === 'error' ? colors.crimson : colors.primary,
              }}
            >
              {toastMsg.text}
            </Text>
          </View>
        )}

        {renderOfflineBanner()}

        {/* Main Content Area */}
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[styles.scrollPad, { paddingHorizontal: horizontalPad }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        >
          {/* TAB 1: HOME DASHBOARD */}
          {activeTab === 'home' && (
            <View style={{ gap: 12 }}>
              {/* Hero Greeting Banner */}
              <View style={[styles.heroCard, { backgroundColor: colors.primary }]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.heroGreeting}>
                    {lang === 'bn' ? `স্বাগতম, ${user.name}` : `Welcome, ${user.name}`}
                  </Text>
                  <Text style={styles.heroDate}>
                    📅 {dashboard?.todayYMD ? formatDualDateFromYMD(dashboard.todayYMD, lang) : ''}
                  </Text>
                </View>
                <Image
                  source={activeRoom?.logo ? { uri: activeRoom.logo } : require('./assets/logo.png')}
                  style={[
                    styles.heroLogo,
                    {
                      width: Math.round(72 * Number(activeRoom?.logo_scale || 1)),
                      height: Math.round(72 * Number(activeRoom?.logo_scale || 1)),
                    },
                  ]}
                  resizeMode="contain"
                />
              </View>

              {/* Quick Actions */}
              <View style={styles.quickRow}>
                {canCreate && (
                  <TouchableOpacity
                    onPress={() => {
                      setNewBookingPrefill({});
                      setNewBookingOpen(true);
                    }}
                    style={[styles.qaBtn, { backgroundColor: colors.primarySoft, borderColor: colors.primary }]}
                  >
                    <Ionicons name="add-circle" size={18} color={colors.primary} />
                    <Text style={{ color: colors.primary, fontWeight: '800', fontSize: 12 }}>
                      {lang === 'bn' ? 'নতুন বুকিং' : 'New Booking'}
                    </Text>
                  </TouchableOpacity>
                )}
                {canCreate && (
                  <TouchableOpacity
                    onPress={() => setAddCustOpen(true)}
                    style={[styles.qaBtn, { backgroundColor: colors.goldSoft, borderColor: colors.gold }]}
                  >
                    <Ionicons name="person-add" size={18} color={colors.gold} />
                    <Text style={{ color: colors.gold, fontWeight: '800', fontSize: 12 }}>
                      {lang === 'bn' ? 'নতুন গ্রাহক' : 'Add Customer'}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Demo Prompt if empty */}
              {halls.length === 0 && canSeeMoney && (
                <TouchableOpacity
                  onPress={handleSeedDemo}
                  style={[styles.card, { backgroundColor: colors.goldSoft, borderColor: colors.gold }]}
                >
                  <Text style={{ color: colors.gold, fontWeight: '800', textAlign: 'center' }}>
                    ✨ {lang === 'bn' ? 'ডেমো হল ও বুকিং লোড করতে ট্যাপ করুন' : 'Tap to Load [DEMO] Halls & Bookings'}
                  </Text>
                </TouchableOpacity>
              )}

              {/* Summary Grid (2 columns, zero overflow) */}
              {dashboard && (
                <View style={styles.grid2}>
                  <SummaryCard
                    title={lang === 'bn' ? 'আজকের অনুষ্ঠান' : "Today's Events"}
                    value={String(dashboard.summaryCards.todaysEventsCount)}
                    color={colors.primary}
                    colors={colors}
                    onPress={() => setActiveTab('bookings')}
                  />
                  <SummaryCard
                    title={lang === 'bn' ? 'আগামী ৭ দিন' : 'Next 7 Days'}
                    value={String(dashboard.summaryCards.upcomingWeekCount)}
                    color={colors.gold}
                    colors={colors}
                    onPress={() => setActiveTab('bookings')}
                  />
                  <SummaryCard
                    title={lang === 'bn' ? 'অস্থায়ী বুকিং' : 'Tentative Holds'}
                    value={String(dashboard.summaryCards.pendingTentativeCount)}
                    color={colors.amber}
                    colors={colors}
                    onPress={() => {
                      setBookingStatusFilter('TENTATIVE');
                      setActiveTab('bookings');
                    }}
                  />
                  <SummaryCard
                    title={lang === 'bn' ? 'খালি স্লট (দিন/রাত)' : 'Free Slots (D/N)'}
                    value={`${dashboard.summaryCards.freeDaySlotsThisMonth}/${dashboard.summaryCards.freeNightSlotsThisMonth}`}
                    color={colors.primary}
                    colors={colors}
                    onPress={() => setActiveTab('calendar')}
                  />
                  {!dashboard.hideMoney && (
                    <>
                      {/* Date / Month / Year / Custom Date Range Selector */}
                      <View style={{ width: '100%', gap: 8, marginTop: 4 }}>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                          {(
                            [
                              { key: 'DAY', bn: 'আজ (Day)', en: 'Today' },
                              { key: 'MONTH', bn: 'এই মাস (Month)', en: 'This Month' },
                              { key: 'YEAR', bn: 'এই বছর (Year)', en: 'This Year' },
                              { key: 'CUSTOM', bn: 'তারিখ থেকে তারিখ', en: 'Custom Range' },
                            ] as const
                          ).map((p) => {
                            const active = homePeriod === p.key;
                            return (
                              <TouchableOpacity
                                key={p.key}
                                onPress={() => setHomePeriod(p.key)}
                                style={[
                                  styles.filterChip,
                                  {
                                    backgroundColor: active ? colors.primary : colors.card,
                                    borderColor: active ? colors.primary : colors.border,
                                  },
                                ]}
                              >
                                <Text style={{ color: active ? '#fff' : colors.text, fontSize: 11, fontWeight: '800' }}>
                                  {lang === 'bn' ? p.bn : p.en}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </ScrollView>
                        {homePeriod === 'CUSTOM' && (
                          <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                            <TouchableOpacity
                              onPress={() => setDatePickerTarget('FROM')}
                              style={[styles.searchBox, { backgroundColor: colors.card, borderColor: colors.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 9 }]}
                            >
                              <View style={{ flex: 1 }}>
                                <Text style={{ fontSize: 9.5, fontWeight: '700', color: colors.textMuted }}>
                                  {lang === 'bn' ? 'শুরুর তারিখ' : 'From Date'}
                                </Text>
                                <Text style={{ fontSize: 12, fontWeight: '800', color: colors.text }} numberOfLines={1}>
                                  {customFrom
                                    ? (() => {
                                        const [y, m, d] = customFrom.split('-').map(Number);
                                        return lang === 'bn'
                                          ? `${toBanglaDigits(d)} ${EN_MONTHS_BN[m - 1]} ${toBanglaDigits(y)}`
                                          : `${d} ${EN_MONTHS[m - 1].slice(0, 3)} ${y}`;
                                      })()
                                    : 'Select'}
                                </Text>
                              </View>
                              <Ionicons name="calendar-outline" size={16} color={colors.primary} />
                            </TouchableOpacity>

                            <Text style={{ color: colors.textMuted, fontWeight: '800' }}>→</Text>

                            <TouchableOpacity
                              onPress={() => setDatePickerTarget('TO')}
                              style={[styles.searchBox, { backgroundColor: colors.card, borderColor: colors.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 9 }]}
                            >
                              <View style={{ flex: 1 }}>
                                <Text style={{ fontSize: 9.5, fontWeight: '700', color: colors.textMuted }}>
                                  {lang === 'bn' ? 'শেষ তারিখ' : 'To Date'}
                                </Text>
                                <Text style={{ fontSize: 12, fontWeight: '800', color: colors.text }} numberOfLines={1}>
                                  {customTo
                                    ? (() => {
                                        const [y, m, d] = customTo.split('-').map(Number);
                                        return lang === 'bn'
                                          ? `${toBanglaDigits(d)} ${EN_MONTHS_BN[m - 1]} ${toBanglaDigits(y)}`
                                          : `${d} ${EN_MONTHS[m - 1].slice(0, 3)} ${y}`;
                                      })()
                                    : 'Select'}
                                </Text>
                              </View>
                              <Ionicons name="calendar-outline" size={16} color={colors.primary} />
                            </TouchableOpacity>
                          </View>
                        )}
                      </View>

                      <SummaryCard
                        title={lang === 'bn' ? 'আয় (সংগৃহীত)' : 'Income (Collected)'}
                        value={formatCurrency(periodReport?.collected ?? report?.collected ?? 0, lang)}
                        color={colors.primary}
                        colors={colors}
                        onPress={() => navigateTab('more')}
                      />
                      <SummaryCard
                        title={lang === 'bn' ? 'মোট রাজস্ব' : 'Revenue'}
                        value={formatCurrency(periodReport?.revenue ?? dashboard.summaryCards.thisMonthRevenue ?? 0, lang)}
                        color={colors.gold}
                        colors={colors}
                        onPress={() => navigateTab('more')}
                      />
                      <SummaryCard
                        title={lang === 'bn' ? 'খরচ (Cost)' : 'Cost (Expenses)'}
                        value={formatCurrency(periodReport?.expenses ?? report?.expenses ?? 0, lang)}
                        color="#DC2626"
                        colors={colors}
                        onPress={() => setCostModalOpen(true)}
                      />
                      <SummaryCard
                        title={lang === 'bn' ? 'মোট বকেয়া (Dues)' : 'Total Dues'}
                        value={formatCurrency(dashboard.summaryCards.totalDueAmount ?? periodReport?.due ?? 0, lang)}
                        color={colors.crimson}
                        colors={colors}
                        onPress={() => setDuesModalOpen(true)}
                      />

                      {/* Expense Breakdown Card (Electricity Bill, Salary, Repair, etc.) */}
                      <View style={[styles.card, { width: '100%', backgroundColor: colors.card, borderColor: colors.border, gap: 6 }]}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Text style={{ fontWeight: '800', fontSize: 13, color: colors.text }}>
                            💸 {lang === 'bn' ? 'খরচের খাতসমূহ (বিদ্যুৎ বিল, বেতন ইত্যাদি)' : 'Expenses Breakdown'}
                          </Text>
                          <TouchableOpacity
                            onPress={() => setAddExpenseOpen(true)}
                            style={[styles.retryPill, { backgroundColor: colors.primary }]}
                          >
                            <Text style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>
                              + {lang === 'bn' ? 'খরচ যোগ' : 'Add'}
                            </Text>
                          </TouchableOpacity>
                        </View>
                        {periodExpenses.length === 0 ? (
                          <Text style={{ fontSize: 12, color: colors.textMuted }}>
                            {lang === 'bn' ? 'এই সময়ে কোনো খরচ রেকর্ড নেই।' : 'No expenses recorded for this period.'}
                          </Text>
                        ) : (
                          periodExpenses.slice(0, 6).map((ex) => (
                            <View key={ex.id} style={{ flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 5 }}>
                              <View style={{ flex: 1 }}>
                                <Text style={{ fontSize: 12, fontWeight: '700', color: colors.text }}>
                                  {ex.category === 'ELECTRICITY' ? '⚡ বিদ্যুৎ বিল (Electricity)' : ex.category}
                                </Text>
                                <Text style={{ fontSize: 10.5, color: colors.textMuted }}>
                                  {formatDualDateFromYMD(ex.expense_date, lang)} {ex.note ? `• ${ex.note}` : ''}
                                </Text>
                              </View>
                              <Text style={{ fontSize: 12.5, fontWeight: '800', color: '#DC2626' }}>
                                {formatCurrency(ex.amount, lang)}
                              </Text>
                            </View>
                          ))
                        )}
                      </View>
                    </>
                  )}
                </View>
              )}

              {/* Today at a Glance */}
              <Text style={[styles.secHeading, { color: colors.text }]}>
                {lang === 'bn' ? 'আজকের হল অবস্থা (দিন ও রাত)' : 'Today at a Glance'}
              </Text>
              {(dashboard?.todayAtAGlance || []).map((h: any) => (
                <View key={h.hall_id} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Text style={{ fontWeight: '800', fontSize: 15, color: colors.text, marginBottom: 8 }}>
                    {h.hall_name}
                  </Text>
                  <View style={styles.twoCol}>
                    <TouchableOpacity
                      onPress={() =>
                        h.day_holder
                          ? setDetailBookingId(h.day_holder.booking_id)
                          : canCreate &&
                          (setNewBookingPrefill({
                            date: dashboard.todayYMD,
                            hallId: h.hall_id,
                            slot: 'DAY',
                          }),
                            setNewBookingOpen(true))
                      }
                      style={[
                        styles.slotPill,
                        {
                          backgroundColor:
                            h.day_status === 'FREE'
                              ? colors.primarySoft
                              : h.day_status === 'TENTATIVE'
                                ? colors.amberSoft
                                : colors.crimsonSoft,
                        },
                      ]}
                    >
                      <Text style={{ fontWeight: '800', fontSize: 12, color: colors.text }}>
                        ☀️ {lang === 'bn' ? 'দিন' : 'Day'}: {h.day_status}
                      </Text>
                      {h.day_holder && (
                        <Text style={{ fontSize: 11, color: colors.textMuted }} numberOfLines={1}>
                          {h.day_holder.customer_name}
                        </Text>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() =>
                        h.night_holder
                          ? setDetailBookingId(h.night_holder.booking_id)
                          : canCreate &&
                          (setNewBookingPrefill({
                            date: dashboard.todayYMD,
                            hallId: h.hall_id,
                            slot: 'NIGHT',
                          }),
                            setNewBookingOpen(true))
                      }
                      style={[
                        styles.slotPill,
                        {
                          backgroundColor:
                            h.night_status === 'FREE'
                              ? colors.primarySoft
                              : h.night_status === 'TENTATIVE'
                                ? colors.amberSoft
                                : colors.crimsonSoft,
                        },
                      ]}
                    >
                      <Text style={{ fontWeight: '800', fontSize: 12, color: colors.text }}>
                        🌙 {lang === 'bn' ? 'রাত' : 'Night'}: {h.night_status}
                      </Text>
                      {h.night_holder && (
                        <Text style={{ fontSize: 11, color: colors.textMuted }} numberOfLines={1}>
                          {h.night_holder.customer_name}
                        </Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              ))}

              {/* Upcoming Next 7 Days */}
              <Text style={[styles.secHeading, { color: colors.text }]}>
                {lang === 'bn' ? 'আগামী ৭ দিনের বুকিং' : 'Upcoming (Next 7 Days)'}
              </Text>
              {(dashboard?.upcomingNext7Days || []).length === 0 ? (
                <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Text style={{ color: colors.textMuted, textAlign: 'center' }}>
                    {lang === 'bn' ? 'আগামী ৭ দিনে কোনো বুকিং নেই' : 'No upcoming events in the next 7 days'}
                  </Text>
                </View>
              ) : (
                (dashboard?.upcomingNext7Days || []).map((b: any) => (
                  <TouchableOpacity
                    key={b.id}
                    onPress={() => setDetailBookingId(b.id)}
                    style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
                  >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={{ fontWeight: '800', color: colors.text, fontSize: 14, flex: 1 }}>
                        {b.customer_name}
                      </Text>
                      <View
                        style={[
                          styles.statusTag,
                          { backgroundColor: b.status === 'CONFIRMED' ? colors.primarySoft : colors.amberSoft },
                        ]}
                      >
                        <Text
                          style={{
                            fontSize: 10,
                            fontWeight: '800',
                            color: b.status === 'CONFIRMED' ? colors.primary : colors.amber,
                          }}
                        >
                          {b.slot} • {b.status}
                        </Text>
                      </View>
                    </View>
                    <Text style={{ fontSize: 12, color: colors.textMuted, marginTop: 4 }}>
                      {b.hall_name} • {formatDualDateFromYMD(b.event_date, lang)}
                    </Text>
                  </TouchableOpacity>
                ))
              )}
            </View>
          )}

          {/* TAB 2: SWIPEABLE CALENDAR (MONTH & YEAR SWIPE + RED BOOKED SLOTS + TOAST) */}
          {activeTab === 'calendar' && dashboard && (
            <View style={{ gap: 12 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={[styles.secHeading, { color: colors.text }]}>
                  {lang === 'bn' ? 'ক্যালেন্ডার (বামে/ডানে সোয়াইপ করুন)' : 'Calendar (Swipe Left/Right)'}
                </Text>
                <TouchableOpacity
                  onPress={() => setCalSwipeMode((m) => (m === 'MONTH' ? 'YEAR' : 'MONTH'))}
                  style={[styles.filterChip, { backgroundColor: colors.primarySoft, borderColor: colors.primary, paddingVertical: 4 }]}
                >
                  <Text style={{ color: colors.primary, fontSize: 10.5, fontWeight: '800' }}>
                    {calSwipeMode === 'MONTH'
                      ? lang === 'bn' ? 'সোয়াইপ: মাস' : 'Swipe: Month'
                      : lang === 'bn' ? 'সোয়াইপ: বছর' : 'Swipe: Year'}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Month Name & Year Direct Picker Bar */}
              <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 }]}>
                <TouchableOpacity onPress={() => shiftCalMonth(-1)} style={[styles.hdrBtn, { borderColor: colors.border }]}>
                  <Text style={{ color: colors.text, fontWeight: '800', fontSize: 14 }}>‹</Text>
                </TouchableOpacity>

                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <TouchableOpacity
                    onPress={() => setCalMonthPickerOpen(true)}
                    style={[styles.filterChip, { backgroundColor: colors.primarySoft, borderColor: colors.primary, flexDirection: 'row', alignItems: 'center', gap: 4 }]}
                  >
                    <Text style={{ fontWeight: '800', fontSize: 13, color: colors.primary }}>
                      {(() => {
                        const mIdx = Math.max(0, Math.min(11, Number(calMonthYM.split('-')[1]) - 1));
                        return lang === 'bn' ? EN_MONTHS_BN[mIdx] : EN_MONTHS[mIdx];
                      })()}
                    </Text>
                    <Ionicons name="chevron-down" size={14} color={colors.primary} />
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => setCalYearPickerOpen(true)}
                    style={[styles.filterChip, { backgroundColor: colors.goldSoft, borderColor: colors.gold, flexDirection: 'row', alignItems: 'center', gap: 4 }]}
                  >
                    <Text style={{ fontWeight: '800', fontSize: 13, color: colors.gold }}>
                      {lang === 'bn' ? toBanglaDigits(calMonthYM.split('-')[0]) : calMonthYM.split('-')[0]}
                    </Text>
                    <Ionicons name="chevron-down" size={14} color={colors.gold} />
                  </TouchableOpacity>
                </View>

                <TouchableOpacity onPress={() => shiftCalMonth(1)} style={[styles.hdrBtn, { borderColor: colors.border }]}>
                  <Text style={{ color: colors.text, fontWeight: '800', fontSize: 14 }}>›</Text>
                </TouchableOpacity>
              </View>

              <View {...calPanResponder.panHandlers}>
                {renderMiniCalendar(
                  calMonthYM,
                  calBookings,
                  selectedCalDay,
                  (ymd) => {
                    setSelectedCalDay(ymd);
                    const dayBookings = calBookings.filter((b: any) => b.event_date === ymd);
                    if (dayBookings.length > 0) {
                      const dayNum = toBanglaDigits(Number(ymd.split('-')[2]));
                      const slotsBn = dayBookings
                        .map((b: any) => (b.slot === 'DAY' ? 'দিন (Day)' : b.slot === 'NIGHT' ? 'রাত (Night)' : 'দিন ও রাত (Full)'))
                        .join(', ');
                      const slotsEn = dayBookings.map((b: any) => b.slot).join(', ');
                      showToast(
                        lang === 'bn'
                          ? `${dayNum} তারিখে ${slotsBn} স্লট বুক করা আছে!`
                          : `${slotsEn} slot booked on ${ymd}!`,
                        'error'
                      );
                    } else {
                      showToast(
                        lang === 'bn' ? 'এই তারিখে সব স্লট খালি আছে।' : 'All slots are free on this date.',
                        'info'
                      );
                    }
                  },
                  colors,
                  lang,
                  calCellSize
                )}
              </View>

              {selectedCalDay && (() => {
                const dayBookings = calBookings.filter(
                  (b: any) => b.event_date === selectedCalDay
                );
                const dayBooking = dayBookings.find((b: any) => b.slot === 'DAY' || b.slot === 'FULL');
                const nightBooking = dayBookings.find((b: any) => b.slot === 'NIGHT' || b.slot === 'FULL');
                const fullBooking = dayBookings.find((b: any) => b.slot === 'FULL') || dayBooking || nightBooking;

                const slotOptions: Array<{
                  key: 'DAY' | 'NIGHT' | 'FULL';
                  icon: string;
                  bn: string;
                  en: string;
                  bookedBy: any;
                }> = [
                    { key: 'DAY', icon: '☀️', bn: 'দিন (Day)', en: 'Day Shift', bookedBy: dayBooking },
                    { key: 'NIGHT', icon: '🌙', bn: 'রাত (Night)', en: 'Night Shift', bookedBy: nightBooking },
                    { key: 'FULL', icon: '☀️🌙', bn: 'দিন ও রাত (Full)', en: 'Full Day', bookedBy: fullBooking },
                  ];

                return (
                  <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, gap: 10 }]}>
                    <Text style={{ fontWeight: '800', color: colors.text, fontSize: 14 }}>
                      📅 {formatDualDateFromYMD(selectedCalDay, lang)}
                    </Text>

                    {/* Day / Night / Full Day Option Cards */}
                    <View style={{ gap: 8 }}>
                      {slotOptions.map((opt) => {
                        const isBooked = Boolean(opt.bookedBy);
                        return (
                          <TouchableOpacity
                            key={opt.key}
                            onPress={() => {
                              if (isBooked) {
                                showToast(
                                  lang === 'bn'
                                    ? `${opt.bn} স্লট ইতিমধ্যে বুক করা আছে (${opt.bookedBy.customer_name})`
                                    : `${opt.en} is already booked (${opt.bookedBy.customer_name})`,
                                  'error'
                                );
                                setDetailBookingId(opt.bookedBy.id);
                              } else if (canCreate) {
                                setNewBookingPrefill({ date: selectedCalDay, slot: opt.key });
                                setNewBookingOpen(true);
                              }
                            }}
                            style={[
                              styles.slotOptionCard,
                              {
                                backgroundColor: isBooked ? colors.crimsonSoft : colors.primarySoft,
                                borderColor: isBooked ? colors.crimson : colors.primary,
                              },
                            ]}
                          >
                            <View style={{ flex: 1 }}>
                              <Text
                                style={{
                                  fontWeight: '800',
                                  fontSize: 13,
                                  color: isBooked ? colors.crimson : colors.primary,
                                }}
                              >
                                {opt.icon} {lang === 'bn' ? opt.bn : opt.en}
                              </Text>
                              <Text
                                style={{
                                  fontSize: 11,
                                  fontWeight: '600',
                                  color: isBooked ? colors.crimson : colors.textMuted,
                                  marginTop: 2,
                                }}
                                numberOfLines={1}
                              >
                                {isBooked
                                  ? `${lang === 'bn' ? 'বুক করা আছে:' : 'Booked:'} ${opt.bookedBy.customer_name} (${opt.bookedBy.hall_name})`
                                  : lang === 'bn'
                                    ? 'খালি আছে — বুক করতে ট্যাপ করুন'
                                    : 'Available — Tap to book'}
                              </Text>
                            </View>
                            <View
                              style={{
                                paddingHorizontal: 8,
                                paddingVertical: 4,
                                borderRadius: 8,
                                backgroundColor: isBooked ? '#DC2626' : colors.primary,
                              }}
                            >
                              <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>
                                {isBooked ? (lang === 'bn' ? 'বুকড' : 'Booked') : lang === 'bn' ? 'খালি' : 'Free'}
                              </Text>
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                );
              })()}
            </View>
          )}

          {/* TAB 3: BOOKINGS (5 AT A TIME + LOAD MORE) */}
          {activeTab === 'bookings' && (
            <View style={{ gap: 10 }}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TextInput
                  value={bookingSearch}
                  onChangeText={(txt) => {
                    setBookingSearch(txt);
                    setBookingsVisibleCount(5);
                  }}
                  placeholder={lang === 'bn' ? 'নাম, হল বা বুকিং নং খুঁজুন...' : 'Search customer, hall, ID...'}
                  placeholderTextColor={colors.textMuted}
                  style={[styles.searchBox, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text }]}
                />
                {canCreate && (
                  <TouchableOpacity
                    onPress={() => {
                      setNewBookingPrefill({});
                      setNewBookingOpen(true);
                    }}
                    style={[styles.addSquareBtn, { backgroundColor: colors.primary }]}
                  >
                    <Ionicons name="add" size={24} color="#fff" />
                  </TouchableOpacity>
                )}
              </View>

              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {(['', 'CONFIRMED', 'TENTATIVE', 'CANCELLED'] as const).map((st) => {
                  const active = bookingStatusFilter === st;
                  return (
                    <TouchableOpacity
                      key={st || 'ALL'}
                      onPress={() => {
                        setBookingStatusFilter(st);
                        setBookingsVisibleCount(5);
                      }}
                      style={[
                        styles.filterChip,
                        {
                          backgroundColor: active ? colors.primary : colors.card,
                          borderColor: active ? colors.primary : colors.border,
                        },
                      ]}
                    >
                      <Text style={{ color: active ? '#fff' : colors.text, fontWeight: '700', fontSize: 12 }}>
                        {st || (lang === 'bn' ? 'সবগুলো' : 'All')}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {filteredBookings.slice(0, bookingsVisibleCount).map((b) => (
                <TouchableOpacity
                  key={b.id}
                  onPress={() => setDetailBookingId(b.id)}
                  style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
                >
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={{ fontWeight: '800', color: colors.primary, fontSize: 12 }}>
                      {b.booking_number}
                    </Text>
                    <Text
                      style={{
                        fontSize: 11,
                        fontWeight: '800',
                        color:
                          b.status === 'CONFIRMED'
                            ? colors.primary
                            : b.status === 'TENTATIVE'
                              ? colors.amber
                              : colors.crimson,
                      }}
                    >
                      {b.slot} • {b.status}
                    </Text>
                  </View>
                  <Text style={{ fontWeight: '800', color: colors.text, fontSize: 15, marginTop: 2 }}>
                    {b.customer_name}
                  </Text>
                  <Text style={{ fontSize: 12, color: colors.textMuted, marginTop: 2 }}>
                    {b.hall_name} • {formatDualDateFromYMD(b.event_date, lang)}
                  </Text>
                  {canSeeMoney && b.total_amount !== undefined && (
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: colors.text }}>
                        {lang === 'bn' ? 'মোট:' : 'Total:'} {formatCurrency(b.total_amount, lang)}
                      </Text>
                      <Text style={{ fontSize: 12, fontWeight: '800', color: b.due_amount > 0 ? colors.crimson : colors.primary }}>
                        {lang === 'bn' ? 'বাকী:' : 'Due:'} {formatCurrency(b.due_amount || 0, lang)}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              ))}

              {filteredBookings.length > bookingsVisibleCount && (
                <TouchableOpacity
                  onPress={() => setBookingsVisibleCount((prev) => prev + 5)}
                  style={[styles.primaryFullBtn, { backgroundColor: colors.primarySoft, borderWidth: 1, borderColor: colors.primary }]}
                >
                  <Ionicons name="chevron-down-circle-outline" size={18} color={colors.primary} />
                  <Text style={{ color: colors.primary, fontWeight: '800', fontSize: 13 }}>
                    {lang === 'bn'
                      ? `আরও লোড করুন (+৫টি) • বাকি ${toBanglaDigits(filteredBookings.length - bookingsVisibleCount)}টি`
                      : `Load More (+5) • ${filteredBookings.length - bookingsVisibleCount} remaining`}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* TAB 4: CUSTOMERS */}
          {activeTab === 'customers' && (
            <View style={{ gap: 10 }}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TextInput
                  value={customerSearch}
                  onChangeText={setCustomerSearch}
                  placeholder={lang === 'bn' ? 'গ্রাহকের নাম বা ফোন...' : 'Search name or phone...'}
                  placeholderTextColor={colors.textMuted}
                  style={[styles.searchBox, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text }]}
                />
                {canCreate && (
                  <TouchableOpacity
                    onPress={() => setAddCustOpen(true)}
                    style={[styles.addSquareBtn, { backgroundColor: colors.primary }]}
                  >
                    <Ionicons name="person-add" size={20} color="#fff" />
                  </TouchableOpacity>
                )}
              </View>

              {filteredCustomers.map((c) => (
                <TouchableOpacity
                  key={c.id}
                  onPress={() => openCustomerHistory(c)}
                  style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
                >
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontWeight: '800', color: colors.text, fontSize: 15 }}>{c.name}</Text>
                      <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>📞 {c.phone}</Text>
                      {c.address ? (
                        <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }} numberOfLines={1}>
                          📍 {c.address}
                        </Text>
                      ) : null}
                      <Text style={{ color: colors.primary, fontSize: 11, fontWeight: '700', marginTop: 4 }}>
                        {lang === 'bn' ? 'সব বুকিং দেখতে ট্যাপ করুন →' : 'Tap to view all bookings →'}
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => Linking.openURL(`tel:${c.phone}`)}
                      style={[styles.hdrBtn, { backgroundColor: colors.primarySoft, borderColor: colors.primary }]}
                    >
                      <Ionicons name="call" size={16} color={colors.primary} />
                    </TouchableOpacity>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* TAB 5: MORE (USER PROFILE, HALLS, REPORTS, EXPENSES, SERVER SETTINGS, LOGOUT) */}
          {activeTab === 'more' && (
            <View style={{ gap: 12 }}>
              {/* Logged-in User Personal Profile Card */}
              <TouchableOpacity
                onPress={openProfileModal}
                style={[styles.card, { backgroundColor: colors.card, borderColor: colors.primary, flexDirection: 'row', alignItems: 'center', gap: 12 }]}
              >
                {user?.picture ? (
                  <Image source={{ uri: user.picture }} style={{ width: 52, height: 52, borderRadius: 26 }} />
                ) : (
                  <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 20, fontWeight: '800', color: colors.primary }}>
                      {(user?.name || 'U').slice(0, 1).toUpperCase()}
                    </Text>
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '800', color: colors.text, fontSize: 15 }}>{user?.name}</Text>
                  <Text style={{ fontSize: 12, color: colors.textMuted }}>{user?.email}</Text>
                  <Text style={{ fontSize: 11, fontWeight: '800', color: colors.primary, marginTop: 2 }}>
                    {activeRole} • {lang === 'bn' ? 'প্রোফাইল ও সেটিংস সম্পাদনা →' : 'Edit Profile & Settings →'}
                  </Text>
                </View>
              </TouchableOpacity>

              <Text style={[styles.secHeading, { color: colors.text }]}>
                {lang === 'bn' ? 'হলসমূহ' : 'Halls'}
              </Text>
              {halls.map((h) => (
                <View key={h.id} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Text style={{ fontWeight: '800', color: colors.text, fontSize: 15 }}>{h.name}</Text>
                  <Text style={{ fontSize: 12, color: colors.textMuted, marginTop: 2 }}>
                    {lang === 'bn' ? 'ধারণক্ষমতা:' : 'Capacity:'} {toBanglaDigits(h.capacity)} • {h.status}
                  </Text>
                  {canSeeMoney && (
                    <Text style={{ fontSize: 12, color: colors.primary, fontWeight: '700', marginTop: 4 }}>
                      দিন: {formatCurrency(h.day_price, lang)} | রাত: {formatCurrency(h.night_price, lang)} | দিন ও রাত: {formatCurrency(h.full_price, lang)}
                    </Text>
                  )}
                </View>
              ))}

              {canSeeMoney && report && (
                <>
                  <Text style={[styles.secHeading, { color: colors.text }]}>
                    {lang === 'bn' ? 'চলতি মাসের রিপোর্ট সারসংক্ষেপ' : 'Monthly Financial Summary'}
                  </Text>
                  <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.gold }]}>
                    <Text style={{ color: colors.text, fontWeight: '700' }}>
                      {lang === 'bn' ? 'মোট রাজস্ব:' : 'Revenue:'} {formatCurrency(report.revenue || 0, lang)}
                    </Text>
                    <Text style={{ color: colors.primary, fontWeight: '700', marginTop: 4 }}>
                      {lang === 'bn' ? 'সংগৃহীত:' : 'Collected:'} {formatCurrency(report.collected || 0, lang)}
                    </Text>
                    <Text style={{ color: colors.crimson, fontWeight: '700', marginTop: 4 }}>
                      {lang === 'bn' ? 'মোট খরচ:' : 'Expenses:'} {formatCurrency(report.expenses || 0, lang)}
                    </Text>
                    <Text style={{ color: colors.gold, fontWeight: '800', marginTop: 4 }}>
                      {lang === 'bn' ? 'নিট লাভ:' : 'Net Profit:'} {formatCurrency(report.profit || 0, lang)}
                    </Text>
                  </View>
                </>
              )}

              {activeRole === 'OWNER' && (
                <TouchableOpacity
                  onPress={openClubSettings}
                  style={[styles.card, { backgroundColor: colors.primarySoft, borderColor: colors.primary }]}
                >
                  <Text style={{ fontWeight: '800', color: colors.primary }}>
                    🎨 {lang === 'bn' ? 'ক্লাব ব্র্যান্ডিং, লোগো, ঠিকানা ও রঙ কাস্টমাইজ' : 'Customize Club Logo, Name, Address & Theme'}
                  </Text>
                  <Text style={{ fontSize: 11, color: colors.textMuted, marginTop: 2 }}>
                    {lang === 'bn' ? 'লোগো, ক্লাবের নাম, একাধিক ফোন নম্বর ও ইমেইল পরিবর্তন করুন' : 'Edit logo, multiple phones, email & theme color'}
                  </Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                onPress={() => setServerModalOpen(true)}
                style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
              >
                <Text style={{ fontWeight: '800', color: colors.text }}>
                  🌐 {lang === 'bn' ? 'সার্ভার IP পরিবর্তন' : 'Server URL Settings'}
                </Text>
                <Text style={{ fontSize: 12, color: colors.textMuted, marginTop: 2 }}>{serverUrlState}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setActiveRoom(null)}
                style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
              >
                <Text style={{ fontWeight: '800', color: colors.primary }}>
                  🔄 {lang === 'bn' ? 'রুম পরিবর্তন করুন' : 'Switch Room'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleLogout}
                style={[styles.card, { backgroundColor: colors.crimsonSoft, borderColor: colors.crimson }]}
              >
                <Text style={{ fontWeight: '800', color: colors.crimson, textAlign: 'center' }}>
                  {lang === 'bn' ? 'লগআউট করুন' : 'Sign Out'}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>

        {/* Rounded Floating Bottom Bar with Raised Middle Button */}
        <View style={{ backgroundColor: 'transparent' }}>
          <View style={[styles.bottomBarFloat, { backgroundColor: colors.tabBg, borderColor: colors.border, shadowColor: colors.shadow }]}>
            {(
              [
                { key: 'home', icon: 'home', bn: 'হোম', en: 'Home' },
                { key: 'calendar', icon: 'calendar', bn: 'ক্যালেন্ডার', en: 'Calendar' },
                { key: 'bookings', icon: 'add', bn: 'বুকিং', en: 'Bookings', isCenter: true },
                { key: 'customers', icon: 'people', bn: 'গ্রাহক', en: 'Customers' },
                { key: 'more', icon: 'grid', bn: 'আরও', en: 'More' },
              ] as Array<{ key: TabKey; icon: string; bn: string; en: string; isCenter?: boolean }>
            ).map((tab) => {
              const active = activeTab === tab.key;
              if (tab.isCenter) {
                return (
                  <TouchableOpacity
                    key={tab.key}
                    onPress={() => navigateTab('bookings')}
                    style={styles.centerTabWrap}
                  >
                    <View style={[styles.centerTabCircle, { backgroundColor: colors.primary, borderColor: colors.tabBg }]}>
                      <Ionicons name={active ? 'list' : 'calendar-outline'} size={22} color="#fff" />
                    </View>
                    <Text style={{ fontSize: 10, fontWeight: '800', color: colors.primary, marginTop: 2 }}>
                      {lang === 'bn' ? tab.bn : tab.en}
                    </Text>
                  </TouchableOpacity>
                );
              }
              return (
                <TouchableOpacity
                  key={tab.key}
                  onPress={() => navigateTab(tab.key)}
                  style={styles.tabItem}
                >
                  <Ionicons
                    name={(active ? tab.icon : `${tab.icon}-outline`) as any}
                    size={20}
                    color={active ? colors.primary : colors.textMuted}
                  />
                  <Text
                    style={{
                      fontSize: 10,
                      fontWeight: active ? '800' : '600',
                      color: active ? colors.primary : colors.textMuted,
                      marginTop: 2,
                    }}
                  >
                    {lang === 'bn' ? tab.bn : tab.en}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Modals */}
        <BookingModal
          visible={newBookingOpen}
          onClose={() => setNewBookingOpen(false)}
          roomId={activeRoom.id}
          halls={halls}
          customers={customers}
          initialDate={newBookingPrefill.date}
          initialHallId={newBookingPrefill.hallId}
          initialSlot={newBookingPrefill.slot}
          lang={lang}
          colors={colors}
          onCreated={loadRoomData}
        />

        <BookingDetailSheet
          bookingId={detailBookingId}
          room={activeRoom}
          role={activeRole}
          lang={lang}
          colors={colors}
          serverUrl={serverUrlState}
          onClose={() => setDetailBookingId(null)}
          onUpdated={loadRoomData}
        />

        {/* Add Customer Modal */}
        <Modal visible={addCustOpen} transparent animationType="fade" onRequestClose={() => setAddCustOpen(false)}>
          <View style={styles.modalBackdrop}>
            <View style={[styles.modalBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.secHeading, { color: colors.text }]}>
                {lang === 'bn' ? 'নতুন গ্রাহক যোগ করুন' : 'Add Customer'}
              </Text>
              <TextInput
                value={newCustName}
                onChangeText={setNewCustName}
                placeholder={lang === 'bn' ? 'গ্রাহকের নাম' : 'Customer Name'}
                placeholderTextColor={colors.textMuted}
                style={[styles.inputBox, { borderColor: colors.border, color: colors.text }]}
              />
              <TextInput
                value={newCustPhone}
                onChangeText={setNewCustPhone}
                placeholder={lang === 'bn' ? 'মোবাইল নম্বর' : 'Phone Number'}
                placeholderTextColor={colors.textMuted}
                keyboardType="phone-pad"
                style={[styles.inputBox, { borderColor: colors.border, color: colors.text }]}
              />
              <TextInput
                value={newCustAddress}
                onChangeText={setNewCustAddress}
                placeholder={lang === 'bn' ? 'গ্রাহকের ঠিকানা / লোকেশন' : 'Customer Address / Location'}
                placeholderTextColor={colors.textMuted}
                style={[styles.inputBox, { borderColor: colors.border, color: colors.text }]}
              />
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                <TouchableOpacity onPress={() => setAddCustOpen(false)} style={[styles.modalBtn, { backgroundColor: colors.cardAlt }]}>
                  <Text style={{ color: colors.text, fontWeight: '700' }}>{lang === 'bn' ? 'বাতিল' : 'Cancel'}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleAddCustomer} style={[styles.modalBtn, { backgroundColor: colors.primary }]}>
                  <Text style={{ color: '#fff', fontWeight: '800' }}>{lang === 'bn' ? 'সংরক্ষণ' : 'Save'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Customer All Bookings History Modal (Confirmed, Tentative, Cancelled) */}
        <Modal visible={custHistoryOpen} animationType="slide" onRequestClose={() => setCustHistoryOpen(false)}>
          <SafeScreen backgroundColor={colors.bg}>
            <View style={[styles.header, { backgroundColor: colors.headerBg, borderBottomColor: colors.border }]}>
              <TouchableOpacity
                onPress={() => setCustHistoryOpen(false)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}
              >
                <Ionicons name="chevron-back" size={22} color={colors.text} />
                <Text style={{ color: colors.text, fontWeight: '700', fontSize: 14 }}>
                  {lang === 'bn' ? 'পিছনে' : 'Back'}
                </Text>
              </TouchableOpacity>
              <Text style={[styles.headerTitle, { color: colors.text, flex: 1, textAlign: 'center' }]} numberOfLines={1}>
                {custHistoryData?.name || ''}
              </Text>
              <View style={{ width: 48 }} />
            </View>

            <View style={{ padding: 14, gap: 8 }}>
              <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={{ fontWeight: '800', color: colors.text, fontSize: 15 }}>{custHistoryData?.name}</Text>
                <Text style={{ color: colors.primary, fontSize: 12, marginTop: 2 }}>📞 {custHistoryData?.phone}</Text>
                {custHistoryData?.address ? (
                  <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>📍 {custHistoryData.address}</Text>
                ) : null}
              </View>

              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {(['', 'CONFIRMED', 'TENTATIVE', 'CANCELLED'] as const).map((st) => {
                  const active = custHistoryFilter === st;
                  return (
                    <TouchableOpacity
                      key={st || 'ALL'}
                      onPress={() => setCustHistoryFilter(st)}
                      style={[
                        styles.filterChip,
                        {
                          backgroundColor: active ? colors.primary : colors.card,
                          borderColor: active ? colors.primary : colors.border,
                        },
                      ]}
                    >
                      <Text style={{ color: active ? '#fff' : colors.text, fontWeight: '700', fontSize: 11 }}>
                        {st || (lang === 'bn' ? 'সব বুকিং' : 'All Bookings')}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            {custHistoryLoading ? (
              <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 30 }} />
            ) : (
              <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 30, gap: 10 }}>
                {custHistoryBookings
                  .filter((b) => !custHistoryFilter || b.status === custHistoryFilter)
                  .map((b) => (
                    <TouchableOpacity
                      key={b.id}
                      onPress={() => {
                        setCustHistoryOpen(false);
                        setDetailBookingId(b.id);
                      }}
                      style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
                    >
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <Text style={{ fontWeight: '800', color: colors.primary, fontSize: 12 }}>{b.booking_number}</Text>
                        <Text
                          style={{
                            fontWeight: '800',
                            fontSize: 11,
                            color:
                              b.status === 'CONFIRMED'
                                ? colors.primary
                                : b.status === 'TENTATIVE'
                                  ? colors.amber
                                  : '#DC2626',
                          }}
                        >
                          {b.slot} • {b.status}
                        </Text>
                      </View>
                      <Text style={{ fontWeight: '700', color: colors.text, marginTop: 4 }}>{b.hall_name}</Text>
                      <Text style={{ fontSize: 12, color: colors.textMuted, marginTop: 2 }}>
                        📅 {formatDualDateFromYMD(b.event_date, lang)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                {custHistoryBookings.length === 0 && (
                  <Text style={{ textAlign: 'center', color: colors.textMuted, marginTop: 20 }}>
                    {lang === 'bn' ? 'এই গ্রাহকের কোনো বুকিং নেই' : 'No bookings found for this customer'}
                  </Text>
                )}
              </ScrollView>
            )}
          </SafeScreen>
        </Modal>

        {/* Add Expense Modal (Electricity Bill, Salary, Repair, etc.) */}
        <Modal visible={addExpenseOpen} transparent animationType="fade" onRequestClose={() => setAddExpenseOpen(false)}>
          <View style={styles.modalBackdrop}>
            <View style={[styles.modalBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.secHeading, { color: colors.text }]}>
                {lang === 'bn' ? 'নতুন খরচ যোগ করুন' : 'Add Expense'}
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                {(['ELECTRICITY', 'SALARY', 'REPAIR', 'CLEANING', 'DECORATION_MATERIAL', 'FOOD', 'OTHER'] as const).map((cat) => (
                  <TouchableOpacity
                    key={cat}
                    onPress={() => setExpCategory(cat)}
                    style={[
                      styles.filterChip,
                      {
                        backgroundColor: expCategory === cat ? colors.primary : colors.bg,
                        borderColor: expCategory === cat ? colors.primary : colors.border,
                      },
                    ]}
                  >
                    <Text style={{ color: expCategory === cat ? '#fff' : colors.text, fontSize: 11, fontWeight: '700' }}>
                      {cat === 'ELECTRICITY' ? 'বিদ্যুৎ বিল' : cat}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <TextInput
                value={expAmount}
                onChangeText={setExpAmount}
                keyboardType="numeric"
                placeholder={lang === 'bn' ? 'খরচের পরিমাণ (৳)' : 'Amount (৳)'}
                placeholderTextColor={colors.textMuted}
                style={[styles.inputBox, { borderColor: colors.border, color: colors.text }]}
              />
              <TextInput
                value={expNote}
                onChangeText={setExpNote}
                placeholder={lang === 'bn' ? 'বিবরণ / নোট' : 'Note / Description'}
                placeholderTextColor={colors.textMuted}
                style={[styles.inputBox, { borderColor: colors.border, color: colors.text }]}
              />
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                <TouchableOpacity onPress={() => setAddExpenseOpen(false)} style={[styles.modalBtn, { backgroundColor: colors.cardAlt }]}>
                  <Text style={{ color: colors.text, fontWeight: '700' }}>{lang === 'bn' ? 'বাতিল' : 'Cancel'}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleAddExpense} style={[styles.modalBtn, { backgroundColor: colors.primary }]}>
                  <Text style={{ color: '#fff', fontWeight: '800' }}>{lang === 'bn' ? 'সংরক্ষণ' : 'Save'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Logged-in User Personal Profile & Settings Modal */}
        <Modal visible={profileModalOpen} animationType="slide" onRequestClose={() => setProfileModalOpen(false)}>
          <SafeScreen backgroundColor={colors.bg}>
            <View style={[styles.header, { backgroundColor: colors.headerBg, borderBottomColor: colors.border }]}>
              <TouchableOpacity
                onPress={() => setProfileModalOpen(false)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}
              >
                <Ionicons name="chevron-back" size={22} color={colors.text} />
                <Text style={{ color: colors.text, fontWeight: '700', fontSize: 14 }}>
                  {lang === 'bn' ? 'পিছনে' : 'Back'}
                </Text>
              </TouchableOpacity>
              <Text style={[styles.headerTitle, { color: colors.text, flex: 1, textAlign: 'center' }]}>
                {lang === 'bn' ? 'ব্যক্তিগত প্রোফাইল ও সেটিংস' : 'My Profile & Settings'}
              </Text>
              <View style={{ width: 48 }} />
            </View>

            <ScrollView contentContainerStyle={styles.scrollPad}>
              <View style={{ alignItems: 'center', marginBottom: 16 }}>
                {editProfilePic ? (
                  <Image source={{ uri: editProfilePic }} style={{ width: 84, height: 84, borderRadius: 42, borderWidth: 2, borderColor: colors.primary }} />
                ) : (
                  <View style={{ width: 84, height: 84, borderRadius: 42, backgroundColor: colors.primarySoft, borderWidth: 2, borderColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 32, fontWeight: '800', color: colors.primary }}>
                      {(editProfileName || user?.name || 'U').slice(0, 1).toUpperCase()}
                    </Text>
                  </View>
                )}
                <Text style={{ fontWeight: '800', fontSize: 16, color: colors.text, marginTop: 8 }}>{user?.email}</Text>
                <Text style={{ fontSize: 12, fontWeight: '700', color: colors.primary, marginTop: 2 }}>
                  {lang === 'bn' ? `বর্তমান রোল: ${activeRole}` : `Current Role: ${activeRole}`}
                </Text>
              </View>

              <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, gap: 10 }]}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textMuted }}>
                  {lang === 'bn' ? 'আপনার নাম' : 'Display Name'}
                </Text>
                <TextInput
                  value={editProfileName}
                  onChangeText={setEditProfileName}
                  placeholder={lang === 'bn' ? 'আপনার নাম লিখুন' : 'Your Name'}
                  placeholderTextColor={colors.textMuted}
                  style={[styles.inputBox, { borderColor: colors.border, color: colors.text }]}
                />

                <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textMuted }}>
                  {lang === 'bn' ? 'প্রোফাইল ছবির URL (ঐচ্ছিক)' : 'Profile Photo URL (optional)'}
                </Text>
                <TextInput
                  value={editProfilePic}
                  onChangeText={setEditProfilePic}
                  autoCapitalize="none"
                  placeholder="https://..."
                  placeholderTextColor={colors.textMuted}
                  style={[styles.inputBox, { borderColor: colors.border, color: colors.text }]}
                />

                <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textMuted }}>
                  {lang === 'bn' ? 'পছন্দের ভাষা ও থিম' : 'Language & Theme'}
                </Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TouchableOpacity
                    onPress={() => setLang((l) => (l === 'bn' ? 'en' : 'bn'))}
                    style={[styles.modalBtn, { backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.border }]}
                  >
                    <Text style={{ color: colors.text, fontWeight: '700' }}>
                      🌐 {lang === 'bn' ? 'ভাষা: বাংলা' : 'Language: English'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={toggleThemeMode}
                    style={[styles.modalBtn, { backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.border }]}
                  >
                    <Text style={{ color: colors.text, fontWeight: '700' }}>
                      {themeMode === 'dark' ? '🌙 Dark' : '☀️ White'}
                    </Text>
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  onPress={handleSaveProfile}
                  disabled={savingProfile}
                  style={[styles.primaryFullBtn, { backgroundColor: colors.primary, marginTop: 6 }]}
                >
                  {savingProfile ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.primaryFullBtnText}>
                      {lang === 'bn' ? 'প্রোফাইল সংরক্ষণ করুন' : 'Save Profile'}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>

              <View style={{ gap: 10, marginTop: 14 }}>
                <TouchableOpacity
                  onPress={() => {
                    setProfileModalOpen(false);
                    openRoomSelector();
                  }}
                  style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
                >
                  <Text style={{ fontWeight: '800', color: colors.primary, textAlign: 'center' }}>
                    🔄 {lang === 'bn' ? 'রুম পরিবর্তন করুন' : 'Switch Room'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleLogout}
                  style={[styles.card, { backgroundColor: colors.crimsonSoft, borderColor: colors.crimson }]}
                >
                  <Text style={{ fontWeight: '800', color: colors.crimson, textAlign: 'center' }}>
                    {lang === 'bn' ? 'এই ডিভাইস থেকে লগআউট' : 'Sign Out (This Device)'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleLogoutAll}
                  style={[styles.card, { backgroundColor: colors.card, borderColor: colors.crimson }]}
                >
                  <Text style={{ fontWeight: '800', color: colors.crimson, textAlign: 'center' }}>
                    {lang === 'bn' ? 'সব ডিভাইস থেকে লগআউট করুন' : 'Sign Out From All Devices'}
                  </Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </SafeScreen>
        </Modal>

        {/* Calendar Direct Month Picker Modal */}
        <Modal visible={calMonthPickerOpen} transparent animationType="fade" onRequestClose={() => setCalMonthPickerOpen(false)}>
          <View style={styles.modalBackdrop}>
            <View style={[styles.modalBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.secHeading, { color: colors.text }]}>
                {lang === 'bn' ? 'মাস নির্বাচন করুন' : 'Select Month'}
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {(lang === 'bn' ? EN_MONTHS_BN : EN_MONTHS).map((mName, idx) => {
                  const mStr = String(idx + 1).padStart(2, '0');
                  const curM = calMonthYM.split('-')[1];
                  const active = curM === mStr;
                  return (
                    <TouchableOpacity
                      key={mStr}
                      onPress={() => {
                        const y = calMonthYM.split('-')[0];
                        setCalMonthYM(`${y}-${mStr}`);
                        setCalMonthPickerOpen(false);
                      }}
                      style={[
                        styles.filterChip,
                        {
                          width: '31%',
                          alignItems: 'center',
                          backgroundColor: active ? colors.primary : colors.bg,
                          borderColor: active ? colors.primary : colors.border,
                        },
                      ]}
                    >
                      <Text style={{ color: active ? '#fff' : colors.text, fontWeight: '800', fontSize: 12 }}>
                        {mName}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <TouchableOpacity onPress={() => setCalMonthPickerOpen(false)} style={[styles.modalBtn, { backgroundColor: colors.cardAlt, marginTop: 6 }]}>
                <Text style={{ color: colors.text, fontWeight: '700' }}>{lang === 'bn' ? 'বন্ধ করুন' : 'Close'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* Calendar Direct Year Picker Modal */}
        <Modal visible={calYearPickerOpen} transparent animationType="fade" onRequestClose={() => setCalYearPickerOpen(false)}>
          <View style={styles.modalBackdrop}>
            <View style={[styles.modalBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.secHeading, { color: colors.text }]}>
                {lang === 'bn' ? 'বছর নির্বাচন করুন' : 'Select Year'}
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {Array.from({ length: 12 }, (_, i) => 2023 + i).map((yr) => {
                  const curY = Number(calMonthYM.split('-')[0]);
                  const active = curY === yr;
                  return (
                    <TouchableOpacity
                      key={yr}
                      onPress={() => {
                        const m = calMonthYM.split('-')[1];
                        setCalMonthYM(`${yr}-${m}`);
                        setCalYearPickerOpen(false);
                      }}
                      style={[
                        styles.filterChip,
                        {
                          width: '31%',
                          alignItems: 'center',
                          backgroundColor: active ? colors.gold : colors.bg,
                          borderColor: active ? colors.gold : colors.border,
                        },
                      ]}
                    >
                      <Text style={{ color: active ? '#fff' : colors.text, fontWeight: '800', fontSize: 13 }}>
                        {lang === 'bn' ? toBanglaDigits(yr) : yr}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <TouchableOpacity onPress={() => setCalYearPickerOpen(false)} style={[styles.modalBtn, { backgroundColor: colors.cardAlt, marginTop: 6 }]}>
                <Text style={{ color: colors.text, fontWeight: '700' }}>{lang === 'bn' ? 'বন্ধ করুন' : 'Close'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* Home All Costs / Expenses Detail Modal (Date / Month / Year / Custom) */}
        <Modal visible={costModalOpen} animationType="slide" onRequestClose={() => setCostModalOpen(false)}>
          <SafeScreen backgroundColor={colors.bg}>
            <View style={[styles.header, { backgroundColor: colors.headerBg, borderBottomColor: colors.border }]}>
              <TouchableOpacity
                onPress={() => setCostModalOpen(false)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}
              >
                <Ionicons name="chevron-back" size={22} color={colors.text} />
                <Text style={{ color: colors.text, fontWeight: '700', fontSize: 14 }}>
                  {lang === 'bn' ? 'পিছনে' : 'Back'}
                </Text>
              </TouchableOpacity>
              <Text style={[styles.headerTitle, { color: colors.text, flex: 1, textAlign: 'center' }]}>
                {lang === 'bn' ? 'সকল খরচের বিবরণ' : 'All Expenses'}
              </Text>
              <TouchableOpacity
                onPress={() => setAddExpenseOpen(true)}
                style={[styles.retryPill, { backgroundColor: colors.primary }]}
              >
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 11 }}>
                  + {lang === 'bn' ? 'খরচ যোগ' : 'Add'}
                </Text>
              </TouchableOpacity>
            </View>

            <View style={{ padding: 14, gap: 10 }}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                {(
                  [
                    { key: 'DAY', bn: 'আজ (Date)', en: 'Today' },
                    { key: 'MONTH', bn: 'এই মাস (Month)', en: 'This Month' },
                    { key: 'YEAR', bn: 'এই বছর (Year)', en: 'This Year' },
                    { key: 'CUSTOM', bn: 'তারিখ থেকে তারিখ', en: 'Custom Range' },
                  ] as const
                ).map((p) => {
                  const active = homePeriod === p.key;
                  return (
                    <TouchableOpacity
                      key={p.key}
                      onPress={() => setHomePeriod(p.key)}
                      style={[
                        styles.filterChip,
                        {
                          backgroundColor: active ? colors.primary : colors.card,
                          borderColor: active ? colors.primary : colors.border,
                        },
                      ]}
                    >
                      <Text style={{ color: active ? '#fff' : colors.text, fontSize: 12, fontWeight: '800' }}>
                        {lang === 'bn' ? p.bn : p.en}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {homePeriod === 'CUSTOM' && (
                <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                  <TouchableOpacity
                    onPress={() => setDatePickerTarget('FROM')}
                    style={[styles.searchBox, { backgroundColor: colors.card, borderColor: colors.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 9 }]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 9.5, fontWeight: '700', color: colors.textMuted }}>
                        {lang === 'bn' ? 'শুরুর তারিখ' : 'From Date'}
                      </Text>
                      <Text style={{ fontSize: 12, fontWeight: '800', color: colors.text }} numberOfLines={1}>
                        {customFrom
                          ? (() => {
                              const [y, m, d] = customFrom.split('-').map(Number);
                              return lang === 'bn'
                                ? `${toBanglaDigits(d)} ${EN_MONTHS_BN[m - 1]} ${toBanglaDigits(y)}`
                                : `${d} ${EN_MONTHS[m - 1].slice(0, 3)} ${y}`;
                            })()
                          : 'Select'}
                      </Text>
                    </View>
                    <Ionicons name="calendar-outline" size={16} color={colors.primary} />
                  </TouchableOpacity>

                  <Text style={{ color: colors.textMuted, fontWeight: '800' }}>→</Text>

                  <TouchableOpacity
                    onPress={() => setDatePickerTarget('TO')}
                    style={[styles.searchBox, { backgroundColor: colors.card, borderColor: colors.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 9 }]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 9.5, fontWeight: '700', color: colors.textMuted }}>
                        {lang === 'bn' ? 'শেষ তারিখ' : 'To Date'}
                      </Text>
                      <Text style={{ fontSize: 12, fontWeight: '800', color: colors.text }} numberOfLines={1}>
                        {customTo
                          ? (() => {
                              const [y, m, d] = customTo.split('-').map(Number);
                              return lang === 'bn'
                                ? `${toBanglaDigits(d)} ${EN_MONTHS_BN[m - 1]} ${toBanglaDigits(y)}`
                                : `${d} ${EN_MONTHS[m - 1].slice(0, 3)} ${y}`;
                            })()
                          : 'Select'}
                      </Text>
                    </View>
                    <Ionicons name="calendar-outline" size={16} color={colors.primary} />
                  </TouchableOpacity>
                </View>
              )}

              <View style={[styles.card, { backgroundColor: colors.crimsonSoft, borderColor: colors.crimson, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}>
                <Text style={{ fontWeight: '800', color: colors.crimson, fontSize: 14 }}>
                  {lang === 'bn' ? 'মোট খরচ:' : 'Total Cost:'}
                </Text>
                <Text style={{ fontWeight: '800', color: colors.crimson, fontSize: 18 }}>
                  {formatCurrency(periodReport?.expenses ?? 0, lang)}
                </Text>
              </View>
            </View>

            <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 30, gap: 8 }}>
              {periodExpenses.length === 0 ? (
                <Text style={{ textAlign: 'center', color: colors.textMuted, marginTop: 24 }}>
                  {lang === 'bn' ? 'এই সময়ে কোনো খরচ রেকর্ড নেই।' : 'No expenses recorded for this period.'}
                </Text>
              ) : (
                periodExpenses.map((ex) => (
                  <View key={ex.id} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontWeight: '800', color: colors.text, fontSize: 14 }}>
                        {ex.category === 'ELECTRICITY' ? '⚡ বিদ্যুৎ বিল (Electricity)' : ex.category}
                      </Text>
                      <Text style={{ fontSize: 11.5, color: colors.textMuted, marginTop: 2 }}>
                        📅 {formatDualDateFromYMD(ex.expense_date, lang)}
                      </Text>
                      {ex.note ? (
                        <Text style={{ fontSize: 11.5, color: colors.textMuted, marginTop: 2 }}>📝 {ex.note}</Text>
                      ) : null}
                    </View>
                    <Text style={{ fontWeight: '800', color: '#DC2626', fontSize: 15 }}>
                      {formatCurrency(ex.amount, lang)}
                    </Text>
                  </View>
                ))
              )}
            </ScrollView>
          </SafeScreen>
        </Modal>

        {/* Outstanding Dues List Modal (Who owes money + details) */}
        <Modal visible={duesModalOpen} animationType="slide" onRequestClose={() => setDuesModalOpen(false)}>
          <SafeScreen backgroundColor={colors.bg}>
            <View style={[styles.header, { backgroundColor: colors.headerBg, borderBottomColor: colors.border }]}>
              <TouchableOpacity
                onPress={() => setDuesModalOpen(false)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}
              >
                <Ionicons name="chevron-back" size={22} color={colors.text} />
                <Text style={{ color: colors.text, fontWeight: '700', fontSize: 14 }}>
                  {lang === 'bn' ? 'পিছনে' : 'Back'}
                </Text>
              </TouchableOpacity>
              <Text style={[styles.headerTitle, { color: colors.text, flex: 1, textAlign: 'center' }]}>
                {lang === 'bn' ? 'বকেয়া টাকার তালিকা (Dues)' : 'Outstanding Dues List'}
              </Text>
              <View style={{ width: 48 }} />
            </View>

            <View style={{ padding: 14 }}>
              <View style={[styles.card, { backgroundColor: colors.crimsonSoft, borderColor: colors.crimson, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}>
                <Text style={{ fontWeight: '800', color: colors.crimson, fontSize: 14 }}>
                  {lang === 'bn' ? 'সর্বমোট পাওনা / বকেয়া:' : 'Total Receivable Dues:'}
                </Text>
                <Text style={{ fontWeight: '800', color: colors.crimson, fontSize: 18 }}>
                  {formatCurrency(dashboard?.summaryCards?.totalDueAmount ?? 0, lang)}
                </Text>
              </View>
            </View>

            <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 30, gap: 10 }}>
              {allDuesList.length === 0 ? (
                <Text style={{ textAlign: 'center', color: colors.textMuted, marginTop: 24 }}>
                  {lang === 'bn' ? 'কোনো বকেয়া টাকা নেই!' : 'No outstanding dues!'}
                </Text>
              ) : (
                allDuesList.map((d) => (
                  <TouchableOpacity
                    key={d.booking_id}
                    onPress={() => {
                      setDuesModalOpen(false);
                      setDetailBookingId(d.booking_id);
                    }}
                    style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, gap: 4 }]}
                  >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={{ fontWeight: '800', color: colors.text, fontSize: 15, flex: 1 }}>
                        {d.customer_name}
                      </Text>
                      <TouchableOpacity
                        onPress={() => Linking.openURL(`tel:${d.customer_phone}`)}
                        style={[styles.hdrBtn, { backgroundColor: colors.primarySoft, borderColor: colors.primary }]}
                      >
                        <Ionicons name="call" size={14} color={colors.primary} />
                      </TouchableOpacity>
                    </View>
                    <Text style={{ fontSize: 12, color: colors.primary, fontWeight: '700' }}>
                      📞 {d.customer_phone} • #{d.booking_number}
                    </Text>
                    <Text style={{ fontSize: 12, color: colors.textMuted }}>
                      🏛️ {d.hall_name} ({d.slot}) • 📅 {formatDualDateFromYMD(d.event_date, lang)}
                    </Text>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 6, marginTop: 4 }}>
                      <Text style={{ fontSize: 11.5, color: colors.textMuted, fontWeight: '700' }}>
                        {lang === 'bn' ? 'মোট:' : 'Total:'} {formatCurrency(d.total_amount, lang)} | {lang === 'bn' ? 'জমা:' : 'Paid:'} {formatCurrency(d.paid_amount, lang)}
                      </Text>
                      <Text style={{ fontSize: 13, color: '#DC2626', fontWeight: '800' }}>
                        {lang === 'bn' ? 'পাবো:' : 'Due:'} {formatCurrency(d.due_amount, lang)}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          </SafeScreen>
        </Modal>

        {/* Owner-Only Club Branding, Storage Image Picker & Logo Size Control Modal */}
        <Modal visible={clubSettingsOpen && activeRole === 'OWNER'} transparent animationType="slide" onRequestClose={() => setClubSettingsOpen(false)}>
          <View style={styles.modalBackdrop}>
            <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}>
              <View style={[styles.modalBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.secHeading, { color: colors.text }]}>
                  {lang === 'bn' ? 'ক্লাব ব্র্যান্ডিং ও লোগো সেটিংস (শুধুমাত্র Owner)' : 'Club Branding & Logo (Owner Only)'}
                </Text>

                {/* Live Logo Preview + Storage Image Picker + Size Control */}
                <View style={{ alignItems: 'center', padding: 12, borderRadius: 14, backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border, gap: 8 }}>
                  <Image
                    source={editClubLogo ? { uri: editClubLogo } : require('./assets/logo.png')}
                    style={{
                      width: Math.round(72 * editClubLogoScale),
                      height: Math.round(72 * editClubLogoScale),
                    }}
                    resizeMode="contain"
                  />
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TouchableOpacity
                      onPress={pickLogoFromStorage}
                      style={[styles.retryPill, { backgroundColor: colors.primary, flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 8, paddingHorizontal: 12 }]}
                    >
                      <Ionicons name="image-outline" size={15} color="#fff" />
                      <Text style={{ color: '#fff', fontWeight: '800', fontSize: 12 }}>
                        {lang === 'bn' ? 'গ্যালারি থেকে ছবি নিন' : 'Pick Image from Storage'}
                      </Text>
                    </TouchableOpacity>
                    {editClubLogo ? (
                      <TouchableOpacity
                        onPress={() => setEditClubLogo('')}
                        style={[styles.retryPill, { backgroundColor: colors.crimsonSoft, borderWidth: 1, borderColor: colors.crimson, justifyContent: 'center' }]}
                      >
                        <Text style={{ color: colors.crimson, fontWeight: '700', fontSize: 11 }}>
                          {lang === 'bn' ? 'ডিফল্ট' : 'Reset'}
                        </Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>

                  {/* Logo Size Control (- / +) */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textMuted }}>
                      {lang === 'bn' ? 'লোগোর সাইজ:' : 'Logo Size:'}
                    </Text>
                    <TouchableOpacity
                      onPress={() => setEditClubLogoScale((s) => Math.max(0.6, Number((s - 0.1).toFixed(2))))}
                      style={[styles.hdrBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
                    >
                      <Text style={{ fontWeight: '800', fontSize: 15, color: colors.text }}>−</Text>
                    </TouchableOpacity>
                    <Text style={{ fontWeight: '800', fontSize: 13, color: colors.primary, minWidth: 42, textAlign: 'center' }}>
                      {Math.round(editClubLogoScale * 100)}%
                    </Text>
                    <TouchableOpacity
                      onPress={() => setEditClubLogoScale((s) => Math.min(1.6, Number((s + 0.1).toFixed(2))))}
                      style={[styles.hdrBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
                    >
                      <Text style={{ fontWeight: '800', fontSize: 15, color: colors.text }}>+</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                <TextInput
                  value={editClubName}
                  onChangeText={setEditClubName}
                  placeholder={lang === 'bn' ? 'ক্লাবের নাম' : 'Club Name'}
                  placeholderTextColor={colors.textMuted}
                  style={[styles.inputBox, { borderColor: colors.border, color: colors.text }]}
                />
                <TextInput
                  value={editClubAddress}
                  onChangeText={setEditClubAddress}
                  placeholder={lang === 'bn' ? 'ঠিকানা / লোকেশন' : 'Address / Location'}
                  placeholderTextColor={colors.textMuted}
                  style={[styles.inputBox, { borderColor: colors.border, color: colors.text }]}
                />
                <TextInput
                  value={editClubPhone}
                  onChangeText={setEditClubPhone}
                  placeholder={lang === 'bn' ? 'ফোন নম্বর (একাধিক হলে কমা দিন)' : 'Phones (comma separated)'}
                  placeholderTextColor={colors.textMuted}
                  style={[styles.inputBox, { borderColor: colors.border, color: colors.text }]}
                />
                <TextInput
                  value={editClubEmail}
                  onChangeText={setEditClubEmail}
                  placeholder={lang === 'bn' ? 'ইমেইল ঠিকানা' : 'Email Address'}
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  style={[styles.inputBox, { borderColor: colors.border, color: colors.text }]}
                />
                <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textMuted, marginTop: 4 }}>
                  {lang === 'bn' ? 'থিমের মূল রঙ পছন্দ করুন:' : 'Select Theme Accent Color:'}
                </Text>
                <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
                  {['#0E8A44', '#C62828', '#8C5E2A', '#582C4D', '#1D4ED8', '#0F766E'].map((hex) => (
                    <TouchableOpacity
                      key={hex}
                      onPress={() => setEditClubColor(hex)}
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: 17,
                        backgroundColor: hex,
                        borderWidth: editClubColor === hex ? 3 : 1,
                        borderColor: editClubColor === hex ? colors.text : colors.border,
                      }}
                    />
                  ))}
                </View>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                  <TouchableOpacity onPress={() => setClubSettingsOpen(false)} style={[styles.modalBtn, { backgroundColor: colors.cardAlt }]}>
                    <Text style={{ color: colors.text, fontWeight: '700' }}>{lang === 'bn' ? 'বাতিল' : 'Cancel'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={handleSaveClubSettings} style={[styles.modalBtn, { backgroundColor: colors.primary }]}>
                    <Text style={{ color: '#fff', fontWeight: '800' }}>{lang === 'bn' ? 'সংরক্ষণ করুন' : 'Save Changes'}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </ScrollView>
          </View>
        </Modal>

        {/* Interactive Calendar Date Picker for Custom Date Range */}
        <DatePickerModal
          visible={datePickerTarget !== null}
          title={
            datePickerTarget === 'FROM'
              ? lang === 'bn'
                ? 'শুরুর তারিখ নির্বাচন করুন'
                : 'Select From Date'
              : lang === 'bn'
              ? 'শেষ তারিখ নির্বাচন করুন'
              : 'Select To Date'
          }
          valueYMD={datePickerTarget === 'FROM' ? customFrom : customTo}
          lang={lang}
          colors={colors}
          onClose={() => setDatePickerTarget(null)}
          onSelectYMD={(ymd) => {
            if (datePickerTarget === 'FROM') {
              setCustomFrom(ymd);
              if (customTo && ymd > customTo) setCustomTo(ymd);
            } else {
              setCustomTo(ymd);
              if (customFrom && ymd < customFrom) setCustomFrom(ymd);
            }
          }}
        />

        {renderServerModal(serverModalOpen, setServerModalOpen, serverUrlInput, setServerUrlInput, handleSaveServerUrl, colors, lang)}
    </SafeScreen>
  );
}

function setLanguageAndSave(lang: 'bn' | 'en', setLang: React.Dispatch<React.SetStateAction<'bn' | 'en'>>) {
  setLang(lang === 'bn' ? 'en' : 'bn');
}

function renderServerModal(
  visible: boolean,
  setVisible: (v: boolean) => void,
  val: string,
  setVal: (v: string) => void,
  onSave: () => void,
  colors: any,
  lang: 'bn' | 'en'
) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
      <View style={styles.modalBackdrop}>
        <View style={[styles.modalBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.secHeading, { color: colors.text }]}>
            {lang === 'bn' ? 'সার্ভার ঠিকানা (URL)' : 'Server URL'}
          </Text>
          <TextInput
            value={val}
            onChangeText={setVal}
            autoCapitalize="none"
            placeholder="http://10.218.141.155:8081"
            style={[styles.inputBox, { borderColor: colors.border, color: colors.text }]}
          />
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
            <TouchableOpacity onPress={() => setVisible(false)} style={[styles.modalBtn, { backgroundColor: colors.cardAlt }]}>
              <Text style={{ color: colors.text, fontWeight: '700' }}>{lang === 'bn' ? 'বাতিল' : 'Cancel'}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onSave} style={[styles.modalBtn, { backgroundColor: colors.primary }]}>
              <Text style={{ color: '#fff', fontWeight: '800' }}>{lang === 'bn' ? 'সংরক্ষণ' : 'Save'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const SummaryCard: React.FC<{
  title: string;
  value: string;
  color: string;
  colors: any;
  onPress: () => void;
}> = ({ title, value, color, colors, onPress }) => {
  const { summaryCardWidth, isSmallPhone } = useResponsiveLayout();
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[
        styles.summaryCard,
        { width: summaryCardWidth, backgroundColor: colors.card, borderColor: colors.border },
      ]}
    >
      <Text style={{ fontSize: 11, fontWeight: '700', color: colors.textMuted }} numberOfLines={1}>
        {title}
      </Text>
      <Text
        style={{ fontSize: isSmallPhone ? 17 : 20, fontWeight: '800', color, marginTop: 4 }}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {value}
      </Text>
    </TouchableOpacity>
  );
};

function renderMiniCalendar(
  ym: string,
  bookings: any[],
  selectedDay: string | null,
  onSelect: (ymd: string) => void,
  colors: any,
  lang: 'bn' | 'en',
  cellPx?: number
) {
  const sizeStyle = cellPx ? { width: cellPx, height: cellPx } : {};
  const [y, m] = ym.split('-').map(Number);
  const firstDow = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells: Array<number | null> = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const dayHeaders = lang === 'bn' ? ['র', 'সো', 'ম', 'বু', 'বৃ', 'শু', 'শ'] : ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.calRow}>
        {dayHeaders.map((h, i) => (
          <Text key={i} style={[styles.calHead, { color: colors.textMuted }]}>
            {h}
          </Text>
        ))}
      </View>
      <View style={styles.calGrid}>
        {cells.map((d, idx) => {
          if (!d) return <View key={`e-${idx}`} style={[styles.calCellEmpty, sizeStyle]} />;
          const ymd = `${ym}-${String(d).padStart(2, '0')}`;
          const dayB = bookings.filter((b) => b.event_date === ymd);
          const hasDay = dayB.some((b) => b.slot === 'DAY' || b.slot === 'FULL');
          const hasNight = dayB.some((b) => b.slot === 'NIGHT' || b.slot === 'FULL');
          const isSel = selectedDay === ymd;

          return (
            <TouchableOpacity
              key={ymd}
              onPress={() => onSelect(ymd)}
              style={[
                styles.calCell,
                sizeStyle,
                {
                  borderColor: isSel ? colors.primary : colors.border,
                  borderWidth: isSel ? 2 : 1,
                },
              ]}
            >
              <View
                style={[
                  styles.calHalf,
                  {
                    top: 0,
                    backgroundColor: hasDay
                      ? colors.mode === 'dark'
                        ? '#5C141B'
                        : '#FCA5A5'
                      : colors.primarySoft,
                  },
                ]}
              />
              <View
                style={[
                  styles.calHalf,
                  {
                    bottom: 0,
                    backgroundColor: hasNight
                      ? colors.mode === 'dark'
                        ? '#7F1D1D'
                        : '#F87171'
                      : colors.cardAlt,
                  },
                ]}
              />
              <Text style={[styles.calNum, { color: colors.text }]}>
                {lang === 'bn' ? toBanglaDigits(d) : d}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  splashContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  splashGlowRing: {
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: '#F1F9F4',
    borderWidth: 2,
    borderColor: '#C6EBD4',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  splashLogo: { width: 205, height: 205 },
  splashTitle: { fontSize: 24, fontWeight: '800', color: '#C62828' },
  splashSub: { fontSize: 15, fontWeight: '700', color: '#0E8A44', marginTop: 2 },
  offlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 12,
    marginTop: 8,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  retryPill: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  loginWrap: { flexGrow: 1, justifyContent: 'center', padding: 20 },
  loginTopRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginBottom: 16 },
  pillBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1 },
  loginCard: { borderRadius: 24, borderWidth: 1, padding: 24, alignItems: 'center' },
  loginLogo: { width: 145, height: 145, marginBottom: 10 },
  loginTitle: { fontSize: 22, fontWeight: '800', textAlign: 'center' },
  loginSub: { fontSize: 12, textAlign: 'center', marginTop: 4, marginBottom: 18 },
  devLoginGrid: { width: '100%', gap: 10 },
  devHint: { fontSize: 12, fontWeight: '800', textAlign: 'center', marginBottom: 4 },
  roleLoginBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    borderRadius: 14,
    borderWidth: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  headerBrand: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  headerLogo: { width: 46, height: 46, borderRadius: 10 },
  headerTitle: { fontSize: 15, fontWeight: '800' },
  headerActions: { flexDirection: 'row', gap: 8 },
  hdrBtn: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10, borderWidth: 1 },
  scrollPad: { padding: 14, paddingBottom: 24 },
  heroCard: {
    borderRadius: 20,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  heroGreeting: { color: '#FFFFFF', fontSize: 17, fontWeight: '800' },
  heroDate: { color: '#E6F5EC', fontSize: 12, fontWeight: '600', marginTop: 4 },
  heroLogo: { width: 72, height: 72, backgroundColor: '#fff', borderRadius: 14, padding: 3 },
  quickRow: { flexDirection: 'row', gap: 10 },
  qaBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  grid2: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  summaryCard: {
    width: '48.3%',
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
  },
  secHeading: { fontSize: 15, fontWeight: '800', marginTop: 4 },
  card: { padding: 14, borderRadius: 16, borderWidth: 1 },
  twoCol: { flexDirection: 'row', gap: 8 },
  slotPill: { flex: 1, padding: 10, borderRadius: 12 },
  statusTag: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  searchBox: { flex: 1, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  addSquareBtn: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  filterChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12, borderWidth: 1 },
  bottomBarFloat: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 12,
    marginBottom: 6,
    borderRadius: 28,
    borderWidth: 1,
    paddingVertical: 6,
    paddingHorizontal: 6,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.14,
    shadowRadius: 10,
    elevation: 8,
  },
  centerTabWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', marginTop: -22 },
  centerTabCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 6,
  },
  backIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toastBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 12,
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  slotOptionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1.5,
    gap: 8,
  },
  tabItem: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 44 },
  primaryFullBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    borderRadius: 14,
  },
  primaryFullBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  inputInline: { flex: 1, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9, fontSize: 14 },
  joinBtn: { paddingHorizontal: 16, borderRadius: 12, justifyContent: 'center' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 20 },
  modalBox: { borderRadius: 20, borderWidth: 1, padding: 18, gap: 10 },
  inputBox: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  modalBtn: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 12 },
  calRow: { flexDirection: 'row', marginBottom: 6 },
  calHead: { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '800' },
  calGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  calCellEmpty: { width: '13.2%', aspectRatio: 1 },
  calCell: {
    width: '13.2%',
    aspectRatio: 1,
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  calHalf: { position: 'absolute', left: 0, right: 0, height: '50%' },
  calNum: { fontSize: 11, fontWeight: '800' },
  calDetailItem: { paddingVertical: 8, borderTopWidth: 1, marginTop: 8 },
});
