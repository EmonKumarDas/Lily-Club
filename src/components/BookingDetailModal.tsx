import React, { useState, useEffect } from 'react';
import {
  Printer,
  Edit3,
  XCircle,
  CheckCircle2,
  Clock,
  FileText,
  History,
  Info,
  CreditCard,
  AlertTriangle,
  Plus,
  RotateCcw,
  Receipt,
  ShieldAlert,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.js';
import { useToast } from './Toast.js';
import { Modal } from './Modal.js';
import { LoadingSkeleton } from './LoadingSkeleton.js';
import { SlotBadge, type SlotType } from './SlotBadge.js';
import { DualDatePicker } from './DualDatePicker.js';
import {
  formatDualDate,
  formatDualDateFromYMD,
  formatCurrency,
  formatNumberByLanguage,
  formatTimeString12,
  getNextDayYMD,
  getTodayDhakaYMD,
  isNightCrossingMidnight,
  toBanglaDigits,
} from '../lib/dateUtils.js';
import { apiRequest } from '../lib/api.js';

interface BookingDetailModalProps {
  bookingId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onEditBooking: (booking: any) => void;
  onUpdated: () => void;
}

export const BookingDetailModal: React.FC<BookingDetailModalProps> = ({
  bookingId,
  isOpen,
  onClose,
  onEditBooking,
  onUpdated,
}) => {
  const { activeRoom, activeMember, language, t } = useAuth();
  const { showSuccess, showError } = useToast();

  const [booking, setBooking] = useState<any | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'payments' | 'notes' | 'history'>('overview');

  const role = activeMember?.role;
  const canSeeMoney = role === 'OWNER' || role === 'MANAGER';
  const canEdit = role === 'OWNER' || role === 'MANAGER' || role === 'STAFF';
  const canCancel =
    role === 'OWNER' ||
    role === 'MANAGER' ||
    (role === 'STAFF' && booking?.status === 'TENTATIVE');

  // Cancel reason & refund modal state
  const [showCancelPrompt, setShowCancelPrompt] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [refundOnCancel, setRefundOnCancel] = useState<number>(0);
  const [refundMethodOnCancel, setRefundMethodOnCancel] = useState<'CASH' | 'BKASH' | 'NAGAD' | 'BANK' | 'OTHER'>('CASH');
  const [actionSaving, setActionSaving] = useState(false);

  // Payment Creation Form State
  const [payType, setPayType] = useState<'ADVANCE' | 'PARTIAL' | 'FINAL' | 'REFUND'>('PARTIAL');
  const [payAmount, setPayAmount] = useState<string>('');
  const [payDate, setPayDate] = useState<string>(() => getTodayDhakaYMD());
  const [payMethod, setPayMethod] = useState<'CASH' | 'BKASH' | 'NAGAD' | 'BANK' | 'OTHER'>('CASH');
  const [payRef, setPayRef] = useState<string>('');
  const [payNote, setPayNote] = useState<string>('');
  const [confirmOverpay, setConfirmOverpay] = useState<boolean>(false);
  const [overpayWarningNeeded, setOverpayWarningNeeded] = useState<boolean>(false);
  const [payIdempotencyKey, setPayIdempotencyKey] = useState<string>('');
  const [savingPayment, setSavingPayment] = useState<boolean>(false);

  // Payment Reversal State
  const [reversingPaymentId, setReversingPaymentId] = useState<string | null>(null);
  const [reversalReason, setReversalReason] = useState<string>('');

  useEffect(() => {
    if (isOpen && bookingId && activeRoom) {
      fetchDetail();
      setActiveTab('overview');
      setShowCancelPrompt(false);
      setCancelReason('');
      setRefundOnCancel(0);
      resetPaymentForm();
    }
  }, [isOpen, bookingId, activeRoom]);

  const resetPaymentForm = () => {
    setPayType('PARTIAL');
    setPayAmount('');
    setPayDate(getTodayDhakaYMD());
    setPayMethod('CASH');
    setPayRef('');
    setPayNote('');
    setConfirmOverpay(false);
    setOverpayWarningNeeded(false);
    setPayIdempotencyKey(`pay-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);
    setReversingPaymentId(null);
    setReversalReason('');
  };

  const fetchDetail = async () => {
    if (!activeRoom || !bookingId) return;
    setLoading(true);
    try {
      const res = await apiRequest<{ booking: any; history: any[] }>(
        `/api/rooms/${activeRoom.id}/bookings/${bookingId}`
      );
      setBooking(res.booking);
      setHistory(res.history || []);

      if (role === 'OWNER' || role === 'MANAGER') {
        const payRes = await apiRequest<{ payments: any[] }>(
          `/api/rooms/${activeRoom.id}/bookings/${bookingId}/payments`
        );
        setPayments(payRes.payments || []);
      } else {
        setPayments([]);
      }
    } catch (err: any) {
      showError(language === 'bn' ? err.messageBn : err.messageEn);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmStatus = async () => {
    if (!activeRoom || !booking || actionSaving) return;
    setActionSaving(true);
    try {
      const res = await apiRequest(`/api/rooms/${activeRoom.id}/bookings/${booking.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'CONFIRMED' }),
      });
      showSuccess(language === 'bn' ? res.messageBn : res.messageEn);
      await fetchDetail();
      onUpdated();
    } catch (err: any) {
      showError(language === 'bn' ? err.messageBn : err.messageEn);
    } finally {
      setActionSaving(false);
    }
  };

  const handleCancelBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeRoom || !booking || actionSaving) return;
    if (cancelReason.trim().length < 2) {
      showError(
        language === 'bn'
          ? 'অনুগ্রহ করে বুকিং বাতিলের কারণ লিখুন।'
          : 'Please enter a cancellation reason.'
      );
      return;
    }
    setActionSaving(true);
    try {
      const res = await apiRequest(`/api/rooms/${activeRoom.id}/bookings/${booking.id}/cancel`, {
        method: 'POST',
        body: JSON.stringify({
          reason: cancelReason.trim(),
          refund_amount: canSeeMoney && refundOnCancel > 0 ? Number(refundOnCancel) : 0,
          refund_method: refundMethodOnCancel,
          refund_date: getTodayDhakaYMD(),
        }),
      });
      showSuccess(language === 'bn' ? res.messageBn : res.messageEn);
      setShowCancelPrompt(false);
      await fetchDetail();
      onUpdated();
    } catch (err: any) {
      showError(language === 'bn' ? err.messageBn : err.messageEn);
    } finally {
      setActionSaving(false);
    }
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeRoom || !booking || savingPayment) return;

    const amt = parseFloat(payAmount);
    if (isNaN(amt) || amt <= 0) {
      showError(
        language === 'bn'
          ? 'পেমেন্টের পরিমাণ শূন্য বা ঋণাত্মক হতে পারবে না।'
          : 'Zero or negative payment amounts are not allowed.'
      );
      return;
    }

    setSavingPayment(true);
    try {
      const res = await apiRequest(`/api/rooms/${activeRoom.id}/bookings/${booking.id}/payments`, {
        method: 'POST',
        body: JSON.stringify({
          payment_type: payType,
          amount: amt,
          payment_date: payDate,
          method: payMethod,
          reference_number: payRef.trim() || null,
          note: payNote.trim() || null,
          confirm_overpayment: confirmOverpay,
          idempotency_key: payIdempotencyKey,
        }),
      });
      showSuccess(language === 'bn' ? res.messageBn : res.messageEn);
      resetPaymentForm();
      await fetchDetail();
      onUpdated();
    } catch (err: any) {
      if (err.data?.error === 'OVERPAYMENT_WARNING') {
        setOverpayWarningNeeded(true);
      }
      showError(language === 'bn' ? err.messageBn || err.message : err.messageEn || err.message);
    } finally {
      setSavingPayment(false);
    }
  };

  const handleReversePayment = async (paymentId: string) => {
    if (!activeRoom || !booking || actionSaving) return;
    if (reversalReason.trim().length < 2) {
      showError(
        language === 'bn'
          ? 'পেমেন্ট রিভার্স করার কারণ উল্লেখ করা আবশ্যক।'
          : 'Please provide a reason for reversing this payment.'
      );
      return;
    }
    setActionSaving(true);
    try {
      const res = await apiRequest(
        `/api/rooms/${activeRoom.id}/bookings/${booking.id}/payments/${paymentId}/reverse`,
        {
          method: 'POST',
          body: JSON.stringify({
            reason: reversalReason.trim(),
            payment_date: getTodayDhakaYMD(),
          }),
        }
      );
      showSuccess(language === 'bn' ? res.messageBn : res.messageEn);
      setReversingPaymentId(null);
      setReversalReason('');
      await fetchDetail();
      onUpdated();
    } catch (err: any) {
      showError(language === 'bn' ? err.messageBn : err.messageEn);
    } finally {
      setActionSaving(false);
    }
  };

  // Printable Bilingual MONEY RECEIPT (Bangla + English, both dates, club name & logo, unique receipt number, booking number, slot & time range, midnight next day date in both calendars)
  const handlePrintMoneyReceipt = (p: any) => {
    if (!booking || !activeRoom) return;
    const dualPaymentDate = formatDualDateFromYMD(p.payment_date);
    const dualEventDate = formatDualDateFromYMD(booking.event_date);
    const crossesMidnight =
      (booking.slot === 'NIGHT' || booking.slot === 'FULL') &&
      isNightCrossingMidnight(booking.start_time, booking.end_time);
    const nextDayDual = crossesMidnight
      ? formatDualDateFromYMD(getNextDayYMD(booking.event_date))
      : '';

    const slotText =
      booking.slot === 'DAY'
        ? 'দিন (Day)'
        : booking.slot === 'NIGHT'
        ? 'রাত (Night)'
        : 'দিন ও রাত (Full)';
    const isBn = language === 'bn';
    const fmtId = (str: string) => (isBn ? toBanglaDigits(str) : str);
    const fmtMoney = (amt: number) =>
      isBn
        ? `${formatCurrency(amt, 'bn')} (${formatCurrency(amt, 'en')})`
        : `${formatCurrency(amt, 'en')} (${formatCurrency(amt, 'bn')})`;

    const win = window.open('', '_blank', 'width=850,height=900');
    if (!win) {
      window.print();
      return;
    }

    const logoUrl = `${window.location.origin}/logo.png`;
    const slotBanglaTime =
      booking.slot === 'DAY'
        ? `দিন (${formatTimeString12(booking.start_time, 'bn')} – ${formatTimeString12(booking.end_time, 'bn')})`
        : booking.slot === 'NIGHT'
        ? `রাত (${formatTimeString12(booking.start_time, 'bn')} – ${formatTimeString12(booking.end_time, 'bn')})`
        : `দিন ও রাত (${formatTimeString12(booking.start_time, 'bn')} – ${formatTimeString12(booking.end_time, 'bn')})`;

    win.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8" />
          <title>চুক্তিপত্র / Cash Memo - ${p.receipt_number}</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&family=Noto+Sans+Bengali:wght@400;600;700;800&display=swap');
            * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
            body { font-family: 'Noto Sans Bengali', 'Inter', sans-serif; padding: 20px; color: #1c1917; max-width: 820px; margin: 0 auto; background: #fff; }
            .memo-sheet { border: 2px solid #0E8A44; border-radius: 10px; padding: 20px 24px; background: #fff; position: relative; }
            .memo-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; border-bottom: 2px solid #8C5E2A; padding-bottom: 12px; margin-bottom: 14px; }
            .memo-brand { display: flex; align-items: center; gap: 12px; }
            .memo-logo { width: 68px; height: 68px; object-fit: contain; }
            .memo-title-bn { font-size: 26px; font-weight: 800; color: #C62828; margin: 0; line-height: 1.1; }
            .memo-title-sub { font-size: 16px; font-weight: 700; color: #1c1917; margin: 2px 0 0; }
            .memo-right { text-align: right; font-size: 11.5px; line-height: 1.45; }
            .memo-badge { display: inline-block; background: #8C5E2A; color: #fff; font-weight: 800; font-size: 13px; padding: 4px 14px; border-radius: 4px; margin-bottom: 4px; }
            .info-grid { display: grid; grid-template-columns: 1.4fr 1fr; gap: 6px 12px; margin-bottom: 12px; font-size: 13px; }
            .info-row { display: flex; align-items: stretch; border: 1px solid #8C5E2A; border-radius: 4px; overflow: hidden; }
            .info-lbl { background: #659B38; color: #fff; font-weight: 700; padding: 5px 10px; min-width: 110px; font-size: 12px; display: flex; align-items: center; }
            .info-val { padding: 5px 10px; font-weight: 600; flex: 1; background: #fff; display: flex; align-items: center; }
            .memo-table-wrap { position: relative; border: 1.5px solid #8C5E2A; border-radius: 4px; overflow: hidden; margin-bottom: 12px; }
            .memo-watermark { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; pointer-events: none; opacity: 0.09; }
            .memo-watermark img { width: 220px; height: 220px; object-fit: contain; }
            table.memo-table { width: 100%; border-collapse: collapse; position: relative; z-index: 1; font-size: 13px; }
            table.memo-table th { background: #7A5229; color: #fff; padding: 7px 12px; font-weight: 700; text-align: left; }
            table.memo-table th:last-child { text-align: right; width: 170px; border-left: 1px solid #fff; }
            table.memo-table td { padding: 8px 12px; border-top: 1px solid #d6d3d1; vertical-align: top; }
            table.memo-table td:last-child { text-align: right; border-left: 1.5px solid #8C5E2A; font-weight: 700; }
            .summary-row td { background: rgba(248, 250, 249, 0.85); font-weight: 700; border-top: 1px solid #8C5E2A; }
            .terms { font-size: 11px; line-height: 1.55; color: #292524; margin: 10px 0 14px; padding-left: 0; list-style: none; }
            .terms li { position: relative; padding-left: 16px; margin-bottom: 2px; }
            .terms li::before { content: '▪'; position: absolute; left: 2px; color: #7A5229; font-weight: 800; }
            .memo-footer { display: flex; align-items: flex-end; justify-content: space-between; margin-top: 22px; padding-top: 8px; font-size: 12px; }
            .sig-box { border-top: 1px solid #44403c; padding-top: 4px; min-width: 160px; text-align: center; font-weight: 700; }
            .date-box { border: 1px solid #8C5E2A; padding: 4px 10px; border-radius: 4px; font-size: 11.5px; font-weight: 600; text-align: center; }
            @media print { body { padding: 0; } .memo-sheet { border-width: 1.5px; } }
          </style>
        </head>
        <body>
          <div class="memo-sheet">
            <div class="memo-header">
              <div class="memo-brand">
                <img src="${logoUrl}" alt="লিলি কমিউনিটি সেন্টার" class="memo-logo" />
                <div>
                  <h1 class="memo-title-bn">লিলি <span style="color:#1c1917;font-size:19px;">কমিউনিটি সেন্টার</span></h1>
                  <div class="memo-title-sub">${activeRoom.name} • মানি রিসিট / Money Receipt</div>
                </div>
              </div>
              <div class="memo-right">
                <span class="memo-badge">চুক্তিপত্র / CASH MEMO</span>
                <div>${activeRoom.address || 'সীম্যান্স হোস্টেলের বিপরীতে, দক্ষিণ মধ্য হালিশহর, ৩৮নং ওয়ার্ড, বন্দর, চট্টগ্রাম।'}</div>
                <div>📞 ${fmtId(activeRoom.phone || '01955 66 66 22')} • ✉ lilycommunitycentre@gmail.com</div>
              </div>
            </div>

            <div class="info-grid">
              <div class="info-row"><span class="info-lbl">নাম / Name</span><span class="info-val">${booking.customer_name}</span></div>
              <div class="info-row"><span class="info-lbl">বিল নং / Receipt</span><span class="info-val" style="font-family:monospace;color:#C62828;">${fmtId(p.receipt_number)}</span></div>
              <div class="info-row" style="grid-column: 1 / -1;"><span class="info-lbl">বুকিং নং / Hall</span><span class="info-val">${fmtId(booking.booking_number)} — ${booking.hall_name}</span></div>
              <div class="info-row"><span class="info-lbl">ফোন / Method</span><span class="info-val">${t(`payMethod_${p.method}` as any)} ${p.reference_number ? `(${fmtId(p.reference_number)})` : ''}</span></div>
              <div class="info-row"><span class="info-lbl">তারিখ / Paid On</span><span class="info-val">${dualPaymentDate}</span></div>
              <div class="info-row"><span class="info-lbl">অনুষ্ঠানের তারিখ</span><span class="info-val">${dualEventDate}</span></div>
              <div class="info-row"><span class="info-lbl">সময় / Slot</span><span class="info-val">${slotBanglaTime}${crossesMidnight ? ` (পরদিন ${nextDayDual})` : ''}</span></div>
            </div>

            <div class="memo-table-wrap">
              <div class="memo-watermark"><img src="${logoUrl}" alt="" /></div>
              <table class="memo-table">
                <thead>
                  <tr>
                    <th>বিবরণ / Description</th>
                    <th>টাকা / Amount</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style="min-height:90px;">
                      <strong>${t(`payType_${p.payment_type}` as any)}</strong> — ${booking.hall_name} (${slotText})<br/>
                      <span style="font-size:12px;color:#57534e;">অতিথি সংখ্যা: ${fmtId(String(booking.guest_count || 0))} জন • ইভেন্ট: ${booking.event_type}</span>
                      ${p.note ? `<br/><span style="font-size:12px;color:#57534e;">মন্তব্য: ${p.note}</span>` : ''}
                    </td>
                    <td>${fmtMoney(Math.abs(p.amount))}</td>
                  </tr>
                  <tr class="summary-row">
                    <td>সর্বমোট বুকিং মূল্য / Total Amount</td>
                    <td>${fmtMoney(booking.total_amount)}</td>
                  </tr>
                  <tr class="summary-row">
                    <td>এই রিসিটে প্রাপ্ত / Received Now</td>
                    <td style="color:#0E8A44;">${fmtMoney(Math.abs(p.amount))}</td>
                  </tr>
                  <tr class="summary-row">
                    <td>বাকী / Remaining Due</td>
                    <td style="color:#C62828;">${fmtMoney(Math.max(0, booking.due_amount))}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <ul class="terms">
              <li>গ্রাহক অতিথি নিয়ন্ত্রণ আইন মানিয়া চলিবেন।</li>
              <li>হল বুকিং করিতে হইলে ৫০% টাকা অগ্রিম প্রদান করিতে হইবে যাহা কোন অবস্থাতেই ফেরত যোগ্য নহে।</li>
              <li>হলের বকেয়া টাকা অনুষ্ঠান দিনে হইলে দুপুর ১২টা এবং রাতে হইলে রাত ১০টার মধ্যে সম্পূর্ণ পরিশোধ করিতে হইবে।</li>
              <li>যে কোন প্রকার বৈদ্যুতিক গোলযোগের জন্য ক্লাব কর্তৃপক্ষ দায়ী নয়।</li>
              <li>চুক্তিপত্র এর বাহিরে মালামাল ব্যবহার করিলে অতিরিক্ত ভাড়া প্রদান করিতে বাধ্য থাকিবে।</li>
              <li>গ্রাহক যে কোন ধরনের মালামাল ভাঙ্গিলে বা কোন প্রকার ক্ষয়ক্ষতি করিলে তাহার মূল্য প্রদান করিতে বাধ্য থাকিবে।</li>
              <li>রাত ১২টার পর গান ও সাংস্কৃতিক অনুষ্ঠানের আওয়াজ হলের ভিতর সীমাবদ্ধ রাখুন।</li>
              <li>দিনের অনুষ্ঠান বিকাল ৫টা এবং রাতের অনুষ্ঠান রাত ১২টার মধ্যে শেষ করে ক্লাব বুঝাইয়া দিতে হইবে।</li>
            </ul>

            <div class="memo-footer">
              <div class="sig-box">গ্রাহকের স্বাক্ষর / Payer</div>
              <div class="date-box">হল বুকিং তারিখ: ${dualEventDate}</div>
              <div class="sig-box">হল কর্তৃপক্ষের স্বাক্ষর (${p.received_by_name})</div>
            </div>
          </div>
          <script>window.onload = () => { window.print(); };</script>
        </body>
      </html>
    `);
    win.document.close();
  };

  const handlePrintBookingSlip = () => {
    if (!booking || !activeRoom) return;
    const dualEventDate = formatDualDateFromYMD(booking.event_date);
    const dualCreatedDate = formatDualDate(booking.created_at, { includeTime: true });
    const crossesMidnight =
      (booking.slot === 'NIGHT' || booking.slot === 'FULL') &&
      isNightCrossingMidnight(booking.start_time, booking.end_time);
    const nextDayDual = crossesMidnight
      ? formatDualDateFromYMD(getNextDayYMD(booking.event_date))
      : '';

    const slotText =
      booking.slot === 'DAY'
        ? 'দিন (Day)'
        : booking.slot === 'NIGHT'
        ? 'রাত (Night)'
        : 'দিন ও রাত (Full)';

    const win = window.open('', '_blank', 'width=850,height=900');
    if (!win) {
      window.print();
      return;
    }

    win.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8" />
          <title>Booking Slip - ${booking.booking_number}</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&family=Noto+Sans+Bengali:wght@400;600;800&display=swap');
            body { font-family: 'Noto Sans Bengali', 'Inter', sans-serif; padding: 32px; color: #1c1917; max-width: 760px; margin: 0 auto; }
            .header { text-align: center; border-bottom: 2px solid #582C4D; padding-bottom: 16px; margin-bottom: 20px; }
            .title { font-size: 22px; font-weight: 800; color: #582C4D; margin: 0; }
            .subtitle { font-size: 13px; color: #57534e; margin-top: 4px; }
            .badge-row { display: flex; justify-content: space-between; align-items: center; background: #fafaf9; padding: 12px 16px; border: 1px solid #e7e5e4; border-radius: 12px; margin-bottom: 20px; }
            .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 20px; }
            .box { border: 1px solid #e7e5e4; border-radius: 10px; padding: 12px; }
            .label { font-size: 11px; color: #78716c; font-weight: 700; text-transform: uppercase; }
            .val { font-size: 14px; font-weight: 700; margin-top: 4px; }
            table { width: 100%; border-collapse: collapse; margin-top: 12px; }
            th, td { border: 1px solid #e7e5e4; padding: 10px; text-align: left; font-size: 13px; }
            th { background: #f5f5f4; }
            .footer { margin-top: 40px; display: flex; justify-content: space-between; font-size: 12px; color: #57534e; border-top: 1px dashed #d6d3d1; padding-top: 16px; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1 class="title">লিলি কমিউনিটি সেন্টার | ${activeRoom.name}</h1>
            <div class="subtitle">${activeRoom.address} • ${activeRoom.phone}</div>
            <div style="margin-top:8px; font-weight:700; font-size:14px;">বুকিং স্লিপ / OFFICIAL BOOKING SLIP</div>
          </div>

          <div class="badge-row">
            <div>
              <div class="label">বুকিং নম্বর / Booking No.</div>
              <div class="val" style="font-family: monospace; font-size: 18px; color: #582C4D;">${booking.booking_number}</div>
            </div>
            <div>
              <div class="label">স্লট / Slot</div>
              <div class="val">${slotText}</div>
            </div>
            <div>
              <div class="label">অবস্থা / Status</div>
              <div class="val">${booking.status}</div>
            </div>
          </div>

          <div class="grid">
            <div class="box">
              <div class="label">অনুষ্ঠানের তারিখ (বাংলা ও ইংরেজি) / Event Date</div>
              <div class="val">${dualEventDate}</div>
            </div>
            <div class="box">
              <div class="label">সময়সূচি / Slot Timing</div>
              <div class="val">
                ${formatTimeString12(booking.start_time, 'bn')} – ${formatTimeString12(booking.end_time, 'bn')}
                (${formatTimeString12(booking.start_time, 'en')} – ${formatTimeString12(booking.end_time, 'en')})
                ${crossesMidnight ? `<br/><small style="color:#4338ca;">পরদিন (${nextDayDual}) শেষ / Ends next day</small>` : ''}
              </div>
            </div>
            <div class="box">
              <div class="label">হল ও অতিথি / Hall & Guests</div>
              <div class="val">${booking.hall_name} (${booking.guest_count} Guests / জন)</div>
            </div>
            <div class="box">
              <div class="label">গ্রাহকের তথ্য / Customer</div>
              <div class="val">${booking.customer_name}<br/><small>${booking.customer_phone}</small></div>
            </div>
          </div>

          ${
            canSeeMoney && booking.total_amount !== undefined
              ? `
          <table>
            <thead>
              <tr>
                <th>বিবরণ / Description</th>
                <th style="text-align:right;">পরিমাণ / Amount (BDT)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>হল ভাড়া (${slotText}) / Hall Rent ${booking.package_name ? `— ${booking.package_name}` : ''}</td>
                <td style="text-align:right;">${formatCurrency(booking.hall_rent, 'bn')} (${formatCurrency(booking.hall_rent, 'en')})</td>
              </tr>
              ${(booking.extra_services || [])
                .map(
                  (s: any) => `
                <tr>
                  <td>অতিরিক্ত সেবা (${s.type}): ${s.label}</td>
                  <td style="text-align:right;">${formatCurrency(s.amount || 0, 'bn')} (${formatCurrency(s.amount || 0, 'en')})</td>
                </tr>`
                )
                .join('')}
              <tr>
                <th>সর্বমোট বিল / Total Amount</th>
                <th style="text-align:right;">${formatCurrency(booking.total_amount, 'bn')} (${formatCurrency(booking.total_amount, 'en')})</th>
              </tr>
              <tr>
                <td>জমা কৃত অর্থ / Net Paid</td>
                <td style="text-align:right; color:#047857; font-weight:700;">${formatCurrency(booking.advance_amount, 'bn')} (${formatCurrency(booking.advance_amount, 'en')})</td>
              </tr>
              <tr>
                <th>বকেয়া পরিমাণ / Due Amount</th>
                <th style="text-align:right; color:#be123c;">${formatCurrency(booking.due_amount, 'bn')} (${formatCurrency(booking.due_amount, 'en')})</th>
              </tr>
            </tbody>
          </table>`
              : ''
          }

          <div class="footer">
            <div>তৈরির তারিখ: ${dualCreatedDate}<br/>প্রস্তুতকারী: ${booking.created_by_name}</div>
            <div>গ্রাহকের স্বাক্ষর / Customer Signature</div>
            <div>কর্তৃপক্ষের স্বাক্ষর / Authorized Signature</div>
          </div>
          <script>window.onload = () => { window.print(); };</script>
        </body>
      </html>
    `);
    win.document.close();
  };

  const getStatusBadgeStyle = (status: string) => {
    switch (status) {
      case 'CONFIRMED':
        return 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/70 dark:text-emerald-300 dark:border-emerald-800';
      case 'TENTATIVE':
        return 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/70 dark:text-amber-300 dark:border-amber-800';
      case 'COMPLETED':
        return 'bg-sky-100 text-sky-800 border-sky-300 dark:bg-sky-950/70 dark:text-sky-300 dark:border-sky-800';
      case 'CANCELLED':
      case 'NO_SHOW':
        return 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950/70 dark:text-rose-300 dark:border-rose-800';
      default:
        return 'bg-stone-100 text-stone-800 border-stone-300';
    }
  };

  const crossesMidnight =
    booking &&
    (booking.slot === 'NIGHT' || booking.slot === 'FULL') &&
    isNightCrossingMidnight(booking.start_time, booking.end_time);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        booking
          ? `${t('bookingNumberLabel')}: ${booking.booking_number}`
          : language === 'bn'
          ? 'বুকিং বিবরণ'
          : 'Booking Details'
      }
      maxWidth="lg"
    >
      {loading || !booking ? (
        <LoadingSkeleton rows={4} />
      ) : (
        <div className="space-y-5">
          {/* Header Badges & Action Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-stone-200 dark:border-stone-800">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-base sm:text-lg font-extrabold text-[#582C4D] dark:text-[#C5A059]">
                {booking.booking_number}
              </span>
              <SlotBadge slot={booking.slot as SlotType} size="sm" showDualLang />
              <span
                className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${getStatusBadgeStyle(
                  booking.status
                )}`}
              >
                {t(`bStatus_${booking.status}` as any)}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {canEdit && booking.status === 'TENTATIVE' && (
                <button
                  onClick={handleConfirmStatus}
                  disabled={actionSaving}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs cursor-pointer"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>{t('confirm')}</span>
                </button>
              )}

              {canEdit && booking.status !== 'CANCELLED' && (
                <button
                  onClick={() => {
                    onClose();
                    onEditBooking(booking);
                  }}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 text-stone-800 dark:text-stone-200 text-xs font-bold cursor-pointer"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>{language === 'bn' ? 'সম্পাদনা' : 'Edit'}</span>
                </button>
              )}

              {canCancel && booking.status !== 'CANCELLED' && (
                <button
                  onClick={() => setShowCancelPrompt((v) => !v)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 hover:bg-rose-100 text-xs font-bold cursor-pointer"
                >
                  <XCircle className="w-3.5 h-3.5" />
                  <span>{t('cancel')}</span>
                </button>
              )}

              <button
                onClick={handlePrintBookingSlip}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#582C4D] hover:bg-[#6C375F] text-white text-xs font-bold shadow-xs cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>{language === 'bn' ? 'বুকিং স্লিপ প্রিন্ট' : 'Print Slip'}</span>
              </button>
            </div>
          </div>

          {/* Inline Cancel Prompt with Mandatory Reason & Optional Refund */}
          {showCancelPrompt && (
            <form
              onSubmit={handleCancelBooking}
              className="p-4 rounded-2xl bg-rose-50/80 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 space-y-3"
            >
              <div className="flex items-center gap-2 text-xs font-bold text-rose-900 dark:text-rose-200">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>
                  {language === 'bn'
                    ? 'বুকিং বাতিলের কারণ উল্লেখ করুন (প্রয়োজনে রিফান্ড রেকর্ড করতে পারেন):'
                    : 'Enter cancellation reason (and optional refund amount if refunding collected payments):'}
                </span>
              </div>
              <input
                type="text"
                required
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder={
                  language === 'bn'
                    ? 'যেমন: গ্রাহকের অনুরোধে বাতিল ও অগ্রিম ফেরত'
                    : 'e.g. Client cancelled event'
                }
                className="w-full px-3.5 py-2 rounded-xl border border-rose-300 dark:border-rose-700 bg-white dark:bg-stone-900 text-xs"
              />

              {canSeeMoney && (booking.advance_amount || 0) > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="block text-[11px] font-bold text-rose-900 dark:text-rose-200 mb-1">
                      {language === 'bn'
                        ? `রিফান্ডের পরিমাণ (জমা আছে: ${formatCurrency(booking.advance_amount, 'bn')})`
                        : `Refund Amount (Collected: ${formatCurrency(booking.advance_amount, 'en')})`}
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={booking.advance_amount}
                      value={refundOnCancel}
                      onChange={(e) => setRefundOnCancel(parseFloat(e.target.value) || 0)}
                      className="w-full px-3 py-1.5 rounded-xl border border-rose-300 bg-white dark:bg-stone-900 text-xs font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-rose-900 dark:text-rose-200 mb-1">
                      {language === 'bn' ? 'রিফান্ডের মাধ্যম' : 'Refund Method'}
                    </label>
                    <select
                      value={refundMethodOnCancel}
                      onChange={(e) => setRefundMethodOnCancel(e.target.value as any)}
                      className="w-full px-3 py-1.5 rounded-xl border border-rose-300 bg-white dark:bg-stone-900 text-xs font-bold"
                    >
                      <option value="CASH">{t('payMethod_CASH')}</option>
                      <option value="BKASH">{t('payMethod_BKASH')}</option>
                      <option value="NAGAD">{t('payMethod_NAGAD')}</option>
                      <option value="BANK">{t('payMethod_BANK')}</option>
                      <option value="OTHER">{t('payMethod_OTHER')}</option>
                    </select>
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCancelPrompt(false)}
                  className="px-3 py-1.5 text-xs font-semibold text-stone-600"
                >
                  {t('back')}
                </button>
                <button
                  type="submit"
                  disabled={actionSaving}
                  className="px-4 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold cursor-pointer"
                >
                  {language === 'bn' ? 'বুকিং বাতিল নিশ্চিত করুন' : 'Confirm Cancellation'}
                </button>
              </div>
            </form>
          )}

          {/* Detail Tabs: Overview, Payments, Notes, History */}
          <div className="flex gap-1 p-1 bg-stone-100 dark:bg-stone-800 rounded-2xl">
            {[
              { id: 'overview', labelBn: 'সারসংক্ষেপ', labelEn: 'Overview', icon: Info },
              { id: 'payments', labelBn: 'পেমেন্ট ও রিসিট', labelEn: 'Payments', icon: CreditCard },
              { id: 'notes', labelBn: 'নোট', labelEn: 'Notes', icon: FileText },
              { id: 'history', labelBn: 'সম্পাদনা ইতিহাস', labelEn: 'History', icon: History },
            ].map((tb) => {
              const Icon = tb.icon;
              const active = activeTab === tb.id;
              return (
                <button
                  key={tb.id}
                  onClick={() => setActiveTab(tb.id as any)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    active
                      ? 'bg-white dark:bg-[#1E1920] text-[#582C4D] dark:text-[#C5A059] shadow-xs'
                      : 'text-stone-600 dark:text-stone-400'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{language === 'bn' ? tb.labelBn : tb.labelEn}</span>
                </button>
              );
            })}
          </div>

          {/* TAB 1: OVERVIEW */}
          {activeTab === 'overview' && (
            <div className="space-y-4 text-xs sm:text-sm">
              {booking.status === 'CANCELLED' && booking.cancel_reason && (
                <div className="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 text-xs text-rose-900 dark:text-rose-200">
                  <strong>{language === 'bn' ? 'বাতিলের কারণ:' : 'Cancellation Reason:'}</strong>{' '}
                  {booking.cancel_reason}
                  {booking.cancelled_at && (
                    <div className="text-[11px] opacity-80 mt-1">
                      {formatDualDate(booking.cancelled_at, { includeTime: true })}
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3.5 rounded-2xl bg-stone-50 dark:bg-stone-900/60 border border-stone-200 dark:border-stone-800 space-y-1">
                  <div className="text-[11px] font-bold text-stone-500 uppercase">
                    {t('eventDateLabel')}
                  </div>
                  <div className="font-bold text-stone-900 dark:text-stone-100">
                    {formatDualDateFromYMD(booking.event_date)}
                  </div>
                  <div className="text-xs text-stone-600 dark:text-stone-400 flex items-center gap-1.5 pt-1">
                    <Clock className="w-3.5 h-3.5 text-[#582C4D] dark:text-[#C5A059]" />
                    <span>
                      {formatTimeString12(booking.start_time, language)} –{' '}
                      {formatTimeString12(booking.end_time, language)}
                    </span>
                  </div>
                  {crossesMidnight && (
                    <div className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 pt-0.5">
                      🌙{' '}
                      {language === 'bn'
                        ? `পরদিন (${formatDualDateFromYMD(getNextDayYMD(booking.event_date))}) ${formatTimeString12(booking.end_time, 'bn')} এ শেষ`
                        : `Ends ${formatTimeString12(booking.end_time, 'en')} next day (${formatDualDateFromYMD(getNextDayYMD(booking.event_date))})`}
                    </div>
                  )}
                </div>

                <div className="p-3.5 rounded-2xl bg-stone-50 dark:bg-stone-900/60 border border-stone-200 dark:border-stone-800 space-y-1">
                  <div className="text-[11px] font-bold text-stone-500 uppercase">
                    {language === 'bn' ? 'হল ও অনুষ্ঠানের বিবরণ' : 'Hall & Event'}
                  </div>
                  <div className="font-bold text-stone-900 dark:text-stone-100">
                    {booking.hall_name}
                  </div>
                  <div className="text-xs text-stone-600 dark:text-stone-400">
                    {t(`event_${booking.event_type}` as any)} •{' '}
                    {formatNumberByLanguage(booking.guest_count, language)} {t('guestsUnit')}
                  </div>
                  {booking.package_name && (
                    <div className="text-xs font-semibold text-[#582C4D] dark:text-[#C5A059]">
                      📦 {booking.package_name}
                    </div>
                  )}
                </div>

                <div className="sm:col-span-2 p-3.5 rounded-2xl bg-stone-50 dark:bg-stone-900/60 border border-stone-200 dark:border-stone-800 space-y-1">
                  <div className="text-[11px] font-bold text-stone-500 uppercase">
                    {language === 'bn' ? 'গ্রাহকের তথ্য' : 'Customer Info'}
                  </div>
                  <div className="font-bold text-stone-900 dark:text-stone-100 break-words">
                    {booking.customer_name}
                  </div>
                  <div className="text-xs font-mono text-stone-600 dark:text-stone-300">
                    📞 {booking.customer_phone}
                    {booking.customer_alt_phone ? ` / ${booking.customer_alt_phone}` : ''}
                  </div>
                  {booking.customer_address && (
                    <div className="text-xs text-stone-500">📍 {booking.customer_address}</div>
                  )}
                </div>
              </div>

              {/* Financial Breakdown (Only visible to Owner & Manager) */}
              {canSeeMoney && booking.total_amount !== undefined ? (
                <div className="p-4 rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 space-y-2">
                  <div className="flex justify-between">
                    <span className="text-stone-500">{t('hallRentLabel')}:</span>
                    <span className="font-bold">{formatCurrency(booking.hall_rent, language)}</span>
                  </div>
                  {(booking.extra_services || []).map((s: any, idx: number) => (
                    <div key={idx} className="flex justify-between text-xs">
                      <span className="text-stone-500">
                        + {t(`service_${s.type}` as any)} ({s.label}):
                      </span>
                      <span className="font-semibold">{formatCurrency(s.amount, language)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between pt-2 border-t border-stone-100 dark:border-stone-800 font-extrabold text-sm">
                    <span>{t('totalAmountLabel')}:</span>
                    <span>{formatCurrency(booking.total_amount, language)}</span>
                  </div>
                  <div className="flex justify-between text-emerald-600 font-bold">
                    <span>{t('advanceAmountLabel')}:</span>
                    <span>{formatCurrency(booking.advance_amount, language)}</span>
                  </div>
                  <div className="flex justify-between pt-1 border-t border-stone-100 dark:border-stone-800 text-rose-600 font-extrabold text-sm">
                    <span>{t('dueAmountLabel')}:</span>
                    <span>{formatCurrency(booking.due_amount, language)}</span>
                  </div>
                </div>
              ) : (
                <div className="p-3.5 rounded-2xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 flex items-center gap-2 text-xs text-amber-800 dark:text-amber-300">
                  <ShieldAlert className="w-4 h-4 shrink-0" />
                  <span>{t('moneyHiddenNotice')}</span>
                </div>
              )}

              <div className="text-[11px] text-stone-400 flex flex-wrap items-center justify-between gap-2">
                <span>
                  {language === 'bn' ? 'তৈরি করেছেন:' : 'Created by:'} {booking.created_by_name}
                </span>
                <span>{formatDualDate(booking.created_at, { includeTime: true })}</span>
              </div>
            </div>
          )}

          {/* TAB 2: PAYMENTS & MONEY RECEIPTS (PART 3) */}
          {activeTab === 'payments' && (
            <div className="space-y-5">
              {!canSeeMoney ? (
                <div className="p-6 rounded-2xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 text-center space-y-2">
                  <ShieldAlert className="w-8 h-8 text-amber-600 mx-auto" />
                  <div className="text-sm font-bold text-amber-900 dark:text-amber-200">
                    {t('moneyHiddenNotice')}
                  </div>
                </div>
              ) : (
                <>
                  {/* Live Balance Summary Banner */}
                  <div className="grid grid-cols-3 gap-2.5 text-center">
                    <div className="p-3 rounded-2xl bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-800">
                      <div className="text-[11px] text-stone-500 font-bold">
                        {t('totalAmountLabel')}
                      </div>
                      <div className="text-sm sm:text-base font-extrabold text-stone-900 dark:text-stone-100 mt-0.5">
                        {formatCurrency(booking.total_amount || 0, language)}
                      </div>
                    </div>
                    <div className="p-3 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900">
                      <div className="text-[11px] text-emerald-700 dark:text-emerald-300 font-bold">
                        {language === 'bn' ? 'নিট জমা (Net Paid)' : 'Net Paid'}
                      </div>
                      <div className="text-sm sm:text-base font-extrabold text-emerald-700 dark:text-emerald-300 mt-0.5">
                        {formatCurrency(booking.advance_amount || 0, language)}
                      </div>
                    </div>
                    <div className="p-3 rounded-2xl bg-rose-50/70 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900">
                      <div className="text-[11px] text-rose-700 dark:text-rose-300 font-bold">
                        {t('dueAmountLabel')}
                      </div>
                      <div className="text-sm sm:text-base font-extrabold text-rose-600 dark:text-rose-400 mt-0.5">
                        {formatCurrency(booking.due_amount || 0, language)}
                      </div>
                    </div>
                  </div>

                  {/* Record New Payment / Refund Form */}
                  <form
                    onSubmit={handleRecordPayment}
                    className="p-4 rounded-2xl bg-stone-50 dark:bg-stone-900/70 border border-stone-200 dark:border-stone-800 space-y-3"
                  >
                    <h4 className="text-xs sm:text-sm font-extrabold text-stone-900 dark:text-stone-100 flex items-center gap-1.5">
                      <Plus className="w-4 h-4 text-[#582C4D] dark:text-[#C5A059]" />
                      <span>
                        {language === 'bn'
                          ? 'নতুন পেমেন্ট বা রিফান্ড যুক্ত করুন'
                          : 'Record Payment or Refund'}
                      </span>
                    </h4>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-[11px] font-bold text-stone-600 dark:text-stone-400 mb-1">
                          {language === 'bn' ? 'পেমেন্টের ধরন *' : 'Payment Type *'}
                        </label>
                        <select
                          value={payType}
                          onChange={(e) => setPayType(e.target.value as any)}
                          className="w-full px-3 py-2 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-xs font-bold"
                        >
                          <option value="ADVANCE">{t('payType_ADVANCE')}</option>
                          <option value="PARTIAL">{t('payType_PARTIAL')}</option>
                          <option value="FINAL">{t('payType_FINAL')}</option>
                          <option value="REFUND">{t('payType_REFUND')}</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-stone-600 dark:text-stone-400 mb-1">
                          {language === 'bn' ? 'পরিমাণ (৳) *' : 'Amount (BDT) *'}
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="0.01"
                          required
                          value={payAmount}
                          onChange={(e) => {
                            setPayAmount(e.target.value);
                            const v = parseFloat(e.target.value) || 0;
                            if (payType !== 'REFUND' && v > (booking.due_amount || 0)) {
                              setOverpayWarningNeeded(true);
                            } else {
                              setOverpayWarningNeeded(false);
                              setConfirmOverpay(false);
                            }
                          }}
                          placeholder="0.00"
                          className="w-full px-3 py-2 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-xs font-extrabold"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-stone-600 dark:text-stone-400 mb-1">
                          {language === 'bn' ? 'মাধ্যম *' : 'Method *'}
                        </label>
                        <select
                          value={payMethod}
                          onChange={(e) => setPayMethod(e.target.value as any)}
                          className="w-full px-3 py-2 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-xs font-bold"
                        >
                          <option value="CASH">{t('payMethod_CASH')}</option>
                          <option value="BKASH">{t('payMethod_BKASH')}</option>
                          <option value="NAGAD">{t('payMethod_NAGAD')}</option>
                          <option value="BANK">{t('payMethod_BANK')}</option>
                          <option value="OTHER">{t('payMethod_OTHER')}</option>
                        </select>
                      </div>
                    </div>

                    <DualDatePicker
                      label={language === 'bn' ? 'পেমেন্টের তারিখ (বাংলা ও ইংরেজি)' : 'Payment Date'}
                      value={payDate}
                      onChange={setPayDate}
                    />

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-bold text-stone-600 dark:text-stone-400 mb-1">
                          {language === 'bn' ? 'রেফারেন্স / ট্রানজেকশন নম্বর' : 'Reference / Trx ID'}
                        </label>
                        <input
                          type="text"
                          value={payRef}
                          onChange={(e) => setPayRef(e.target.value)}
                          placeholder="e.g. TRX9821..."
                          className="w-full px-3 py-2 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-xs font-mono"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-stone-600 dark:text-stone-400 mb-1">
                          {language === 'bn'
                            ? payType === 'REFUND'
                              ? 'রিফান্ডের কারণ *'
                              : 'নোট (ঐচ্ছিক)'
                            : payType === 'REFUND'
                            ? 'Refund Reason *'
                            : 'Note (Optional)'}
                        </label>
                        <input
                          type="text"
                          required={payType === 'REFUND'}
                          value={payNote}
                          onChange={(e) => setPayNote(e.target.value)}
                          placeholder={
                            language === 'bn' ? 'পেমেন্ট নোট বা বিবরণ' : 'Payment note or remark'
                          }
                          className="w-full px-3 py-2 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-xs"
                        />
                      </div>
                    </div>

                    {/* Overpayment Warning Box */}
                    {overpayWarningNeeded && payType !== 'REFUND' && (
                      <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 space-y-2">
                        <div className="flex items-start gap-2 text-xs font-bold text-amber-900 dark:text-amber-200">
                          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                          <span>
                            {language === 'bn'
                              ? `সতর্কতা: পেমেন্টের পরিমাণ বর্তমান বকেয়ার (${formatCurrency(booking.due_amount || 0, 'bn')}) চেয়ে বেশি!`
                              : `Warning: Payment amount exceeds the current due balance (${formatCurrency(booking.due_amount || 0, 'en')})!`}
                          </span>
                        </div>
                        <label className="flex items-center gap-2 text-xs font-bold text-amber-950 dark:text-amber-100 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={confirmOverpay}
                            onChange={(e) => setConfirmOverpay(e.target.checked)}
                            className="w-4 h-4 rounded accent-amber-600"
                          />
                          <span>
                            {language === 'bn'
                              ? 'হ্যাঁ, আমি ওভারপেমেন্ট জেনেও এই পেমেন্ট সংরক্ষণ করতে চাই'
                              : 'Yes, I confirm recording this overpayment'}
                          </span>
                        </label>
                      </div>
                    )}

                    <div className="flex justify-end">
                      <button
                        type="submit"
                        disabled={savingPayment}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#582C4D] hover:bg-[#6C375F] text-white text-xs font-bold shadow-xs disabled:opacity-50 cursor-pointer"
                      >
                        <Receipt className="w-3.5 h-3.5" />
                        <span>
                          {savingPayment
                            ? t('saving')
                            : language === 'bn'
                            ? 'পেমেন্ট সংরক্ষণ ও রিসিট তৈরি করুন'
                            : 'Save Payment & Generate Receipt'}
                        </span>
                      </button>
                    </div>
                  </form>

                  {/* Immutable Payment Ledger List */}
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-extrabold text-stone-700 dark:text-stone-300 uppercase">
                        {language === 'bn'
                          ? 'পেমেন্ট ও মানি রিসিট লেজার (অপরিবর্তনশীল)'
                          : 'Immutable Payment & Receipt Ledger'}
                      </h4>
                      <span className="text-[11px] text-stone-400">
                        {language === 'bn'
                          ? 'সংশোধনের জন্য রিভার্সাল এন্ট্রি ব্যবহৃত হয়'
                          : 'Corrections use Reversal entries'}
                      </span>
                    </div>

                    {payments.length === 0 ? (
                      <div className="p-4 text-center text-xs text-stone-500 bg-stone-50 dark:bg-stone-900/40 rounded-2xl border border-dashed border-stone-200 dark:border-stone-800">
                        {language === 'bn'
                          ? 'এখনও কোনো পেমেন্ট রিসিট রেকর্ড করা হয়নি।'
                          : 'No payment receipts recorded yet.'}
                      </div>
                    ) : (
                      <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                        {payments.map((p) => {
                          const isNegative = p.amount < 0;
                          const isRevEntry = p.payment_type === 'REVERSAL';
                          return (
                            <div
                              key={p.id}
                              className={`p-3.5 rounded-2xl border text-xs space-y-2 ${
                                isRevEntry
                                  ? 'bg-rose-50/50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/60'
                                  : p.is_reversed === 1
                                  ? 'bg-stone-100/70 dark:bg-stone-900/50 border-stone-200 dark:border-stone-800 opacity-80'
                                  : 'bg-white dark:bg-stone-900 border-stone-200 dark:border-stone-800'
                              }`}
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-mono font-extrabold text-[#582C4D] dark:text-[#C5A059]">
                                    {p.receipt_number}
                                  </span>
                                  <span
                                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                      isNegative
                                        ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                                        : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                    }`}
                                  >
                                    {t(`payType_${p.payment_type}` as any)}
                                  </span>
                                  <span className="px-2 py-0.5 rounded-md bg-stone-100 dark:bg-stone-800 font-semibold text-[10px]">
                                    {t(`payMethod_${p.method}` as any)}
                                  </span>
                                  {p.is_reversed === 1 && (
                                    <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 text-[10px] font-extrabold">
                                      {language === 'bn' ? 'রিভার্সড (Reversed)' : 'Reversed'}
                                    </span>
                                  )}
                                </div>

                                <div
                                  className={`text-sm font-extrabold ${
                                    isNegative
                                      ? 'text-rose-600 dark:text-rose-400'
                                      : 'text-emerald-700 dark:text-emerald-400'
                                  }`}
                                >
                                  {isNegative ? '- ' : '+ '}
                                  {formatCurrency(Math.abs(p.amount), language)}
                                </div>
                              </div>

                              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-stone-500">
                                <span>📅 {formatDualDateFromYMD(p.payment_date)}</span>
                                <span>
                                  {language === 'bn' ? 'গ্রহণকারী:' : 'By:'} {p.received_by_name}
                                  {p.reference_number ? ` • Ref: ${p.reference_number}` : ''}
                                </span>
                              </div>

                              {p.note && (
                                <div className="text-[11px] text-stone-600 dark:text-stone-300 italic">
                                  📝 {p.note}
                                </div>
                              )}

                              <div className="flex items-center justify-end gap-2 pt-1 border-t border-stone-100 dark:border-stone-800">
                                <button
                                  type="button"
                                  onClick={() => handlePrintMoneyReceipt(p)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#582C4D]/10 text-[#582C4D] dark:bg-[#C5A059]/20 dark:text-[#C5A059] font-bold hover:bg-[#582C4D]/20 cursor-pointer"
                                >
                                  <Printer className="w-3 h-3" />
                                  <span>
                                    {language === 'bn' ? 'মানি রিসিট প্রিন্ট' : 'Print Money Receipt'}
                                  </span>
                                </button>

                                {p.payment_type !== 'REVERSAL' && p.is_reversed === 0 && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setReversingPaymentId(
                                        reversingPaymentId === p.id ? null : p.id
                                      );
                                      setReversalReason('');
                                    }}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 font-bold hover:bg-rose-100 cursor-pointer"
                                  >
                                    <RotateCcw className="w-3 h-3" />
                                    <span>
                                      {language === 'bn' ? 'রিভার্স (সংশোধন)' : 'Reverse Entry'}
                                    </span>
                                  </button>
                                )}
                              </div>

                              {reversingPaymentId === p.id && (
                                <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 space-y-2 mt-2">
                                  <input
                                    type="text"
                                    value={reversalReason}
                                    onChange={(e) => setReversalReason(e.target.value)}
                                    placeholder={
                                      language === 'bn'
                                        ? 'রিভার্স করার কারণ লিখুন (যেমন: ভুল অংক এন্ট্রি)...'
                                        : 'Enter reason for reversal (e.g. wrong amount entered)...'
                                    }
                                    className="w-full px-2.5 py-1.5 rounded-lg border border-rose-300 bg-white dark:bg-stone-900 text-xs"
                                  />
                                  <div className="flex justify-end gap-2">
                                    <button
                                      type="button"
                                      onClick={() => setReversingPaymentId(null)}
                                      className="px-2.5 py-1 text-[11px] font-semibold text-stone-600"
                                    >
                                      {t('cancel')}
                                    </button>
                                    <button
                                      type="button"
                                      disabled={actionSaving}
                                      onClick={() => handleReversePayment(p.id)}
                                      className="px-3 py-1 rounded-lg bg-rose-600 text-white text-[11px] font-bold cursor-pointer"
                                    >
                                      {language === 'bn'
                                        ? 'রিভার্সাল এন্ট্রি নিশ্চিত করুন'
                                        : 'Confirm Reversal'}
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* TAB 3: NOTES */}
          {activeTab === 'notes' && (
            <div className="p-4 rounded-2xl bg-stone-50 dark:bg-stone-900/60 border border-stone-200 dark:border-stone-800 text-xs sm:text-sm min-h-[120px]">
              {booking.notes ? (
                <p className="whitespace-pre-wrap leading-relaxed text-stone-800 dark:text-stone-200">
                  {booking.notes}
                </p>
              ) : (
                <p className="text-stone-400 italic">
                  {language === 'bn'
                    ? 'কোনো বিশেষ নোট যুক্ত করা হয়নি।'
                    : 'No notes recorded for this booking.'}
                </p>
              )}
            </div>
          )}

          {/* TAB 4: FULL EDIT HISTORY */}
          {activeTab === 'history' && (
            <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
              {history.length === 0 ? (
                <p className="text-xs text-stone-500 text-center py-4">
                  {language === 'bn' ? 'কোনো ইতিহাস পাওয়া যায়নি।' : 'No edit history found.'}
                </p>
              ) : (
                history.map((h) => (
                  <div
                    key={h.id}
                    className="p-3.5 rounded-2xl bg-stone-50 dark:bg-stone-900/60 border border-stone-200 dark:border-stone-800 space-y-1.5 text-xs"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-bold text-[#582C4D] dark:text-[#C5A059]">
                        {h.action} — {h.user_name}
                      </span>
                      <span className="text-[11px] text-stone-500">
                        {formatDualDate(h.created_at, { includeTime: true })}
                      </span>
                    </div>
                    <pre className="p-2 rounded-xl bg-white dark:bg-stone-950 border border-stone-100 dark:border-stone-800 text-[11px] font-mono overflow-x-auto text-stone-700 dark:text-stone-300">
                      {JSON.stringify(h.changes, null, 2)}
                    </pre>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
};
