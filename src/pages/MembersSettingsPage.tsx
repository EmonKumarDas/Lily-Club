import React, { useState, useEffect, useMemo } from 'react';
import {
  Users2,
  Settings,
  Shield,
  KeyRound,
  Copy,
  Check,
  RefreshCw,
  UserX,
  UserCheck,
  Building,
  Save,
  AlertTriangle,
  Clock,
  Crown,
  Ban,
  Download,
  Trash2,
  Receipt,
} from 'lucide-react';
import { useAuth, type RoomMember } from '../context/AuthContext.js';
import { useToast } from '../components/Toast.js';
import { Modal } from '../components/Modal.js';
import { SectionLoader } from '../components/Loader.js';
import { ActionButton, useActionGuard, useUnsavedChanges } from '../components/ActionButton.js';
import { EmptyState } from '../components/EmptyState.js';
import { formatDualDate } from '../lib/dateUtils.js';
import { apiRequest, generateIdempotencyKey } from '../lib/api.js';

interface FullMemberInfo extends RoomMember {
  user_name: string;
  user_email: string;
  user_picture: string | null;
  created_at: number;
}

export const MembersSettingsPage: React.FC = () => {
  const { activeRoom, activeMember, refreshAuth, language, t } = useAuth();
  const { showSuccess, showError } = useToast();
  const { runGuarded: runRoleGuard, busy: roleChangeBusy } = useActionGuard();

  const [activeTab, setActiveTab] = useState<'members' | 'settings'>('members');
  const [members, setMembers] = useState<FullMemberInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [pendingRoleMap, setPendingRoleMap] = useState<Record<string, 'STAFF' | 'MANAGER' | 'VIEWER'>>({});

  // Club settings form
  const [clubName, setClubName] = useState('');
  const [clubAddress, setClubAddress] = useState('');
  const [clubPhone, setClubPhone] = useState('');
  const [clubDefaultLang, setClubDefaultLang] = useState<'bn' | 'en'>('bn');
  const [approvalRequired, setApprovalRequired] = useState(true);
  const [allowStaffCosts, setAllowStaffCosts] = useState(false);
  const [dayStartTime, setDayStartTime] = useState('08:00');
  const [dayEndTime, setDayEndTime] = useState('16:00');
  const [nightStartTime, setNightStartTime] = useState('18:00');
  const [nightEndTime, setNightEndTime] = useState('00:00');
  const [bufferEnabled, setBufferEnabled] = useState(false);
  const [bufferMinutes, setBufferMinutes] = useState(60);

  // Modals & Confirmation States
  const [regenModalOpen, setRegenModalOpen] = useState(false);
  const [removeModalOpen, setRemoveModalOpen] = useState(false);
  const [targetMemberToRemove, setTargetMemberToRemove] = useState<FullMemberInfo | null>(null);
  const [suspendModalOpen, setSuspendModalOpen] = useState(false);
  const [targetMemberToSuspend, setTargetMemberToSuspend] = useState<FullMemberInfo | null>(null);
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [targetNewOwner, setTargetNewOwner] = useState<FullMemberInfo | null>(null);
  const [transferConfirmed, setTransferConfirmed] = useState(false);
  const [deleteRoomModalOpen, setDeleteRoomModalOpen] = useState(false);
  const [deleteRoomConfirmText, setDeleteRoomConfirmText] = useState('');

  const [savingSettings, setSavingSettings] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  const isOwner = activeMember?.role === 'OWNER';
  const isManager = activeMember?.role === 'MANAGER';
  const canManageSettings = isOwner || isManager;

  useEffect(() => {
    if (activeRoom) {
      setClubName(activeRoom.name);
      setClubAddress(activeRoom.address);
      setClubPhone(activeRoom.phone);
      setClubDefaultLang(activeRoom.default_language);
      setApprovalRequired(activeRoom.join_approval_required === 1);
      setAllowStaffCosts(Number(activeRoom.allow_staff_costs || 0) === 1);
      setDayStartTime(activeRoom.day_start_time || '08:00');
      setDayEndTime(activeRoom.day_end_time || '16:00');
      setNightStartTime(activeRoom.night_start_time || '18:00');
      setNightEndTime(activeRoom.night_end_time || '00:00');
      setBufferEnabled(activeRoom.buffer_enabled === 1);
      setBufferMinutes(activeRoom.buffer_minutes ?? 60);
      if (canManageSettings) {
        fetchMembers();
      } else {
        setLoading(false);
      }
    }
  }, [activeRoom?.id, canManageSettings]);

  const isSettingsDirty = useMemo(() => {
    if (!activeRoom) return false;
    return (
      clubName !== activeRoom.name ||
      clubAddress !== activeRoom.address ||
      clubPhone !== activeRoom.phone ||
      clubDefaultLang !== activeRoom.default_language ||
      approvalRequired !== (activeRoom.join_approval_required === 1) ||
      allowStaffCosts !== (Number(activeRoom.allow_staff_costs || 0) === 1) ||
      dayStartTime !== (activeRoom.day_start_time || '08:00') ||
      dayEndTime !== (activeRoom.day_end_time || '16:00') ||
      nightStartTime !== (activeRoom.night_start_time || '18:00') ||
      nightEndTime !== (activeRoom.night_end_time || '00:00') ||
      bufferEnabled !== (activeRoom.buffer_enabled === 1) ||
      bufferMinutes !== (activeRoom.buffer_minutes ?? 60)
    );
  }, [
    activeRoom,
    clubName,
    clubAddress,
    clubPhone,
    clubDefaultLang,
    approvalRequired,
    allowStaffCosts,
    dayStartTime,
    dayEndTime,
    nightStartTime,
    nightEndTime,
    bufferEnabled,
    bufferMinutes,
  ]);

  useUnsavedChanges(isSettingsDirty);

  const fetchMembers = async () => {
    if (!activeRoom) return;
    setLoading(true);
    setFetchError(null);
    try {
      const res = await apiRequest<{ members: FullMemberInfo[] }>(
        `/api/rooms/${activeRoom.id}/members`
      );
      setMembers(res.members || []);
    } catch (err: any) {
      const msg =
        language === 'bn'
          ? err.messageBn || 'সদস্যদের তালিকা লোড করতে ব্যর্থ হয়েছে।'
          : err.messageEn || 'Failed to load members.';
      setFetchError(msg);
      showError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleCopyJoinCode = async () => {
    if (!activeRoom?.join_code || !isOwner) return;
    await navigator.clipboard.writeText(activeRoom.join_code);
    setCopiedCode(true);
    showSuccess(language === 'bn' ? 'কপি হয়েছে' : 'Copied');
    setTimeout(() => setCopiedCode(false), 2500);
  };

  const handleRegenerateCode = async () => {
    if (!activeRoom || !isOwner) return;
    try {
      const res = await apiRequest<{ success: boolean; newJoinCode: string; messageBn?: string; messageEn?: string }>(
        `/api/rooms/${activeRoom.id}/regenerate-code`,
        {
          method: 'POST',
          idempotencyKey: generateIdempotencyKey('regen-code'),
        }
      );
      if (res.success) {
        showSuccess(language === 'bn' ? res.messageBn || t('toastCodeRegenerated') : res.messageEn || t('toastCodeRegenerated'));
        setRegenModalOpen(false);
        await refreshAuth();
      }
    } catch (err: any) {
      showError(err.messageBn || err.messageEn || 'Failed to regenerate join code');
    }
  };

  const handleApproveRequest = async (userId: string) => {
    if (!activeRoom || !isOwner) return;
    const assignedRole = pendingRoleMap[userId] || 'STAFF';
    try {
      const res = await apiRequest(`/api/rooms/${activeRoom.id}/requests/${userId}/approve`, {
        method: 'POST',
        idempotencyKey: generateIdempotencyKey('approve-member'),
        body: JSON.stringify({ role: assignedRole }),
      });
      if (res.success) {
        showSuccess(language === 'bn' ? res.messageBn || t('toastRoleUpdated') : res.messageEn || t('toastRoleUpdated'));
        await fetchMembers();
        await refreshAuth();
      }
    } catch (err: any) {
      showError(err.messageBn || err.messageEn || 'Approval failed');
    }
  };

  const handleRejectRequest = async (userId: string) => {
    if (!activeRoom || !isOwner) return;
    try {
      const res = await apiRequest(`/api/rooms/${activeRoom.id}/requests/${userId}/reject`, {
        method: 'POST',
        idempotencyKey: generateIdempotencyKey('reject-member'),
      });
      if (res.success) {
        showSuccess(language === 'bn' ? res.messageBn || 'আবেদন প্রত্যাখ্যান করা হয়েছে।' : res.messageEn || 'Join request rejected');
        await fetchMembers();
      }
    } catch (err: any) {
      showError(err.messageBn || err.messageEn || 'Rejection failed');
    }
  };

  const handleChangeRole = async (userId: string, newRole: string) => {
    if (!activeRoom || !isOwner || newRole === 'OWNER') return;
    await runRoleGuard(async () => {
      try {
        const res = await apiRequest(`/api/rooms/${activeRoom.id}/members/${userId}/role`, {
          method: 'PATCH',
          idempotencyKey: generateIdempotencyKey('role-change'),
          body: JSON.stringify({ role: newRole }),
        });
        if (res.success) {
          showSuccess(t('toastRoleUpdated'));
          await fetchMembers();
          await refreshAuth();
        }
      } catch (err: any) {
        showError(err.messageBn || err.messageEn || 'Failed to update member role');
      }
    });
  };

  const handleSuspendMember = async () => {
    if (!activeRoom || !targetMemberToSuspend || !isOwner) return;
    try {
      const res = await apiRequest(
        `/api/rooms/${activeRoom.id}/members/${targetMemberToSuspend.user_id}/suspend`,
        {
          method: 'POST',
          idempotencyKey: generateIdempotencyKey('suspend-member'),
        }
      );
      if (res.success) {
        showSuccess(language === 'bn' ? res.messageBn : res.messageEn);
        setSuspendModalOpen(false);
        setTargetMemberToSuspend(null);
        await fetchMembers();
        await refreshAuth();
      }
    } catch (err: any) {
      showError(err.messageBn || err.messageEn || 'Failed to suspend member');
    }
  };

  const handleRemoveMember = async () => {
    if (!activeRoom || !targetMemberToRemove || !isOwner) return;
    try {
      const res = await apiRequest(
        `/api/rooms/${activeRoom.id}/members/${targetMemberToRemove.user_id}`,
        {
          method: 'DELETE',
          idempotencyKey: generateIdempotencyKey('remove-member'),
        }
      );
      if (res.success) {
        showSuccess(t('toastMemberRemoved'));
        setRemoveModalOpen(false);
        setTargetMemberToRemove(null);
        await fetchMembers();
        await refreshAuth();
      }
    } catch (err: any) {
      showError(err.messageBn || err.messageEn || 'Failed to remove member');
    }
  };

  const handleTransferOwnership = async () => {
    if (!activeRoom || !targetNewOwner || !isOwner || !transferConfirmed) return;
    try {
      const res = await apiRequest(`/api/rooms/${activeRoom.id}/transfer-ownership`, {
        method: 'POST',
        idempotencyKey: generateIdempotencyKey('transfer-owner'),
        body: JSON.stringify({
          newOwnerUserId: targetNewOwner.user_id,
          confirm: true,
        }),
      });
      if (res.success) {
        showSuccess(language === 'bn' ? res.messageBn : res.messageEn);
        setTransferModalOpen(false);
        setTargetNewOwner(null);
        setTransferConfirmed(false);
        await refreshAuth();
        await fetchMembers();
      }
    } catch (err: any) {
      showError(err.messageBn || err.messageEn || 'Failed to transfer ownership');
    }
  };

  const handleExportRoomData = async () => {
    if (!activeRoom || !isOwner) return;
    try {
      const response = await fetch(`/api/rooms/${activeRoom.id}/export-data`, {
        credentials: 'include',
        headers: { 'X-Client-Version': '1.0.0' },
      });
      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(
          (language === 'bn' ? errJson.messageBn : errJson.messageEn) || 'Export failed'
        );
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `lilycc-room-backup-${activeRoom.id.slice(0, 8)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showSuccess(
        language === 'bn'
          ? 'রুমের সম্পূর্ণ ব্যাকআপ (JSON) ডাউনলোড হয়েছে।'
          : 'Full room data backup downloaded.'
      );
    } catch (err: any) {
      showError(err.message || 'Failed to export room data');
    }
  };

  const handleSoftDeleteRoom = async () => {
    if (!activeRoom || !isOwner) return;
    if (deleteRoomConfirmText.trim() !== activeRoom.name.trim()) {
      showError(
        language === 'bn'
          ? 'নিশ্চিত করতে রুমের সঠিক নামটি হুবহু লিখুন।'
          : 'Please type the exact room name to confirm deletion.'
      );
      return;
    }
    try {
      const res = await apiRequest(`/api/rooms/${activeRoom.id}`, {
        method: 'DELETE',
        idempotencyKey: generateIdempotencyKey('delete-room'),
      });
      if (res.success) {
        showSuccess(language === 'bn' ? res.messageBn : res.messageEn);
        setDeleteRoomModalOpen(false);
        await refreshAuth();
      }
    } catch (err: any) {
      showError(err.messageBn || err.messageEn || 'Failed to delete room');
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeRoom || savingSettings) return;
    setSavingSettings(true);
    try {
      const res = await apiRequest(`/api/rooms/${activeRoom.id}/settings`, {
        method: 'PATCH',
        idempotencyKey: generateIdempotencyKey('save-settings'),
        body: JSON.stringify({
          name: clubName.trim(),
          address: clubAddress.trim(),
          phone: clubPhone.trim(),
          default_language: clubDefaultLang,
          join_approval_required: approvalRequired,
          allow_staff_costs: allowStaffCosts,
          day_start_time: dayStartTime,
          day_end_time: dayEndTime,
          night_start_time: nightStartTime,
          night_end_time: nightEndTime,
          buffer_enabled: bufferEnabled,
          buffer_minutes: Number(bufferMinutes) || 0,
        }),
      });
      if (res.success) {
        showSuccess(t('toastSettingsUpdated'));
        await refreshAuth();
      }
    } catch (err: any) {
      showError(err.messageBn || err.messageEn || 'Failed to update room settings');
    } finally {
      setSavingSettings(false);
    }
  };

  if (!canManageSettings) {
    return (
      <div className="p-8 max-w-xl mx-auto">
        <EmptyState
          icon={Shield}
          title={t('roleDesc_OWNER')}
          description={
            language === 'bn'
              ? 'সদস্য ও সেটিংস পাতাটি শুধুমাত্র ওনার ও ম্যানেজারের জন্য সংরক্ষিত।'
              : 'Access to Members & Settings is restricted to the Owner and Manager of this room.'
          }
        />
      </div>
    );
  }

  const pendingMembers = members.filter((m) => m.status === 'PENDING');
  const activeMembers = members.filter((m) => m.status === 'ACTIVE');

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-8 space-y-8">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-stone-200 dark:border-stone-800 pb-5">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-stone-900 dark:text-stone-100 flex items-center gap-2.5">
            <Settings className="w-6 h-6 text-[#4A2545] dark:text-[#C5A059]" />
            <span>{t('membersSettingsTitle')}</span>
          </h1>
          <p className="text-xs sm:text-sm text-stone-500 dark:text-stone-400 mt-1">
            {t('membersSettingsSubtitle')}
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex p-1 bg-stone-100 dark:bg-stone-800/80 rounded-2xl border border-stone-200 dark:border-stone-700/80">
          <button
            type="button"
            onClick={() => setActiveTab('members')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
              activeTab === 'members'
                ? 'bg-white dark:bg-[#1D1820] text-[#4A2545] dark:text-[#C5A059] shadow-xs'
                : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100'
            }`}
          >
            <Users2 className="w-4 h-4" />
            <span>{t('tabMembers')}</span>
            {isOwner && pendingMembers.length > 0 && (
              <span className="w-5 h-5 rounded-full bg-amber-500 text-white text-[10px] flex items-center justify-center font-bold">
                {pendingMembers.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('settings')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
              activeTab === 'settings'
                ? 'bg-white dark:bg-[#1D1820] text-[#4A2545] dark:text-[#C5A059] shadow-xs'
                : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100'
            }`}
          >
            <Building className="w-4 h-4" />
            <span>{t('tabClubSettings')}</span>
          </button>
        </div>
      </div>

      {/* Tab 1: Members & Approvals */}
      {activeTab === 'members' && (
        <SectionLoader
          loading={loading}
          error={fetchError}
          onRetry={fetchMembers}
          language={language}
          labelBn="সদস্যদের তথ্য লোড হচ্ছে..."
          labelEn="Loading room members..."
        >
          <div className="space-y-8">
            {/* Section: Pending Requests (Owner approval only — OWNER role can never be assigned here) */}
            {isOwner && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-base sm:text-lg font-bold text-stone-900 dark:text-stone-100 flex items-center gap-2">
                    <Clock className="w-5 h-5 text-amber-500" />
                    <span>{t('pendingRequestsSection')}</span>
                    {pendingMembers.length > 0 && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 font-mono">
                        {pendingMembers.length}
                      </span>
                    )}
                  </h2>
                </div>

                {pendingMembers.length === 0 ? (
                  <div className="p-6 text-center text-xs sm:text-sm text-stone-500 bg-stone-50 dark:bg-stone-900/30 border border-dashed border-stone-200 dark:border-stone-800 rounded-2xl">
                    {t('noPendingRequests')}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {pendingMembers.map((m) => (
                      <div
                        key={m.id}
                        className="p-4 rounded-2xl bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/60 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                      >
                        <div className="flex items-center gap-3">
                          {m.user_picture ? (
                            <img
                              src={m.user_picture}
                              alt={m.user_name}
                              className="w-10 h-10 rounded-full object-cover ring-2 ring-amber-300 dark:ring-amber-800"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-full bg-amber-600 text-white flex items-center justify-center font-bold text-sm">
                              {m.user_name?.charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div>
                            <h4 className="text-sm font-bold text-stone-900 dark:text-stone-100">
                              {m.user_name}
                            </h4>
                            <p className="text-xs text-stone-500 dark:text-stone-400">{m.user_email}</p>
                            <p className="text-[11px] text-amber-700 dark:text-amber-300 mt-0.5">
                              {formatDualDate(m.created_at, { includeTime: true })}
                            </p>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 self-end sm:self-center">
                          <select
                            aria-label="Assign role"
                            value={pendingRoleMap[m.user_id] || 'STAFF'}
                            onChange={(e) =>
                              setPendingRoleMap((prev) => ({
                                ...prev,
                                [m.user_id]: e.target.value as 'STAFF' | 'MANAGER' | 'VIEWER',
                              }))
                            }
                            className="px-3 py-2 min-h-[40px] rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-xs font-semibold text-stone-800 dark:text-stone-200"
                          >
                            <option value="STAFF">{t('role_STAFF')}</option>
                            <option value="MANAGER">{t('role_MANAGER')}</option>
                            <option value="VIEWER">{t('role_VIEWER')}</option>
                          </select>

                          <ActionButton
                            onClick={() => handleApproveRequest(m.user_id)}
                            icon={<UserCheck className="w-3.5 h-3.5" />}
                            className="!bg-[#0E8A44] hover:!bg-[#0B7137] !border-[#0E8A44] !px-3.5 !py-2 !min-h-[40px] !text-xs"
                          >
                            {t('approveBtn')}
                          </ActionButton>

                          <ActionButton
                            variant="danger"
                            onClick={() => handleRejectRequest(m.user_id)}
                            icon={<UserX className="w-3.5 h-3.5" />}
                            className="!px-3.5 !py-2 !min-h-[40px] !text-xs"
                          >
                            {t('rejectBtn')}
                          </ActionButton>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Section: Active Members Table */}
            <div className="space-y-4">
              <h2 className="text-base sm:text-lg font-bold text-stone-900 dark:text-stone-100 flex items-center gap-2">
                <Users2 className="w-5 h-5 text-[#4A2545] dark:text-[#C5A059]" />
                <span>{t('activeMembersSection')}</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300 font-mono">
                  {activeMembers.length}
                </span>
              </h2>

              <div className="bg-white dark:bg-[#1D1820] border border-stone-200 dark:border-stone-800 rounded-2xl overflow-hidden shadow-xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs sm:text-sm">
                    <thead className="bg-stone-50 dark:bg-stone-900/60 border-b border-stone-200 dark:border-stone-800 text-[11px] font-bold text-stone-500 uppercase tracking-wider">
                      <tr>
                        <th className="px-5 py-3.5">সদস্য / Member</th>
                        <th className="px-5 py-3.5">পদবি / Role</th>
                        <th className="px-5 py-3.5">যুক্ত হওয়ার তারিখ / Joined</th>
                        {isOwner && <th className="px-5 py-3.5 text-right">পদক্ষেপ / Actions</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100 dark:divide-stone-800/80">
                      {activeMembers.map((m) => {
                        const isThisUser = m.user_id === activeMember?.user_id;
                        const isRowOwner = m.role === 'OWNER';
                        return (
                          <tr
                            key={m.id}
                            className="hover:bg-stone-50/50 dark:hover:bg-stone-900/40 transition-colors"
                          >
                            <td className="px-5 py-4">
                              <div className="flex items-center gap-3">
                                {m.user_picture ? (
                                  <img
                                    src={m.user_picture}
                                    alt={m.user_name}
                                    className="w-9 h-9 rounded-full object-cover ring-1 ring-stone-200"
                                  />
                                ) : (
                                  <div className="w-9 h-9 rounded-full bg-[#4A2545] text-[#C5A059] flex items-center justify-center font-bold text-xs">
                                    {m.user_name?.charAt(0).toUpperCase()}
                                  </div>
                                )}
                                <div className="min-w-0">
                                  <p className="font-bold text-stone-900 dark:text-stone-100 truncate">
                                    {m.user_name}{' '}
                                    {isThisUser && (
                                      <span className="text-[10px] text-stone-400">(You)</span>
                                    )}
                                  </p>
                                  <p className="text-xs text-stone-500 dark:text-stone-400 truncate">
                                    {m.user_email}
                                  </p>
                                </div>
                              </div>
                            </td>

                            <td className="px-5 py-4">
                              {isRowOwner || !isOwner ? (
                                <span
                                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${
                                    isRowOwner
                                      ? 'bg-[#C5A059]/20 text-[#4A2545] dark:text-[#C5A059]'
                                      : 'bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300'
                                  }`}
                                >
                                  {isRowOwner && <Crown className="w-3.5 h-3.5" />}
                                  <span>{t(`role_${m.role}` as any)}</span>
                                </span>
                              ) : (
                                <select
                                  value={m.role}
                                  disabled={roleChangeBusy}
                                  onChange={(e) => handleChangeRole(m.user_id, e.target.value)}
                                  className="px-2.5 py-1.5 rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-xs font-semibold text-stone-800 dark:text-stone-200 disabled:opacity-50"
                                >
                                  <option value="MANAGER">{t('role_MANAGER')}</option>
                                  <option value="STAFF">{t('role_STAFF')}</option>
                                  <option value="VIEWER">{t('role_VIEWER')}</option>
                                </select>
                              )}
                            </td>

                            <td className="px-5 py-4 text-xs text-stone-500 dark:text-stone-400">
                              {formatDualDate(m.created_at)}
                            </td>

                            {isOwner && (
                              <td className="px-5 py-4 text-right">
                                {!isRowOwner && (
                                  <div className="inline-flex flex-wrap items-center justify-end gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setTargetNewOwner(m);
                                        setTransferConfirmed(false);
                                        setTransferModalOpen(true);
                                      }}
                                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-[#4A2545] dark:text-[#C5A059] hover:bg-[#4A2545]/10 rounded-lg transition-colors cursor-pointer"
                                      title={language === 'bn' ? 'মালিকানা হস্তান্তর' : 'Transfer Ownership'}
                                    >
                                      <Crown className="w-3.5 h-3.5" />
                                      <span>
                                        {language === 'bn' ? 'মালিকানা দিন' : 'Make Owner'}
                                      </span>
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => {
                                        setTargetMemberToSuspend(m);
                                        setSuspendModalOpen(true);
                                      }}
                                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/50 rounded-lg transition-colors cursor-pointer"
                                    >
                                      <Ban className="w-3.5 h-3.5" />
                                      <span>{language === 'bn' ? 'স্থগিত' : 'Suspend'}</span>
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => {
                                        setTargetMemberToRemove(m);
                                        setRemoveModalOpen(true);
                                      }}
                                      className="px-2.5 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-lg transition-colors cursor-pointer"
                                    >
                                      {t('removeMemberBtn')}
                                    </button>
                                  </div>
                                )}
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </SectionLoader>
      )}

      {/* Tab 2: Club & Room Settings */}
      {activeTab === 'settings' && activeRoom && (
        <div className="space-y-8">
          {/* Owner-ONLY Room ID Management Card (Strictly hidden from Managers, Staff, Viewers & logs!) */}
          {isOwner && activeRoom.join_code && (
            <div className="p-6 rounded-3xl bg-gradient-to-br from-white to-[#FAF4F0] dark:from-[#1D1820] dark:to-[#151118] border border-stone-200 dark:border-stone-800 shadow-md space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h3 className="text-base font-bold text-stone-900 dark:text-stone-100 flex items-center gap-2">
                    <KeyRound className="w-5 h-5 text-[#4A2545] dark:text-[#C5A059]" />
                    <span>{t('roomJoinCodeCardTitle')}</span>
                  </h3>
                  <p className="text-xs text-stone-500 dark:text-stone-400 mt-1">
                    {t('roomJoinCodeCardDesc')}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="px-4 py-2 rounded-2xl bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 font-mono text-lg font-extrabold tracking-widest text-[#4A2545] dark:text-[#C5A059] shadow-inner select-all">
                    {activeRoom.join_code}
                  </div>

                  <ActionButton
                    variant="secondary"
                    onClick={handleCopyJoinCode}
                    icon={
                      copiedCode ? (
                        <Check className="w-4 h-4 text-[#0E8A44]" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )
                    }
                  >
                    {copiedCode
                      ? language === 'bn'
                        ? 'কপি হয়েছে'
                        : 'Copied'
                      : language === 'bn'
                      ? 'কপি করুন'
                      : 'Copy'}
                  </ActionButton>

                  <ActionButton
                    variant="gold"
                    onClick={() => setRegenModalOpen(true)}
                    icon={<RefreshCw className="w-4 h-4" />}
                  >
                    {t('regenerateCodeBtn')}
                  </ActionButton>
                </div>
              </div>
            </div>
          )}

          {/* Club Info & Policies Form */}
          <form
            onSubmit={handleSaveSettings}
            className="p-6 sm:p-8 rounded-3xl bg-white dark:bg-[#1D1820] border border-stone-200 dark:border-stone-800 shadow-md space-y-6"
          >
            <h3 className="text-base font-bold text-stone-900 dark:text-stone-100 border-b border-stone-100 dark:border-stone-800 pb-3">
              সেন্টার তথ্য ও নীতিমালা / Club Info & Policies
            </h3>

            {/* Owner-only Policies: Join Mode + Staff Cost Permission */}
            {isOwner && (
              <div className="space-y-5">
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-stone-700 dark:text-stone-300">
                    {t('joinApprovalModeLabel')}
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setApprovalRequired(true)}
                      className={`p-4 rounded-2xl border-2 text-left cursor-pointer transition-all ${
                        approvalRequired
                          ? 'border-[#4A2545] dark:border-[#C5A059] bg-[#4A2545]/5 dark:bg-[#C5A059]/10'
                          : 'border-stone-200 dark:border-stone-800 hover:border-stone-300'
                      }`}
                    >
                      <div className="flex items-center gap-2 font-bold text-xs sm:text-sm text-stone-900 dark:text-stone-100">
                        <Shield className="w-4 h-4 text-[#4A2545] dark:text-[#C5A059]" />
                        <span>{t('approvalRequiredOption')}</span>
                      </div>
                      <p className="text-[11px] text-stone-500 mt-1 leading-relaxed">
                        {language === 'bn'
                          ? 'স্টাফ বা ম্যানেজার রুম আইডি দিলে একটি অপেক্ষমান আবেদন তৈরি হবে যা ওনার অনুমোদন করবেন।'
                          : 'Entering the Room ID creates a pending request until the Owner approves and assigns a role.'}
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setApprovalRequired(false)}
                      className={`p-4 rounded-2xl border-2 text-left cursor-pointer transition-all ${
                        !approvalRequired
                          ? 'border-[#0E8A44] dark:border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20'
                          : 'border-stone-200 dark:border-stone-800 hover:border-stone-300'
                      }`}
                    >
                      <div className="flex items-center gap-2 font-bold text-xs sm:text-sm text-stone-900 dark:text-stone-100">
                        <UserCheck className="w-4 h-4 text-[#0E8A44]" />
                        <span>{t('directJoinOption')}</span>
                      </div>
                      <p className="text-[11px] text-stone-500 mt-1 leading-relaxed">
                        {language === 'bn'
                          ? 'রুম আইডি জানা স্টাফ সদস্য কোড দিয়ে সাথে সাথে Staff হিসেবে যুক্ত হতে পারবেন।'
                          : 'Staff with the valid Room ID join directly as Staff.'}
                      </p>
                    </button>
                  </div>
                </div>

                {/* Staff Cost Entry Toggle (Section 6 — default OFF) */}
                <div className="p-4 rounded-2xl bg-[#FAF4F0]/70 dark:bg-stone-900/60 border border-stone-200 dark:border-stone-800 flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-xs sm:text-sm font-bold text-stone-900 dark:text-stone-100">
                      <Receipt className="w-4 h-4 text-[#4A2545] dark:text-[#C5A059]" />
                      <span>
                        {language === 'bn'
                          ? 'স্টাফদের খরচ (Cost) যোগ করার অনুমতি দিন'
                          : 'Allow Staff to add costs'}
                      </span>
                    </div>
                    <p className="text-[11px] text-stone-500 dark:text-stone-400 leading-relaxed">
                      {language === 'bn'
                        ? 'ডিফল্টভাবে বন্ধ থাকে। চালু করলে স্টাফ সদস্যরা হোম পেজের "খরচ" বাটন থেকে নতুন খরচ এন্ট্রি করতে পারবেন (কিন্তু মোট আয় বা ব্যয়ের হিসাব দেখতে পাবেন না)।'
                        : 'Off by default. When enabled, Staff see the Home "Cost" button to submit daily costs without viewing financial reports.'}
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    aria-label="Allow Staff to add costs"
                    checked={allowStaffCosts}
                    onChange={(e) => setAllowStaffCosts(e.target.checked)}
                    className="w-5 h-5 mt-1 rounded accent-[#4A2545] cursor-pointer shrink-0"
                  />
                </div>

                {/* Club Fields */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 mb-1">
                      {t('roomNameLabel')} *
                    </label>
                    <input
                      type="text"
                      required
                      value={clubName}
                      onChange={(e) => setClubName(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-xs sm:text-sm text-stone-900 dark:text-stone-100"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 mb-1">
                      {t('roomPhoneLabel')} *
                    </label>
                    <input
                      type="text"
                      required
                      value={clubPhone}
                      onChange={(e) => setClubPhone(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-xs sm:text-sm text-stone-900 dark:text-stone-100"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 mb-1">
                      {t('roomAddressLabel')} *
                    </label>
                    <input
                      type="text"
                      required
                      value={clubAddress}
                      onChange={(e) => setClubAddress(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-xs sm:text-sm text-stone-900 dark:text-stone-100"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 mb-1">
                      {t('roomDefaultLangLabel')}
                    </label>
                    <select
                      value={clubDefaultLang}
                      onChange={(e) => setClubDefaultLang(e.target.value as 'bn' | 'en')}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-xs sm:text-sm text-stone-900 dark:text-stone-100"
                    >
                      <option value="bn">বাংলা (বাং)</option>
                      <option value="en">English (EN)</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* Day / Night Slot Timing & Buffer Configuration (Owner & Manager) */}
            <div className="pt-4 border-t border-stone-100 dark:border-stone-800 space-y-4">
              <div>
                <h4 className="text-sm font-bold text-stone-900 dark:text-stone-100 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-[#4A2545] dark:text-[#C5A059]" />
                  <span>
                    {language === 'bn'
                      ? 'দিন ও রাত (Day / Night) স্লট সময়সূচি ও বাফার সেটিংস'
                      : 'Day & Night Slot Timing & Buffer Configuration'}
                  </span>
                </h4>
                <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
                  {language === 'bn'
                    ? 'ডিফল্ট: দিন ৮:০০ পূর্বাহ্ন – ৪:০০ অপরাহ্ন, রাত ৬:০০ অপরাহ্ন – ১২:০০ মধ্যরাত (বা মধ্যরাত পরবর্তী সময়)।'
                    : 'Default: Day 8:00 AM to 4:00 PM, Night 6:00 PM to 12:00 AM (or after midnight).'}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 rounded-2xl bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50 space-y-3">
                  <div className="text-xs font-bold text-amber-900 dark:text-amber-300">
                    ☀️ {language === 'bn' ? 'দিন (Day) স্লটের ডিফল্ট সময়' : 'Day Slot Default Timing'}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] font-semibold text-stone-600 dark:text-stone-400 mb-1">
                        {language === 'bn' ? 'শুরু' : 'Start Time'}
                      </label>
                      <input
                        type="time"
                        value={dayStartTime}
                        onChange={(e) => setDayStartTime(e.target.value)}
                        className="w-full px-2.5 py-2 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-xs font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-stone-600 dark:text-stone-400 mb-1">
                        {language === 'bn' ? 'শেষ' : 'End Time'}
                      </label>
                      <input
                        type="time"
                        value={dayEndTime}
                        onChange={(e) => setDayEndTime(e.target.value)}
                        className="w-full px-2.5 py-2 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-xs font-mono"
                      />
                    </div>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-900/50 space-y-3">
                  <div className="text-xs font-bold text-indigo-900 dark:text-indigo-300">
                    🌙 {language === 'bn' ? 'রাত (Night) স্লটের ডিফল্ট সময়' : 'Night Slot Default Timing'}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] font-semibold text-stone-600 dark:text-stone-400 mb-1">
                        {language === 'bn' ? 'শুরু' : 'Start Time'}
                      </label>
                      <input
                        type="time"
                        value={nightStartTime}
                        onChange={(e) => setNightStartTime(e.target.value)}
                        className="w-full px-2.5 py-2 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-xs font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-stone-600 dark:text-stone-400 mb-1">
                        {language === 'bn' ? 'শেষ (মধ্যরাতের পরেও বৈধ)' : 'End Time (After midnight valid)'}
                      </label>
                      <input
                        type="time"
                        value={nightEndTime}
                        onChange={(e) => setNightEndTime(e.target.value)}
                        className="w-full px-2.5 py-2 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-xs font-mono"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Optional Buffer Time between Day and Night */}
              <div className="p-4 rounded-2xl bg-stone-50 dark:bg-stone-900/60 border border-stone-200 dark:border-stone-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={bufferEnabled}
                      onChange={(e) => setBufferEnabled(e.target.checked)}
                      className="w-4 h-4 rounded accent-[#4A2545]"
                    />
                    <span className="text-xs sm:text-sm font-bold text-stone-900 dark:text-stone-100">
                      {language === 'bn'
                        ? 'দিন ও রাতের স্লটের মাঝে পরিষ্কার ও প্রস্তুতির বাফার সময় চালু করুন'
                        : 'Enable Buffer Time Between Day and Night Slots (for cleaning & setup)'}
                    </span>
                  </label>
                  <p className="text-[11px] text-stone-500 dark:text-stone-400">
                    {language === 'bn'
                      ? 'চালু থাকলে একই দিনে দিন ও রাতের বুকিংয়ের মাঝে নির্ধারিত বিরতি না থাকলে সিস্টেম বাধা দেবে।'
                      : 'When enabled, the system blocks bookings that violate the cleaning buffer between Day and Night on the same date.'}
                  </p>
                </div>

                {bufferEnabled && (
                  <div className="flex items-center gap-2 shrink-0">
                    <input
                      type="number"
                      min={15}
                      max={360}
                      step={15}
                      value={bufferMinutes}
                      onChange={(e) => setBufferMinutes(parseInt(e.target.value, 10) || 60)}
                      className="w-20 px-2.5 py-1.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-xs font-bold text-center"
                    />
                    <span className="text-xs font-semibold text-stone-600 dark:text-stone-400">
                      {language === 'bn' ? 'মিনিট' : 'minutes'}
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end pt-4 border-t border-stone-100 dark:border-stone-800">
              <ActionButton
                type="submit"
                loading={savingSettings}
                loadingLabel={t('saving')}
                icon={<Save className="w-4 h-4" />}
              >
                {t('save')}
              </ActionButton>
            </div>
          </form>

          {/* Owner Data Backup & Room Deletion Card (Section 9) */}
          {isOwner && (
            <div className="p-6 rounded-3xl bg-white dark:bg-[#1D1820] border border-stone-200 dark:border-stone-800 shadow-xs space-y-5">
              <div>
                <h3 className="text-base font-bold text-stone-900 dark:text-stone-100 flex items-center gap-2">
                  <Shield className="w-5 h-5 text-[#4A2545] dark:text-[#C5A059]" />
                  <span>
                    {language === 'bn'
                      ? 'ডেটা ব্যাকআপ ও রুম ব্যবস্থাপনা'
                      : 'Room Data Backup & Lifecycle'}
                  </span>
                </h3>
                <p className="text-xs text-stone-500 dark:text-stone-400 mt-1">
                  {language === 'bn'
                    ? 'ওনার যেকোনো সময় রুমের সম্পূর্ণ তথ্য এক্সপোর্ট করতে বা রুম মুছে ফেলতে পারেন।'
                    : 'As Owner, you can export a complete portable backup of this room or permanently close it.'}
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-stone-100 dark:border-stone-800">
                <ActionButton
                  variant="secondary"
                  onClick={handleExportRoomData}
                  icon={<Download className="w-4 h-4" />}
                >
                  {language === 'bn' ? 'রুমের সম্পূর্ণ ডেটা ডাউনলোড (JSON)' : 'Export All Room Data (JSON)'}
                </ActionButton>

                <ActionButton
                  variant="danger"
                  onClick={() => {
                    setDeleteRoomConfirmText('');
                    setDeleteRoomModalOpen(true);
                  }}
                  icon={<Trash2 className="w-4 h-4" />}
                >
                  {language === 'bn' ? 'রুম মুছে ফেলুন' : 'Delete Room'}
                </ActionButton>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Confirmation Modal for Code Regeneration */}
      <Modal
        isOpen={regenModalOpen}
        onClose={() => setRegenModalOpen(false)}
        title={t('regenerateCodeBtn')}
        maxWidth="sm"
      >
        <div className="space-y-4">
          <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl flex items-start gap-2.5 text-amber-800 dark:text-amber-300">
            <AlertTriangle className="w-5 h-5 shrink-0 text-amber-600 mt-0.5" />
            <p className="text-xs leading-relaxed">{t('regenerateCodeConfirm')}</p>
          </div>
          <div className="flex items-center justify-end gap-3 pt-3">
            <button
              type="button"
              onClick={() => setRegenModalOpen(false)}
              className="px-4 py-2 text-xs font-semibold text-stone-600 dark:text-stone-400 hover:bg-stone-100 rounded-xl"
            >
              {t('cancel')}
            </button>
            <ActionButton
              variant="gold"
              onClick={handleRegenerateCode}
              icon={<RefreshCw className="w-4 h-4" />}
            >
              {t('regenerateCodeBtn')}
            </ActionButton>
          </div>
        </div>
      </Modal>

      {/* Confirmation Modal for Suspending Member */}
      <Modal
        isOpen={suspendModalOpen}
        onClose={() => setSuspendModalOpen(false)}
        title={language === 'bn' ? 'সদস্য স্থগিত করুন (Suspend Member)' : 'Suspend Member'}
        maxWidth="sm"
      >
        <div className="space-y-4">
          <p className="text-xs sm:text-sm text-stone-600 dark:text-stone-300 leading-relaxed">
            {language === 'bn'
              ? 'স্থগিত করলে এই সদস্যের সকল চলমান সেশন তাৎক্ষণিকভাবে বিচ্ছিন্ন হবে এবং রুমের তথ্যে প্রবেশাধিকার বন্ধ হয়ে যাবে।'
              : 'Suspending this member immediately revokes their room access and disconnects any open sessions.'}
          </p>
          {targetMemberToSuspend && (
            <div className="p-3 rounded-xl bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-800 text-xs">
              <span className="font-bold">{targetMemberToSuspend.user_name}</span> (
              {targetMemberToSuspend.user_email})
            </div>
          )}
          <div className="flex items-center justify-end gap-3 pt-3">
            <button
              type="button"
              onClick={() => setSuspendModalOpen(false)}
              className="px-4 py-2 text-xs font-semibold text-stone-600 dark:text-stone-400"
            >
              {t('cancel')}
            </button>
            <ActionButton
              variant="danger"
              onClick={handleSuspendMember}
              icon={<Ban className="w-4 h-4" />}
            >
              {language === 'bn' ? 'স্থগিত নিশ্চিত করুন' : 'Confirm Suspend'}
            </ActionButton>
          </div>
        </div>
      </Modal>

      {/* Confirmation Modal for Removing Member */}
      <Modal
        isOpen={removeModalOpen}
        onClose={() => setRemoveModalOpen(false)}
        title={t('removeMemberBtn')}
        maxWidth="sm"
      >
        <div className="space-y-4">
          <p className="text-xs sm:text-sm text-stone-600 dark:text-stone-300 leading-relaxed">
            {t('removeMemberConfirm')}
          </p>
          {targetMemberToRemove && (
            <div className="p-3 rounded-xl bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-800 text-xs">
              <span className="font-bold">{targetMemberToRemove.user_name}</span> (
              {targetMemberToRemove.user_email})
            </div>
          )}
          <div className="flex items-center justify-end gap-3 pt-3">
            <button
              type="button"
              onClick={() => setRemoveModalOpen(false)}
              className="px-4 py-2 text-xs font-semibold text-stone-600 dark:text-stone-400"
            >
              {t('cancel')}
            </button>
            <ActionButton variant="danger" onClick={handleRemoveMember}>
              {t('removeMemberBtn')}
            </ActionButton>
          </div>
        </div>
      </Modal>

      {/* Confirmation Modal for Transferring Ownership */}
      <Modal
        isOpen={transferModalOpen}
        onClose={() => setTransferModalOpen(false)}
        title={language === 'bn' ? 'মালিকানা হস্তান্তর নিশ্চিতকরণ' : 'Transfer Room Ownership'}
        maxWidth="sm"
      >
        <div className="space-y-4">
          <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 text-xs text-amber-900 dark:text-amber-200 leading-relaxed">
            {language === 'bn'
              ? 'মালিকানা হস্তান্তর করলে নির্বাচিত সদস্য এই রুমের নতুন Owner হবেন এবং আপনার পদবি স্বয়ংক্রিয়ভাবে Manager হয়ে যাবে।'
              : 'Transferring ownership makes the selected member the sole Owner of this room, and transitions your role to Manager.'}
          </div>

          {targetNewOwner && (
            <div className="p-3 rounded-xl bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-800 text-xs">
              <div className="font-bold text-stone-900 dark:text-stone-100">
                {targetNewOwner.user_name}
              </div>
              <div className="text-stone-500">{targetNewOwner.user_email}</div>
            </div>
          )}

          <label className="flex items-center gap-2 text-xs font-bold text-stone-800 dark:text-stone-200 cursor-pointer">
            <input
              type="checkbox"
              checked={transferConfirmed}
              onChange={(e) => setTransferConfirmed(e.target.checked)}
              className="w-4 h-4 rounded accent-[#4A2545]"
            />
            <span>
              {language === 'bn'
                ? 'আমি বুঝেছি এবং মালিকানা হস্তান্তর নিশ্চিত করছি'
                : 'I understand and confirm transferring room ownership'}
            </span>
          </label>

          <div className="flex items-center justify-end gap-3 pt-3">
            <button
              type="button"
              onClick={() => setTransferModalOpen(false)}
              className="px-4 py-2 text-xs font-semibold text-stone-600 dark:text-stone-400"
            >
              {t('cancel')}
            </button>
            <ActionButton
              disabled={!transferConfirmed}
              onClick={handleTransferOwnership}
              icon={<Crown className="w-4 h-4" />}
            >
              {language === 'bn' ? 'মালিকানা হস্তান্তর করুন' : 'Confirm Transfer'}
            </ActionButton>
          </div>
        </div>
      </Modal>

      {/* Confirmation Modal for Deleting Room */}
      <Modal
        isOpen={deleteRoomModalOpen}
        onClose={() => setDeleteRoomModalOpen(false)}
        title={language === 'bn' ? 'রুম মুছে ফেলুন (Delete Room)' : 'Delete Room'}
        maxWidth="sm"
      >
        <div className="space-y-4">
          <div className="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 text-xs text-rose-900 dark:text-rose-200 leading-relaxed">
            {language === 'bn'
              ? `নিশ্চিত করতে নিচে রুমের নাম "${activeRoom?.name}" হুবহু লিখুন। সকল সদস্যের সেশন সাথে সাথে বন্ধ হয়ে যাবে।`
              : `Type "${activeRoom?.name}" below to confirm closing this room and disconnecting all member sessions.`}
          </div>

          <input
            type="text"
            value={deleteRoomConfirmText}
            onChange={(e) => setDeleteRoomConfirmText(e.target.value)}
            placeholder={activeRoom?.name || ''}
            className="w-full px-3.5 py-2.5 rounded-xl border border-rose-300 dark:border-rose-700 bg-white dark:bg-stone-900 text-xs font-bold"
          />

          <div className="flex items-center justify-end gap-3 pt-3">
            <button
              type="button"
              onClick={() => setDeleteRoomModalOpen(false)}
              className="px-4 py-2 text-xs font-semibold text-stone-600 dark:text-stone-400"
            >
              {t('cancel')}
            </button>
            <ActionButton
              variant="danger"
              disabled={deleteRoomConfirmText.trim() !== (activeRoom?.name || '').trim()}
              onClick={handleSoftDeleteRoom}
              icon={<Trash2 className="w-4 h-4" />}
            >
              {language === 'bn' ? 'রুম মুছে ফেলুন' : 'Confirm Delete Room'}
            </ActionButton>
          </div>
        </div>
      </Modal>
    </div>
  );
};
