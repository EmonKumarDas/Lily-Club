const BN_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];

export function toBanglaDigits(input: string | number): string {
  return String(input).replace(/\d/g, (d) => BN_DIGITS[Number(d)]);
}

const BN_MONTHS = [
  'বৈশাখ', 'জ্যৈষ্ঠ', 'আষাঢ়', 'শ্রাবণ', 'ভাদ্র', 'আশ্বিন',
  'কার্তিক', 'অগ্রহায়ণ', 'পৌষ', 'মাঘ', 'ফাল্গুন', 'চৈত্র',
];

export const EN_MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export const EN_MONTHS_BN = [
  'জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন',
  'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর',
];

const WEEKDAYS_BN = ['রবিবার', 'সোমবার', 'মঙ্গলবার', 'বুধবার', 'বৃহস্পতিবার', 'শুক্রবার', 'শনিবার'];
const WEEKDAYS_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function isGregorianLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

export function getBengaliDateFromYMD(ymd: string): { day: number; monthName: string; year: number } {
  const [y, m, d] = ymd.split('-').map(Number);
  const currentUtc = Date.UTC(y, m - 1, d);
  const pohelaSame = Date.UTC(y, 3, 14);
  const bnYear = currentUtc >= pohelaSame ? y - 593 : y - 594;
  const startGregYear = currentUtc >= pohelaSame ? y : y - 1;
  const startUtc = Date.UTC(startGregYear, 3, 14);
  const diffDays = Math.floor((currentUtc - startUtc) / 86400000);
  const falgunDays = isGregorianLeapYear(startGregYear + 1) ? 30 : 29;
  const monthLens = [31, 31, 31, 31, 31, 31, 30, 30, 30, 30, falgunDays, 30];

  let rem = diffDays;
  let monthIdx = 0;
  for (let i = 0; i < 12; i++) {
    if (rem < monthLens[i]) {
      monthIdx = i;
      break;
    }
    rem -= monthLens[i];
  }
  return { day: rem + 1, monthName: BN_MONTHS[monthIdx], year: bnYear };
}

export function formatDualDateFromYMD(ymd: string, lang: 'bn' | 'en' = 'bn'): string {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return ymd || '';
  const [y, m, d] = ymd.split('-').map(Number);
  const bn = getBengaliDateFromYMD(ymd);
  const bnStr = `${toBanglaDigits(bn.day)} ${bn.monthName} ${toBanglaDigits(bn.year)}`;
  if (lang === 'bn') {
    const gregBn = `${toBanglaDigits(d)} ${EN_MONTHS_BN[m - 1]} ${toBanglaDigits(y)}`;
    return `${bnStr} (${gregBn})`;
  }
  const gregEn = `${d} ${EN_MONTHS[m - 1]} ${y}`;
  return `${bnStr} • ${gregEn}`;
}

export function getWeekdayFromYMD(ymd: string, lang: 'bn' | 'en' = 'bn'): string {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return '';
  const [y, m, d] = ymd.split('-').map(Number);
  const idx = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return lang === 'bn' ? WEEKDAYS_BN[idx] : WEEKDAYS_EN[idx];
}

export function formatTime12(hhmm: string, lang: 'bn' | 'en' = 'bn'): string {
  if (!hhmm || !hhmm.includes(':')) return hhmm || '';
  const [hStr, mStr] = hhmm.split(':');
  let h = Number(hStr);
  const m = Number(mStr);
  const period = h >= 12 ? (lang === 'bn' ? 'PM' : 'PM') : 'AM';
  h = h % 12 || 12;
  const raw = `${h}:${String(m).padStart(2, '0')} ${period}`;
  return lang === 'bn' ? toBanglaDigits(raw) : raw;
}

export function formatCurrency(amount: number, lang: 'bn' | 'en' = 'bn'): string {
  const num = Math.round(Number(amount || 0));
  const formatted = num.toLocaleString('en-IN');
  return lang === 'bn' ? `৳${toBanglaDigits(formatted)}` : `৳${formatted}`;
}

