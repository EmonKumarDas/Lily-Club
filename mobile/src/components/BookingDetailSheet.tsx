import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeScreen } from './ScreenShell';
import { AppColors } from '../theme';
import { apiFetch } from '../api';
import { formatDualDateFromYMD, formatTime12, formatCurrency } from '../dateUtils';
import { CashMemoModal } from './CashMemoModal';

interface BookingDetailSheetProps {
  bookingId: string | null;
  room: any | null;
  role: string;
  lang: 'bn' | 'en';
  colors: AppColors;
  serverUrl: string;
  onClose: () => void;
  onUpdated: () => void;
}

export const BookingDetailSheet: React.FC<BookingDetailSheetProps> = ({
  bookingId,
  room,
  role,
  lang,
  colors,
  serverUrl,
  onClose,
  onUpdated,
}) => {
  const [booking, setBooking] = useState<any | null>(null);
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState<'CASH' | 'BKASH' | 'NAGAD' | 'BANK'>('CASH');
  const [savingPay, setSavingPay] = useState(false);
  const [memoPayment, setMemoPayment] = useState<any | null>(null);
  const [memoVisible, setMemoVisible] = useState(false);

  const canSeeMoney = role === 'OWNER' || role === 'MANAGER';

  const loadDetail = async () => {
    if (!bookingId || !room) return;
    setLoading(true);
    try {
      const res = await apiFetch<{ booking: any }>(`/api/rooms/${room.id}/bookings/${bookingId}`);
      setBooking(res.booking);
      if (canSeeMoney) {
        const pRes = await apiFetch<{ payments: any[] }>(`/api/rooms/${room.id}/bookings/${bookingId}/payments`);
        setPayments(pRes.payments || []);
      }
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (bookingId) loadDetail();
    else {
      setBooking(null);
      setPayments([]);
    }
  }, [bookingId]);

  const handleRecordPayment = async () => {
    const amt = parseFloat(payAmount);
    if (!amt || amt <= 0 || !booking || !room) {
      Alert.alert(lang === 'bn' ? 'সঠিক পরিমাণ দিন' : 'Enter valid amount');
      return;
    }
    setSavingPay(true);
    try {
      await apiFetch(`/api/rooms/${room.id}/bookings/${booking.id}/payments`, {
        method: 'POST',
        body: JSON.stringify({
          payment_type: amt >= Number(booking.due_amount || 0) ? 'FINAL' : 'PARTIAL',
          amount: amt,
          method: payMethod,
          confirm_overpayment: true,
        }),
      });
      setPayAmount('');
      await loadDetail();
      onUpdated();
    } catch (err: any) {
      Alert.alert('Payment Error', err.message);
    } finally {
      setSavingPay(false);
    }
  };

  return (
    <Modal visible={Boolean(bookingId)} animationType="slide" onRequestClose={onClose}>
      <SafeScreen backgroundColor={colors.bg}>
        <View style={[styles.header, { backgroundColor: colors.headerBg, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={onClose} style={[styles.iconBtn, { flexDirection: 'row', alignItems: 'center', gap: 2 }]} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="chevron-back" size={22} color={colors.text} />
            <Text style={{ color: colors.text, fontWeight: '700', fontSize: 14 }}>
              {lang === 'bn' ? 'পিছনে' : 'Back'}
            </Text>
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
            {booking?.booking_number || (lang === 'bn' ? 'বুকিং বিবরণ' : 'Booking Details')}
          </Text>
          {booking && canSeeMoney ? (
            <TouchableOpacity
              onPress={() => {
                setMemoPayment(payments[0] || null);
                setMemoVisible(true);
              }}
              style={[styles.memoBtn, { backgroundColor: colors.gold }]}
            >
              <Ionicons name="document-text-outline" size={16} color="#fff" />
              <Text style={styles.memoBtnText}>{lang === 'bn' ? 'চুক্তিপত্র' : 'Cash Memo'}</Text>
            </TouchableOpacity>
          ) : (
            <View style={{ width: 40 }} />
          )}
        </View>

        {loading || !booking ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.body}>
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.hallName, { color: colors.primary }]}>{booking.hall_name}</Text>
              <Text style={[styles.custName, { color: colors.text }]}>{booking.customer_name}</Text>
              <Text style={[styles.subText, { color: colors.textMuted }]}>
                📅 {formatDualDateFromYMD(booking.event_date, lang)}
              </Text>
              <Text style={[styles.subText, { color: colors.textMuted }]}>
                🕒 {booking.slot} • {formatTime12(booking.start_time, lang)} - {formatTime12(booking.end_time, lang)}
              </Text>
            </View>

            {canSeeMoney && (
              <>
                <View style={styles.moneyRow}>
                  <View style={[styles.moneyBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <Text style={[styles.moneyLbl, { color: colors.textMuted }]}>{lang === 'bn' ? 'সর্বমোট' : 'Total'}</Text>
                    <Text style={[styles.moneyVal, { color: colors.text }]}>{formatCurrency(booking.total_amount, lang)}</Text>
                  </View>
                  <View style={[styles.moneyBox, { backgroundColor: colors.primarySoft, borderColor: colors.primary }]}>
                    <Text style={[styles.moneyLbl, { color: colors.primary }]}>{lang === 'bn' ? 'পরিশোধিত' : 'Paid'}</Text>
                    <Text style={[styles.moneyVal, { color: colors.primary }]}>
                      {formatCurrency((booking.total_amount || 0) - (booking.due_amount || 0), lang)}
                    </Text>
                  </View>
                  <View style={[styles.moneyBox, { backgroundColor: colors.crimsonSoft, borderColor: colors.crimson }]}>
                    <Text style={[styles.moneyLbl, { color: colors.crimson }]}>{lang === 'bn' ? 'বাকী' : 'Due'}</Text>
                    <Text style={[styles.moneyVal, { color: colors.crimson }]}>{formatCurrency(booking.due_amount, lang)}</Text>
                  </View>
                </View>

                {/* Record Payment */}
                <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Text style={[styles.secTitle, { color: colors.text }]}>
                    {lang === 'bn' ? 'পেমেন্ট গ্রহণ করুন' : 'Record Payment'}
                  </Text>
                  <TextInput
                    value={payAmount}
                    onChangeText={setPayAmount}
                    keyboardType="numeric"
                    placeholder={lang === 'bn' ? 'টাকার পরিমাণ (৳)' : 'Amount (৳)'}
                    placeholderTextColor={colors.textMuted}
                    style={[styles.input, { backgroundColor: colors.bg, borderColor: colors.border, color: colors.text }]}
                  />
                  <View style={styles.methodRow}>
                    {(['CASH', 'BKASH', 'NAGAD', 'BANK'] as const).map((m) => (
                      <TouchableOpacity
                        key={m}
                        onPress={() => setPayMethod(m)}
                        style={[
                          styles.methodChip,
                          {
                            backgroundColor: payMethod === m ? colors.primary : colors.bg,
                            borderColor: payMethod === m ? colors.primary : colors.border,
                          },
                        ]}
                      >
                        <Text style={{ color: payMethod === m ? '#fff' : colors.text, fontSize: 11, fontWeight: '700' }}>
                          {m}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <TouchableOpacity
                    onPress={handleRecordPayment}
                    disabled={savingPay}
                    style={[styles.payBtn, { backgroundColor: colors.primary }]}
                  >
                    {savingPay ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.payBtnText}>{lang === 'bn' ? 'পেমেন্ট সেভ ও রিসিট তৈরি' : 'Save Payment & Receipt'}</Text>
                    )}
                  </TouchableOpacity>
                </View>

                {/* Payment Receipts */}
                <Text style={[styles.secTitle, { color: colors.text, marginTop: 4 }]}>
                  {lang === 'bn' ? 'রিসিটসমূহ (ক্যাশ মেমো)' : 'Receipts (Cash Memo)'}
                </Text>
                {payments.map((p) => (
                  <TouchableOpacity
                    key={p.id}
                    onPress={() => {
                      setMemoPayment(p);
                      setMemoVisible(true);
                    }}
                    style={[styles.receiptItem, { backgroundColor: colors.card, borderColor: colors.border }]}
                  >
                    <View>
                      <Text style={{ fontWeight: '800', color: colors.crimson, fontSize: 13 }}>{p.receipt_number}</Text>
                      <Text style={{ color: colors.textMuted, fontSize: 11 }}>
                        {formatDualDateFromYMD(p.payment_date, lang)} • {p.method}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={{ fontWeight: '800', color: colors.primary, fontSize: 14 }}>
                        {formatCurrency(p.amount, lang)}
                      </Text>
                      <Text style={{ color: colors.gold, fontSize: 11, fontWeight: '700' }}>
                        {lang === 'bn' ? 'চুক্তিপত্র দেখুন →' : 'View Memo →'}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </>
            )}
          </ScrollView>
        )}

        <CashMemoModal
          visible={memoVisible}
          onClose={() => setMemoVisible(false)}
          booking={booking}
          payment={memoPayment}
          room={room}
          lang={lang}
          colors={colors}
          serverUrl={serverUrl}
        />
      </SafeScreen>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  iconBtn: { padding: 6 },
  title: { fontSize: 16, fontWeight: '800', flex: 1, textAlign: 'center' },
  memoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
  },
  memoBtnText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  body: { padding: 14, gap: 12, paddingBottom: 40 },
  card: { padding: 14, borderRadius: 16, borderWidth: 1, gap: 4 },
  hallName: { fontSize: 12, fontWeight: '800', textTransform: 'uppercase' },
  custName: { fontSize: 18, fontWeight: '800' },
  subText: { fontSize: 13, fontWeight: '500', marginTop: 2 },
  moneyRow: { flexDirection: 'row', gap: 8 },
  moneyBox: { flex: 1, padding: 10, borderRadius: 14, borderWidth: 1, alignItems: 'center' },
  moneyLbl: { fontSize: 11, fontWeight: '700' },
  moneyVal: { fontSize: 14, fontWeight: '800', marginTop: 2 },
  secTitle: { fontSize: 14, fontWeight: '800' },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, fontWeight: '700', marginTop: 6 },
  methodRow: { flexDirection: 'row', gap: 6, marginTop: 8 },
  methodChip: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 10, borderWidth: 1 },
  payBtn: { marginTop: 10, paddingVertical: 13, borderRadius: 12, alignItems: 'center' },
  payBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  receiptItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
});
