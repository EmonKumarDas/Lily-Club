import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getBengaliDate,
  formatDualDate,
  formatFullDualDateWithWeekdayFromYMD,
  formatDualMonthHeader,
  formatCurrency,
  toBanglaDigits,
  toEnglishDigits,
  formatTime12,
  isGregorianLeapYear
} from '../server/dateUtils.js';

test('Bengali digits conversion and reverse', () => {
  assert.equal(toBanglaDigits('0123456789'), '০১২৩৪৫৬৭৮৯');
  assert.equal(toBanglaDigits(2026), '২০২৬');
  assert.equal(toEnglishDigits('০১২৩৪৫৬৭৮৯'), '0123456789');
  assert.equal(toEnglishDigits('১৪৩৩'), '1433');
});

test('Gregorian Leap Year Calculation', () => {
  assert.equal(isGregorianLeapYear(2020), true);
  assert.equal(isGregorianLeapYear(2024), true);
  assert.equal(isGregorianLeapYear(2025), false);
  assert.equal(isGregorianLeapYear(2026), false);
  assert.equal(isGregorianLeapYear(1900), false);
  assert.equal(isGregorianLeapYear(2000), true);
});

test('Exact requirement example: 30 November 2026', () => {
  // 30 November 2026 at 14:00 Dhaka time (08:00 UTC)
  const date = new Date('2026-11-30T08:00:00Z');
  const formatted = formatDualDate(date);
  assert.equal(formatted, '১৫ অগ্রহায়ণ ১৪৩৩ বঙ্গাব্দ | 30 November 2026');
});

test('Pohela Boishakh (14 April) new year transition', () => {
  // 14 April 2026 at 06:00 Dhaka (00:00 UTC)
  const newYearDay = new Date('2026-04-14T00:00:00Z');
  const infoNewYear = getBengaliDate(newYearDay);
  assert.equal(infoNewYear.year, 1433);
  assert.equal(infoNewYear.monthBn, 'বৈশাখ');
  assert.equal(infoNewYear.day, 1);
  assert.equal(infoNewYear.dayBn, '১');
  assert.equal(infoNewYear.yearBn, '১৪৩৩');

  // 13 April 2026 at 18:00 Dhaka (12:00 UTC) -> Previous year last day (30 Chaitra 1432)
  const prevYearEnd = new Date('2026-04-13T12:00:00Z');
  const infoPrev = getBengaliDate(prevYearEnd);
  assert.equal(infoPrev.year, 1432);
  assert.equal(infoPrev.monthBn, 'চৈত্র');
  assert.equal(infoPrev.day, 30);
  assert.equal(infoPrev.dayBn, '৩০');
  assert.equal(infoPrev.yearBn, '১৪৩২');
});

test('Month boundaries - First 6 months have 31 days', () => {
  // Boishakh: 14 April - 14 May (31 days)
  const bEnd = new Date('2026-05-14T06:00:00Z');
  const infoBEnd = getBengaliDate(bEnd);
  assert.equal(infoBEnd.monthBn, 'বৈশাখ');
  assert.equal(infoBEnd.day, 31);

  // Joishtho starts 15 May
  const jStart = new Date('2026-05-15T06:00:00Z');
  const infoJStart = getBengaliDate(jStart);
  assert.equal(infoJStart.monthBn, 'জ্যৈষ্ঠ');
  assert.equal(infoJStart.day, 1);

  // Ashwin ends 16 October (31 days in revised calendar)
  const aEnd = new Date('2026-10-16T06:00:00Z');
  const infoAEnd = getBengaliDate(aEnd);
  assert.equal(infoAEnd.monthBn, 'আশ্বিন');
  assert.equal(infoAEnd.day, 31);

  // Kartik starts 17 October
  const kStart = new Date('2026-10-17T06:00:00Z');
  const infoKStart = getBengaliDate(kStart);
  assert.equal(infoKStart.monthBn, 'কার্তিক');
  assert.equal(infoKStart.day, 1);
});

test('Months 7 to 10 have 30 days', () => {
  // Kartik: 17 Oct - 15 Nov (30 days)
  const kEnd = new Date('2026-11-15T06:00:00Z');
  const infoKEnd = getBengaliDate(kEnd);
  assert.equal(infoKEnd.monthBn, 'কার্তিক');
  assert.equal(infoKEnd.day, 30);

  // Ogrohayon: 16 Nov (day 1) to 15 Dec (day 30)
  const oStart = new Date('2026-11-16T06:00:00Z');
  assert.equal(getBengaliDate(oStart).monthBn, 'অগ্রহায়ণ');
  assert.equal(getBengaliDate(oStart).day, 1);

  const oEnd = new Date('2026-12-15T06:00:00Z');
  assert.equal(getBengaliDate(oEnd).monthBn, 'অগ্রহায়ণ');
  assert.equal(getBengaliDate(oEnd).day, 30);
});

