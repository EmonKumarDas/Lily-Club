import React, { useState, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeScreen } from './ScreenShell';
import { Ionicons } from '@expo/vector-icons';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { captureRef } from 'react-native-view-shot';
import { AppColors } from '../theme';
import { DEFAULT_LOGO_URI } from '../logoBase64';
import {
  formatDualDateFromYMD,
  formatTime12,
  formatCurrency,
  getWeekdayFromYMD,
  toBanglaDigits,
  numberToBanglaWords,
} from '../dateUtils';

const TERMS_BN = [
  'গ্রাহক অতিথি নিয়ন্ত্রণ আইন মানিয়া চলিবেন।',
  'হল বুকিং করিতে হইলে ৫০% টাকা অগ্রিম প্রদান করিতে হইবে যাহা কোন অবস্থাতেই ফেরত যোগ্য নহে।',
  'হলের বকেয়া টাকা অনুষ্ঠান দিনে হইলে দুপুর ১২টা এবং রাতে হইলে রাত ১০টার মধ্যে সম্পূর্ণ পরিশোধ করিতে হইবে।',
  'যে কোন প্রকার বৈদ্যুতিক গোলযোগের জন্য ক্লাব কর্তৃপক্ষ দায়ী নয়।',
  'চুক্তিপত্র এর বাহিরে মালামাল ব্যবহার করিলে অতিরিক্ত ভাড়া প্রদান করিতে বাধ্য থাকিবে।',
  'গ্রাহক যে কোন ধরনের মালামাল ভাঙ্গিলে বা কোন প্রকার ক্ষয়ক্ষতি করিলে তাহার মূল্য প্রদান করিতে বাধ্য থাকিবে।',
  'রাত ১২টার পর গান ও সাংস্কৃতিক অনুষ্ঠানের আওয়াজ হলের ভিতর সীমাবদ্ধ রাখুন।',
  'দিনের অনুষ্ঠান বিকাল ৫টা এবং রাতের অনুষ্ঠান রাত ১২টার মধ্যে শেষ করে ক্লাব বুঝাইয়া দিতে হইবে।',
];

interface CashMemoModalProps {
  visible: boolean;
  onClose: () => void;
  booking: any | null;
  payment?: any | null;
  room: any | null;
  lang: 'bn' | 'en';
  colors: AppColors;
  serverUrl: string;
}

