import React, { useState, useEffect } from 'react';
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
  Phone,
  MapPin,
} from 'lucide-react';
import { useAuth, type RoomMember } from '../context/AuthContext.js';
import { useToast } from '../components/Toast.js';
import { Modal } from '../components/Modal.js';
import { LoadingSkeleton } from '../components/LoadingSkeleton.js';
import { EmptyState } from '../components/EmptyState.js';
import { formatDualDate } from '../lib/dateUtils.js';
import { apiRequest } from '../lib/api.js';

interface FullMemberInfo extends RoomMember {
  user_name: string;
  user_email: string;
  user_picture: string | null;
  created_at: number;
}

export const MembersSettingsPage: React.FC = () => {
  const { activeRoom, activeMember, refreshAuth, language, t } = useAuth();
  const { showSuccess, showError } = useToast();

  const [activeTab, setActiveTab] = useState<'members' | 'settings'>('members');
  const [members, setMembers] = useState<FullMemberInfo[]>([]);
  const [loading, setLoading] = useState(true);

  // Club settings form
  const [clubName, setClubName] = useState('');
  const [clubAddress, setClubAddress] = useState('');
  const [clubPhone, setClubPhone] = useState('');
  const [clubDefaultLang, setClubDefaultLang] = useState<'bn' | 'en'>('bn');
  const [approvalRequired, setApprovalRequired] = useState(true);
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
  const [savingSettings, setSavingSettings] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  // Verification: Owner or Manager
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
      setDayStartTime(activeRoom.day_start_time || '08:00');
      setDayEndTime(activeRoom.day_end_time || '16:00');
      setNightStartTime(activeRoom.night_start_time || '18:00');
      setNightEndTime(activeRoom.night_end_time || '00:00');
      setBufferEnabled(activeRoom.buffer_enabled === 1);
      setBufferMinutes(activeRoom.buffer_minutes ?? 60);
      if (isOwner) {
        fetchMembers();
      } else {
        setActiveTab('settings');
        setLoading(false);
      }
    }
  }, [activeRoom, isOwner]);

  const fetchMembers = async () => {
    if (!activeRoom) return;
    setLoading(true);
    try {
      const res = await apiRequest<{ members: FullMemberInfo[] }>(
        `/api/rooms/${activeRoom.id}/members`
      );
      setMembers(res.members || []);
    } catch (err: any) {
      showError(err.messageBn || err.messageEn || 'Failed to load members');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyJoinCode = () => {
    if (!activeRoom) return;
    navigator.clipboard.writeText(activeRoom.join_code);
    setCopiedCode(true);
    showSuccess(t('toastCopied'));
    setTimeout(() => setCopiedCode(false), 2500);
  };

  const handleRegenerateCode = async () => {
    if (!activeRoom) return;
    try {
      const res = await apiRequest<{ success: boolean; newJoinCode: string }>(
        `/api/rooms/${activeRoom.id}/regenerate-code`,
        { method: 'POST' }
      );
      if (res.success) {
        showSuccess(t('toastCodeRegenerated'));
        setRegenModalOpen(false);
        await refreshAuth();
      }
    } catch (err: any) {
      showError(err.messageBn || err.messageEn || 'Failed to regenerate join code');
    }
  };

  const handleApproveRequest = async (userId: string, role: string) => {
    if (!activeRoom) return;
    try {
      const res = await apiRequest(`/api/rooms/${activeRoom.id}/requests/${userId}/approve`, {
        method: 'POST',
        body: JSON.stringify({ role }),
      });
      if (res.success) {
        showSuccess(t('toastRoleUpdated'));
        await fetchMembers();
        await refreshAuth();
      }
    } catch (err: any) {
      showError(err.messageBn || err.messageEn || 'Approval failed');
    }
  };

  const handleRejectRequest = async (userId: string) => {
    if (!activeRoom) return;
    try {
      const res = await apiRequest(`/api/rooms/${activeRoom.id}/requests/${userId}/reject`, {
        method: 'POST',
      });
      if (res.success) {
        showSuccess('Join request rejected');
        await fetchMembers();
      }
    } catch (err: any) {
      showError(err.messageBn || err.messageEn || 'Rejection failed');
    }
  };

  const handleChangeRole = async (userId: string, newRole: string) => {
    if (!activeRoom) return;
    try {
      const res = await apiRequest(`/api/rooms/${activeRoom.id}/members/${userId}/role`, {
        method: 'PATCH',
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
  };

  const handleRemoveMember = async () => {
    if (!activeRoom || !targetMemberToRemove) return;
    try {
      const res = await apiRequest(
        `/api/rooms/${activeRoom.id}/members/${targetMemberToRemove.user_id}`,
        { method: 'DELETE' }
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

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeRoom) return;
    setSavingSettings(true);
    try {
      const res = await apiRequest(`/api/rooms/${activeRoom.id}/settings`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: clubName.trim(),
          address: clubAddress.trim(),
          phone: clubPhone.trim(),
          default_language: clubDefaultLang,
          join_approval_required: approvalRequired,
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
          description="Access to this screen is restricted to the Owner and Manager of this room."
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
            <Settings className="w-6 h-6 text-[#582C4D] dark:text-[#C5A059]" />
            <span>{t('membersSettingsTitle')}</span>
          </h1>
          <p className="text-xs sm:text-sm text-stone-500 dark:text-stone-400 mt-1">
            {t('membersSettingsSubtitle')}
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex p-1 bg-stone-100 dark:bg-stone-800/80 rounded-2xl border border-stone-200 dark:border-stone-700/80">
          <button
            onClick={() => setActiveTab('members')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all ${
              activeTab === 'members'
                ? 'bg-white dark:bg-[#1E1920] text-[#582C4D] dark:text-[#C5A059] shadow-xs'
                : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100'
            }`}
          >
            <Users2 className="w-4 h-4" />
            <span>{t('tabMembers')}</span>
            {pendingMembers.length > 0 && (
              <span className="w-5 h-5 rounded-full bg-amber-500 text-white text-[10px] flex items-center justify-center font-bold">
                {pendingMembers.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('settings')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all ${
              activeTab === 'settings'
                ? 'bg-white dark:bg-[#1E1920] text-[#582C4D] dark:text-[#C5A059] shadow-xs'
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
        <div className="space-y-8">
          {/* Section: Pending Requests */}
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

            {loading ? (
              <LoadingSkeleton rows={2} />
            ) : pendingMembers.length === 0 ? (
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

                    <div className="flex items-center gap-2 self-end sm:self-center">
                      <select
                        id={`role-select-${m.user_id}`}
                        defaultValue="STAFF"
                        className="px-3 py-1.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-xs font-semibold text-stone-800 dark:text-stone-200 focus:outline-hidden"
                      >
                        <option value="STAFF">{t('role_STAFF')}</option>
                        <option value="MANAGER">{t('role_MANAGER')}</option>
                        <option value="VIEWER">{t('role_VIEWER')}</option>
                      </select>

                      <button
                        onClick={() => {
                          const selectEl = document.getElementById(
                            `role-select-${m.user_id}`
                          ) as HTMLSelectElement;
                          handleApproveRequest(m.user_id, selectEl?.value || 'STAFF');
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-xs transition-colors"
                      >
                        <UserCheck className="w-3.5 h-3.5" />
                        <span>{t('approveBtn')}</span>
                      </button>

                      <button
                        onClick={() => handleRejectRequest(m.user_id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-rose-600 hover:bg-rose-100/70 dark:hover:bg-rose-950/40 rounded-xl transition-colors"
                      >
                        <UserX className="w-3.5 h-3.5" />
                        <span>{t('rejectBtn')}</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Section: Active Members Table */}
          <div className="space-y-4">
            <h2 className="text-base sm:text-lg font-bold text-stone-900 dark:text-stone-100 flex items-center gap-2">
              <Users2 className="w-5 h-5 text-[#582C4D] dark:text-[#C5A059]" />
              <span>{t('activeMembersSection')}</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300 font-mono">
                {activeMembers.length}
              </span>
            </h2>

            {loading ? (
              <LoadingSkeleton rows={3} />
            ) : (
              <div className="bg-white dark:bg-[#1E1920] border border-stone-200 dark:border-stone-800 rounded-2xl overflow-hidden shadow-xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs sm:text-sm">
                    <thead className="bg-stone-50 dark:bg-stone-900/60 border-b border-stone-200 dark:border-stone-800 text-[11px] font-bold text-stone-500 uppercase tracking-wider">
                      <tr>
                        <th className="px-5 py-3.5">সদস্য / Member</th>
                        <th className="px-5 py-3.5">পদবি / Role</th>
                        <th className="px-5 py-3.5">যুক্ত হওয়ার তারিখ / Joined</th>
                        <th className="px-5 py-3.5 text-right">পদক্ষেপ / Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100 dark:divide-stone-800/80">
                      {activeMembers.map((m) => {
                        const isThisUser = m.user_id === activeMember?.user_id;
                        return (
                          <tr key={m.id} className="hover:bg-stone-50/50 dark:hover:bg-stone-900/40 transition-colors">
                            <td className="px-5 py-4">
                              <div className="flex items-center gap-3">
                                {m.user_picture ? (
                                  <img
                                    src={m.user_picture}
                                    alt={m.user_name}
                                    className="w-9 h-9 rounded-full object-cover ring-1 ring-stone-200"
                                  />
                                ) : (
                                  <div className="w-9 h-9 rounded-full bg-[#582C4D] text-[#C5A059] flex items-center justify-center font-bold text-xs">
                                    {m.user_name?.charAt(0).toUpperCase()}
                                  </div>
                                )}
                                <div className="min-w-0">
                                  <p className="font-bold text-stone-900 dark:text-stone-100 truncate">
                                    {m.user_name} {isThisUser && <span className="text-[10px] text-stone-400">(You)</span>}
                                  </p>
                                  <p className="text-xs text-stone-500 dark:text-stone-400 truncate">{m.user_email}</p>
                                </div>
                              </div>
                            </td>

                            <td className="px-5 py-4">
                              <select
                                value={m.role}
                                onChange={(e) => handleChangeRole(m.user_id, e.target.value)}
                                className="px-2.5 py-1.5 rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-xs font-semibold text-stone-800 dark:text-stone-200 focus:outline-hidden"
                              >
                                <option value="OWNER">{t('role_OWNER')}</option>
                                <option value="MANAGER">{t('role_MANAGER')}</option>
                                <option value="STAFF">{t('role_STAFF')}</option>
                                <option value="VIEWER">{t('role_VIEWER')}</option>
                              </select>
                            </td>

                            <td className="px-5 py-4 text-xs text-stone-500 dark:text-stone-400">
                              {formatDualDate(m.created_at)}
                            </td>

                            <td className="px-5 py-4 text-right">
                              <button
                                onClick={() => {
                                  setTargetMemberToRemove(m);
                                  setRemoveModalOpen(true);
                                }}
                                className="px-2.5 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-lg transition-colors"
                              >
                                {t('removeMemberBtn')}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 2: Club & Room Settings */}
      {activeTab === 'settings' && activeRoom && (
        <div className="space-y-8">
          {/* Join Code Management Card */}
          <div className="p-6 rounded-3xl bg-gradient-to-br from-white to-[#FDFBF9] dark:from-[#1E1920] dark:to-[#171318] border border-stone-200 dark:border-stone-800 shadow-md space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-bold text-stone-900 dark:text-stone-100 flex items-center gap-2">
                  <KeyRound className="w-5 h-5 text-[#582C4D] dark:text-[#C5A059]" />
                  <span>{t('roomJoinCodeCardTitle')}</span>
                </h3>
                <p className="text-xs text-stone-500 dark:text-stone-400 mt-1">
                  {t('roomJoinCodeCardDesc')}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <div className="px-4 py-2 rounded-2xl bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 font-mono text-lg font-extrabold tracking-widest text-[#582C4D] dark:text-[#C5A059] shadow-inner">
                  {activeRoom.join_code}
                </div>

                <button
                  onClick={handleCopyJoinCode}
                  className="p-2.5 rounded-xl bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 dark:hover:bg-stone-700 text-stone-700 dark:text-stone-300 transition-colors"
                  title={t('copy')}
                >
                  {copiedCode ? <Check className="w-5 h-5 text-emerald-600" /> : <Copy className="w-5 h-5" />}
                </button>

                <button
                  onClick={() => setRegenModalOpen(true)}
                  className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold shadow-xs transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>{t('regenerateCodeBtn')}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Club Info & Policies Form */}
          <form onSubmit={handleSaveSettings} className="p-6 sm:p-8 rounded-3xl bg-white dark:bg-[#1E1920] border border-stone-200 dark:border-stone-800 shadow-md space-y-6">
            <h3 className="text-base font-bold text-stone-900 dark:text-stone-100 border-b border-stone-100 dark:border-stone-800 pb-3">
              সেন্টার তথ্য ও নীতিমালা / Club Info & Policies
            </h3>

            {/* Join Policy Toggle */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-stone-700 dark:text-stone-300">
                {t('joinApprovalModeLabel')}
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div
                  onClick={() => setApprovalRequired(true)}
                  className={`p-4 rounded-2xl border-2 cursor-pointer transition-all ${
                    approvalRequired
                      ? 'border-[#582C4D] dark:border-[#C5A059] bg-[#582C4D]/5 dark:bg-[#C5A059]/10'
                      : 'border-stone-200 dark:border-stone-800 hover:border-stone-300'
                  }`}
                >
                  <div className="flex items-center gap-2 font-bold text-xs sm:text-sm text-stone-900 dark:text-stone-100">
                    <Shield className="w-4 h-4 text-[#582C4D] dark:text-[#C5A059]" />
                    <span>{t('approvalRequiredOption')}</span>
                  </div>
                  <p className="text-[11px] text-stone-500 mt-1 leading-relaxed">
                    স্টাফ বা ম্যানেজার কোড দিলে একটি অপেক্ষমান আবেদন তৈরি হবে যা ওনার অনুমোদন করতে পারবেন।
                  </p>
                </div>

                <div
                  onClick={() => setApprovalRequired(false)}
                  className={`p-4 rounded-2xl border-2 cursor-pointer transition-all ${
                    !approvalRequired
                      ? 'border-[#2D5A46] dark:border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20'
                      : 'border-stone-200 dark:border-stone-800 hover:border-stone-300'
                  }`}
                >
                  <div className="flex items-center gap-2 font-bold text-xs sm:text-sm text-stone-900 dark:text-stone-100">
                    <UserCheck className="w-4 h-4 text-emerald-600" />
                    <span>{t('directJoinOption')}</span>
                  </div>
                  <p className="text-[11px] text-stone-500 mt-1 leading-relaxed">
                    কোড জানা যেকোনো স্টাফ সদস্য কোড প্রবেশ করিয়ে সাথে সাথে সক্রিয় হতে পারবে।
                  </p>
                </div>
              </div>
            </div>

            {/* Club Fields */}
            {isOwner && (
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
                    value={clubPhone}
                    onChange={(e) => setClubPhone(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-xs sm:text-sm text-stone-900 dark:text-stone-100 focus:outline-hidden focus:ring-2 focus:ring-[#582C4D]"
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
                    className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-xs sm:text-sm text-stone-900 dark:text-stone-100 focus:outline-hidden focus:ring-2 focus:ring-[#582C4D]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 mb-1">
                    {t('roomDefaultLangLabel')}
                  </label>
                  <select
                    value={clubDefaultLang}
                    onChange={(e) => setClubDefaultLang(e.target.value as 'bn' | 'en')}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-xs sm:text-sm text-stone-900 dark:text-stone-100 focus:outline-hidden focus:ring-2 focus:ring-[#582C4D]"
                  >
                    <option value="bn">বাংলা (বাং)</option>
                    <option value="en">English (EN)</option>
                  </select>
                </div>
              </div>
            )}

            {/* Part 2: Day / Night Slot Timing & Buffer Configuration (Owner & Manager) */}
            <div className="pt-4 border-t border-stone-100 dark:border-stone-800 space-y-4">
              <div>
                <h4 className="text-sm font-bold text-stone-900 dark:text-stone-100 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-[#582C4D] dark:text-[#C5A059]" />
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
                      className="w-4 h-4 rounded accent-[#582C4D]"
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
              <button
                type="submit"
                disabled={savingSettings}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-[#582C4D] hover:bg-[#6C375F] text-white text-xs sm:text-sm font-bold shadow-md transition-all disabled:opacity-60 cursor-pointer"
              >
                <Save className="w-4 h-4" />
                <span>{savingSettings ? t('saving') : t('save')}</span>
              </button>
            </div>
          </form>
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
              onClick={() => setRegenModalOpen(false)}
              className="px-4 py-2 text-xs font-semibold text-stone-600 dark:text-stone-400 hover:bg-stone-100 rounded-xl"
            >
              {t('cancel')}
            </button>
            <button
              onClick={handleRegenerateCode}
              className="px-4 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-xl shadow-xs"
            >
              {t('regenerateCodeBtn')}
            </button>
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
              <span className="font-bold">{targetMemberToRemove.user_name}</span> ({targetMemberToRemove.user_email})
            </div>
          )}
          <div className="flex items-center justify-end gap-3 pt-3">
            <button
              onClick={() => setRemoveModalOpen(false)}
              className="px-4 py-2 text-xs font-semibold text-stone-600 dark:text-stone-400 hover:bg-stone-100 rounded-xl"
            >
              {t('cancel')}
            </button>
            <button
              onClick={handleRemoveMember}
              className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-xs"
            >
              {t('removeMemberBtn')}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
