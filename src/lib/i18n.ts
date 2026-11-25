/**
 * Lily Community Center - Complete Bilingual Localization Dictionary
 * Bangla (বাং) and English (EN)
 */

import { toBanglaDigits, toEnglishDigits } from './dateUtils.js';

export type Language = 'bn' | 'en';

export const translations = {
  // App General
  appName: {
    bn: 'লিলি কমিউনিটি সেন্টার',
    en: 'Lily Community Center',
  },
  appTagline: {
    bn: 'বিয়ে ও ইভেন্ট ক্লাবের অভ্যন্তরীণ ব্যবস্থাপনা সিস্টেম',
    en: 'Internal Management System for Marriage & Events Club',
  },
  loading: {
    bn: 'লোড হচ্ছে...',
    en: 'Loading...',
  },
  save: {
    bn: 'সংরক্ষণ করুন',
    en: 'Save Changes',
  },
  saving: {
    bn: 'সংরক্ষণ হচ্ছে...',
    en: 'Saving...',
  },
  cancel: {
    bn: 'বাতিল',
    en: 'Cancel',
  },
  confirm: {
    bn: 'নিশ্চিত করুন',
    en: 'Confirm',
  },
  delete: {
    bn: 'মুছে ফেলুন',
    en: 'Delete',
  },
  actions: {
    bn: 'পদক্ষেপ',
    en: 'Actions',
  },
  status: {
    bn: 'অবস্থা',
    en: 'Status',
  },
  search: {
    bn: 'অনুসন্ধান করুন...',
    en: 'Search...',
  },
  refresh: {
    bn: 'রিফ্রেশ',
    en: 'Refresh',
  },
  copy: {
    bn: 'কপি করুন',
    en: 'Copy',
  },
  copied: {
    bn: 'কপি হয়েছে!',
    en: 'Copied!',
  },
  back: {
    bn: 'ফিরে যান',
    en: 'Go Back',
  },

  // Auth & Login Screen
  loginWelcomeTitle: {
    bn: 'লিলি কমিউনিটি সেন্টারে স্বাগতম',
    en: 'Welcome to Lily Community Center',
  },
  loginWelcomeSubtitle: {
    bn: 'অভ্যন্তরীণ ক্লাব কার্যক্রম পরিচালনা করতে আপনার অফিসিয়াল জিমেইল অ্যাকাউন্ট দিয়ে প্রবেশ করুন।',
    en: 'Sign in with your official Google account to access internal club management.',
  },
  continueWithGoogle: {
    bn: 'গুগল দিয়ে এগিয়ে যান',
    en: 'Continue with Google',
  },
  loginNotice: {
    bn: 'শুধুমাত্র অনুমোদিত স্টাফ এবং ম্যানেজমেন্টের জন্য সংরক্ষিত। পাসওয়ার্ডের কোনো প্রয়োজন নেই।',
    en: 'Restricted for authorized staff and management only. No password required.',
  },
  devQuickLoginTitle: {
    bn: 'ডেভেলপার টেস্ট লগইন (লোকাল মোড)',
    en: 'Developer Test Quick Login (Local Mode)',
  },
  devQuickLoginNotice: {
    bn: 'এই অপশনটি শুধুমাত্র লোকাল ডেভেলপমেন্ট এবং অটোমেটেড টেস্টের জন্য সক্রিয়। প্রোডাকশনে এটি স্বয়ংক্রিয়ভাবে বন্ধ থাকবে।',
    en: 'Active exclusively for local development and automated testing. Disabled in production.',
  },
  signInAsOwner: {
    bn: 'ওনার হিসেবে টেস্ট লগইন',
    en: 'Test Login as Owner',
  },
  signInAsManager: {
    bn: 'ম্যানেজার হিসেবে টেস্ট লগইন',
    en: 'Test Login as Manager',
  },
  signInAsStaff: {
    bn: 'স্টাফ হিসেবে টেস্ট লগইন',
    en: 'Test Login as Staff',
  },
  signInAsViewer: {
    bn: 'ভিউয়ার হিসেবে টেস্ট লগইন',
    en: 'Test Login as Viewer',
  },
  signOut: {
    bn: 'লগআউট',
    en: 'Sign Out',
  },
  signOutAllDevices: {
    bn: 'সব ডিভাইস থেকে লগআউট করুন',
    en: 'Sign Out of All Devices',
  },
  signOutAllConfirm: {
    bn: 'আপনি কি নিশ্চিত যে আপনার অ্যাকাউন্টটি সমস্ত মোবাইল ও কম্পিউটার ডিভাইস থেকে লগআউট করতে চান?',
    en: 'Are you sure you want to sign out from all browsers and devices?',
  },

  // Top bar & Navigation
  rooms: {
    bn: 'রুমসমূহ',
    en: 'Rooms',
  },
  switchRoom: {
    bn: 'রুম পরিবর্তন করুন',
    en: 'Switch Room',
  },
  currentRoom: {
    bn: 'বর্তমান রুম',
    en: 'Active Room',
  },
  notifications: {
    bn: 'বিজ্ঞপ্তি',
    en: 'Notifications',
  },
  noNotifications: {
    bn: 'কোনো নতুন বিজ্ঞপ্তি নেই',
    en: 'No new notifications',
  },
  themeLight: {
    bn: 'লাইট মোড',
    en: 'Light Mode',
  },
  themeDark: {
    bn: 'ডার্ক মোড',
    en: 'Dark Mode',
  },
  languageToggle: {
    bn: 'English',
    en: 'বাংলা',
  },

  // Navigation Items
  navOverview: {
    bn: 'ড্যাশবোর্ড',
    en: 'Overview',
  },
  navBookings: {
    bn: 'বুকিং তালিকা',
    en: 'Bookings',
  },
  navCalendar: {
    bn: 'ইভেন্ট ক্যালেন্ডার',
    en: 'Calendar',
  },
  navPayments: {
    bn: 'পেমেন্ট ও হিসাব',
    en: 'Payments',
  },
  navReports: {
    bn: 'রিপোর্ট ও বিশ্লেষণ',
    en: 'Reports',
  },
  navMembersSettings: {
    bn: 'সদস্য ও সেটিংস',
    en: 'Members & Settings',
  },
  navAuditLog: {
    bn: 'অডিট লগ',
    en: 'Audit Log',
  },

  // Room Choice Screen
  roomChoiceTitle: {
    bn: 'আপনার রুম নির্বাচন বা তৈরি করুন',
    en: 'Select or Create a Room',
  },
  roomChoiceSubtitle: {
    bn: 'ক্লাব পরিচালনা শুরু করতে নতুন রুম তৈরি করুন অথবা বিদ্যমান রুমে যুক্ত হতে রুম কোড দিন।',
    en: 'Create a new room to manage your center or join an existing room with a Room ID.',
  },
  createRoomCardTitle: {
    bn: 'নতুন রুম তৈরি করুন',
    en: 'Create a Room',
  },
  createRoomCardDesc: {
    bn: 'আপনার সেন্টারের জন্য নতুন স্পেস তৈরি করুন। আপনি স্বয়ংক্রিয়ভাবে এই রুমের প্রধান ওনার হবেন।',
    en: 'Set up a new space for your center. You will automatically become the primary Owner.',
  },
  joinRoomCardTitle: {
    bn: 'রুম আইডি দিয়ে যুক্ত হন',
    en: 'Join with Room ID',
  },
  joinRoomCardDesc: {
    bn: 'ওনারের দেওয়া ৮-১০ অক্ষরের রুম কোড প্রবেশ করিয়ে সেন্টারে যোগদানের অনুরোধ পাঠান।',
    en: 'Enter the 8-character Room ID provided by the Owner to request membership access.',
  },
  myRoomsListTitle: {
    bn: 'আপনার যুক্ত থাকা রুমসমূহ',
    en: 'Your Accessible Rooms',
  },
  enterRoom: {
    bn: 'রুমে প্রবেশ করুন',
    en: 'Enter Room',
  },
  noRoomsYet: {
    bn: 'আপনি এখনও কোনো রুমে যুক্ত হননি। উপরে থেকে নতুন রুম তৈরি করুন বা বিদ্যমান রুমে যুক্ত হন।',
    en: 'You do not belong to any rooms yet. Create a new room or join an existing one above.',
  },

  // Create Room Modal
  createRoomModalTitle: {
    bn: 'নতুন রুম তৈরি',
    en: 'Create New Room',
  },
  roomNameLabel: {
    bn: 'সেন্টার / রুমের নাম',
    en: 'Center / Room Name',
  },
  roomNamePlaceholder: {
    bn: 'যেমন: লিলি কমিউনিটি সেন্টার',
    en: 'e.g. Lily Community Center',
  },
  roomAddressLabel: {
    bn: 'ঠিকানা ও অবস্থান',
    en: 'Address & Location',
  },
  roomAddressPlaceholder: {
    bn: 'যেমন: বাড়ি নং ১২, রোড ৫, ধানমন্ডি, ঢাকা',
    en: 'e.g. House 12, Road 5, Dhanmondi, Dhaka',
  },
  roomPhoneLabel: {
    bn: 'যোগাযোগের ফোন নম্বর',
    en: 'Contact Phone Number',
  },
  roomPhonePlaceholder: {
    bn: 'যেমন: +৮৮০ ১৭১১ ০০০০০০',
    en: 'e.g. +880 1711 000000',
  },
  roomDefaultLangLabel: {
    bn: 'ডিফল্ট ভাষা',
    en: 'Default Language',
  },
  createRoomBtn: {
    bn: 'রুম তৈরি সম্পন্ন করুন',
    en: 'Create Room',
  },

  // Join Room Modal
  joinRoomModalTitle: {
    bn: 'রুমে যোগদানের কোড প্রবেশ করান',
    en: 'Enter Room Join Code',
  },
  joinCodeLabel: {
    bn: 'রুম আইডি / জয়েন কোড (৮ অক্ষর)',
    en: 'Room ID / Join Code (8 characters)',
  },
  joinCodePlaceholder: {
    bn: 'যেমন: 8K7M2X4P',
    en: 'e.g. 8K7M2X4P',
  },
  joinRoomBtn: {
    bn: 'যোগদানের আবেদন পাঠান',
    en: 'Submit Join Request',
  },

  // Roles
  role_OWNER: {
    bn: 'ওনার (Owner)',
    en: 'Owner',
  },
  role_MANAGER: {
    bn: 'ম্যানেজার (Manager)',
    en: 'Manager',
  },
  role_STAFF: {
    bn: 'স্টাফ (Staff)',
    en: 'Staff',
  },
  role_VIEWER: {
    bn: 'ভিউয়ার (Viewer)',
    en: 'Viewer',
  },
  roleDesc_OWNER: {
    bn: 'সর্বোচ্চ ক্ষমতা: সদস্য অনুমোদন, সেটিংস, রিপোর্ট এবং সম্পূর্ণ অডিট লগ নিয়ন্ত্রণ।',
    en: 'Full authority: manage members, settings, money reports, and audit trail.',
  },
  roleDesc_MANAGER: {
    bn: 'বুকিং, পেমেন্ট এবং গ্রাহক তথ্য নিয়ন্ত্রণ। রুম মুছতে বা ওনার বদলাতে পারবেন না।',
    en: 'Manages bookings, payments, customers. Cannot delete room or change Owner.',
  },
  roleDesc_STAFF: {
    bn: 'বুকিং তৈরি/সম্পাদনা ও ক্যালেন্ডার দেখা। অর্থ সম্পর্কিত রিপোর্ট দেখার অনুমতি নেই।',
    en: 'Creates bookings and views calendar. No financial reports or deletes.',
  },
  roleDesc_VIEWER: {
    bn: 'শুধুমাত্র দেখার অনুমতি (Read-only)। কোনো তথ্য পরিবর্তন করতে পারবেন না।',
    en: 'Read-only access. Cannot modify or alter any data.',
  },

  // Member Status
  status_ACTIVE: {
    bn: 'সক্রিয়',
    en: 'Active',
  },
  status_PENDING: {
    bn: 'অনুমোদনের অপেক্ষায়',
    en: 'Pending Approval',
  },
  status_REJECTED: {
    bn: 'প্রত্যাখ্যাত',
    en: 'Rejected',
  },

  // Members & Settings Screen
  membersSettingsTitle: {
    bn: 'সদস্য ও ক্লাব সেটিংস',
    en: 'Members & Club Settings',
  },
  membersSettingsSubtitle: {
    bn: 'সেন্টারের তথ্য সম্পাদনা করুন, স্টাফ অনুমোদন ও পদবি পরিচালনা করুন এবং রুম কোড নিয়ন্ত্রণ করুন।',
    en: 'Manage club details, approve staff, configure roles, and control the join code.',
  },
  tabMembers: {
    bn: 'সদস্য তালিকা ও অনুমোদন',
    en: 'Members & Approvals',
  },
  tabClubSettings: {
    bn: 'ক্লাব ও রুম সেটিংস',
    en: 'Club & Room Settings',
  },
  pendingRequestsSection: {
    bn: 'যোগদানের অপেক্ষমান আবেদনসমূহ',
    en: 'Pending Join Requests',
  },
  activeMembersSection: {
    bn: 'অনুমোদিত সক্রিয় সদস্যবৃন্দ',
    en: 'Active Members List',
  },
  noPendingRequests: {
    bn: 'বর্তমানে কোনো অপেক্ষমান যোগদানের আবেদন নেই।',
    en: 'No pending join requests right now.',
  },
  approveBtn: {
    bn: 'অনুমোদন করুন',
    en: 'Approve',
  },
  rejectBtn: {
    bn: 'প্রত্যাখ্যান করুন',
    en: 'Reject',
  },
  changeRole: {
    bn: 'পদবি পরিবর্তন',
    en: 'Change Role',
  },
  removeMemberBtn: {
    bn: 'অপসারণ করুন',
    en: 'Remove Member',
  },
  removeMemberConfirm: {
    bn: 'আপনি কি নিশ্চিত যে এই সদস্যকে রুম থেকে অপসারণ করতে চান? অপসারণের পর তিনি আর এই রুমের কোনো তথ্য দেখতে পারবেন না।',
    en: 'Are you sure you want to remove this member? They will lose access immediately.',
  },

  // Join Code Card
  roomJoinCodeCardTitle: {
    bn: 'বর্তমান রুম আইডি / জয়েন কোড',
    en: 'Current Room ID / Join Code',
  },
  roomJoinCodeCardDesc: {
    bn: 'স্টাফ ও ম্যানেজারদের সাইন-ইন করে এই কোডটি দিতে বলুন। ওনার যেকোনো সময় কোড পুনর্নবীকরণ করতে পারেন।',
    en: 'Share this code with your staff. The Owner can regenerate this code at any time.',
  },
  regenerateCodeBtn: {
    bn: 'নতুন কোড তৈরি করুন',
    en: 'Regenerate Code',
  },
  regenerateCodeConfirm: {
    bn: 'সতর্কতা: নতুন কোড তৈরি করলে পূর্বের কোডটি তাৎক্ষণিকভাবে অকার্যকর হয়ে যাবে। আপনি কি নিশ্চিত?',
    en: 'Warning: Generating a new code immediately invalidates the previous code. Are you sure?',
  },
  joinApprovalModeLabel: {
    bn: 'যোগদানের অনুমোদন নীতি',
    en: 'Join Approval Policy',
  },
  approvalRequiredOption: {
    bn: 'ওনারের অনুমোদন প্রয়োজন (ডিফল্ট ও নিরাপদ)',
    en: 'Owner approval required (Default & Secure)',
  },
  directJoinOption: {
    bn: 'সরাসরি যোগদান (কোড দিলে সরাসরি স্টাফ হিসেবে যুক্ত হবে)',
    en: 'Direct join (Code grants immediate Staff access)',
  },

  // Audit Log Screen
  auditLogTitle: {
    bn: 'নিরাপত্তা ও অডিট লগ',
    en: 'Security & Audit Log',
  },
  auditLogSubtitle: {
    bn: 'রুম তৈরি, সদস্য অনুমোদন, পদবি পরিবর্তন ও কোড পুনর্নবীকরণের সুরক্ষিত অপরিবর্তনশীল রেকর্ড।',
    en: 'Tamper-proof record of logins, room creation, approvals, role changes, and code renewals.',
  },
  auditLogOwnerOnlyNote: {
    bn: 'এই লগটি শুধুমাত্র ওনার (Owner) দেখতে পারবেন। এটি স্বয়ংক্রিয়ভাবে সংরক্ষিত এবং অপরিবর্তনশীল।',
    en: 'This audit log is strictly restricted to the Owner. It is append-only and cannot be altered.',
  },
  auditAction: {
    bn: 'পদক্ষেপ',
    en: 'Action',
  },
  auditActor: {
    bn: 'সম্পাদনকারী',
    en: 'Performed By',
  },
  auditDate: {
    bn: 'তারিখ ও সময় (ঢাকা সময়)',
    en: 'Date & Time (Dhaka Time)',
  },
  auditDetails: {
    bn: 'বিবরণ',
    en: 'Details',
  },
  auditIp: {
    bn: 'আইপি ঠিকানা',
    en: 'IP Address',
  },
  noAuditLogs: {
    bn: 'কোনো অডিট রেকর্ড এখনও নেই।',
    en: 'No audit records found yet.',
  },

  // Coming Soon Screens (for Parts 2, 3, 4)
  comingSoonPart2Title: {
    bn: 'বুকিং ও ক্যালেন্ডার সিস্টেম — পার্ট ২ এ আসছে',
    en: 'Bookings & Slot Calendar — Coming in Part 2',
  },
  comingSoonPart2Desc: {
    bn: 'অভ্যন্তরীণ বুকিং প্রক্রিয়া, দিন/রাত/ফুল স্লট সিস্টেম, দ্বৈত বাংলা-ইংরেজি ক্যালেন্ডার এবং ক্লায়েন্ট ম্যানেজমেন্ট পার্ট ২ এ যুক্ত করা হবে।',
    en: 'Internal bookings, Day/Night/Full slot management, dual Bengali-English calendar, and client tracking will be integrated in Part 2.',
  },
  comingSoonPart3Title: {
    bn: 'পেমেন্ট ও ইনভয়েস সিস্টেম — পার্ট ৩ এ আসছে',
    en: 'Payments & Invoicing — Coming in Part 3',
  },
  comingSoonPart3Desc: {
    bn: 'অগ্রিম বুকিং ডিপোজিট, বকেয়া হিসাব, বাংলা মানিরিসিট এবং কিস্তি ব্যবস্থাপনা পার্ট ৩ এ উন্মোচিত হবে।',
    en: 'Advance deposits, due balance tracking, Bengali payment receipts, and installment records arrive in Part 3.',
  },
  comingSoonPart4Title: {
    bn: 'ড্যাশবোর্ড ও আর্থিক বিশ্লেষণ — পার্ট ৪ এ আসছে',
    en: 'Executive Dashboard & Financial Reports — Coming in Part 4',
  },
  comingSoonPart4Desc: {
    bn: 'মাসিক আয়ের বিশ্লেষণ, বুকিং ট্রেন্ড, রুম অকুপেন্সি গ্রাফ এবং প্রিন্ট-রেডি প্রতিবেদন পার্ট ৪ এ সম্পন্ন হবে।',
    en: 'Revenue analytics, booking trends, room occupancy visualizations, and printable club reports arrive in Part 4.',
  },

  // Security & Feedback Toasts
  toastCopied: {
    bn: 'রুম কোড ক্লিপবোর্ডে কপি করা হয়েছে!',
    en: 'Room ID copied to clipboard!',
  },
  toastRoomCreated: {
    bn: 'রুম সফলভাবে তৈরি করা হয়েছে!',
    en: 'Room created successfully!',
  },
  toastJoinedSuccess: {
    bn: 'রুমে যোগদান সম্পন্ন হয়েছে!',
    en: 'Successfully joined the room!',
  },
  toastRequestSent: {
    bn: 'যোগদানের আবেদন ওনারের অনুমোদনের জন্য পাঠানো হয়েছে।',
    en: 'Join request sent for Owner approval.',
  },
  toastRoleUpdated: {
    bn: 'সদস্যের পদবি সফলভাবে পরিবর্তন করা হয়েছে।',
    en: 'Member role updated successfully.',
  },
  toastMemberRemoved: {
    bn: 'সদস্যকে রুম থেকে অপসারণ করা হয়েছে।',
    en: 'Member removed from room.',
  },
  toastCodeRegenerated: {
    bn: 'নতুন রুম কোড তৈরি সম্পন্ন হয়েছে! পূর্বের কোডটি বাতিল।',
    en: 'New Room ID generated! Old code revoked.',
  },
  toastSettingsUpdated: {
    bn: 'রুমের তথ্য সফলভাবে সংরক্ষিত হয়েছে।',
    en: 'Room settings updated successfully.',
  },

  // ======================== PART 2: Halls, Customers, Bookings & Slot Calendar ========================

  // Navigation Part 2
  navHalls: {
    bn: 'হল ও স্পেস',
    en: 'Halls & Spaces',
  },
  navCustomers: {
    bn: 'গ্রাহক তালিকা',
    en: 'Customers',
  },

  // Slot System (Strictly DAY / NIGHT / FULL)
  slotLabel: {
    bn: 'স্লট',
    en: 'Slot',
  },
  slot_DAY: {
    bn: 'দিন',
    en: 'Day',
  },
  slot_NIGHT: {
    bn: 'রাত',
    en: 'Night',
  },
  slot_FULL: {
    bn: 'দিন ও রাত',
    en: 'Full',
  },
  slotDesc_DAY: {
    bn: 'দিনের অনুষ্ঠান',
    en: 'Daytime Event',
  },
  slotDesc_NIGHT: {
    bn: 'রাতের অনুষ্ঠান',
    en: 'Nighttime Event',
  },
  slotDesc_FULL: {
    bn: 'দিন ও রাত উভয় স্লট একত্রে',
    en: 'Both Day & Night Together',
  },

  // Availability States
  avail_BOTH_FREE: {
    bn: 'উভয় স্লট খালি',
    en: 'Both free',
  },
  avail_DAY_ONLY_FREE: {
    bn: 'শুধু দিন খালি',
    en: 'Day only free',
  },
  avail_NIGHT_ONLY_FREE: {
    bn: 'শুধু রাত খালি',
    en: 'Night only free',
  },
  avail_FULLY_BOOKED: {
    bn: 'সম্পূর্ণ বুকড',
    en: 'Fully booked',
  },
  slotFree: {
    bn: 'খালি আছে',
    en: 'Free',
  },
  slotTaken: {
    bn: 'বুক করা আছে',
    en: 'Taken',
  },
  heldBy: {
    bn: 'বুকিং ধারক',
    en: 'Held by',
  },
  endsNextDay: {
    bn: 'পরদিন {time} এ শেষ',
    en: 'Ends {time} next day',
  },

  // Event Types
  eventTypeLabel: {
    bn: 'অনুষ্ঠানের ধরন',
    en: 'Event Type',
  },
  event_WEDDING: {
    bn: 'বিয়ে (Wedding)',
    en: 'Wedding',
  },
  event_HOLUD: {
    bn: 'গায়ে হলুদ (Holud)',
    en: 'Holud',
  },
  event_RECEPTION: {
    bn: 'বৌভাত / রিসেপশন (Reception)',
    en: 'Reception',
  },
  event_ENGAGEMENT: {
    bn: 'আংটি বদল / এনগেজমেন্ট (Engagement)',
    en: 'Engagement',
  },
  event_BIRTHDAY: {
    bn: 'জন্মদিন (Birthday)',
    en: 'Birthday',
  },
  event_AQIQAH: {
    bn: 'আকিকা (Aqiqah)',
    en: 'Aqiqah',
  },
  event_MEETING: {
    bn: 'সভা / সেমিনার (Meeting)',
    en: 'Meeting',
  },
  event_OTHER: {
    bn: 'অন্যান্য (Other)',
    en: 'Other',
  },

  // Booking Statuses
  bStatus_TENTATIVE: {
    bn: 'অস্থায়ী (Tentative)',
    en: 'Tentative',
  },
  bStatus_CONFIRMED: {
    bn: 'নিশ্চিত (Confirmed)',
    en: 'Confirmed',
  },
  bStatus_COMPLETED: {
    bn: 'সম্পন্ন (Completed)',
    en: 'Completed',
  },
  bStatus_CANCELLED: {
    bn: 'বাতিল (Cancelled)',
    en: 'Cancelled',
  },
  bStatus_NO_SHOW: {
    bn: 'অনুপস্থিত (No-show)',
    en: 'No-show',
  },

  // Extra Services
  service_CATERING: {
    bn: 'ক্যাটারিং ও খাবার',
    en: 'Catering',
  },
  service_DECORATION: {
    bn: 'ডেকোরেশন ও স্টেজ',
    en: 'Decoration',
  },
  service_SOUND: {
    bn: 'সাউন্ড সিস্টেম',
    en: 'Sound',
  },
  service_LIGHTING: {
    bn: 'আলোকসজ্জা (Lighting)',
    en: 'Lighting',
  },
  service_OTHER: {
    bn: 'অন্যান্য সেবা',
    en: 'Other',
  },

  // Halls Screen
  hallsPageTitle: {
    bn: 'হল ও ইভেন্ট স্পেস ব্যবস্থাপনা',
    en: 'Halls & Event Spaces',
  },
  hallsPageSubtitle: {
    bn: 'সেন্টারের প্রতিটি হলের ধারণক্ষমতা, দিন/রাত/দিন ও রাতের ভাড়া এবং সুবিধাসমূহ পরিচালনা করুন।',
    en: 'Manage capacity, Day / Night / Full base prices, photos, facilities, and active status for each hall.',
  },
  addHallBtn: {
    bn: 'নতুন হল যুক্ত করুন',
    en: 'Add New Hall',
  },
  editHallTitle: {
    bn: 'হলের তথ্য সম্পাদনা',
    en: 'Edit Hall Details',
  },
  hallNameLabel: {
    bn: 'হলের নাম',
    en: 'Hall Name',
  },
  hallCapacityLabel: {
    bn: 'ধারণক্ষমতা (অতিথি সংখ্যা)',
    en: 'Guest Capacity',
  },
  dayPriceLabel: {
    bn: 'দিন (Day) বেস ভাড়া',
    en: 'Day Base Price',
  },
  nightPriceLabel: {
    bn: 'রাত (Night) বেস ভাড়া',
    en: 'Night Base Price',
  },
  fullPriceLabel: {
    bn: 'দিন ও রাত (Full) বেস ভাড়া',
    en: 'Full (Day + Night) Base Price',
  },
  facilitiesLabel: {
    bn: 'সুবিধাসমূহ (কমা দিয়ে লিখুন)',
    en: 'Facilities (comma separated)',
  },
  photoUrlLabel: {
    bn: 'হলের ছবির লিংক (URL)',
    en: 'Hall Photo URL',
  },
  activeHallBadge: {
    bn: 'সক্রিয়',
    en: 'Active',
  },
  inactiveHallBadge: {
    bn: 'নিষ্ক্রিয়',
    en: 'Inactive',
  },
  guestsUnit: {
    bn: 'জন অতিথি',
    en: 'Guests',
  },

  // Customers Screen
  customersPageTitle: {
    bn: 'গ্রাহক তালিকা ও প্রোফাইল',
    en: 'Customers & Booking History',
  },
  customersPageSubtitle: {
    bn: 'সকল গ্রাহকের নাম, ফোন নম্বর, ঠিকানা ও পূর্ববর্তী বুকিংয়ের ইতিহাস দেখুন।',
    en: 'Search customers by name or phone, view profiles, and inspect booking history.',
  },
  addCustomerBtn: {
    bn: 'নতুন গ্রাহক যুক্ত করুন',
    en: 'Add Customer',
  },
  customerNameLabel: {
    bn: 'গ্রাহকের পূর্ণ নাম',
    en: 'Customer Full Name',
  },
  customerPhoneLabel: {
    bn: 'প্রধান ফোন নম্বর',
    en: 'Primary Phone Number',
  },
  customerAltPhoneLabel: {
    bn: 'বিকল্প ফোন নম্বর (ঐচ্ছিক)',
    en: 'Alternate Phone (Optional)',
  },
  customerAddressLabel: {
    bn: 'ঠিকানা',
    en: 'Address',
  },
  customerNotesLabel: {
    bn: 'নোট / বিশেষ তথ্য',
    en: 'Notes',
  },
  useExistingCustomerBtn: {
    bn: 'বিদ্যমান গ্রাহক নির্বাচন করুন',
    en: 'Use Existing Customer',
  },
  viewProfileBtn: {
    bn: 'প্রোফাইল ও বুকিং ইতিহাস',
    en: 'Profile & History',
  },
  moneyHiddenNotice: {
    bn: 'নিরাপত্তা নীতিমালা অনুযায়ী অর্থ সংক্রান্ত তথ্য শুধুমাত্র ওনার ও ম্যানেজারের জন্য দৃশ্যমান।',
    en: 'Financial columns are restricted to Owner and Manager roles.',
  },

  // Bookings Screen
  bookingsPageTitle: {
    bn: 'অভ্যন্তরীণ বুকিং তালিকা',
    en: 'Internal Bookings',
  },
  bookingsPageSubtitle: {
    bn: 'দিন, রাত এবং দিন ও রাত (Full) স্লটের সকল বুকিং খুঁজুন, ফিল্টার করুন এবং ব্যবস্থাপনা করুন।',
    en: 'Search, filter, create, confirm, and print booking slips for Day, Night, and Full slots.',
  },
  newBookingBtn: {
    bn: 'নতুন বুকিং তৈরি করুন',
    en: 'New Booking',
  },
  seedDemoBtn: {
    bn: 'ডেমো ডেটা লোড করুন',
    en: 'Seed Demo Data',
  },
  clearDemoBtn: {
    bn: 'ডেমো ডেটা মুছুন',
    en: 'Remove Demo Data',
  },
  bookingNumberLabel: {
    bn: 'বুকিং নম্বর',
    en: 'Booking No.',
  },
  eventDateLabel: {
    bn: 'অনুষ্ঠানের তারিখ',
    en: 'Event Date',
  },
  startTimeLabel: {
    bn: 'শুরুর সময়',
    en: 'Start Time',
  },
  endTimeLabel: {
    bn: 'শেষের সময়',
    en: 'End Time',
  },
  guestCountLabel: {
    bn: 'অতিথি সংখ্যা',
    en: 'Guest Count',
  },
  packageLabel: {
    bn: 'প্যাকেজের নাম',
    en: 'Package Name',
  },
  extraServicesLabel: {
    bn: 'অতিরিক্ত সেবাসমূহ',
    en: 'Extra Services',
  },
  basePriceLabel: {
    bn: 'নির্ধারিত বেস ভাড়া',
    en: 'Slot Base Price',
  },
  hallRentLabel: {
    bn: 'চূড়ান্ত হল ভাড়া',
    en: 'Hall Rent',
  },
  totalAmountLabel: {
    bn: 'সর্বমোট বিল',
    en: 'Total Amount',
  },
  advanceAmountLabel: {
    bn: 'অগ্রিম জমা',
    en: 'Advance Paid',
  },
  dueAmountLabel: {
    bn: 'বকেয়া পরিমাণ',
    en: 'Due Amount',
  },

  // Multi-step Booking Form
  step1Title: {
    bn: '১. তারিখ, স্লট ও হল',
    en: '1. Date, Slot & Hall',
  },
  step2Title: {
    bn: '২. গ্রাহক নির্বাচন',
    en: '2. Customer',
  },
  step3Title: {
    bn: '৩. অনুষ্ঠানের বিবরণ ও সেবা',
    en: '3. Event & Services',
  },
  step4Title: {
    bn: '৪. ভাড়া ও অগ্রিম হিসাব',
    en: '4. Pricing & Advance',
  },
  step5Title: {
    bn: '৫. যাচাই ও নিশ্চিতকরণ',
    en: '5. Review & Confirm',
  },
  nextStepBtn: {
    bn: 'পরবর্তী ধাপ',
    en: 'Next Step',
  },
  prevStepBtn: {
    bn: 'পূর্ববর্তী ধাপ',
    en: 'Previous Step',
  },

  // Calendar Screen
  calendarPageTitle: {
    bn: 'দ্বৈত স্লট ইভেন্ট ক্যালেন্ডার (দিন ও রাত)',
    en: 'Dual-Slot Event Calendar (Day & Night)',
  },
  calendarPageSubtitle: {
    bn: 'প্রতিটি তারিখের উপরের অংশ দিন (সূর্য) এবং নিচের অংশ রাত (চাঁদ) নির্দেশ করে। খালি অংশে ট্যাপ করে সরাসরি বুকিং নিন।',
    en: 'Each day cell splits into Day (top/sun) and Night (bottom/moon). Tap an empty half to book directly.',
  },
  viewMonth: {
    bn: 'মাসিক ভিউ',
    en: 'Month',
  },
  viewWeek: {
    bn: 'সাপ্তাহিক ভিউ',
    en: 'Week',
  },
  viewList: {
    bn: 'তালিকা ভিউ',
    en: 'List',
  },

  // ======================== PART 3: Payments, Expenses, Reports & Notifications ========================
  navExpenses: {
    bn: 'খরচ ও ব্যয়',
    en: 'Expenses',
  },
  payType_ADVANCE: {
    bn: 'অগ্রিম (Advance)',
    en: 'Advance',
  },
  payType_PARTIAL: {
    bn: 'আংশিক (Partial)',
    en: 'Partial',
  },
  payType_FINAL: {
    bn: 'চূড়ান্ত (Final)',
    en: 'Final',
  },
  payType_REFUND: {
    bn: 'রিফান্ড (Refund)',
    en: 'Refund',
  },
  payType_REVERSAL: {
    bn: 'রিভার্সাল (Reversal)',
    en: 'Reversal',
  },
  payMethod_CASH: {
    bn: 'নগদ (Cash)',
    en: 'Cash',
  },
  payMethod_BKASH: {
    bn: 'বিকাশ (bKash)',
    en: 'bKash',
  },
  payMethod_NAGAD: {
    bn: 'নগদ মোবাইল (Nagad)',
    en: 'Nagad',
  },
  payMethod_BANK: {
    bn: 'ব্যাংক ট্রান্সফার (Bank)',
    en: 'Bank Transfer',
  },
  payMethod_OTHER: {
    bn: 'অন্যান্য (Other)',
    en: 'Other',
  },
  expCat_ELECTRICITY: {
    bn: 'বিদ্যুৎ ও ইউটিলিটি বিল',
    en: 'Electricity & Utilities',
  },
  expCat_SALARY: {
    bn: 'স্টাফ বেতন ও ভাতা',
    en: 'Staff Salary',
  },
  expCat_REPAIR: {
    bn: 'মেরামত ও রক্ষণাবেক্ষণ',
    en: 'Repair & Maintenance',
  },
  expCat_CLEANING: {
    bn: 'পরিষ্কার ও পরিচ্ছন্নতা',
    en: 'Cleaning & Housekeeping',
  },
  expCat_DECORATION_MATERIAL: {
    bn: 'ডেকোরেশন সরঞ্জাম',
    en: 'Decoration Material',
  },
  expCat_FOOD: {
    bn: 'খাবার ও আপ্যায়ন',
    en: 'Food & Refreshments',
  },
  expCat_OTHER: {
    bn: 'অন্যান্য খরচ',
    en: 'Other Expense',
  },
  markAllRead: {
    bn: 'সব পঠিত হিসেবে চিহ্নিত করুন',
    en: 'Mark all as read',
  },

  // ======================== PART 4: Executive Dashboard & Mobile Polish ========================
  navHome: {
    bn: 'হোম',
    en: 'Home',
  },
  navMore: {
    bn: 'আরও',
    en: 'More',
  },
  greetingMorning: {
    bn: 'শুভ সকাল, {name}',
    en: 'Good morning, {name}',
  },
  greetingAfternoon: {
    bn: 'শুভ অপরাহ্ন, {name}',
    en: 'Good afternoon, {name}',
  },
  greetingEvening: {
    bn: 'শুভ সন্ধ্যা, {name}',
    en: 'Good evening, {name}',
  },
  quickActionsTitle: {
    bn: 'দ্রুত পদক্ষেপ',
    en: 'Quick Actions',
  },
  recordPaymentBtn: {
    bn: 'পেমেন্ট রেকর্ড করুন',
    en: 'Record Payment',
  },
  openCalendarBtn: {
    bn: 'ক্যালেন্ডার খুলুন',
    en: 'Open Calendar',
  },
  cardTodaysEvents: {
    bn: 'আজকের অনুষ্ঠান',
    en: "Today's Events",
  },
  cardUpcomingWeek: {
    bn: 'আগামী ৭ দিনের ইভেন্ট',
    en: 'Upcoming This Week',
  },
  cardPendingTentative: {
    bn: 'অস্থায়ী (Tentative) বুকিং',
    en: 'Pending (Tentative) Bookings',
  },
  cardThisMonthRevenue: {
    bn: 'চলতি মাসের রাজস্ব',
    en: "This Month's Revenue",
  },
  cardTotalDue: {
    bn: 'মোট বকেয়া পরিমাণ',
    en: 'Total Due Amount',
  },
  cardFreeSlotsThisMonth: {
    bn: 'চলতি মাসে খালি স্লট',
    en: 'Free Slots This Month',
  },
  todayAtAGlanceTitle: {
    bn: 'আজ এক নজরে (হল ভিত্তিক দিন ও রাত স্লট)',
    en: 'Today at a Glance (Day & Night Status per Hall)',
  },
  upcomingNext7DaysTitle: {
    bn: 'আগামী ৭ দিনের অনুষ্ঠান তালিকা',
    en: 'Upcoming Events (Next 7 Days)',
  },
  miniCalendarTitle: {
    bn: 'চলতি মাসের মিনি ক্যালেন্ডার (দিন ও রাত)',
    en: 'Current Month Mini Calendar (Day & Night)',
  },
  alertsPanelTitle: {
    bn: 'জরুরি সতর্কতা ও অপেক্ষমান কাজ',
    en: 'Alerts & Action Items',
  },
  recentActivityTitle: {
    bn: 'সাম্প্রতিক কার্যক্রম (সর্বশেষ ১০টি অডিট রেকর্ড)',
    en: 'Recent Activity (Last 10 Audit Actions)',
  },
  networkRetryBtn: {
    bn: 'পুনরায় চেষ্টা করুন',
    en: 'Retry Connection',
  },
} as const;

export type TranslationKey = keyof typeof translations;

export function getTranslation(key: TranslationKey, language: Language): string {
  const item = translations[key];
  if (!item) return key;
  return item[language] || item['en'] || key;
}

export function formatBilingualText(
  key: TranslationKey,
  language: Language,
  params?: Record<string, string | number>
): string {
  let text = getTranslation(key, language);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      const valStr = language === 'bn' ? toBanglaDigits(v) : toEnglishDigits(String(v));
      text = text.replace(new RegExp(`{${k}}`, 'g'), valStr);
    }
  }
  return text;
}
