import React, { useState, useEffect, useMemo } from 'react';
import {
  Check,
  ChevronRight,
  ChevronLeft,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Search,
  UserPlus,
  Plus,
  Trash2,
  Clock,
  ShieldCheck,
  Save,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.js';
import { useToast } from './Toast.js';
import { Modal } from './Modal.js';
import { ActionButton, useUnsavedChanges } from './ActionButton.js';
import { SlotBadge, SlotIcon, type SlotType } from './SlotBadge.js';
import { DualDatePicker } from './DualDatePicker.js';
import {
  formatDualDateFromYMD,
  formatCurrency,
  formatNumberByLanguage,
  formatTimeString12,
  getNextDayYMD,
  getTodayDhakaYMD,
  isNightCrossingMidnight,
} from '../lib/dateUtils.js';
import { apiRequest, generateIdempotencyKey } from '../lib/api.js';
import type { HallItem } from '../pages/HallsPage.js';
import type { CustomerItem } from '../pages/CustomersPage.js';

export interface ExtraServiceInput {
  type: 'CATERING' | 'DECORATION' | 'SOUND' | 'LIGHTING' | 'OTHER';
  label: string;
  amount: number;
}

export interface BookingFormInitialData {
  bookingId?: string;
  event_date?: string;
  slot?: SlotType;
  hall_id?: string;
  customer_id?: string;
  event_type?: string;
  start_time?: string;
  end_time?: string;
  guest_count?: number;
  package_name?: string | null;
  extra_services?: ExtraServiceInput[];
  hall_rent?: number;
  advance_amount?: number;
  status?: 'TENTATIVE' | 'CONFIRMED';
  notes?: string | null;
}

interface BookingWizardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: (bookingId: string) => void;
  initialData?: BookingFormInitialData | null;
}

const DRAFT_STORAGE_KEY = 'lily_part2_booking_draft';

