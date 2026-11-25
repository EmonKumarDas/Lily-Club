import React, { useState, useEffect } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppColors } from '../theme';
import {
  EN_MONTHS,
  EN_MONTHS_BN,
  toBanglaDigits,
  formatDualDateFromYMD,
} from '../dateUtils';

interface DatePickerModalProps {
  visible: boolean;
  title: string;
  valueYMD: string;
  lang: 'bn' | 'en';
  colors: AppColors;
  onClose: () => void;
  onSelectYMD: (ymd: string) => void;
}

export const DatePickerModal: React.FC<DatePickerModalProps> = ({
  visible,
  title,
  valueYMD,
  lang,
  colors,
  onClose,
  onSelectYMD,
}) => {
  const { width } = useWindowDimensions();
  const modalInnerW = Math.min(width - 36, 460) - 32;
  const dayPx = Math.floor((modalInnerW - 24) / 7);
  const initialYMD = /^\d{4}-\d{2}-\d{2}$/.test(valueYMD)
    ? valueYMD
    : new Date().toISOString().slice(0, 10);

  const [viewYear, setViewYear] = useState<number>(Number(initialYMD.split('-')[0]));
  const [viewMonth, setViewMonth] = useState<number>(Number(initialYMD.split('-')[1])); // 1..12
  const [mode, setMode] = useState<'DAY' | 'MONTH' | 'YEAR'>('DAY');

  useEffect(() => {
    if (visible) {
      const ymd = /^\d{4}-\d{2}-\d{2}$/.test(valueYMD)
        ? valueYMD
        : new Date().toISOString().slice(0, 10);
      setViewYear(Number(ymd.split('-')[0]));
      setViewMonth(Number(ymd.split('-')[1]));
      setMode('DAY');
    }
  }, [visible, valueYMD]);

  const shiftMonth = (delta: number) => {
    const dt = new Date(Date.UTC(viewYear, viewMonth - 1 + delta, 1));
    setViewYear(dt.getUTCFullYear());
    setViewMonth(dt.getUTCMonth() + 1);
  };

  const firstDow = new Date(Date.UTC(viewYear, viewMonth - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(viewYear, viewMonth, 0)).getUTCDate();
  const cells: Array<number | null> = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const dayHeaders =
    lang === 'bn'
      ? ['র', 'সো', 'ম', 'বু', 'বৃ', 'শু', 'শ']
      : ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

  const monthName =
    lang === 'bn' ? EN_MONTHS_BN[viewMonth - 1] : EN_MONTHS[viewMonth - 1];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.box, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {/* Header */}
          <View style={styles.topRow}>
            <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={20} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          {/* Direct Month Name & Year Selector Pills */}
          <View style={[styles.navBar, { backgroundColor: colors.bg, borderColor: colors.border }]}>
            <TouchableOpacity onPress={() => shiftMonth(-1)} style={styles.arrowBtn}>
              <Text style={{ color: colors.text, fontWeight: '800', fontSize: 16 }}>‹</Text>
            </TouchableOpacity>

            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity
                onPress={() => setMode((m) => (m === 'MONTH' ? 'DAY' : 'MONTH'))}
                style={[
                  styles.pill,
                  {
                    backgroundColor: mode === 'MONTH' ? colors.primary : colors.primarySoft,
                    borderColor: colors.primary,
                  },
                ]}
              >
                <Text
                  style={{
                    color: mode === 'MONTH' ? '#fff' : colors.primary,
                    fontWeight: '800',
                    fontSize: 13,
                  }}
                >
                  {monthName}
                </Text>
                <Ionicons
                  name="chevron-down"
                  size={13}
                  color={mode === 'MONTH' ? '#fff' : colors.primary}
                />
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setMode((m) => (m === 'YEAR' ? 'DAY' : 'YEAR'))}
                style={[
                  styles.pill,
                  {
                    backgroundColor: mode === 'YEAR' ? colors.gold : colors.goldSoft,
                    borderColor: colors.gold,
                  },
                ]}
              >
                <Text
                  style={{
                    color: mode === 'YEAR' ? '#fff' : colors.gold,
                    fontWeight: '800',
                    fontSize: 13,
                  }}
                >
                  {lang === 'bn' ? toBanglaDigits(viewYear) : viewYear}
                </Text>
                <Ionicons
                  name="chevron-down"
                  size={13}
                  color={mode === 'YEAR' ? '#fff' : colors.gold}
                />
              </TouchableOpacity>
            </View>

            <TouchableOpacity onPress={() => shiftMonth(1)} style={styles.arrowBtn}>
              <Text style={{ color: colors.text, fontWeight: '800', fontSize: 16 }}>›</Text>
            </TouchableOpacity>
          </View>

          {/* MODE 1: MONTH NAME PICKER */}
          {mode === 'MONTH' && (
            <View style={styles.grid3}>
              {(lang === 'bn' ? EN_MONTHS_BN : EN_MONTHS).map((mLbl, idx) => {
                const active = viewMonth === idx + 1;
                return (
                  <TouchableOpacity
                    key={idx}
                    onPress={() => {
                      setViewMonth(idx + 1);
                      setMode('DAY');
                    }}
                    style={[
                      styles.gridItem,
                      {
                        backgroundColor: active ? colors.primary : colors.bg,
                        borderColor: active ? colors.primary : colors.border,
                      },
                    ]}
                  >
                    <Text
                      style={{
                        color: active ? '#fff' : colors.text,
                        fontWeight: '800',
                        fontSize: 12,
                      }}
                    >
                      {mLbl}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {/* MODE 2: YEAR PICKER */}
          {mode === 'YEAR' && (
            <View style={styles.grid3}>
              {Array.from({ length: 15 }, (_, i) => 2021 + i).map((yr) => {
                const active = viewYear === yr;
                return (
                  <TouchableOpacity
                    key={yr}
                    onPress={() => {
                      setViewYear(yr);
                      setMode('DAY');
                    }}
                    style={[
                      styles.gridItem,
                      {
                        backgroundColor: active ? colors.gold : colors.bg,
                        borderColor: active ? colors.gold : colors.border,
                      },
                    ]}
                  >
                    <Text
                      style={{
                        color: active ? '#fff' : colors.text,
                        fontWeight: '800',
                        fontSize: 13,
                      }}
                    >
                      {lang === 'bn' ? toBanglaDigits(yr) : yr}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {/* MODE 3: DIRECT CALENDAR DAY GRID */}
          {mode === 'DAY' && (
            <View>
              <View style={styles.dowRow}>
                {dayHeaders.map((h, i) => (
                  <Text key={i} style={[styles.dowText, { color: colors.textMuted }]}>
                    {h}
                  </Text>
                ))}
              </View>
              <View style={styles.daysGrid}>
                {cells.map((d, i) => {
                  if (!d) return <View key={`empty-${i}`} style={{ width: dayPx, height: dayPx }} />;
                  const ymd = `${viewYear}-${String(viewMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                  const isSelected = ymd === valueYMD;
                  return (
                    <TouchableOpacity
                      key={ymd}
                      onPress={() => {
                        onSelectYMD(ymd);
                        onClose();
                      }}
                      style={[
                        styles.dayCell,
                        {
                          width: dayPx,
                          height: dayPx,
                          backgroundColor: isSelected ? colors.primary : colors.bg,
                          borderColor: isSelected ? colors.primary : colors.border,
                        },
                      ]}
                    >
                      <Text
                        style={{
                          color: isSelected ? '#fff' : colors.text,
                          fontWeight: '800',
                          fontSize: 12.5,
                        }}
                      >
                        {lang === 'bn' ? toBanglaDigits(d) : d}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {/* Selected Dual Date Preview */}
          {valueYMD ? (
            <Text style={{ fontSize: 11.5, fontWeight: '700', color: colors.primary, textAlign: 'center', marginTop: 6 }}>
              📅 {formatDualDateFromYMD(valueYMD, lang)}
            </Text>
          ) : null}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    padding: 18,
  },
  box: {
    borderRadius: 22,
    borderWidth: 1,
    padding: 16,
    gap: 10,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: { fontSize: 15, fontWeight: '800' },
  closeBtn: { padding: 4 },
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  arrowBtn: { paddingHorizontal: 10, paddingVertical: 4 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
  },
  grid3: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  gridItem: {
    width: '31%',
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
  },
  dowRow: { flexDirection: 'row', marginBottom: 6 },
  dowText: { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '800' },
  daysGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  dayCellEmpty: { width: '13.2%', aspectRatio: 1 },
  dayCell: {
    width: '13.2%',
    aspectRatio: 1,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
