/**
 * Natural-language question parser for the soil moisture chatbot.
 *
 * Pure functions only - no I/O - so the same module is used by the API
 * route and by the parser test script (scripts/parser-test.ts).
 *
 * Understands, for example:
 *   "What was the soil moisture at 0-7 cm depth in Lahore on 14 May 2023 at 3 pm?"
 *   "What was the average soil moisture in Faisalabad in June 2022?"
 *   "How much rain fell in Faisalabad on 18 July 2022?"
 *   "Which city was wetter on 14 May 2023, Lahore or Multan?"
 *   "Should I irrigate in Multan on 1 January 2020?"
 */

import { LOCATIONS, MONTH_NAMES, type CityName, type VariableKey } from "./data";

export type QuestionType =
  | "point_value"
  | "daily_average"
  | "daily_max"
  | "daily_min"
  | "daily_rain_total"
  | "monthly_average"
  | "comparison"
  | "irrigation_advice"
  | "dataset_info"
  | "unknown";

export interface ParsedQuestion {
  type: QuestionType;
  /** First city mentioned, or null. */
  city: CityName | null;
  /** All cities mentioned (used by comparisons). */
  cities: CityName[];
  /** Full date as "YYYY-MM-DD", or null. */
  date: string | null;
  /** Time of day "HH:MM" (24h, UTC), or null. */
  time: string | null;
  /** Set when only a month + year were given. */
  month: { year: number; month: number } | null;
  variable: VariableKey;
  /** The original question, trimmed. */
  raw: string;
}

const MONTH_PATTERN = MONTH_NAMES.join("|");

function monthIndex(name: string): number {
  return MONTH_NAMES.findIndex(
    (m) => m.toLowerCase() === name.toLowerCase()
  );
}

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

function makeDate(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(Date.UTC(year, month - 1, day));
  if (
    d.getUTCFullYear() !== year ||
    d.getUTCMonth() !== month - 1 ||
    d.getUTCDate() !== day
  ) {
    return null;
  }
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function findCities(q: string): CityName[] {
  const found: CityName[] = [];
  for (const loc of LOCATIONS) {
    if (q.includes(loc.name.toLowerCase())) {
      found.push(loc.name as CityName);
    }
  }
  return found;
}

function parseDate(q: string): {
  date: string | null;
  month: { year: number; month: number } | null;
} {
  let m = q.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (m) {
    const date = makeDate(+m[1], +m[2], +m[3]);
    if (date) return { date, month: null };
  }
  // "14 May 2023", "1 January 2020", "14th May 2023"
  m = q.match(
    new RegExp(
      `\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTH_PATTERN})\\s+(\\d{4})\\b`,
      "i"
    )
  );
  if (m) {
    const date = makeDate(+m[3], monthIndex(m[2]) + 1, +m[1]);
    if (date) return { date, month: null };
  }
  // "May 14, 2023", "January 1 2020"
  m = q.match(
    new RegExp(
      `\\b(${MONTH_PATTERN})\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})\\b`,
      "i"
    )
  );
  if (m) {
    const date = makeDate(+m[3], monthIndex(m[1]) + 1, +m[2]);
    if (date) return { date, month: null };
  }
  // "June 2022" - month and year only
  m = q.match(new RegExp(`\\b(${MONTH_PATTERN})\\s+(\\d{4})\\b`, "i"));
  if (m) {
    return { date: null, month: { year: +m[2], month: monthIndex(m[1]) + 1 } };
  }
  return { date: null, month: null };
}

function parseTime(q: string): string | null {
  let m = q.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
  if (m) {
    let hour = parseInt(m[1], 10) % 12;
    if (m[3].toLowerCase() === "pm") hour += 12;
    return `${pad2(hour)}:${m[2] ?? "00"}`;
  }
  m = q.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (m) {
    return `${pad2(parseInt(m[1], 10))}:${m[2]}`;
  }
  if (/\bnoon\b/i.test(q)) return "12:00";
  if (/\bmidnight\b/i.test(q)) return "00:00";
  return null;
}

function parseVariable(q: string): VariableKey {
  const s = q.replace(/[–—]/g, "-");
  if (/\btemperature\b/.test(s)) return "temperature";
  if (/\bhumidity\b/.test(s)) return "humidity";
  if (/\b(precipitation|rainfall|rain)\b/.test(s)) return "precipitation";
  if (/100\s*-\s*255/.test(s)) return "sm_100_255";
  if (/28\s*-\s*100/.test(s)) return "sm_28_100";
  if (/7\s*-\s*28/.test(s)) return "sm_7_28";
  if (/0\s*-\s*7/.test(s)) return "sm_0_7";
  // Default: surface soil moisture.
  return "sm_0_7";
}

function parseType(
  q: string,
  ctx: {
    date: string | null;
    month: { year: number; month: number } | null;
    time: string | null;
    variable: VariableKey;
  }
): QuestionType {
  if (
    /(dataset|question[-\s]?answer|\bpairs\b|how many (questions|rows)|how much data)/.test(
      q
    )
  ) {
    return "dataset_info";
  }
  if (/(wetter|wettest|compare|comparison|which city|which of the)/.test(q)) {
    return "comparison";
  }
  if (/(irrigat|should i water|water my|water the)/.test(q)) {
    return "irrigation_advice";
  }
  if (ctx.month) return "monthly_average";
  if (/(maximum|highest|max)\b/.test(q)) return "daily_max";
  if (/(minimum|lowest|min)\b/.test(q)) return "daily_min";
  if (ctx.variable === "precipitation" && !/(average|mean)/.test(q)) {
    return "daily_rain_total";
  }
  if (/(average|mean)/.test(q)) return "daily_average";
  if (ctx.time) return "point_value";
  if (ctx.date) return "daily_average";
  return "unknown";
}

export function parseQuestion(question: string): ParsedQuestion {
  const raw = question.trim();
  const q = raw.toLowerCase();
  const cities = findCities(q);
  const { date, month } = parseDate(q);
  const time = parseTime(q);
  const variable = parseVariable(q);
  const type = parseType(q, { date, month, time, variable });
  return {
    type,
    city: cities[0] ?? null,
    cities,
    date,
    time,
    month,
    variable,
    raw,
  };
}
