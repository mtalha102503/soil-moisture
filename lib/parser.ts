/**
 * Natural-language question parser for the soil moisture chatbot.
 *
 * Pure functions only - no I/O - so the same module is used by the API
 * route and by the parser test script (scripts/parser-test.ts).
 *
 * The parser never matches exact sentences. It detects the pieces of a
 * question - city, date / month / year / season, variable, and intent
 * words - in any order and with varied wording, so the same question
 * asked ten different ways ("What was the average soil moisture in
 * Multan in 2021?", "Multan me 2021 me average soil moisture kitna
 * tha?", "Tell me Multan's 2021 average moisture") gets the same answer.
 *
 * Understands, for example:
 *   "What was the soil moisture at 0-7 cm depth in Lahore on 14 May 2023 at 3 pm?"
 *   "What was the average soil moisture in Faisalabad in June 2022?"
 *   "How much rain fell in Faisalabad in 2021?"
 *   "Which year was the wettest in Multan?"
 *   "What was the average soil moisture in Lahore during the monsoon?"
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
  | "monthly_max"
  | "monthly_min"
  | "monthly_rain_total"
  | "climatology_average"
  | "yearly_average"
  | "yearly_max"
  | "yearly_min"
  | "yearly_rain_total"
  | "season_average"
  | "season_rain_total"
  | "overall_average"
  | "wettest_year"
  | "driest_year"
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
  /** Set when a month was named with no year, e.g. "in June" (all years). */
  monthOfYear: number | null;
  /** Set when only a year was given, e.g. "in 2021". */
  year: number | null;
  /** Every 4-digit year mentioned (kept for future comparisons). */
  years: number[];
  /** Set when a season was named, with its year when one was given. */
  season: { name: SeasonName; year: number | null } | null;
  variable: VariableKey;
  /** The original question, trimmed. */
  raw: string;
}

export type SeasonName = "monsoon" | "summer" | "winter" | "spring" | "autumn";

const MONTH_ABBR: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  sept: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

const MONTH_PATTERN = [...MONTH_NAMES, ...Object.keys(MONTH_ABBR)].join("|");

function monthIndex(name: string): number {
  const lower = name.toLowerCase();
  const full = MONTH_NAMES.findIndex((m) => m.toLowerCase() === lower);
  if (full >= 0) return full;
  const abbr = MONTH_ABBR[lower];
  return abbr ? abbr - 1 : -1;
}

/**
 * Light normalisation so the same question is understood however it is
 * phrased: filler words - including common Roman Urdu glue words such as
 * me/mein, ka/ki, tha, batao - are dropped, and punctuation is simplified.
 * The detectors then work on city, time, variable and intent words only,
 * in any order.
 */
const FILLER_WORDS =
  /\b(me|mein|mai|ka|ki|ke|ko|tha|thi|the|hai|hain|batao|bata|yar|bro|please|plz|zara|bhala)\b/g;