test('Leap year edge case: Falgun 29 in non-leap year vs Falgun 30 in leap year', () => {
  // Non-leap year 2025:
  // Falgun: 14 February to 14 March (29 days)
  const nonLeapFalgunEnd = new Date('2025-03-14T06:00:00Z');
  const infoNonLeap = getBengaliDate(nonLeapFalgunEnd);
  assert.equal(infoNonLeap.monthBn, 'ফাল্গুন');
  assert.equal(infoNonLeap.day, 29);

  // Chaitra starts 15 March
  const nonLeapChaitraStart = new Date('2025-03-15T06:00:00Z');
  const infoNonLeapCh = getBengaliDate(nonLeapChaitraStart);
  assert.equal(infoNonLeapCh.monthBn, 'চৈত্র');
  assert.equal(infoNonLeapCh.day, 1);

  // Leap year 2024:
  // 29 February 2024 is 16 Falgun
  const leapFeb29 = new Date('2024-02-29T06:00:00Z');
  const infoLeapFeb29 = getBengaliDate(leapFeb29);
  assert.equal(infoLeapFeb29.monthBn, 'ফাল্গুন');
  assert.equal(infoLeapFeb29.day, 16);

  // Falgun ends 14 March with 30 days!
  const leapFalgunEnd = new Date('2024-03-14T06:00:00Z');
  const infoLeapEnd = getBengaliDate(leapFalgunEnd);
  assert.equal(infoLeapEnd.monthBn, 'ফাল্গুন');
  assert.equal(infoLeapEnd.day, 30);

  // Chaitra starts 15 March in leap year too
  const leapChaitraStart = new Date('2024-03-15T06:00:00Z');
  const infoLeapCh = getBengaliDate(leapChaitraStart);
  assert.equal(infoLeapCh.monthBn, 'চৈত্র');
  assert.equal(infoLeapCh.day, 1);
});

test('Midnight edge case in Asia/Dhaka', () => {
  // UTC 17:59:59 on Nov 29 is 23:59:59 in Dhaka (+6) -> Nov 29 (14 Ogrohayon)
  const beforeMidnight = new Date('2026-11-29T17:59:59Z');
  const infoBefore = getBengaliDate(beforeMidnight);
  assert.equal(infoBefore.day, 14);
  assert.equal(infoBefore.dhakaParts.day, 29);
  assert.equal(infoBefore.dhakaParts.hour, 23);

  // UTC 18:00:00 on Nov 29 is 00:00:00 in Dhaka (+6) -> Nov 30 (15 Ogrohayon)
  const atMidnight = new Date('2026-11-29T18:00:00Z');
  const infoAt = getBengaliDate(atMidnight);
  assert.equal(infoAt.day, 15);
  assert.equal(infoAt.dhakaParts.day, 30);
  assert.equal(infoAt.dhakaParts.hour, 0);

  // UTC 18:00:01 on Nov 29 is 00:00:01 in Dhaka (+6) -> Nov 30 (15 Ogrohayon)
  const afterMidnight = new Date('2026-11-29T18:00:01Z');
  const infoAfter = getBengaliDate(afterMidnight);
  assert.equal(infoAfter.day, 15);
  assert.equal(infoAfter.dhakaParts.day, 30);
  assert.equal(infoAfter.dhakaParts.hour, 0);
});

test('Time formatting 12-hour', () => {
  // 14:30 Dhaka time is 08:30 UTC
  const afternoon = new Date('2026-11-30T08:30:00Z');
  assert.equal(formatTime12(afternoon, 'en'), '2:30 PM');
  assert.equal(formatTime12(afternoon, 'bn'), '২:৩০ অপরাহ্ন');

  // 09:05 Dhaka time is 03:05 UTC
  const morning = new Date('2026-11-30T03:05:00Z');
  assert.equal(formatTime12(morning, 'en'), '9:05 AM');
  assert.equal(formatTime12(morning, 'bn'), '৯:০৫ পূর্বাহ্ন');
});

test('Currency formatting in BDT', () => {
  assert.equal(formatCurrency(25000, 'en'), '৳25,000');
  assert.equal(formatCurrency(25000, 'bn'), '৳২৫,০০০');
  assert.equal(formatCurrency(1250500, 'bn'), '৳১২,৫০,৫০০');
});

test('Pohela Boishakh (14 April = ১ বৈশাখ) across multiple years (2024, 2025, 2026, 2027)', () => {
  const cases = [
    { gYear: 2024, bYear: 1431, bYearBn: '১৪৩১' },
    { gYear: 2025, bYear: 1432, bYearBn: '১৪৩২' },
    { gYear: 2026, bYear: 1433, bYearBn: '১৪৩৩' },
    { gYear: 2027, bYear: 1434, bYearBn: '১৪৩৪' },
  ];

  for (const c of cases) {
    const dt = new Date(`${c.gYear}-04-14T06:00:00Z`);
    const info = getBengaliDate(dt);
    assert.equal(info.day, 1);
    assert.equal(info.dayBn, '১');
    assert.equal(info.monthBn, 'বৈশাখ');
    assert.equal(info.year, c.bYear);
    assert.equal(info.yearBn, c.bYearBn);
  }
});

test('26 November 2026, full dual date with weekday, and dual month header', () => {
  // Under official 2019 Bangladesh Revised Calendar (Ashwin = 31 days, Kartik = 17 Oct..15 Nov, Ogrohayon starts 16 Nov):
  // 26 November 2026 = ১১ অগ্রহায়ণ ১৪৩৩, বৃহস্পতিবার / Thursday
  const full26Nov = formatFullDualDateWithWeekdayFromYMD('2026-11-26');
  assert.ok(full26Nov.includes('বৃহস্পতিবার'));
  assert.ok(full26Nov.includes('১১ অগ্রহায়ণ ১৪৩৩'));
  assert.ok(full26Nov.includes('Thursday, 26 November 2026'));

  const novHeaderEn = formatDualMonthHeader(2026, 10, 'en');
  assert.equal(novHeaderEn, 'November 2026 | কার্তিক–অগ্রহায়ণ ১৪৩৩');

  const aprHeaderBn = formatDualMonthHeader(2026, 3, 'bn');
  assert.equal(aprHeaderBn, 'এপ্রিল ২০২৬ (April 2026) | চৈত্র ১৪৩২–বৈশাখ ১৪৩৩');
});