export const CashMemoModal: React.FC<CashMemoModalProps> = ({
  visible,
  onClose,
  booking,
  payment,
  room,
  lang,
  colors,
  serverUrl,
}) => {
  const [printing, setPrinting] = useState(false);
  const paperRef = useRef<any>(null);

  if (!booking) return null;

  const billNo = payment?.receipt_number || booking.booking_number;
  const dualEventDate = formatDualDateFromYMD(booking.event_date, lang);
  const weekday = getWeekdayFromYMD(booking.event_date, lang);
  const [evY, evM, evD] = (booking.event_date || '2026-01-01').split('-');

  const slotLabel =
    booking.slot === 'DAY'
      ? `দিন (${formatTime12(booking.start_time, 'bn')} - ${formatTime12(booking.end_time, 'bn')})`
      : booking.slot === 'NIGHT'
      ? `রাত (${formatTime12(booking.start_time, 'bn')} - ${formatTime12(booking.end_time, 'bn')})`
      : `দিন ও রাত (${formatTime12(booking.start_time, 'bn')} - ${formatTime12(booking.end_time, 'bn')})`;

  const totalAmt = Number(booking.total_amount || 0);
  const paidAmt = payment
    ? Math.abs(Number(payment.amount || 0))
    : Math.max(0, totalAmt - Number(booking.due_amount || 0));
  const dueAmt = Math.max(0, Number(booking.due_amount || 0));
  const inWordsBn = numberToBanglaWords(totalAmt);

  const buildPrintHtml = async (): Promise<string> => {
    // 1. Primary: Capture the exact in-app rendered Cash Memo view at full retina resolution!
    if (paperRef.current) {
      try {
        const snapshotDataUri = await captureRef(paperRef, {
          format: 'png',
          quality: 1,
          result: 'data-uri',
        });
        if (snapshotDataUri) {
          return `
            <!DOCTYPE html>
            <html>
              <head>
                <meta charset="utf-8" />
                <style>
                  @page { size: A4 portrait; margin: 10mm; }
                  * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                  html, body { margin: 0; padding: 0; background: #ffffff; width: 100%; }
                  .wrap { width: 100%; display: flex; justify-content: center; align-items: flex-start; padding: 4px; }
                  img.memo-img { width: 100%; max-width: 760px; height: auto; display: block; border-radius: 8px; }
                </style>
              </head>
              <body>
                <div class="wrap">
                  <img class="memo-img" src="${snapshotDataUri}" />
                </div>
              </body>
            </html>
          `;
        }
      } catch {}
    }

    // 2. Fallback: Exact 1:1 HTML with print-color-adjust, embedded Base64 logo, and large watermark
    const logoSrc = room?.logo || DEFAULT_LOGO_URI || `${serverUrl}/logo.png`;
    const logoPx = Math.round(62 * Number(room?.logo_scale || 1));
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <style>
            @page { size: A4 portrait; margin: 12mm; }
            * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
            body { font-family: 'Noto Sans Bengali', sans-serif; margin: 0; padding: 10px; color: #1c1917; background: #fff; }
            .sheet { border: 2px solid #0E8A44; border-radius: 8px; padding: 14px; background: #FAF9F5 !important; }
            .hdr { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #8C5E2A; padding-bottom: 10px; margin-bottom: 10px; gap: 8px; }
            .brand { display: flex; align-items: center; gap: 10px; flex: 1; }
            .title { font-size: 20px; font-weight: 800; color: #C62828; margin: 0; }
            .addr { font-size: 10.5px; color: #44403C; margin-top: 2px; }
            .badge { background: #8C5E2A !important; color: #fff !important; padding: 5px 10px; border-radius: 4px; font-size: 12px; font-weight: 800; }
            .grid { display: flex; flex-direction: column; gap: 5px; margin-bottom: 10px; font-size: 11.5px; }
            .srow { display: flex; gap: 6px; }
            .cell { display: flex; align-items: center; border: 1px solid #8C5E2A; border-radius: 3px; background: #fff !important; overflow: hidden; flex: 1; }
            .lbl { background: #659B38 !important; color: #fff !important; font-weight: 700; padding: 5px 8px; min-width: 68px; font-size: 11px; }
            .val { padding: 5px 8px; font-weight: 600; flex: 1; color: #1C1917; }
            .tbl { border: 1.5px solid #8C5E2A; border-radius: 3px; background: #fff !important; position: relative; overflow: hidden; margin-bottom: 10px; }
            .wm { position: absolute; width: 240px; height: 240px; left: 8%; top: 14px; opacity: 0.14; pointer-events: none; object-fit: contain; }
            .tbl-hdr { display: flex; background: #7A5229 !important; color: #fff !important; font-weight: 800; font-size: 12.5px; }
            .tbl-hdr div:first-child { flex: 1; padding: 6px 10px; text-align: center; }
            .tbl-hdr div:last-child { width: 150px; padding: 6px 10px; text-align: center; border-left: 1px solid #fff; }
            .tbl-body { display: flex; min-height: 175px; position: relative; z-index: 1; }
            .tbl-left { flex: 1; display: flex; flex-direction: column; justify-content: space-between; }
            .tbl-right { width: 150px; border-left: 1.5px solid #8C5E2A; display: flex; flex-direction: column; justify-content: space-between; }
            .inwords { border-top: 1px solid #8C5E2A; padding: 6px 8px; background: #FAF8F3 !important; font-size: 11px; font-weight: 700; }
            .sum-row { display: flex; border-top: 1px solid #8C5E2A; background: #FAF8F3 !important; font-size: 11px; font-weight: 700; }
            .sum-lbl { width: 56px; padding: 5px 6px; border-right: 1px solid #8C5E2A; }
            .sum-val { flex: 1; padding: 5px 6px; text-align: right; font-weight: 800; }
            .terms { font-size: 10px; line-height: 1.55; margin: 8px 0 14px; }
            .ftr { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 18px; font-size: 10.5px; font-weight: 700; }
            .sig { border-top: 1px solid #44403C; padding-top: 4px; min-width: 135px; text-align: center; }
            .dbox { display: inline-flex; border: 1px solid #8C5E2A; background: #fff !important; margin-top: 2px; }
            .dbox span { padding: 3px 8px; border-right: 1px solid #8C5E2A; }
            .dbox span:last-child { border-right: none; }
          </style>
        </head>
        <body>
          <div class="sheet">
            <div class="hdr">
              <div class="brand">
                <img src="${logoSrc}" style="width:${logoPx}px;height:${logoPx}px;object-fit:contain;" />
                <div>
                  <h1 class="title">${room?.name || 'লিলি কমিউনিটি সেন্টার'}</h1>
                  <div class="addr">${room?.address || 'সীম্যান্স হোস্টেলের বিপরীতে, দক্ষিণ মধ্য হালিশহর, ৩৮নং ওয়ার্ড, বন্দর, চট্টগ্রাম।'}</div>
                  <div class="addr">📞 ${room?.phone || '01955 66 66 22, 031-741821'} • ✉ ${room?.email || 'lilycommunitycentre@gmail.com'}</div>
                </div>
              </div>
              <div class="badge">চুক্তিপত্র</div>
            </div>
            <div class="grid">
              <div class="srow">
                <div class="cell" style="flex:1.4;"><div class="lbl">নাম</div><div class="val">${booking.customer_name || '-'}</div></div>
                <div class="cell" style="flex:1;"><div class="lbl" style="min-width:52px;">বিল নং</div><div class="val" style="color:#C62828;font-weight:800;font-size:10px;">${billNo}</div></div>
              </div>
              <div class="srow">
                <div class="cell"><div class="lbl">ঠিকানা</div><div class="val">${booking.customer_address || '-'}</div></div>
              </div>
              <div class="srow">
                <div class="cell" style="flex:1.25;"><div class="lbl">ফোন</div><div class="val">${booking.customer_phone || '-'}</div></div>
                <div class="cell" style="flex:1;"><div class="lbl" style="min-width:44px;">বার</div><div class="val">${weekday}</div></div>
              </div>
              <div class="srow">
                <div class="cell" style="flex:1.35;"><div class="lbl" style="min-width:86px;">অনুষ্ঠানের তারিখ</div><div class="val">${dualEventDate}</div></div>
                <div class="cell" style="flex:1;"><div class="lbl" style="min-width:44px;">সময়</div><div class="val">${slotLabel}</div></div>
              </div>
            </div>
            <div class="tbl">
              <img class="wm" src="${logoSrc}" />
              <div class="tbl-hdr"><div>বিবরণ</div><div>টাকা</div></div>
              <div class="tbl-body">
                <div class="tbl-left">
                  <div style="padding:10px;font-size:12px;">
                    <strong>${booking.hall_name || 'Hall'}</strong> (${booking.event_type})<br/>
                    লোক সংখ্যা - ${toBanglaDigits(booking.guest_count || 0)} জন<br/>
                    ${payment ? `মাধ্যম: ${payment.method} ${payment.reference_number ? `(${payment.reference_number})` : ''}` : ''}
                  </div>
                  <div class="inwords">কথায় : ${inWordsBn}</div>
                </div>
                <div class="tbl-right">
                  <div style="padding:10px;text-align:right;font-weight:800;font-size:13px;">${formatCurrency(totalAmt, lang)}</div>
                  <div>
                    <div class="sum-row"><div class="sum-lbl">সর্বমোট</div><div class="sum-val">${formatCurrency(totalAmt, lang)}</div></div>
                    <div class="sum-row"><div class="sum-lbl">${payment ? 'প্রাপ্ত' : 'অগ্রিম'}</div><div class="sum-val" style="color:#0E8A44;">${formatCurrency(paidAmt, lang)}</div></div>
                    <div class="sum-row"><div class="sum-lbl">বাকী</div><div class="sum-val" style="color:#C62828;">${formatCurrency(dueAmt, lang)}</div></div>
                  </div>
                </div>
              </div>
            </div>
            <div class="terms">${TERMS_BN.map((t) => `<div>▪ ${t}</div>`).join('')}</div>
            <div class="ftr">
              <div class="sig">গ্রাহকের স্বাক্ষর</div>
              <div style="text-align:center;">
                <div style="font-size:9.5px;">হল বুকিং তারিখ</div>
                <div class="dbox"><span>${toBanglaDigits(evD)}</span><span>${toBanglaDigits(evM)}</span><span>${toBanglaDigits(evY)}</span></div>
              </div>
              <div class="sig">হল কর্তৃপক্ষের স্বাক্ষর</div>
            </div>
          </div>
        </body>
      </html>
    `;
  };

  const handlePrintDirect = async () => {
    setPrinting(true);
    try {
      const html = await buildPrintHtml();
      await Print.printAsync({ html });
    } catch (e: any) {
      if (!String(e?.message || '').toLowerCase().includes('cancel')) {
        Alert.alert('Print Error', e?.message || 'Could not print');
      }
    } finally {
      setPrinting(false);
    }
  };

  const handleSharePdf = async () => {
    setPrinting(true);
    try {
      const html = await buildPrintHtml();
      const { uri } = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: `Cash Memo ${billNo}` });
      } else {
        await Print.printAsync({ html });
      }
    } catch (e: any) {
      Alert.alert('PDF Error', e?.message || 'Could not generate PDF');
    } finally {
      setPrinting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeScreen backgroundColor={colors.bg}>
        {/* Top Action Bar with iPhone Back Button */}
        <View style={[styles.topBar, { backgroundColor: colors.headerBg, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={onClose} style={styles.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="chevron-back" size={22} color={colors.text} />
            <Text style={{ color: colors.text, fontWeight: '700', fontSize: 14 }}>
              {lang === 'bn' ? 'পিছনে' : 'Back'}
            </Text>
          </TouchableOpacity>
          <Text style={[styles.topTitle, { color: colors.text }]} numberOfLines={1}>
            {lang === 'bn' ? 'চুক্তিপত্র' : 'Cash Memo'}
          </Text>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <TouchableOpacity
              onPress={handlePrintDirect}
              disabled={printing}
              style={[styles.printBtn, { backgroundColor: colors.gold }]}
            >
              {printing ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="print-outline" size={15} color="#fff" />
                  <Text style={styles.printBtnText}>{lang === 'bn' ? 'প্রিন্ট' : 'Print'}</Text>
                </>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleSharePdf}
              disabled={printing}
              style={[styles.printBtn, { backgroundColor: colors.primary }]}
            >
              <Ionicons name="share-outline" size={15} color="#fff" />
              <Text style={styles.printBtnText}>PDF</Text>
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent}>
          {/* Exact Paper Cash Memo UI (captured 1:1 for Print & PDF!) */}
          <View ref={paperRef} collapsable={false} style={styles.paper}>
            {/* Header */}
            <View style={styles.memoHeader}>
              <Image
                source={room?.logo ? { uri: room.logo } : require('../../assets/logo.png')}
                style={{
                  width: Math.round(62 * Number(room?.logo_scale || 1)),
                  height: Math.round(62 * Number(room?.logo_scale || 1)),
                }}
                resizeMode="contain"
              />
              <View style={styles.memoTitleWrap}>
                <Text style={styles.memoTitleRed}>
                  {room?.name || 'লিলি কমিউনিটি সেন্টার'}
                </Text>
                <Text style={styles.memoAddress} numberOfLines={2}>
                  {room?.address || 'সীম্যান্স হোস্টেলের বিপরীতে, দক্ষিণ মধ্য হালিশহর, ৩৮নং ওয়ার্ড, বন্দর, চট্টগ্রাম।'}
                </Text>
                <Text style={styles.memoAddress} numberOfLines={2}>
                  📞 {room?.phone || '01955 66 66 22, 031-741821'} • ✉ {room?.email || 'lilycommunitycentre@gmail.com'}
                </Text>
              </View>
              <View style={styles.chuktibadge}>
                <Text style={styles.chuktibadgeText}>চুক্তিপত্র</Text>
              </View>
            </View>

            {/* Green-labeled Info Grid matching photo */}
            <View style={styles.infoGrid}>
              <View style={styles.infoSplitRow}>
                <View style={[styles.infoCell, { flex: 1.4 }]}>
                  <View style={styles.infoLbl}><Text style={styles.infoLblText}>নাম</Text></View>
                  <Text style={styles.infoValText} numberOfLines={1}>{booking.customer_name || '-'}</Text>
                </View>
                <View style={[styles.infoCell, { flex: 1 }]}>
                  <View style={[styles.infoLbl, { width: 44 }]}><Text style={styles.infoLblText}>বিল নং</Text></View>
                  <Text style={[styles.infoValText, { color: '#C62828', fontWeight: '800', fontSize: 9.5 }]} numberOfLines={1}>{billNo}</Text>
                </View>
              </View>

              <View style={styles.infoCell}>
                <View style={styles.infoLbl}><Text style={styles.infoLblText}>ঠিকানা</Text></View>
                <Text style={styles.infoValText} numberOfLines={1}>{booking.customer_address || '-'}</Text>
              </View>

              <View style={styles.infoSplitRow}>
                <View style={[styles.infoCell, { flex: 1.25 }]}>
                  <View style={styles.infoLbl}><Text style={styles.infoLblText}>ফোন</Text></View>
                  <Text style={styles.infoValText} numberOfLines={1}>{booking.customer_phone || '-'}</Text>
                </View>
                <View style={[styles.infoCell, { flex: 1 }]}>
                  <View style={[styles.infoLbl, { width: 38 }]}><Text style={styles.infoLblText}>বার</Text></View>
                  <Text style={styles.infoValText} numberOfLines={1}>{weekday}</Text>
                </View>
              </View>

              <View style={styles.infoSplitRow}>
                <View style={[styles.infoCell, { flex: 1.35 }]}>
                  <View style={[styles.infoLbl, { width: 78 }]}><Text style={styles.infoLblText}>অনুষ্ঠানের তারিখ</Text></View>
                  <Text style={styles.infoValText} numberOfLines={2}>{dualEventDate}</Text>
                </View>
                <View style={[styles.infoCell, { flex: 1 }]}>
                  <View style={[styles.infoLbl, { width: 38 }]}><Text style={styles.infoLblText}>সময়</Text></View>
                  <Text style={styles.infoValText} numberOfLines={2}>{slotLabel}</Text>
                </View>
              </View>
            </View>

            {/* Brown/Bronze Table with BIGGER Watermark & Right-Side সর্বমোট/অগ্রিম/বাকী + কথায় */}
            <View style={styles.tableWrap}>
              <Image
                source={room?.logo ? { uri: room.logo } : require('../../assets/logo.png')}
                style={styles.watermark}
                resizeMode="contain"
              />
              <View style={styles.tableHeader}>
                <Text style={[styles.thText, { flex: 1, textAlign: 'center' }]}>বিবরণ</Text>
                <Text style={[styles.thText, { width: 132, textAlign: 'center', borderLeftWidth: 1, borderLeftColor: '#fff' }]}>
                  টাকা
                </Text>
              </View>

              <View style={styles.splitTableBody}>
                {/* Left: Description + কথায় */}
                <View style={styles.leftDescCol}>
                  <View style={{ padding: 8 }}>
                    <Text style={styles.tdTitle}>{booking.hall_name} ({booking.event_type})</Text>
                    <Text style={styles.tdSub}>লোক সংখ্যা - {toBanglaDigits(booking.guest_count || 0)} জন</Text>
                    {payment ? (
                      <Text style={styles.tdSub}>
                        মাধ্যম: {payment.method} {payment.reference_number ? `(${payment.reference_number})` : ''}
                      </Text>
                    ) : null}
                  </View>
                  <View style={styles.inWordsBar}>
                    <Text style={styles.inWordsText} numberOfLines={2}>
                      কথায় : {inWordsBn}
                    </Text>
                  </View>
                </View>

                {/* Right: Amount + সর্বমোট / অগ্রিম / বাকী */}
                <View style={styles.rightMoneyCol}>
                  <View style={styles.rightTopAmt}>
                    <Text style={styles.tdAmount}>{formatCurrency(totalAmt, lang)}</Text>
                  </View>
                  <View>
                    <RightSumRow label="সর্বমোট" amount={formatCurrency(totalAmt, lang)} />
                    <RightSumRow label={payment ? 'প্রাপ্ত' : 'অগ্রিম'} amount={formatCurrency(paidAmt, lang)} color="#0E8A44" />
                    <RightSumRow label="বাকী" amount={formatCurrency(dueAmt, lang)} color="#C62828" />
                  </View>
                </View>
              </View>
            </View>

            {/* 8 Terms */}
            <View style={styles.termsBox}>
              {TERMS_BN.map((term, i) => (
                <Text key={i} style={styles.termLine}>▪ {term}</Text>
              ))}
            </View>

            {/* Bottom Signatures & Split Date Boxes */}
            <View style={styles.sigRow}>
              <View style={styles.sigBox}>
                <Text style={styles.sigText}>গ্রাহকের স্বাক্ষর</Text>
              </View>
              <View style={styles.dateSplitWrap}>
                <Text style={styles.dateSplitLbl}>হল বুকিং তারিখ</Text>
                <View style={styles.dateSplitBoxes}>
                  <Text style={styles.dateCell}>{toBanglaDigits(evD)}</Text>
                  <Text style={styles.dateCell}>{toBanglaDigits(evM)}</Text>
                  <Text style={[styles.dateCell, { borderRightWidth: 0 }]}>{toBanglaDigits(evY)}</Text>
                </View>
              </View>
              <View style={styles.sigBox}>
                <Text style={styles.sigText}>হল কর্তৃপক্ষের স্বাক্ষর</Text>
              </View>
            </View>
          </View>
        </ScrollView>
      </SafeScreen>
    </Modal>
  );
};

const RightSumRow: React.FC<{ label: string; amount: string; color?: string }> = ({
  label,
  amount,
  color = '#1C1917',
}) => (
  <View style={styles.rSumRow}>
    <Text style={styles.rSumLbl}>{label}</Text>
    <Text style={[styles.rSumAmt, { color }]} numberOfLines={1}>{amount}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, minHeight: 40, paddingRight: 8 },
  topTitle: { fontSize: 15, fontWeight: '800', flex: 1, textAlign: 'center' },
  printBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  printBtnText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  scrollContent: { padding: 10, paddingBottom: 32 },
  paper: {
    backgroundColor: '#FAF9F5',
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#0E8A44',
    padding: 10,
  },
  memoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: '#8C5E2A',
    paddingBottom: 8,
    marginBottom: 8,
    gap: 6,
  },
  memoLogo: { width: 62, height: 62 },
  memoTitleWrap: { flex: 1 },
  memoTitleRed: { fontSize: 17, fontWeight: '800', color: '#C62828' },
  memoTitleDark: { fontSize: 13, fontWeight: '700', color: '#1C1917' },
  memoAddress: { fontSize: 9.5, color: '#44403C', marginTop: 1 },
  chuktibadge: { backgroundColor: '#8C5E2A', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },
  chuktibadgeText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
  infoGrid: { gap: 4, marginBottom: 8 },
  infoSplitRow: { flexDirection: 'row', gap: 5 },
  infoCell: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#8C5E2A',
    borderRadius: 3,
    backgroundColor: '#fff',
    overflow: 'hidden',
  },
  infoLbl: { backgroundColor: '#659B38', width: 58, paddingVertical: 5, paddingHorizontal: 6 },
  infoLblText: { color: '#FFFFFF', fontSize: 10.5, fontWeight: '700' },
  infoValText: { flex: 1, paddingHorizontal: 6, fontSize: 11, fontWeight: '600', color: '#1C1917' },
  tableWrap: {
    borderWidth: 1.5,
    borderColor: '#8C5E2A',
    borderRadius: 3,
    backgroundColor: '#fff',
    overflow: 'hidden',
    marginBottom: 8,
    position: 'relative',
  },
  watermark: { position: 'absolute', width: 240, height: 240, left: '2%', top: 10, opacity: 0.14 },
  tableHeader: { backgroundColor: '#7A5229', flexDirection: 'row' },
  thText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800', paddingVertical: 5 },
  splitTableBody: { flexDirection: 'row', minHeight: 155 },
  leftDescCol: { flex: 1, justifyContent: 'space-between' },
  tdTitle: { fontSize: 12, fontWeight: '800', color: '#1C1917' },
  tdSub: { fontSize: 10.5, color: '#44403C', marginTop: 2 },
  inWordsBar: { borderTopWidth: 1, borderTopColor: '#8C5E2A', padding: 6, backgroundColor: '#FAF8F3' },
  inWordsText: { fontSize: 10.5, fontWeight: '700', color: '#1C1917' },
  rightMoneyCol: { width: 132, borderLeftWidth: 1.5, borderLeftColor: '#8C5E2A', justifyContent: 'space-between' },
  rightTopAmt: { padding: 8, alignItems: 'flex-end' },
  tdAmount: { fontSize: 12.5, fontWeight: '800', color: '#1C1917' },
  rSumRow: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#8C5E2A', backgroundColor: '#FAF8F3' },
  rSumLbl: {
    width: 48,
    fontSize: 10,
    fontWeight: '700',
    paddingVertical: 5,
    paddingHorizontal: 4,
    borderRightWidth: 1,
    borderRightColor: '#8C5E2A',
    color: '#1C1917',
  },
  rSumAmt: { flex: 1, fontSize: 10.5, fontWeight: '800', textAlign: 'right', paddingVertical: 5, paddingHorizontal: 4 },
  termsBox: { marginBottom: 12, gap: 2 },
  termLine: { fontSize: 9.5, color: '#292524', lineHeight: 14 },
  sigRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 6, marginTop: 8 },
  sigBox: { flex: 1, borderTopWidth: 1, borderTopColor: '#44403C', paddingTop: 4, alignItems: 'center' },
  sigText: { fontSize: 9.5, fontWeight: '700', color: '#1C1917' },
  dateSplitWrap: { alignItems: 'center' },
  dateSplitLbl: { fontSize: 9, fontWeight: '700', color: '#44403C', marginBottom: 2 },
  dateSplitBoxes: { flexDirection: 'row', borderWidth: 1, borderColor: '#8C5E2A', backgroundColor: '#fff' },
  dateCell: { fontSize: 10, fontWeight: '700', paddingHorizontal: 6, paddingVertical: 2, borderRightWidth: 1, borderRightColor: '#8C5E2A' },
});