function normalize(question: string): string {
  return question
    .toLowerCase()
    .replace(/[?!,;]+/g, " ")
    .replace(FILLER_WORDS, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseSeason(q: string): { name: SeasonName; year: number | null } | null {
  const m = q.match(/\b(monsoon|summer|winter|spring|autumn|fall)\b/);
  if (!m) return null;
  const name = (m[1] === "fall" ? "autumn" : m[1]) as SeasonName;
  const ym = q.match(/\b(\d{4})\b/);
  return { name, year: ym ? +ym[1] : null };
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
  year: number | null;
  monthOfYear: number | null;
} {
  let m = q.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (m) {
    const date = makeDate(+m[1], +m[2], +m[3]);
    if (date) return { date, month: null, year: null, monthOfYear: null };
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
    if (date) return { date, month: null, year: null, monthOfYear: null };
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
    if (date) return { date, month: null, year: null, monthOfYear: null };
  }
  // "June 2022" - month and year only
  m = q.match(new RegExp(`\\b(${MONTH_PATTERN})\\s+(\\d{4})\\b`, "i"));
  if (m) {
    return {
      date: null,
      month: { year: +m[2], month: monthIndex(m[1]) + 1 },
      year: null,
      monthOfYear: null,
    };
  }
  // "in June" - a month named with no year (that month, in all years)
  m = q.match(new RegExp(`\\b(${MONTH_PATTERN})\\b`, "i"));
  if (m) {
    return { date: null, month: null, year: null, monthOfYear: monthIndex(m[1]) + 1 };
  }
  // "in 2021" - a bare year only
  m = q.match(/\b(\d{4})\b/);
  if (m) {
    return { date: null, month: null, year: +m[1], monthOfYear: null };
  }
  return { date: null, month: null, year: null, monthOfYear: null };
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
  if (/(temperature|temprature|temp)\b/.test(s)) return "temperature";
  if (/humid/.test(s)) return "humidity";
  if (/(precipitation|precip|rainfall|rain|barish|baarish)\b/.test(s))
    return "precipitation";
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
    year: number | null;
    monthOfYear: number | null;
    season: { name: SeasonName; year: number | null } | null;
    time: string | null;
    variable: VariableKey;
  }
): QuestionType {
  // "kitna / kitni" (Roman Urdu "how much") signals an amount question:
  // a total for rain, an average for everything else, over the period set.
  const kitna = /\b(kitna|kitni)\b/.test(q);
  const averageWords = /(average|mean|avg|typical)/.test(q);
  const maxWords = /(maximum|highest|max|peak)/.test(q);
  const minWords = /(minimum|lowest|min)/.test(q);

  if (
    /(dataset|question[-\s]?answer|\bpairs\b|how many (questions|rows)|how much data|data (covers|span)|which (cities|years) are)/.test(
      q
    )
  ) {
    return "dataset_info";
  }
  // Wettest / driest year comes before the city comparison, whose
  // keywords overlap ("wettest").
  if (/\byear\b/.test(q) && /(wettest|rainiest)/.test(q)) return "wettest_year";
  if (/\byear\b/.test(q) && /driest/.test(q)) return "driest_year";
  if (
    /(wetter|wettest|driest|compare|comparison|which city|which of the|versus|vs)\b/.test(
      q
    )
  ) {
    return "comparison";
  }
  if (/(irrigat|should i water|water my|water the|pani (dun|doun|dena|daina))/.test(q)) {
    return "irrigation_advice";
  }
  if (ctx.season) {
    return ctx.variable === "precipitation"
      ? "season_rain_total"
      : "season_average";
  }
  if (ctx.month) {
    if (maxWords) return "monthly_max";
    if (minWords) return "monthly_min";
    if (ctx.variable === "precipitation" && !averageWords) {
      return "monthly_rain_total";
    }
    return "monthly_average";
  }
  if (ctx.year !== null) {
    if (maxWords) return "yearly_max";
    if (minWords) return "yearly_min";
    if (ctx.variable === "precipitation" && !averageWords) {
      return "yearly_rain_total";
    }
    return "yearly_average";
  }
  if (ctx.monthOfYear !== null) return "climatology_average";
  if (
    !ctx.date &&
    /(overall|in total|all years|whole|entire|full period)/.test(q)
  ) {
    return "overall_average";
  }
  if (maxWords && ctx.date) return "daily_max";
  if (minWords && ctx.date) return "daily_min";
  if (ctx.variable === "precipitation" && ctx.date && !averageWords) {
    return "daily_rain_total";
  }
  if (ctx.date && (averageWords || kitna)) return "daily_average";
  if (ctx.time) return "point_value";
  if (ctx.date) return "daily_average";
  // No time reference at all: a bare average / "kitna" question means the
  // whole dataset period ("What is the average soil moisture in Multan?").
  if (averageWords || kitna) return "overall_average";
  return "unknown";
}

export function parseQuestion(question: string): ParsedQuestion {
  const raw = question.trim();
  const q = normalize(raw);
  const cities = findCities(q);
  const { date, month, year, monthOfYear } = parseDate(q);
  const season = parseSeason(q);
  const years = Array.from(
    new Set((q.match(/\b\d{4}\b/g) ?? []).map((s) => parseInt(s, 10)))
  );
  const time = parseTime(q);
  const variable = parseVariable(q);
  const type = parseType(q, { date, month, year, monthOfYear, season, time, variable });
  return {
    type,
    city: cities[0] ?? null,
    cities,
    date,
    time,
    month,
    monthOfYear,
    year,
    years,
    season,
    variable,
    raw,
  };
}