export const BookingWizardModal: React.FC<BookingWizardModalProps> = ({
  isOpen,
  onClose,
  onSaved,
  initialData,
}) => {
  const { activeRoom, activeMember, language, t } = useAuth();
  const { showSuccess, showError } = useToast();

  const isEditing = Boolean(initialData?.bookingId);
  const isOwnerOrManager = activeMember?.role === 'OWNER' || activeMember?.role === 'MANAGER';

  const [step, setStep] = useState<number>(1);
  const [dirty, setDirty] = useState(false);

  // Reference lists
  const [halls, setHalls] = useState<HallItem[]>([]);
  const [customers, setCustomers] = useState<CustomerItem[]>([]);
  const [customerSearch, setCustomerSearch] = useState('');

  // Form State
  const [eventDate, setEventDate] = useState<string>(() => getTodayDhakaYMD());
  const [slot, setSlot] = useState<SlotType>('DAY');
  const [hallId, setHallId] = useState<string>('');
  const [startTime, setStartTime] = useState<string>('08:00');
  const [endTime, setEndTime] = useState<string>('16:00');

  // Availability live result for selected date & hall
  const [availability, setAvailability] = useState<any | null>(null);
  const [loadingAvail, setLoadingAvail] = useState(false);

  // Step 2: Customer state
  const [customerMode, setCustomerMode] = useState<'existing' | 'new'>('existing');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [newCustName, setNewCustName] = useState('');
  const [newCustPhone, setNewCustPhone] = useState('');
  const [newCustAltPhone, setNewCustAltPhone] = useState('');
  const [newCustAddress, setNewCustAddress] = useState('');
  const [duplicateCustomerFound, setDuplicateCustomerFound] = useState<CustomerItem | null>(null);

  // Step 3: Event details & services
  const [eventType, setEventType] = useState<string>('WEDDING');
  const [guestCount, setGuestCount] = useState<number>(250);
  const [packageName, setPackageName] = useState<string>('');
  const [extraServices, setExtraServices] = useState<ExtraServiceInput[]>([]);
  const [notes, setNotes] = useState<string>('');

  // Step 4: Pricing & Status
  const [hallRent, setHallRent] = useState<number>(0);
  const [managerPriceApproved, setManagerPriceApproved] = useState<boolean>(false);
  const [advanceAmount, setAdvanceAmount] = useState<number>(0);
  const [bookingStatus, setBookingStatus] = useState<'TENTATIVE' | 'CONFIRMED'>('CONFIRMED');
  const [holdHours, setHoldHours] = useState<number>(48);
  const [confirmPastDate, setConfirmPastDate] = useState<boolean>(false);

  // Submission & Idempotency
  const [idempotencyKey, setIdempotencyKey] = useState<string>('');
  const [saving, setSaving] = useState(false);

  useUnsavedChanges(isOpen && dirty);

  const selectedHall = useMemo(
    () => halls.find((h) => h.id === hallId) || null,
    [halls, hallId]
  );

  const basePriceForSlot = useMemo(() => {
    if (!selectedHall) return 0;
    if (slot === 'DAY') return selectedHall.day_price;
    if (slot === 'NIGHT') return selectedHall.night_price;
    return selectedHall.full_price;
  }, [selectedHall, slot]);

  const extraServicesTotal = useMemo(
    () => extraServices.reduce((sum, s) => sum + (Number(s.amount) || 0), 0),
    [extraServices]
  );

  const totalAmount = useMemo(
    () => Math.max(0, (Number(hallRent) || 0) + extraServicesTotal),
    [hallRent, extraServicesTotal]
  );

  const dueAmount = useMemo(
    () => Math.max(0, totalAmount - (Number(advanceAmount) || 0)),
    [totalAmount, advanceAmount]
  );

  const todayYMD = useMemo(() => getTodayDhakaYMD(), []);
  const isPastDate = eventDate < todayYMD;

  // Initialize form when modal opens
  useEffect(() => {
    if (!isOpen || !activeRoom) return;

    setStep(1);
    setIdempotencyKey(`idem-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);

    // Load active halls & customers
    (async () => {
      try {
        const [hRes, cRes] = await Promise.all([
          apiRequest<{ halls: HallItem[] }>(`/api/rooms/${activeRoom.id}/halls?activeOnly=true`),
          apiRequest<{ customers: CustomerItem[] }>(`/api/rooms/${activeRoom.id}/customers?limit=150`),
        ]);
        const loadedHalls = hRes.halls || [];
        setHalls(loadedHalls);
        setCustomers(cRes.customers || []);

        if (initialData?.bookingId) {
          // Editing existing booking
          setEventDate(initialData.event_date || getTodayDhakaYMD());
          setSlot(initialData.slot || 'DAY');
          setHallId(initialData.hall_id || loadedHalls[0]?.id || '');
          setSelectedCustomerId(initialData.customer_id || '');
          setCustomerMode('existing');
          setEventType(initialData.event_type || 'WEDDING');
          setStartTime(initialData.start_time || '08:00');
          setEndTime(initialData.end_time || '16:00');
          setGuestCount(initialData.guest_count || 200);
          setPackageName(initialData.package_name || '');
          setExtraServices(initialData.extra_services || []);
          setHallRent(initialData.hall_rent ?? 0);
          setAdvanceAmount(initialData.advance_amount ?? 0);
          setBookingStatus(initialData.status === 'TENTATIVE' ? 'TENTATIVE' : 'CONFIRMED');
          setNotes(initialData.notes || '');
          setConfirmPastDate(true);
          setDirty(false);
        } else {
          // Check if there is a saved draft or prefilled slot/date from calendar
          let draft: any = null;
          try {
            const rawDraft = sessionStorage.getItem(DRAFT_STORAGE_KEY);
            if (rawDraft) draft = JSON.parse(rawDraft);
          } catch {}

          const defaultSlot: SlotType = initialData?.slot || draft?.slot || 'DAY';
          const defaultDate = initialData?.event_date || draft?.event_date || getTodayDhakaYMD();
          const defaultHallId = initialData?.hall_id || draft?.hall_id || loadedHalls[0]?.id || '';

          setEventDate(defaultDate);
          setSlot(defaultSlot);
          setHallId(defaultHallId);

          const targetHall = loadedHalls.find((h) => h.id === defaultHallId) || loadedHalls[0];
          if (targetHall) {
            const bp =
              defaultSlot === 'DAY'
                ? targetHall.day_price
                : defaultSlot === 'NIGHT'
                ? targetHall.night_price
                : targetHall.full_price;
            setHallRent(draft?.hall_rent ?? bp);
          }

          applyDefaultSlotTimes(defaultSlot);
          setSelectedCustomerId(draft?.customer_id || '');
          setEventType(draft?.event_type || 'WEDDING');
          setGuestCount(draft?.guest_count || 250);
          setPackageName(draft?.package_name || '');
          setExtraServices(draft?.extra_services || []);
          setAdvanceAmount(draft?.advance_amount || 0);
          setBookingStatus(draft?.status || 'CONFIRMED');
          setNotes(draft?.notes || '');
          setConfirmPastDate(false);
          setDirty(false);
        }
      } catch (err: any) {
        showError(err.messageBn || err.messageEn || 'Failed to initialize booking form');
      }
    })();
  }, [isOpen, activeRoom, initialData]);

  // Persist draft to sessionStorage when creating a new booking so data is never lost on back/refresh
  useEffect(() => {
    if (!isOpen || isEditing) return;
    try {
      sessionStorage.setItem(
        DRAFT_STORAGE_KEY,
        JSON.stringify({
          event_date: eventDate,
          slot,
          hall_id: hallId,
          customer_id: selectedCustomerId,
          event_type: eventType,
          guest_count: guestCount,
          package_name: packageName,
          extra_services: extraServices,
          hall_rent: hallRent,
          advance_amount: advanceAmount,
          status: bookingStatus,
          notes,
        })
      );
    } catch {}
  }, [
    isOpen,
    isEditing,
    eventDate,
    slot,
    hallId,
    selectedCustomerId,
    eventType,
    guestCount,
    packageName,
    extraServices,
    hallRent,
    advanceAmount,
    bookingStatus,
    notes,
  ]);

  const applyDefaultSlotTimes = (targetSlot: SlotType) => {
    if (!activeRoom) return;
    if (targetSlot === 'DAY') {
      setStartTime(activeRoom.day_start_time || '08:00');
      setEndTime(activeRoom.day_end_time || '16:00');
    } else if (targetSlot === 'NIGHT') {
      setStartTime(activeRoom.night_start_time || '18:00');
      setEndTime(activeRoom.night_end_time || '00:00');
    } else {
      setStartTime(activeRoom.day_start_time || '08:00');
      setEndTime(activeRoom.night_end_time || '00:00');
    }
  };

  const handleSlotChange = (newSlot: SlotType) => {
    setSlot(newSlot);
    setDirty(true);
    applyDefaultSlotTimes(newSlot);
    if (selectedHall) {
      const bp =
        newSlot === 'DAY'
          ? selectedHall.day_price
          : newSlot === 'NIGHT'
          ? selectedHall.night_price
          : selectedHall.full_price;
      setHallRent(bp);
    }
  };

  const handleHallChange = (newHallId: string) => {
    setHallId(newHallId);
    setDirty(true);
    const h = halls.find((x) => x.id === newHallId);
    if (h) {
      const bp = slot === 'DAY' ? h.day_price : slot === 'NIGHT' ? h.night_price : h.full_price;
      setHallRent(bp);
    }
  };

  // Live availability check whenever date or hall changes
  useEffect(() => {
    if (!isOpen || !activeRoom || !hallId || !eventDate) return;
    let active = true;
    setLoadingAvail(true);

    const excludeParam = initialData?.bookingId
      ? `&excludeBookingId=${encodeURIComponent(initialData.bookingId)}`
      : '';

    apiRequest<{ availability: any }>(
      `/api/rooms/${activeRoom.id}/availability?date=${encodeURIComponent(eventDate)}&hallId=${encodeURIComponent(hallId)}${excludeParam}`
    )
      .then((res) => {
        if (active) setAvailability(res.availability || null);
      })
      .catch(() => {
        if (active) setAvailability(null);
      })
      .finally(() => {
        if (active) setLoadingAvail(false);
      });

    return () => {
      active = false;
    };
  }, [isOpen, activeRoom, hallId, eventDate, initialData?.bookingId]);

  // Check if currently picked slot is free
  const isPickedSlotFree = useMemo(() => {
    if (!availability) return true;
    if (slot === 'DAY') return availability.day_free;
    if (slot === 'NIGHT') return availability.night_free;
    return availability.full_free;
  }, [availability, slot]);

  // Check duplicate phone in Step 2
  const handleCheckNewPhone = async () => {
    if (!activeRoom || !newCustPhone.trim()) return;
    try {
      const res = await apiRequest<{ exists: boolean; customer: CustomerItem | null }>(
        `/api/rooms/${activeRoom.id}/customers/check-phone?phone=${encodeURIComponent(newCustPhone.trim())}`
      );
      if (res.exists && res.customer) {
        setDuplicateCustomerFound(res.customer);
      } else {
        setDuplicateCustomerFound(null);
      }
    } catch {}
  };

  const handleCloseWithCheck = () => {
    if (dirty && !saving) {
      const msg =
        language === 'bn'
          ? 'আপনার অসংরক্ষিত পরিবর্তন রয়েছে। আপনি কি নিশ্চিতভাবে ফর্মটি বন্ধ করতে চান?'
          : 'You have unsaved changes. Are you sure you want to leave?';
      if (!window.confirm(msg)) return;
    }
    onClose();
  };

  // Step Validations
  const validateStep1 = (): boolean => {
    if (!eventDate || !hallId) {
      showError(
        language === 'bn'
          ? 'অনুগ্রহ করে তারিখ এবং হল নির্বাচন করুন।'
          : 'Please select an event date and hall.'
      );
      return false;
    }
    if (!isPickedSlotFree) {
      showError(
        language === 'bn'
          ? 'নির্বাচিত স্লটটি ইতোমধ্যে বুক করা আছে! অনুগ্রহ করে খালি স্লট বা অন্য তারিখ নির্বাচন করুন।'
          : 'The selected slot is already taken! Please choose a free slot or another date.'
      );
      return false;
    }
    if (isPastDate && !confirmPastDate) {
      showError(
        language === 'bn'
          ? 'নির্বাচিত তারিখটি অতীতের। সামনে এগোতে অতীত তারিখের সতর্কবার্তায় টিক দিন।'
          : 'The selected date is in the past. Please check the past-date confirmation box to proceed.'
      );
      return false;
    }
    return true;
  };

  const validateStep2 = async (): Promise<boolean> => {
    if (customerMode === 'existing') {
      if (!selectedCustomerId) {
        showError(
          language === 'bn'
            ? 'অনুগ্রহ করে একজন গ্রাহক নির্বাচন করুন অথবা নতুন গ্রাহক যুক্ত করুন।'
            : 'Please select an existing customer or add a new customer.'
        );
        return false;
      }
      return true;
    }

    // Creating new customer inline
    if (!newCustName.trim() || !newCustPhone.trim()) {
      showError(
        language === 'bn'
          ? 'নতুন গ্রাহকের নাম এবং ফোন নম্বর আবশ্যক।'
          : 'New customer name and phone number are required.'
      );
      return false;
    }

    if (!activeRoom) return false;
    try {
      const res = await apiRequest<{ customer: CustomerItem }>(
        `/api/rooms/${activeRoom.id}/customers`,
        {
          method: 'POST',
          body: JSON.stringify({
            name: newCustName.trim(),
            phone: newCustPhone.trim(),
            alt_phone: newCustAltPhone.trim() || null,
            address: newCustAddress.trim() || null,
          }),
        }
      );
      setCustomers((prev) => [res.customer, ...prev]);
      setSelectedCustomerId(res.customer.id);
      setCustomerMode('existing');
      return true;
    } catch (err: any) {
      if (err.data?.error === 'DUPLICATE_CUSTOMER_PHONE' && err.data?.existingCustomer) {
        setDuplicateCustomerFound(err.data.existingCustomer);
      }
      showError(language === 'bn' ? err.messageBn || err.message : err.messageEn || err.message);
      return false;
    }
  };

  const validateStep3 = (): boolean => {
    if (!guestCount || guestCount < 1) {
      showError(
        language === 'bn'
          ? 'অতিথি সংখ্যা কমপক্ষে ১ জন হতে হবে।'
          : 'Guest count must be at least 1.'
      );
      return false;
    }
    return true;
  };

  const validateStep4 = (): boolean => {
    if (hallRent < 0 || advanceAmount < 0) {
      showError(
        language === 'bn'
          ? 'ভাড়া বা অগ্রিম টাকা ঋণাত্মক হতে পারবে না।'
          : 'Amounts cannot be negative.'
      );
      return false;
    }
    if (hallRent < basePriceForSlot && !isOwnerOrManager && !managerPriceApproved) {
      showError(
        language === 'bn'
          ? 'স্টাফ হিসেবে বেস ভাড়ার নিচে মূল্য নির্ধারণ করতে ম্যানেজারের অনুমোদন নিশ্চিত করুন।'
          : 'Staff cannot set a price below the base price without Manager approval.'
      );
      return false;
    }
    if (advanceAmount > totalAmount) {
      showError(
        language === 'bn'
          ? 'অগ্রিম জমার পরিমাণ মোট বিলের চেয়ে বেশি হতে পারবে না।'
          : 'Advance amount cannot exceed total amount.'
      );
      return false;
    }
    return true;
  };

  const handleNextStep = async () => {
    if (step === 1 && !validateStep1()) return;
    if (step === 2 && !(await validateStep2())) return;
    if (step === 3 && !validateStep3()) return;
    if (step === 4 && !validateStep4()) return;
    setStep((s) => Math.min(5, s + 1));
  };

  const handleConfirmSave = async () => {
    if (!activeRoom || saving) return;
    setSaving(true);
    try {
      const key = idempotencyKey || generateIdempotencyKey('booking');
      const payload = {
        customer_id: selectedCustomerId,
        hall_id: hallId,
        event_type: eventType,
        event_date: eventDate,
        slot,
        start_time: startTime,
        end_time: endTime,
        guest_count: Number(guestCount),
        package_name: packageName.trim() || null,
        extra_services: extraServices.filter((s) => s.label.trim() !== ''),
        hall_rent: Number(hallRent),
        manager_price_approved: managerPriceApproved,
        advance_amount: Number(advanceAmount),
        confirm_past_date: confirmPastDate,
        status: bookingStatus,
        hold_hours: bookingStatus === 'TENTATIVE' ? Number(holdHours) : null,
        notes: notes.trim() || null,
        idempotency_key: key,
      };

      if (isEditing && initialData?.bookingId) {
        const res = await apiRequest<{ booking: any; messageBn: string; messageEn: string }>(
          `/api/rooms/${activeRoom.id}/bookings/${initialData.bookingId}`,
          {
            method: 'PATCH',
            idempotencyKey: key,
            body: JSON.stringify(payload),
          }
        );
        showSuccess(language === 'bn' ? res.messageBn : res.messageEn);
        onSaved(res.booking.id);
      } else {
        const res = await apiRequest<{ booking: any; messageBn: string; messageEn: string }>(
          `/api/rooms/${activeRoom.id}/bookings`,
          {
            method: 'POST',
            idempotencyKey: key,
            body: JSON.stringify(payload),
          }
        );
        try {
          sessionStorage.removeItem(DRAFT_STORAGE_KEY);
        } catch {}
        showSuccess(language === 'bn' ? res.messageBn : res.messageEn);
        onSaved(res.booking.id);
      }
      onClose();
    } catch (err: any) {
      showError(language === 'bn' ? err.messageBn || err.message : err.messageEn || err.message);
    } finally {
      setSaving(false);
    }
  };

  const selectedCustomerObj = useMemo(
    () => customers.find((c) => c.id === selectedCustomerId) || null,
    [customers, selectedCustomerId]
  );

  const filteredCustomers = useMemo(() => {
    if (!customerSearch.trim()) return customers.slice(0, 30);
    const q = customerSearch.toLowerCase();
    return customers
      .filter((c) => c.name.toLowerCase().includes(q) || c.phone.toLowerCase().includes(q))
      .slice(0, 30);
  }, [customers, customerSearch]);

  const crossesMidnight =
    (slot === 'NIGHT' || slot === 'FULL') && isNightCrossingMidnight(startTime, endTime);

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleCloseWithCheck}
      title={
        isEditing
          ? language === 'bn'
            ? 'বুকিং সম্পাদনা (Edit Booking)'
            : 'Edit Booking'
          : t('newBookingBtn')
      }
      maxWidth="lg"
    >
      <div className="space-y-6">
        {/* Step Progress Indicator */}
        <div className="grid grid-cols-5 gap-1.5">
          {[1, 2, 3, 4, 5].map((num) => {
            const isCurrent = step === num;
            const isDone = step > num;
            return (
              <div
                key={num}
                className={`p-2 rounded-xl border text-center transition-all ${
                  isCurrent
                    ? 'bg-[#582C4D] text-white border-[#582C4D] shadow-xs'
                    : isDone
                    ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                    : 'bg-stone-50 dark:bg-stone-900 border-stone-200 dark:border-stone-800 text-stone-400'
                }`}
              >
                <div className="text-[11px] font-extrabold truncate">
                  {t(`step${num}Title` as any)}
                </div>
              </div>
            );
          })}
        </div>

        {/* STEP 1: Date, Slot (Day / Night / Full) & Hall with LIVE availability */}
        {step === 1 && (
          <div className="space-y-5">
            <DualDatePicker
              label={`${t('eventDateLabel')} *`}
              value={eventDate}
              onChange={(ymd) => {
                setEventDate(ymd);
                setDirty(true);
              }}
            />

            {isPastDate && (
              <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 space-y-2">
                <div className="flex items-start gap-2 text-xs font-bold text-amber-900 dark:text-amber-200">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <span>
                    {language === 'bn'
                      ? 'সতর্কতা: আপনি অতীতের একটি তারিখ নির্বাচন করেছেন।'
                      : 'Warning: You have selected a past event date.'}
                  </span>
                </div>
                <label className="flex items-center gap-2 text-xs font-semibold text-amber-950 dark:text-amber-100 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={confirmPastDate}
                    onChange={(e) => setConfirmPastDate(e.target.checked)}
                    className="w-4 h-4 rounded accent-amber-600"
                  />
                  <span>
                    {language === 'bn'
                      ? 'হ্যাঁ, আমি জেনেবুঝে অতীতের তারিখে বুকিংটি সংরক্ষণ করতে চাই'
                      : 'Yes, I confirm saving this booking on a past date'}
                  </span>
                </label>
              </div>
            )}

            {/* Hall Selector */}
            <div>
              <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 mb-1.5">
                {language === 'bn' ? 'হল নির্বাচন করুন *' : 'Select Hall *'}
              </label>
              <select
                value={hallId}
                onChange={(e) => handleHallChange(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-xs sm:text-sm font-bold"
              >
                {halls.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name} — ({formatNumberByLanguage(h.capacity, language)} {t('guestsUnit')})
                  </option>
                ))}
              </select>
            </div>

            {/* LIVE Slot Availability Panel (Green Free, Red Taken with Holder) */}
            {availability && (
              <div className="p-4 rounded-2xl bg-stone-50 dark:bg-stone-900/60 border border-stone-200 dark:border-stone-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-stone-700 dark:text-stone-300">
                    {language === 'bn'
                      ? 'লাইভ স্লট প্রাপ্যতা (Live Availability):'
                      : 'Live Slot Availability:'}
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-[#582C4D]/10 text-[#582C4D] dark:bg-[#C5A059]/20 dark:text-[#C5A059]">
                    {t(`avail_${availability.availability_state}` as any)}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                  {/* Day Slot Status Box */}
                  <div
                    className={`p-3 rounded-xl border flex items-start justify-between gap-2 ${
                      availability.day_free
                        ? 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
                        : 'bg-rose-50/80 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800 text-rose-900 dark:text-rose-200'
                    }`}
                  >
                    <div>
                      <div className="font-bold flex items-center gap-1.5">
                        <SlotIcon slot="DAY" />
                        <span>{t('slot_DAY')} (Day)</span>
                      </div>
                      {availability.day_holder ? (
                        <div className="text-[11px] mt-1 font-medium">
                          {t('heldBy')}: <strong className="underline">{availability.day_holder.customer_name}</strong> ({availability.day_holder.booking_number})
                        </div>
                      ) : (
                        <div className="text-[11px] mt-1 font-semibold text-emerald-700 dark:text-emerald-300">
                          ✓ {t('slotFree')}
                        </div>
                      )}
                    </div>
                    {availability.day_free ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    ) : (
                      <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
                    )}
                  </div>

                  {/* Night Slot Status Box */}
                  <div
                    className={`p-3 rounded-xl border flex items-start justify-between gap-2 ${
                      availability.night_free
                        ? 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
                        : 'bg-rose-50/80 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800 text-rose-900 dark:text-rose-200'
                    }`}
                  >
                    <div>
                      <div className="font-bold flex items-center gap-1.5">
                        <SlotIcon slot="NIGHT" />
                        <span>{t('slot_NIGHT')} (Night)</span>
                      </div>
                      {availability.night_holder ? (
                        <div className="text-[11px] mt-1 font-medium">
                          {t('heldBy')}: <strong className="underline">{availability.night_holder.customer_name}</strong> ({availability.night_holder.booking_number})
                        </div>
                      ) : (
                        <div className="text-[11px] mt-1 font-semibold text-emerald-700 dark:text-emerald-300">
                          ✓ {t('slotFree')}
                        </div>
                      )}
                    </div>
                    {availability.night_free ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    ) : (
                      <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Slot Picker Cards: DAY / NIGHT / FULL */}
            <div>
              <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 mb-2">
                {t('slotLabel')} (Day / Night / Full) *
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {(['DAY', 'NIGHT', 'FULL'] as SlotType[]).map((sType) => {
                  const isSelected = slot === sType;
                  const isFree =
                    !availability ||
                    (sType === 'DAY'
                      ? availability.day_free
                      : sType === 'NIGHT'
                      ? availability.night_free
                      : availability.full_free);

                  const slotPrice = selectedHall
                    ? sType === 'DAY'
                      ? selectedHall.day_price
                      : sType === 'NIGHT'
                      ? selectedHall.night_price
                      : selectedHall.full_price
                    : 0;

                  return (
                    <button
                      key={sType}
                      type="button"
                      onClick={() => handleSlotChange(sType)}
                      className={`p-3.5 rounded-2xl border-2 text-left transition-all cursor-pointer flex flex-col justify-between gap-2 ${
                        isSelected
                          ? 'border-[#582C4D] dark:border-[#C5A059] bg-[#582C4D]/8 dark:bg-[#C5A059]/15 shadow-sm'
                          : isFree
                          ? 'border-stone-200 dark:border-stone-800 hover:border-stone-300'
                          : 'border-rose-300 dark:border-rose-900/60 bg-rose-50/40 dark:bg-rose-950/20 opacity-80'
                      }`}
                    >
                      <div className="flex items-center justify-between w-full">
                        <SlotBadge slot={sType} size="sm" showDualLang />
                        <span
                          className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                            isFree
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                              : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                          }`}
                        >
                          {isFree ? t('slotFree') : t('slotTaken')}
                        </span>
                      </div>

                      <div className="text-xs text-stone-500 dark:text-stone-400">
                        {t(`slotDesc_${sType}` as any)}
                      </div>

                      <div className="text-sm font-extrabold text-stone-900 dark:text-stone-100">
                        {formatCurrency(slotPrice, language)}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Start and End Time inside allowed slot window */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 mb-1">
                  {t('startTimeLabel')} ({formatTimeString12(startTime, language)})
                </label>
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => {
                    setStartTime(e.target.value);
                    setDirty(true);
                  }}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-xs sm:text-sm font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 mb-1">
                  {t('endTimeLabel')} ({formatTimeString12(endTime, language)})
                </label>
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => {
                    setEndTime(e.target.value);
                    setDirty(true);
                  }}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-xs sm:text-sm font-mono"
                />
              </div>
            </div>

            {/* Midnight crossing banner */}
            {crossesMidnight && (
              <div className="p-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 text-xs text-indigo-900 dark:text-indigo-200 flex items-center gap-2">
                <Clock className="w-4 h-4 text-indigo-600 shrink-0" />
                <span>
                  {language === 'bn'
                    ? `এই রাতের স্লটটি মধ্যরাতের পরে পরদিন (${formatDualDateFromYMD(getNextDayYMD(eventDate))}) ${formatTimeString12(endTime, 'bn')} এ শেষ হবে, তবে এটি শুরুর তারিখেই (${formatDualDateFromYMD(eventDate)}) গণ্য হবে।`
                    : `This Night booking ends at ${formatTimeString12(endTime, 'en')} next day (${formatDualDateFromYMD(getNextDayYMD(eventDate))}) and remains anchored to its starting date.`}
                </span>
              </div>
            )}
          </div>
        )}

        {/* STEP 2: Customer (Search Existing or Add New) */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="flex p-1 bg-stone-100 dark:bg-stone-800 rounded-2xl">
              <button
                type="button"
                onClick={() => setCustomerMode('existing')}
                className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  customerMode === 'existing'
                    ? 'bg-white dark:bg-[#1E1920] text-[#582C4D] dark:text-[#C5A059] shadow-xs'
                    : 'text-stone-600 dark:text-stone-400'
                }`}
              >
                {language === 'bn' ? 'বিদ্যমান গ্রাহক খুঁজুন' : 'Search Existing Customer'}
              </button>
              <button
                type="button"
                onClick={() => setCustomerMode('new')}
                className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  customerMode === 'new'
                    ? 'bg-white dark:bg-[#1E1920] text-[#582C4D] dark:text-[#C5A059] shadow-xs'
                    : 'text-stone-600 dark:text-stone-400'
                }`}
              >
                + {t('addCustomerBtn')}
              </button>
            </div>

            {customerMode === 'existing' ? (
              <div className="space-y-3">
                <div className="relative">
                  <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={customerSearch}
                    onChange={(e) => setCustomerSearch(e.target.value)}
                    placeholder={
                      language === 'bn'
                        ? 'গ্রাহকের নাম বা ফোন নম্বর লিখে খুঁজুন...'
                        : 'Type customer name or phone...'
                    }
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-xs sm:text-sm"
                  />
                </div>

                <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
                  {filteredCustomers.map((c) => {
                    const isSelected = c.id === selectedCustomerId;
                    return (
                      <div
                        key={c.id}
                        onClick={() => {
                          setSelectedCustomerId(c.id);
                          setDirty(true);
                        }}
                        className={`p-3 rounded-xl border cursor-pointer flex items-center justify-between transition-all ${
                          isSelected
                            ? 'border-[#582C4D] dark:border-[#C5A059] bg-[#582C4D]/10 dark:bg-[#C5A059]/15'
                            : 'border-stone-200 dark:border-stone-800 hover:border-stone-300'
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="text-xs sm:text-sm font-bold text-stone-900 dark:text-stone-100 break-words">
                            {c.name}
                          </div>
                          <div className="text-xs font-mono text-stone-500">
                            {c.phone} {c.address ? `• ${c.address}` : ''}
                          </div>
                        </div>
                        {isSelected && <Check className="w-4 h-4 text-[#582C4D] dark:text-[#C5A059] shrink-0" />}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {duplicateCustomerFound && (
                  <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 space-y-2">
                    <div className="text-xs font-bold text-amber-900 dark:text-amber-200">
                      {language === 'bn'
                        ? `এই ফোন নম্বরে "${duplicateCustomerFound.name}" (${duplicateCustomerFound.phone}) ইতোমধ্যে নিবন্ধিত আছেন!`
                        : `Customer "${duplicateCustomerFound.name}" (${duplicateCustomerFound.phone}) already exists with this phone!`}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedCustomerId(duplicateCustomerFound.id);
                        setCustomerMode('existing');
                        setDuplicateCustomerFound(null);
                      }}
                      className="w-full py-2 px-3 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold cursor-pointer"
                    >
                      {t('useExistingCustomerBtn')} — {duplicateCustomerFound.name}
                    </button>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 mb-1">
                    {t('customerNameLabel')} *
                  </label>
                  <input
                    type="text"
                    value={newCustName}
                    onChange={(e) => setNewCustName(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-xs sm:text-sm"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 mb-1">
                      {t('customerPhoneLabel')} *
                    </label>
                    <input
                      type="text"
                      value={newCustPhone}
                      onChange={(e) => setNewCustPhone(e.target.value)}
                      onBlur={handleCheckNewPhone}
                      placeholder="01711-XXXXXX"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-xs sm:text-sm font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 mb-1">
                      {t('customerAltPhoneLabel')}
                    </label>
                    <input
                      type="text"
                      value={newCustAltPhone}
                      onChange={(e) => setNewCustAltPhone(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-xs sm:text-sm font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 mb-1">
                    {t('customerAddressLabel')}
                  </label>
                  <input
                    type="text"
                    value={newCustAddress}
                    onChange={(e) => setNewCustAddress(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-xs sm:text-sm"
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* STEP 3: Event Details, Package & Extra Services */}
        {step === 3 && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 mb-1">
                  {t('eventTypeLabel')} *
                </label>
                <select
                  value={eventType}
                  onChange={(e) => {
                    setEventType(e.target.value);
                    setDirty(true);
                  }}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-xs sm:text-sm font-bold"
                >
                  {['WEDDING', 'HOLUD', 'RECEPTION', 'ENGAGEMENT', 'BIRTHDAY', 'AQIQAH', 'MEETING', 'OTHER'].map(
                    (ev) => (
                      <option key={ev} value={ev}>
                        {t(`event_${ev}` as any)}
                      </option>
                    )
                  )}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 mb-1">
                  {t('guestCountLabel')} *
                </label>
                <input
                  type="number"
                  min={1}
                  value={guestCount}
                  onChange={(e) => {
                    setGuestCount(parseInt(e.target.value, 10) || 1);
                    setDirty(true);
                  }}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-xs sm:text-sm font-bold"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 mb-1">
                  {t('packageLabel')}
                </label>
                <input
                  type="text"
                  value={packageName}
                  onChange={(e) => {
                    setPackageName(e.target.value);
                    setDirty(true);
                  }}
                  placeholder={
                    language === 'bn'
                      ? 'যেমন: রয়েল ওয়েডিং প্যাকেজ / স্ট্যান্ডার্ড হল ভাড়া'
                      : 'e.g. Royal Wedding Package / Standard Hall Rental'
                  }
                  className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-xs sm:text-sm"
                />
              </div>
            </div>

            {/* Extra Services Builder */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-stone-700 dark:text-stone-300">
                  {t('extraServicesLabel')} (Catering, Decoration, Sound, Lighting, Other)
                </label>
                <button
                  type="button"
                  onClick={() =>
                    setExtraServices((prev) => [
                      ...prev,
                      { type: 'CATERING', label: language === 'bn' ? 'ক্যাটারিং সেবা' : 'Catering Service', amount: 10000 },
                    ])
                  }
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#582C4D]/10 text-[#582C4D] dark:bg-[#C5A059]/20 dark:text-[#C5A059] text-xs font-bold cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{language === 'bn' ? 'সেবা যুক্ত করুন' : 'Add Service'}</span>
                </button>
              </div>

              {extraServices.map((srv, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                  <select
                    value={srv.type}
                    onChange={(e) => {
                      const val = e.target.value as ExtraServiceInput['type'];
                      setExtraServices((prev) =>
                        prev.map((item, i) => (i === idx ? { ...item, type: val } : item))
                      );
                    }}
                    className="col-span-4 px-2.5 py-2 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-xs"
                  >
                    <option value="CATERING">{t('service_CATERING')}</option>
                    <option value="DECORATION">{t('service_DECORATION')}</option>
                    <option value="SOUND">{t('service_SOUND')}</option>
                    <option value="LIGHTING">{t('service_LIGHTING')}</option>
                    <option value="OTHER">{t('service_OTHER')}</option>
                  </select>

                  <input
                    type="text"
                    value={srv.label}
                    onChange={(e) => {
                      const val = e.target.value;
                      setExtraServices((prev) =>
                        prev.map((item, i) => (i === idx ? { ...item, label: val } : item))
                      );
                    }}
                    placeholder={language === 'bn' ? 'বিবরণ' : 'Description'}
                    className="col-span-4 px-2.5 py-2 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-xs"
                  />

                  <input
                    type="number"
                    min={0}
                    value={srv.amount}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value) || 0;
                      setExtraServices((prev) =>
                        prev.map((item, i) => (i === idx ? { ...item, amount: val } : item))
                      );
                    }}
                    className="col-span-3 px-2.5 py-2 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-xs font-bold"
                  />

                  <button
                    type="button"
                    onClick={() => setExtraServices((prev) => prev.filter((_, i) => i !== idx))}
                    className="col-span-1 p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg flex justify-center cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 mb-1">
                {t('customerNotesLabel')}
              </label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-xs"
              />
            </div>
          </div>
        )}

        {/* STEP 4: Pricing & Advance */}
        {step === 4 && (
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-stone-50 dark:bg-stone-900/60 border border-stone-200 dark:border-stone-800 flex items-center justify-between">
              <div>
                <div className="text-xs text-stone-500">{t('basePriceLabel')}</div>
                <div className="text-sm font-extrabold text-stone-900 dark:text-stone-100 mt-0.5">
                  {selectedHall?.name} — <SlotBadge slot={slot} size="xs" />
                </div>
              </div>
              <div className="text-base font-extrabold text-[#582C4D] dark:text-[#C5A059]">
                {formatCurrency(basePriceForSlot, language)}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 mb-1">
                  {t('hallRentLabel')} (৳) *
                </label>
                <input
                  type="number"
                  min={0}
                  value={hallRent}
                  onChange={(e) => {
                    setHallRent(parseFloat(e.target.value) || 0);
                    setDirty(true);
                  }}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-sm font-extrabold"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 mb-1">
                  {t('advanceAmountLabel')} (৳)
                </label>
                <input
                  type="number"
                  min={0}
                  max={totalAmount}
                  value={advanceAmount}
                  onChange={(e) => {
                    setAdvanceAmount(parseFloat(e.target.value) || 0);
                    setDirty(true);
                  }}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-sm font-extrabold text-emerald-700 dark:text-emerald-400"
                />
              </div>
            </div>

            {/* Staff below base price Manager approval check */}
            {hallRent < basePriceForSlot && !isOwnerOrManager && (
              <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 space-y-2">
                <div className="flex items-start gap-2 text-xs font-bold text-amber-900 dark:text-amber-200">
                  <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <span>
                    {language === 'bn'
                      ? `নির্ধারিত বেস ভাড়ার (${formatCurrency(basePriceForSlot, 'bn')}) নিচে মূল্য সেট করতে ম্যানেজারের অনুমোদন আবশ্যক। এই পরিবর্তনটি অডিট লগে রেকর্ড হবে।`
                      : `Manager approval is required for Staff to set a price below the base price (${formatCurrency(basePriceForSlot, 'en')}). This price change will be logged.`}
                  </span>
                </div>
                <label className="flex items-center gap-2 text-xs font-bold text-amber-950 dark:text-amber-100 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={managerPriceApproved}
                    onChange={(e) => setManagerPriceApproved(e.target.checked)}
                    className="w-4 h-4 rounded accent-amber-600"
                  />
                  <span>
                    {language === 'bn'
                      ? 'ম্যানেজার কর্তৃক এই ছাড় অনুমোদিত হয়েছে'
                      : 'Manager approval confirmed for this discounted price'}
                  </span>
                </label>
              </div>
            )}

            {/* Server-Verified Totals Summary Card */}
            <div className="p-4 rounded-2xl bg-[#582C4D]/5 dark:bg-[#C5A059]/10 border border-[#582C4D]/20 dark:border-[#C5A059]/25 space-y-2 text-xs sm:text-sm">
              <div className="flex justify-between">
                <span className="text-stone-600 dark:text-stone-400">{t('hallRentLabel')}:</span>
                <span className="font-bold">{formatCurrency(hallRent, language)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-600 dark:text-stone-400">{t('extraServicesLabel')}:</span>
                <span className="font-bold">{formatCurrency(extraServicesTotal, language)}</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-stone-200 dark:border-stone-700 text-sm sm:text-base font-extrabold text-stone-900 dark:text-stone-100">
                <span>{t('totalAmountLabel')}:</span>
                <span>{formatCurrency(totalAmount, language)}</span>
              </div>
              <div className="flex justify-between text-emerald-700 dark:text-emerald-400 font-bold">
                <span>{t('advanceAmountLabel')}:</span>
                <span>- {formatCurrency(advanceAmount, language)}</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-stone-200 dark:border-stone-700 text-sm sm:text-base font-extrabold text-rose-600 dark:text-rose-400">
                <span>{t('dueAmountLabel')}:</span>
                <span>{formatCurrency(dueAmount, language)}</span>
              </div>
            </div>

            {/* Booking Status & Tentative Hold Expiry */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 mb-1">
                  {t('status')}
                </label>
                <select
                  value={bookingStatus}
                  onChange={(e) => setBookingStatus(e.target.value as 'TENTATIVE' | 'CONFIRMED')}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-xs sm:text-sm font-bold"
                >
                  <option value="CONFIRMED">{t('bStatus_CONFIRMED')}</option>
                  <option value="TENTATIVE">{t('bStatus_TENTATIVE')}</option>
                </select>
              </div>

              {bookingStatus === 'TENTATIVE' && (
                <div>
                  <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 mb-1">
                    {language === 'bn'
                      ? 'অস্থায়ী হোল্ড মেয়াদ (ঘণ্টা)'
                      : 'Tentative Hold Expiry (Hours)'}
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={720}
                    value={holdHours}
                    onChange={(e) => setHoldHours(parseInt(e.target.value, 10) || 24)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-xs sm:text-sm font-bold"
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {/* STEP 5: Review and Confirm */}
        {step === 5 && (
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-stone-50 dark:bg-stone-900/70 border border-stone-200 dark:border-stone-800 space-y-3 text-xs sm:text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-stone-200 dark:border-stone-800">
                <span className="font-bold text-stone-900 dark:text-stone-100">
                  {selectedHall?.name}
                </span>
                <SlotBadge slot={slot} size="sm" showDualLang />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <span className="text-stone-500 block text-[11px]">{t('eventDateLabel')}</span>
                  <span className="font-bold">{formatDualDateFromYMD(eventDate)}</span>
                </div>
                <div>
                  <span className="text-stone-500 block text-[11px]">
                    {t('startTimeLabel')} – {t('endTimeLabel')}
                  </span>
                  <span className="font-bold">
                    {formatTimeString12(startTime, language)} – {formatTimeString12(endTime, language)}
                    {crossesMidnight && (
                      <span className="ml-1 text-indigo-600 dark:text-indigo-400 text-xs">
                        ({language === 'bn' ? 'পরদিন' : 'next day'})
                      </span>
                    )}
                  </span>
                </div>
                <div>
                  <span className="text-stone-500 block text-[11px]">{t('step2Title')}</span>
                  <span className="font-bold break-words">
                    {selectedCustomerObj?.name} ({selectedCustomerObj?.phone})
                  </span>
                </div>
                <div>
                  <span className="text-stone-500 block text-[11px]">
                    {t('eventTypeLabel')} & {t('guestCountLabel')}
                  </span>
                  <span className="font-bold">
                    {t(`event_${eventType}` as any)} • {formatNumberByLanguage(guestCount, language)}{' '}
                    {t('guestsUnit')}
                  </span>
                </div>
              </div>

              <div className="pt-2 border-t border-stone-200 dark:border-stone-800 grid grid-cols-3 gap-2 text-center">
                <div className="p-2 rounded-xl bg-white dark:bg-stone-900">
                  <div className="text-[11px] text-stone-500">{t('totalAmountLabel')}</div>
                  <div className="font-extrabold text-stone-900 dark:text-stone-100">
                    {formatCurrency(totalAmount, language)}
                  </div>
                </div>
                <div className="p-2 rounded-xl bg-white dark:bg-stone-900">
                  <div className="text-[11px] text-stone-500">{t('advanceAmountLabel')}</div>
                  <div className="font-extrabold text-emerald-600">
                    {formatCurrency(advanceAmount, language)}
                  </div>
                </div>
                <div className="p-2 rounded-xl bg-white dark:bg-stone-900">
                  <div className="text-[11px] text-stone-500">{t('dueAmountLabel')}</div>
                  <div className="font-extrabold text-rose-600">
                    {formatCurrency(dueAmount, language)}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Wizard Footer Navigation */}
        <div className="flex items-center justify-between pt-4 border-t border-stone-100 dark:border-stone-800">
          {step > 1 ? (
            <button
              type="button"
              disabled={saving}
              onClick={() => setStep((s) => s - 1)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-200 text-xs font-bold hover:bg-stone-200 cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>{t('prevStepBtn')}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleCloseWithCheck}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-stone-500 hover:bg-stone-100 cursor-pointer"
            >
              {t('cancel')}
            </button>
          )}

          {step < 5 ? (
            <ActionButton
              onClick={handleNextStep}
              icon={<ChevronRight className="w-4 h-4" />}
            >
              {t('nextStepBtn')}
            </ActionButton>
          ) : (
            <ActionButton
              loading={saving}
              loadingLabel={t('saving')}
              onClick={handleConfirmSave}
              icon={<Save className="w-4 h-4" />}
              className="!bg-[#0E8A44] hover:!bg-[#0B7137] !border-[#0E8A44]"
            >
              {isEditing
                ? t('save')
                : language === 'bn'
                ? 'বুকিং নিশ্চিত ও সংরক্ষণ করুন'
                : 'Confirm & Save Booking'}
            </ActionButton>
          )}
        </div>
      </div>
    </Modal>
  );
};
