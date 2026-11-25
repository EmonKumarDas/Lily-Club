import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeScreen } from './ScreenShell';
import { AppColors } from '../theme';
import { apiFetch } from '../api';
import { formatCurrency } from '../dateUtils';

interface BookingModalProps {
  visible: boolean;
  onClose: () => void;
  roomId: string;
  halls: any[];
  customers: any[];
  initialDate?: string;
  initialHallId?: string;
  initialSlot?: 'DAY' | 'NIGHT' | 'FULL';
  lang: 'bn' | 'en';
  colors: AppColors;
  onCreated: () => void;
}

export const BookingModal: React.FC<BookingModalProps> = ({
  visible,
  onClose,
  roomId,
  halls,
  customers,
  initialDate,
  initialHallId,
  initialSlot,
  lang,
  colors,
  onCreated,
}) => {
  const [hallId, setHallId] = useState(initialHallId || halls[0]?.id || '');
  const [customerId, setCustomerId] = useState(customers[0]?.id || '');
  const [eventDate, setEventDate] = useState(initialDate || new Date().toISOString().slice(0, 10));
  const [slot, setSlot] = useState<'DAY' | 'NIGHT' | 'FULL'>(initialSlot || 'DAY');
  const [eventType, setEventType] = useState<'WEDDING' | 'HOLUD' | 'RECEPTION' | 'BIRTHDAY' | 'MEETING' | 'OTHER'>('WEDDING');
  const [guestCount, setGuestCount] = useState('250');
  const [price, setPrice] = useState('');
  const [advance, setAdvance] = useState('0');
  const [status, setStatus] = useState<'TENTATIVE' | 'CONFIRMED'>('CONFIRMED');
  const [saving, setSaving] = useState(false);
  const [custPickerOpen, setCustPickerOpen] = useState(false);
  const [custQuery, setCustQuery] = useState('');

  const selectedCustomer = customers.find((c) => c.id === customerId);
  const filteredCustomers = customers.filter((c) => {
    if (!custQuery.trim()) return true;
    const q = custQuery.toLowerCase();
    return (
      (c.name || '').toLowerCase().includes(q) ||
      (c.phone || '').toLowerCase().includes(q)
    );
  });

  useEffect(() => {
    if (visible) {
      const hId = initialHallId || halls[0]?.id || '';
      setHallId(hId);
      setCustomerId(customers[0]?.id || '');
      if (initialDate) setEventDate(initialDate);
      if (initialSlot) setSlot(initialSlot);
    }
  }, [visible, initialDate, initialHallId, initialSlot, halls, customers]);

  useEffect(() => {
    const h = halls.find((item) => item.id === hallId);
    if (h) {
      const base = slot === 'DAY' ? h.day_price : slot === 'NIGHT' ? h.night_price : h.full_price;
      setPrice(String(base || 0));
    }
  }, [hallId, slot, halls]);

  const handleSave = async () => {
    if (!hallId || !customerId || !/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) {
      Alert.alert(
        lang === 'bn' ? 'তথ্য অসম্পূর্ণ' : 'Missing Fields',
        lang === 'bn' ? 'হল, গ্রাহক এবং YYYY-MM-DD তারিখ দিন।' : 'Select hall, customer, and valid YYYY-MM-DD date.'
      );
      return;
    }
    setSaving(true);
    try {
      await apiFetch(`/api/rooms/${roomId}/bookings`, {
        method: 'POST',
        body: JSON.stringify({
          hall_id: hallId,
          customer_id: customerId,
          event_date: eventDate,
          slot,
          event_type: eventType,
          guest_count: Math.max(1, parseInt(guestCount, 10) || 100),
          hall_rent: parseFloat(price) || 0,
          advance_amount: parseFloat(advance) || 0,
          status,
          confirm_past_date: true,
        }),
      });
      onCreated();
      onClose();
    } catch (err: any) {
      Alert.alert(lang === 'bn' ? 'বুকিং হয়নি' : 'Booking Failed', err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeScreen backgroundColor={colors.bg}>
        <View style={[styles.header, { backgroundColor: colors.headerBg, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={onClose} style={[styles.iconBtn, { flexDirection: 'row', alignItems: 'center', gap: 2 }]} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="chevron-back" size={22} color={colors.text} />
            <Text style={{ color: colors.text, fontWeight: '700', fontSize: 14 }}>
              {lang === 'bn' ? 'পিছনে' : 'Back'}
            </Text>
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.text }]}>
            {lang === 'bn' ? 'নতুন বুকিং' : 'New Booking'}
          </Text>
          <View style={{ width: 36 }} />
        </View>

        <ScrollView contentContainerStyle={styles.body}>
          {/* Hall Picker */}
          <Text style={[styles.label, { color: colors.textMuted }]}>{lang === 'bn' ? 'হল নির্বাচন' : 'Select Hall'}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {halls.map((h) => {
              const active = h.id === hallId;
              return (
                <TouchableOpacity
                  key={h.id}
                  onPress={() => setHallId(h.id)}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: active ? colors.primary : colors.card,
                      borderColor: active ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <Text style={{ color: active ? '#fff' : colors.text, fontWeight: '700', fontSize: 13 }}>
                    {h.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Searchable Customer Dropdown */}
          <Text style={[styles.label, { color: colors.textMuted }]}>{lang === 'bn' ? 'গ্রাহক নির্বাচন' : 'Customer'}</Text>
          <TouchableOpacity
            onPress={() => {
              setCustQuery('');
              setCustPickerOpen(true);
            }}
            style={[
              styles.dropdownTrigger,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <View style={{ flex: 1 }}>
              <Text style={{ color: selectedCustomer ? colors.text : colors.textMuted, fontWeight: '700', fontSize: 14 }} numberOfLines={1}>
                {selectedCustomer
                  ? selectedCustomer.name
                  : lang === 'bn'
                  ? 'গ্রাহক নির্বাচন করুন...'
                  : 'Select customer...'}
              </Text>
              {selectedCustomer?.phone ? (
                <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '600', marginTop: 2 }}>
                  📞 {selectedCustomer.phone}
                </Text>
              ) : null}
            </View>
            <Ionicons name="chevron-down" size={20} color={colors.textMuted} />
          </TouchableOpacity>

          {/* Slot Picker: DAY / NIGHT / FULL */}
          <Text style={[styles.label, { color: colors.textMuted }]}>{lang === 'bn' ? 'স্লট (দিন / রাত / দিন ও রাত)' : 'Slot'}</Text>
          <View style={styles.slotGrid}>
            {(['DAY', 'NIGHT', 'FULL'] as const).map((s) => {
              const active = slot === s;
              const icon = s === 'DAY' ? 'sunny' : s === 'NIGHT' ? 'moon' : 'partly-sunny';
              const lbl = s === 'DAY' ? (lang === 'bn' ? 'দিন' : 'Day') : s === 'NIGHT' ? (lang === 'bn' ? 'রাত' : 'Night') : (lang === 'bn' ? 'দিন ও রাত' : 'Full');
              return (
                <TouchableOpacity
                  key={s}
                  onPress={() => setSlot(s)}
                  style={[
                    styles.slotCard,
                    {
                      backgroundColor: active ? colors.primarySoft : colors.card,
                      borderColor: active ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <Ionicons name={icon as any} size={18} color={active ? colors.primary : colors.textMuted} />
                  <Text style={{ color: active ? colors.primary : colors.text, fontWeight: '700', fontSize: 12, marginTop: 4 }}>
                    {lbl}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Date & Guest Count */}
          <View style={styles.twoCol}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.label, { color: colors.textMuted }]}>{lang === 'bn' ? 'তারিখ (YYYY-MM-DD)' : 'Event Date'}</Text>
              <TextInput
                value={eventDate}
                onChangeText={setEventDate}
                placeholder="2026-11-30"
                placeholderTextColor={colors.textMuted}
                style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text }]}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.label, { color: colors.textMuted }]}>{lang === 'bn' ? 'অতিথি সংখ্যা' : 'Guests'}</Text>
              <TextInput
                value={guestCount}
                onChangeText={setGuestCount}
                keyboardType="number-pad"
                style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text }]}
              />
            </View>
          </View>

          {/* Event Type */}
          <Text style={[styles.label, { color: colors.textMuted }]}>{lang === 'bn' ? 'অনুষ্ঠানের ধরন' : 'Event Type'}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {(['WEDDING', 'HOLUD', 'RECEPTION', 'BIRTHDAY', 'MEETING', 'OTHER'] as const).map((et) => {
              const active = eventType === et;
              return (
                <TouchableOpacity
                  key={et}
                  onPress={() => setEventType(et)}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: active ? colors.goldSoft : colors.card,
                      borderColor: active ? colors.gold : colors.border,
                    },
                  ]}
                >
                  <Text style={{ color: active ? colors.gold : colors.text, fontWeight: '700', fontSize: 12 }}>{et}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Price & Advance */}
          <View style={styles.twoCol}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.label, { color: colors.textMuted }]}>{lang === 'bn' ? 'ভাড়া (৳)' : 'Hall Rent (৳)'}</Text>
              <TextInput
                value={price}
                onChangeText={setPrice}
                keyboardType="numeric"
                style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text }]}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.label, { color: colors.textMuted }]}>{lang === 'bn' ? 'অগ্রিম (৳)' : 'Advance (৳)'}</Text>
              <TextInput
                value={advance}
                onChangeText={setAdvance}
                keyboardType="numeric"
                style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text }]}
              />
            </View>
          </View>

          {/* Status */}
          <View style={styles.twoCol}>
            {(['CONFIRMED', 'TENTATIVE'] as const).map((st) => {
              const active = status === st;
              return (
                <TouchableOpacity
                  key={st}
                  onPress={() => setStatus(st)}
                  style={[
                    styles.statusBtn,
                    {
                      backgroundColor: active ? (st === 'CONFIRMED' ? colors.primarySoft : colors.amberSoft) : colors.card,
                      borderColor: active ? (st === 'CONFIRMED' ? colors.primary : colors.amber) : colors.border,
                    },
                  ]}
                >
                  <Text style={{ color: active ? (st === 'CONFIRMED' ? colors.primary : colors.amber) : colors.text, fontWeight: '700', fontSize: 13 }}>
                    {st === 'CONFIRMED' ? (lang === 'bn' ? 'নিশ্চিত (Confirmed)' : 'Confirmed') : (lang === 'bn' ? 'অস্থায়ী (Tentative)' : 'Tentative')}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <TouchableOpacity
            onPress={handleSave}
            disabled={saving}
            style={[styles.saveBtn, { backgroundColor: colors.primary }]}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.saveBtnText}>
                {lang === 'bn' ? 'বুকিং সংরক্ষণ করুন' : 'Save Booking'} ({formatCurrency(Number(price || 0), lang)})
              </Text>
            )}
          </TouchableOpacity>
        </ScrollView>

        {/* Searchable Customer Picker Modal */}
        <Modal visible={custPickerOpen} animationType="slide" onRequestClose={() => setCustPickerOpen(false)}>
          <SafeScreen backgroundColor={colors.bg}>
            <View style={[styles.header, { backgroundColor: colors.headerBg, borderBottomColor: colors.border }]}>
              <TouchableOpacity
                onPress={() => setCustPickerOpen(false)}
                style={[styles.iconBtn, { flexDirection: 'row', alignItems: 'center', gap: 2 }]}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="chevron-back" size={22} color={colors.text} />
                <Text style={{ color: colors.text, fontWeight: '700', fontSize: 14 }}>
                  {lang === 'bn' ? 'পিছনে' : 'Back'}
                </Text>
              </TouchableOpacity>
              <Text style={[styles.title, { color: colors.text }]}>
                {lang === 'bn' ? 'গ্রাহক খুঁজুন' : 'Select Customer'}
              </Text>
              <View style={{ width: 52 }} />
            </View>

            <View style={{ padding: 14 }}>
              <TextInput
                value={custQuery}
                onChangeText={setCustQuery}
                autoFocus
                placeholder={lang === 'bn' ? 'নাম বা ফোন নম্বর লিখুন...' : 'Search by name or phone...'}
                placeholderTextColor={colors.textMuted}
                style={[styles.input, { backgroundColor: colors.card, borderColor: colors.primary, color: colors.text }]}
              />
            </View>

            <FlatList
              data={filteredCustomers}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 24, gap: 8 }}
              ListEmptyComponent={
                <Text style={{ textAlign: 'center', color: colors.textMuted, marginTop: 24 }}>
                  {lang === 'bn' ? 'কোনো গ্রাহক পাওয়া যায়নি' : 'No matching customers found'}
                </Text>
              }
              renderItem={({ item }) => {
                const isSel = item.id === customerId;
                return (
                  <TouchableOpacity
                    onPress={() => {
                      setCustomerId(item.id);
                      setCustPickerOpen(false);
                    }}
                    style={[
                      styles.custRow,
                      {
                        backgroundColor: isSel ? colors.primarySoft : colors.card,
                        borderColor: isSel ? colors.primary : colors.border,
                      },
                    ]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontWeight: '800', fontSize: 14, color: colors.text }}>
                        {item.name}
                      </Text>
                      <Text style={{ fontSize: 12, color: colors.textMuted, marginTop: 2 }}>
                        📞 {item.phone}
                      </Text>
                    </View>
                    {isSel && <Ionicons name="checkmark-circle" size={22} color={colors.primary} />}
                  </TouchableOpacity>
                );
              }}
            />
          </SafeScreen>
        </Modal>
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
  title: { fontSize: 17, fontWeight: '800' },
  body: { padding: 16, gap: 10, paddingBottom: 40 },
  label: { fontSize: 12, fontWeight: '700', marginTop: 4 },
  chipRow: { gap: 8, paddingVertical: 4 },
  chip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12, borderWidth: 1 },
  slotGrid: { flexDirection: 'row', gap: 8 },
  slotCard: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  twoCol: { flexDirection: 'row', gap: 10 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, fontWeight: '600' },
  statusBtn: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 12, borderWidth: 1.5 },
  saveBtn: { marginTop: 12, paddingVertical: 15, borderRadius: 14, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  dropdownTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  custRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
});
