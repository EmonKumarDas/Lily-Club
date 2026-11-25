/**
 * Lily Community Center - Unified Bilingual Date & Number Utility (Client)
 * Implements the official Bangladesh Revised Bengali Calendar (Bangla Academy / 2019 Revision)
 * Fixed to Asia/Dhaka timezone.
 */

export const BENGALI_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];

export const BENGALI_MONTHS = [
  { bn: 'বৈশাখ', en: 'Boishakh', days: 31 },
  { bn: 'জ্যৈষ্ঠ', en: 'Joishtho', days: 31 },
  { bn: 'আষাঢ়', en: 'Ashar', days: 31 },
  { bn: 'শ্রাবণ', en: 'Srabon', days: 31 },
  { bn: 'ভাদ্র', en: 'Bhadro', days: 31 },
  { bn: 'আশ্বিন', en: 'Ashwin', days: 31 },
  { bn: 'কার্তিক', en: 'Kartik', days: 30 },
  { bn: 'অগ্রহায়ণ', en: 'Ogrohayon', days: 30 },
  { bn: 'পৌষ', en: 'Poush', days: 30 },
  { bn: 'মাঘ', en: 'Magh', days: 30 },
  { bn: 'ফাল্গুন', en: 'Falgun', days: 29 }, // 30 in Gregorian leap year
  { bn: 'চৈত্র', en: 'Chaitra', days: 30 },
];

export const GREGORIAN_MONTHS_EN = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export const GREGORIAN_MONTHS_BN = [
  'জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন',
  'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর'
];

export const WEEKDAYS = [
  { bn: 'রবিবার', en: 'Sunday', shortBn: 'রবি', shortEn: 'Sun' },
  { bn: 'সোমবার', en: 'Monday', shortBn: 'সোম', shortEn: 'Mon' },
  { bn: 'মঙ্গলবার', en: 'Tuesday', shortBn: 'মঙ্গল', shortEn: 'Tue' },
  { bn: 'বুধবার', en: 'Wednesday', shortBn: 'বুধ', shortEn: 'Wed' },
  { bn: 'বৃহস্পতিবার', en: 'Thursday', shortBn: 'বৃহস্পতি', shortEn: 'Thu' },
  { bn: 'শুক্রবার', en: 'Friday', shortBn: 'শুক্র', shortEn: 'Fri' },
  { bn: 'শনিবার', en: 'Saturday', shortBn: 'শনি', shortEn: 'Sat' },
];

export function toBanglaDigits(input: number | string): string {
  const str = String(input);
  return str.replace(/[0-9]/g, (digit) => BENGALI_DIGITS[parseInt(digit, 10)]);
}

export function toEnglishDigits(input: string): string {
  return input.replace(/[০-৯]/g, (bDigit) => {
    const idx = BENGALI_DIGITS.indexOf(bDigit);
    return idx !== -1 ? String(idx) : bDigit;
  });
}

export function formatNumberByLanguage(input: number | string, language: 'bn' | 'en'): string {
  return language === 'bn' ? toBanglaDigits(input) : toEnglishDigits(String(input));
}

export function isGregorianLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
}

export interface DhakaZonedParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;  // 0-23
  minute: number;
  second: number;
  dayOfWeek: number; // 0 (Sun) - 6 (Sat)
}

export function getDhakaParts(inputDate: Date | string | number): DhakaZonedParts {
  const date = typeof inputDate === 'object' ? inputDate : new Date(inputDate);
  if (isNaN(date.getTime())) {
    throw new Error('Invalid date provided to getDhakaParts');
  }

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Dhaka',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    weekday: 'short',
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const getVal = (type: string) => parts.find((p) => p.type === type)?.value;

  const weekdayVal = getVal('weekday');
  const weekdayMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6
  };

  const hourRaw = parseInt(getVal('hour') || '0', 10);
  const hour = hourRaw === 24 ? 0 : hourRaw;

  return {
    year: parseInt(getVal('year') || '0', 10),
    month: parseInt(getVal('month') || '0', 10),
    day: parseInt(getVal('day') || '0', 10),
    hour,
    minute: parseInt(getVal('minute') || '0', 10),
    second: parseInt(getVal('second') || '0', 10),
    dayOfWeek: weekdayVal ? weekdayMap[weekdayVal] ?? 0 : 0,
  };
}

export interface BengaliDateInfo {
  year: number;
  monthIndex: number; // 0 (Boishakh) to 11 (Chaitra)
  monthBn: string;
  monthEn: string;
  day: number;
  dayBn: string;
  yearBn: string;
  dhakaParts: DhakaZonedParts;
}

export function getBengaliDate(inputDate: Date | string | number): BengaliDateInfo {
  const parts = getDhakaParts(inputDate);
  const { year: gYear, month: gMonth, day: gDay } = parts;

  let bYear: number;
  let startAnchorUtc: number;

  if (gMonth > 4 || (gMonth === 4 && gDay >= 14)) {
    bYear = gYear - 593;
    startAnchorUtc = Date.UTC(gYear, 3, 14); // 14 April
  } else {
    bYear = gYear - 594;
    startAnchorUtc = Date.UTC(gYear - 1, 3, 14);
  }

  const currentUtc = Date.UTC(gYear, gMonth - 1, gDay);
  const diffTime = currentUtc - startAnchorUtc;
  const dayOfYear = Math.round(diffTime / (1000 * 60 * 60 * 24)); // 0 = 1 Boishakh

  const anchorGregorianYear = new Date(startAnchorUtc).getUTCFullYear();
  const isFebLeapYear = isGregorianLeapYear(anchorGregorianYear + 1);

  const monthLengths = [31, 31, 31, 31, 31, 31, 30, 30, 30, 30, isFebLeapYear ? 30 : 29, 30];

  let monthIndex = 0;
  let dayInMonth = dayOfYear + 1;

  while (monthIndex < 12 && dayInMonth > monthLengths[monthIndex]) {
    dayInMonth -= monthLengths[monthIndex];
    monthIndex++;
  }

  if (monthIndex >= 12) monthIndex = 11;
  const monthMeta = BENGALI_MONTHS[monthIndex];

  return {
    year: bYear,
    monthIndex,
    monthBn: monthMeta.bn,
    monthEn: monthMeta.en,
    day: dayInMonth,
    dayBn: toBanglaDigits(dayInMonth),
    yearBn: toBanglaDigits(bYear),
    dhakaParts: parts,
  };
}

