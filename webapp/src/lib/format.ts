import { formatNumber } from "@domain/money";
import { addDays, tashkentDate, weekday } from "@domain/time";
import type { Lang } from "@domain/types";

export const som = (n: number, unit: string) => `${formatNumber(n)} ${unit}`;

const MONTHS: Record<Lang, string[]> = {
  uz: ["yan", "fev", "mar", "apr", "may", "iyun", "iyul", "avg", "sen", "okt", "noy", "dek"],
  ru: ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"],
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
};
const DAYS: Record<Lang, string[]> = {
  uz: ["Yak", "Dush", "Sesh", "Chor", "Pay", "Jum", "Shan"],
  ru: ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"],
  en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
};

export function dayMonth(date: string, lang: Lang) {
  const [, m, d] = date.split("-").map(Number);
  return `${d} ${MONTHS[lang][m - 1]}`;
}

export function weekdayShort(date: string, lang: Lang) {
  return DAYS[lang][weekday(date)];
}

/** "Bugun" / "Ertaga" / "Pay, 27 noy" */
export function friendlyDate(date: string, lang: Lang, words: { today: string; tomorrow: string }, now = new Date()) {
  const today = tashkentDate(now);
  if (date === today) return words.today;
  if (date === addDays(today, 1)) return words.tomorrow;
  return `${weekdayShort(date, lang)}, ${dayMonth(date, lang)}`;
}

/** Date + time in Tashkent: "21 noy, 14:05" */
export function dateTime(iso: string | Date, lang: Lang) {
  const d = new Date(new Date(iso).getTime() + 5 * 3600_000);
  const date = d.toISOString().slice(0, 10);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${dayMonth(date, lang)}, ${hh}:${mm}`;
}

export function timeOnly(iso: string | Date) {
  const d = new Date(new Date(iso).getTime() + 5 * 3600_000);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

export function km(n: number) {
  return n < 1 ? `${Math.round(n * 1000)} m` : `${n.toFixed(1)} km`;
}

export function phoneDisplay(p: string | null | undefined) {
  if (!p) return "";
  const m = /^\+998(\d{2})(\d{3})(\d{2})(\d{2})$/.exec(p);
  return m ? `+998 ${m[1]} ${m[2]} ${m[3]} ${m[4]}` : p;
}
