import React, { useState } from 'react';
import { ShieldCheck, Trash2, AlertTriangle, Lock } from 'lucide-react';
import { Modal } from './Modal.js';
import { ActionButton } from './ActionButton.js';

export const PrivacyPolicyModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  language: 'bn' | 'en';
}> = ({ isOpen, onClose, language }) => {
  const isBn = language === 'bn';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isBn ? 'গোপনীয়তা নীতি (Privacy Policy)' : 'Privacy Policy & Data Protection'}
      maxWidth="lg"
    >
      <div className="space-y-4 text-xs sm:text-sm text-stone-700 dark:text-stone-300 leading-relaxed">
        <div className="p-3.5 rounded-2xl bg-[#FAF4F0] dark:bg-stone-900 border border-[#4A2545]/15 dark:border-[#C5A059]/25 flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 text-[#0E8A44] shrink-0 mt-0.5" />
          <p className="font-semibold text-stone-900 dark:text-stone-100">
            {isBn
              ? 'লিলি কমিউনিটি সেন্টার আপনার ব্যক্তিগত তথ্য ও প্রতিষ্ঠানের আর্থিক তথ্যের গোপনীয়তা কঠোরভাবে সুরক্ষা করে।'
              : 'Lily Community Center strictly protects personal identity and club operational/financial records.'}
          </p>
        </div>

        <div className="space-y-2">
          <h4 className="font-bold text-stone-900 dark:text-stone-100 flex items-center gap-1.5">
            <Lock className="w-4 h-4 text-[#4A2545] dark:text-[#C5A059]" />
            <span>{isBn ? '১. সংগৃহীত তথ্য ও ব্যবহার' : '1. Data Collected & Purpose'}</span>
          </h4>
          <p>
            {isBn
              ? 'Google সাইন-ইনের মাধ্যমে শুধুমাত্র আপনার নাম, ইমেইল ও প্রোফাইল ছবি পরিচয় যাচাইয়ের জন্য ব্যবহৃত হয়। রুমের বুকিং, গ্রাহকের ফোন নম্বর, ঠিকানা ও পেমেন্ট তথ্য শুধুমাত্র সংশ্লিষ্ট রুমের অনুমোদিত সদস্যদের অভ্যন্তরীণ ব্যবস্থাপনার জন্য সংরক্ষিত থাকে।'
              : 'Google Sign-In provides only your verified name, email address, and profile avatar for authentication. Customer contact details, bookings, and payment receipts are used solely for internal hall management within your authorized room.'}
          </p>
        </div>

        <div className="space-y-2">
          <h4 className="font-bold text-stone-900 dark:text-stone-100">
            {isBn ? '২. এনক্রিপশন ও অ্যাক্সেস নিয়ন্ত্রণ' : '2. Encryption & Access Control'}
          </h4>
          <p>
            {isBn
              ? 'সকল যোগাযোগ HTTPS দ্বারা সুরক্ষিত, ডাটাবেজ ডিফল্টভাবে deny-by-default নীতিতে চলে এবং সংবেদনশীল তথ্য (গ্রাহকের ফোন, ঠিকানা ও পেমেন্ট রেফারেন্স) সার্ভার-সাইড AES-256-GCM এনক্রিপশনে সংরক্ষিত থাকে। কোনো তথ্য তৃতীয় পক্ষের কাছে বিক্রি বা শেয়ার করা হয় না।'
              : 'All traffic uses HTTPS, database rules enforce strict deny-by-default per-room RBAC, and sensitive fields (customer phone, address, payment references) are protected at rest via server-side AES-256-GCM encryption. No personal data is sold or shared with third parties.'}
          </p>
        </div>

        <div className="space-y-2">
          <h4 className="font-bold text-stone-900 dark:text-stone-100">
            {isBn ? '৩. অ্যাকাউন্ট ও ডেটা মুছে ফেলার অধিকার' : '3. Account & Room Data Deletion Rights'}
          </h4>
          <p>
            {isBn
              ? 'যে কোনো ব্যবহারকারী তার প্রোফাইল মেনু থেকে নিজস্ব অ্যাকাউন্ট মুছে ফেলতে পারেন। রুমের মালিক (Owner) যে কোনো সময় রুমের সম্পূর্ণ ডেটা এক্সপোর্ট অথবা রুম মুছে ফেলার ক্ষমতা রাখেন।'
              : 'Any user may permanently delete their personal account from the Profile menu at any time. Room Owners can export all room records or delete their room data from Club Settings.'}
          </p>
        </div>

        <div className="flex justify-end pt-2">
          <ActionButton variant="primary" onClick={onClose}>
            {isBn ? 'বুঝেছি' : 'Close'}
          </ActionButton>
        </div>
      </div>
    </Modal>
  );
};

export const DeleteAccountModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  language: 'bn' | 'en';
  onConfirmDelete: () => Promise<void>;
}> = ({ isOpen, onClose, language, onConfirmDelete }) => {
  const isBn = language === 'bn';
  const [confirmText, setConfirmText] = useState('');

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isBn ? 'অ্যাকাউন্ট মুছে ফেলুন (Delete Account)' : 'Delete Personal Account'}
      maxWidth="sm"
    >
      <div className="space-y-4">
        <div className="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 flex items-start gap-2.5 text-xs text-rose-800 dark:text-rose-200">
          <AlertTriangle className="w-5 h-5 shrink-0 text-rose-600" />
          <p className="leading-relaxed">
            {isBn
              ? 'সতর্কতা: অ্যাকাউন্ট মুছে ফেললে আপনার সকল সক্রিয় সেশন ও রুম সদস্যপদ বাতিল হবে। আপনি কোনো সক্রিয় রুমের একমাত্র Owner হলে আগে মালিকানা হস্তান্তর (Transfer Ownership) বা রুম মুছে ফেলতে হবে।'
              : 'Warning: Deleting your account revokes all sessions and memberships immediately. If you are the sole Owner of an active room, you must transfer ownership or delete that room first.'}
          </p>
        </div>

        <div>
          <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 mb-1.5">
            {isBn ? 'নিশ্চিত করতে DELETE লিখুন:' : 'Type DELETE to confirm:'}
          </label>
          <input
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="DELETE"
            className="w-full px-3.5 py-2.5 min-h-[44px] rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-xs font-mono uppercase"
          />
        </div>

        <div className="flex items-center justify-end gap-2.5 pt-2">
          <ActionButton variant="ghost" onClick={onClose}>
            {isBn ? 'বাতিল' : 'Cancel'}
          </ActionButton>
          <ActionButton
            variant="danger"
            disabled={confirmText.trim().toUpperCase() !== 'DELETE'}
            icon={<Trash2 className="w-4 h-4" />}
            onClick={async () => {
              await onConfirmDelete();
              setConfirmText('');
            }}
          >
            {isBn ? 'অ্যাকাউন্ট মুছুন' : 'Delete Account'}
          </ActionButton>
        </div>
      </div>
    </Modal>
  );
};