export function formatTime12(inputDate: Date | string | number, language: 'bn' | 'en' = 'en'): string {
  const parts = getDhakaParts(inputDate);
  const hour24 = parts.hour;
  const isPM = hour24 >= 12;
  let hour12 = hour24 % 12;
  if (hour12 === 0) hour12 = 12;

  const minStr = parts.minute < 10 ? `0${parts.minute}` : `${parts.minute}`;

  if (language === 'bn') {
    const period = isPM ? 'অপরাহ্ন' : 'পূর্বাহ্ন';
    return `${toBanglaDigits(hour12)}:${toBanglaDigits(minStr)} ${period}`;
  }

  const period = isPM ? 'PM' : 'AM';
  return `${hour12}:${minStr} ${period}`;
}

/**
 * Formats dual date string:
 * "১৫ অগ্রহায়ণ ১৪৩৩ বঙ্গাব্দ | 30 November 2026"
 */
export function formatDualDate(
  inputDate: Date | string | number,
  options: { includeTime?: boolean; separator?: string } = {}
): string {
  const bInfo = getBengaliDate(inputDate);
  const parts = bInfo.dhakaParts;
  const separator = options.separator ?? ' | ';

  const bnDateStr = `${bInfo.dayBn} ${bInfo.monthBn} ${bInfo.yearBn} বঙ্গাব্দ`;
  const enMonthStr = GREGORIAN_MONTHS_EN[parts.month - 1];
  const enDateStr = `${parts.day} ${enMonthStr} ${parts.year}`;

  if (options.includeTime) {
    const bnTime = formatTime12(inputDate, 'bn');
    const enTime = formatTime12(inputDate, 'en');
    return `${bnDateStr}, ${bnTime}${separator}${enDateStr}, ${enTime}`;
  }

  return `${bnDateStr}${separator}${enDateStr}`;
}

export function formatCurrency(amount: number, language: 'bn' | 'en' = 'en'): string {
  const formattedEn = new Intl.NumberFormat('en-IN', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  }).format(amount);

  if (language === 'bn') {
    return `৳${toBanglaDigits(formattedEn)}`;
  }
  return `৳${formattedEn}`;
}

/**
 * Formats a YYYY-MM-DD event date string safely without timezone shift!
 * Parses YYYY-MM-DD as 12:00:00 PM in Asia/Dhaka (+06:00).
 */
export function parseEventDateToDhakaDate(ymd: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
    const d = new Date(ymd);
    if (!isNaN(d.getTime())) return d;
    throw new Error(`Invalid YYYY-MM-DD date string: ${ymd}`);
  }
  return new Date(`${ymd}T12:00:00+06:00`);
}

export function formatDualDateFromYMD(ymd: string, separator = ' | '): string {
  if (!ymd) return '';
  const d = parseEventDateToDhakaDate(ymd);
  return formatDualDate(d, { separator });
}

export function getNextDayYMD(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + 1));
  const ny = dt.getUTCFullYear();
  const nm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const nd = String(dt.getUTCDate()).padStart(2, '0');
  return `${ny}-${nm}-${nd}`;
}

export function getTodayDhakaYMD(): string {
  const parts = getDhakaParts(new Date());
  const m = String(parts.month).padStart(2, '0');
  const d = String(parts.day).padStart(2, '0');
  return `${parts.year}-${m}-${d}`;
}

export function formatTimeString12(hhmm: string, language: 'bn' | 'en' = 'en'): string {
  const [hStr, mStr] = (hhmm || '00:00').split(':');
  const hour24 = parseInt(hStr || '0', 10);
  const min = parseInt(mStr || '0', 10);
  const isPM = hour24 >= 12 && hour24 < 24;
  let hour12 = hour24 % 12;
  if (hour12 === 0) hour12 = 12;
  const minPadded = min < 10 ? `0${min}` : `${min}`;
  if (language === 'bn') {
    const period = isPM ? 'অপরাহ্ন' : 'পূর্বাহ্ন';
    return `${toBanglaDigits(hour12)}:${toBanglaDigits(minPadded)} ${period}`;
  }
  const period = isPM ? 'PM' : 'AM';
  return `${hour12}:${minPadded} ${period}`;
}

export function timeToMinutes(hhmm: string): number {
  const [h, m] = (hhmm || '00:00').split(':').map((x) => parseInt(x, 10) || 0);
  return h * 60 + m;
}

export function isNightCrossingMidnight(startTime: string, endTime: string): boolean {
  const s = timeToMinutes(startTime);
  const e = timeToMinutes(endTime);
  // e.g. start 18:00 (1080), end 01:00 (60). Notice 00:00 is midnight. If e > 0 and e <= s, it crosses midnight into next day!
  return e > 0 && e <= s;
}