const BN_ONES = [
  '', 'এক', 'দুই', 'তিন', 'চার', 'পাঁচ', 'ছয়', 'সাত', 'আট', 'নয়',
  'দশ', 'এগারো', 'বারো', 'তেরো', 'চৌদ্দ', 'পনেরো', 'ষোল', 'সতেরো', 'আঠারো', 'উনিশ',
  'বিশ', 'একুশ', 'বাইশ', 'তেইশ', 'চব্বিশ', 'পঁচিশ', 'ছাব্বিশ', 'সাতাশ', 'আটাশ', 'ঊনত্রিশ',
  'ত্রিশ', 'একত্রিশ', 'বত্রিশ', 'তেত্রিশ', 'চৌত্রিশ', 'পঁয়ত্রিশ', 'ছত্রিশ', 'সাঁইত্রিশ', 'আটত্রিশ', 'ঊনচল্লিশ',
  'চল্লিশ', 'একচল্লিশ', 'বিয়াল্লিশ', 'তেতাল্লিশ', 'চুয়াল্লিশ', 'পঁয়তাল্লিশ', 'ছেচল্লিশ', 'সাতচল্লিশ', 'আটচল্লিশ', 'ঊনপঞ্চাশ',
  'পঞ্চাশ', 'একান্ন', 'বাহান্ন', 'তিপ্পান্ন', 'চুয়ান্ন', 'পঞ্চান্ন', 'ছাপ্পান্ন', 'সাতান্ন', 'আটান্ন', 'ঊনষাট',
  'ষাট', 'একষট্টি', 'বাষট্টি', 'তেষট্টি', 'চৌষট্টি', 'পঁয়ষট্টি', 'ছেষট্টি', 'সাতষট্টি', 'আটষট্টি', 'ঊনসত্তর',
  'সত্তর', 'একাত্তর', 'বাহাত্তর', 'তিয়াত্তর', 'চুয়াত্তর', 'পঁচাত্তর', 'ছিয়াত্তর', 'সাতাত্তর', 'আটাত্তর', 'ঊনআশি',
  'আশি', 'একাশি', 'বিরাশি', 'তিরাশি', 'চুরাশি', 'পঁচাশি', 'ছিয়াশি', 'সাতাশি', 'আটাশি', 'ঊননব্বই',
  'নব্বই', 'একানব্বই', 'বিরানব্বই', 'তিরানব্বই', 'চুরানব্বই', 'পঁচানব্বই', 'ছিয়ানব্বই', 'সাতানব্বই', 'আটানব্বই', 'নিরানব্বই',
];

export function numberToBanglaWords(amount: number): string {
  const n = Math.max(0, Math.round(Number(amount || 0)));
  if (n === 0) return 'শূন্য টাকা মাত্র';
  const parts: string[] = [];
  let rem = n;
  const crore = Math.floor(rem / 10000000);
  rem %= 10000000;
  const lakh = Math.floor(rem / 100000);
  rem %= 100000;
  const thousand = Math.floor(rem / 1000);
  rem %= 1000;
  const hundred = Math.floor(rem / 100);
  rem %= 100;

  if (crore > 0) parts.push(`${BN_ONES[crore] || toBanglaDigits(crore)} কোটি`);
  if (lakh > 0) parts.push(`${BN_ONES[lakh] || toBanglaDigits(lakh)} লক্ষ`);
  if (thousand > 0) parts.push(`${BN_ONES[thousand] || toBanglaDigits(thousand)} হাজার`);
  if (hundred > 0) parts.push(`${BN_ONES[hundred]} শত`);
  if (rem > 0) parts.push(BN_ONES[rem] || toBanglaDigits(rem));

  return `${parts.join(' ')} টাকা মাত্র`;
}
