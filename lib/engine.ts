/**
 * Answer engine: turns a ParsedQuestion into a targeted Supabase query
 * against public.soil_moisture_cleaned and formats the result as a
 * natural sentence in the same style as the generated Q&A pairs.
 *
 * Every query is narrow - a single point in time, one day (24 rows),
 * one month (<= 744 rows) or, for year, season and overall questions,
 * one location's rows for that period, fetched in pages of 1,000.
 * The full table is never fetched.
 *
 * Questions are understood by intent (city + period + variable +
 * aggregation), not by exact wording, so rephrased questions such as
 * "Multan 2021 average soil moisture kitna tha?" work as well.
 */

import {
  DATA_END,
  LOCATIONS,
  VARIABLES,
  formatDate,
  formatMonth,
  locationByName,
  type LocationInfo,
  type VariableInfo,
} from "./data";
import type { ParsedQuestion } from "./parser";
import { getSupabase } from "./supabase";

export const HELP_ANSWER = [
  "I answer questions about hourly soil moisture, temperature, humidity and rainfall",
  "for Faisalabad, Multan and Lahore from 1 January 2020 to 31 December 2024 (times in UTC).",
  "Try asking, for example:",
  '"What was the soil moisture at 0-7 cm depth in Lahore on 14 May 2023 at 3 pm?"',
  '"What was the average soil moisture in Faisalabad on 10 June 2022?"',
  '"How much rain fell in Faisalabad on 18 July 2022?"',
  '"What was the average soil moisture in Faisalabad in June 2022?"',
  '"What was the average soil moisture in Multan in 2021?"',
  '"How much rain fell in Lahore in the monsoon of 2022?"',
  '"What is the overall average soil moisture in Lahore?"',
  '"Which year was the wettest in Multan?"',
  '"Which city was wetter on 14 May 2023, Lahore or Multan?"',
  '"Should I irrigate in Multan on 1 January 2020?"',
  '"How many question-answer pairs are in the dataset?"',
].join(" ");

type Row = Record<string, number | string | null>;

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

function fmt(value: number, variable: VariableInfo): string {
  return value.toFixed(variable.decimals);
}

function dayBounds(isoDate: string): { start: string; end: string } {
  const [y, m, d] = isoDate.split("-").map((s) => parseInt(s, 10));
  const start = new Date(Date.UTC(y, m - 1, d)).toISOString();
  const end = new Date(Date.UTC(y, m - 1, d + 1)).toISOString();
  return { start, end };
}

function monthBounds(year: number, month: number): { start: string; end: string } {
  const start = new Date(Date.UTC(year, month - 1, 1)).toISOString();
  const end = new Date(Date.UTC(year, month, 1)).toISOString();
  return { start, end };
}

function yearBounds(year: number): { start: string; end: string } {
  const start = new Date(Date.UTC(year, 0, 1)).toISOString();
  const end = new Date(Date.UTC(year + 1, 0, 1)).toISOString();
  return { start, end };
}

/**
 * Season definitions used by this chatbot (northern-hemisphere, Pakistan):
 * monsoon June-September, summer May-July, winter December-February,
 * spring March-April, autumn October-November.
 */
function seasonBounds(
  season: string,
  year: number
): { start: string; end: string } {
  const y = year;
  switch (season) {
    case "monsoon":
      return {
        start: new Date(Date.UTC(y, 5, 1)).toISOString(),
        end: new Date(Date.UTC(y, 9, 1)).toISOString(),
      };
    case "summer":
      return {
        start: new Date(Date.UTC(y, 4, 1)).toISOString(),
        end: new Date(Date.UTC(y, 7, 1)).toISOString(),
      };
    case "winter":
      return {
        start: new Date(Date.UTC(y, 11, 1)).toISOString(),
        end: new Date(Date.UTC(y + 1, 2, 1)).toISOString(),
      };
    case "spring":
      return {
        start: new Date(Date.UTC(y, 2, 1)).toISOString(),
        end: new Date(Date.UTC(y, 4, 1)).toISOString(),
      };
    default: // autumn
      return {
        start: new Date(Date.UTC(y, 9, 1)).toISOString(),
        end: new Date(Date.UTC(y, 11, 1)).toISOString(),
      };
  }
}

async function fetchRows(
  loc: LocationInfo,
  startIso: string,
  endIso: string,
  column: string
): Promise<Row[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("soil_moisture_cleaned")
    .select(`recorded_at, ${column}`)
    .eq("latitude", loc.latitude)
    .eq("longitude", loc.longitude)
    .gte("recorded_at", startIso)
    .lt("recorded_at", endIso)
    .order("recorded_at", { ascending: true })
    .limit(1000);
  if (error) throw new Error(`Database error: ${error.message}`);
  return (data ?? []) as unknown as Row[];
}

/** Fetch every row in a period for one location, in pages of 1,000. */
async function fetchAllRows(
  loc: LocationInfo,
  startIso: string,
  endIso: string,
  column: string
): Promise<Row[]> {
  const supabase = getSupabase();
  const pageSize = 1000;
  const all: Row[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase
      .from("soil_moisture_cleaned")
      .select(`recorded_at, ${column}`)
      .eq("latitude", loc.latitude)
      .eq("longitude", loc.longitude)
      .gte("recorded_at", startIso)
      .lt("recorded_at", endIso)
      .order("recorded_at", { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (error) throw new Error(`Database error: ${error.message}`);
    const page = (data ?? []) as unknown as Row[];
    all.push(...page);
    if (page.length < pageSize) break;
  }
  return all;
}

function values(rows: Row[], column: string): number[] {
  const out: number[] = [];
  for (const r of rows) {
    const v = r[column];
    if (typeof v === "number") out.push(v);
  }
  return out;
}

function average(nums: number[]): number {
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function noData(where: string): string {
  return (
    `I found no data for ${where}. The dataset covers Faisalabad, Multan and Lahore ` +
    `from 1 January 2020 to 31 December 2024, hourly, in UTC.`
  );
}

function needCity(): string {
  return (
    "Please name a city - I have data for Faisalabad, Multan and Lahore. " +
    'For example: "What was the soil moisture at 0-7 cm depth in Lahore on 14 May 2023 at 3 pm?"'
  );
}

function needDate(): string {
  return (
    "Please include a date, for example 14 May 2023. " +
    "The dataset covers 1 January 2020 to 31 December 2024."
  );
}

async function pointAnswer(p: ParsedQuestion, loc: LocationInfo): Promise<string> {
  const variable = VARIABLES[p.variable];
  const at = `${p.date}T${p.time}:00.000Z`;
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("soil_moisture_cleaned")
    .select(`recorded_at, ${variable.column}`)
    .eq("latitude", loc.latitude)
    .eq("longitude", loc.longitude)
    .eq("recorded_at", at)
    .maybeSingle();
  if (error) throw new Error(`Database error: ${error.message}`);
  const value = data ? (data as unknown as Row)[variable.column] : null;
  if (typeof value !== "number") {
    return noData(
      `${loc.name} on ${p.date ? formatDate(p.date) : ""} at ${p.time} UTC`
    );
  }
  return (
    `The ${variable.label} in ${loc.name} on ${formatDate(p.date!)} ` +
    `at ${p.time} UTC was ${fmt(value, variable)} ${variable.unit}.`
  );
}

async function dayAnswer(p: ParsedQuestion, loc: LocationInfo): Promise<string> {
  const variable = VARIABLES[p.variable];
  const { start, end } = dayBounds(p.date!);
  const rows = await fetchRows(loc, start, end, variable.column);
  const vals = values(rows, variable.column);
  if (vals.length === 0) return noData(`${loc.name} on ${formatDate(p.date!)}`);
  const dateStr = formatDate(p.date!);
  switch (p.type) {
    case "daily_average":
      return `The average ${variable.label} in ${loc.name} on ${dateStr} was ${fmt(average(vals), variable)} ${variable.unit}.`;
    case "daily_max":
      return `The maximum ${variable.label} in ${loc.name} on ${dateStr} was ${fmt(Math.max(...vals), variable)} ${variable.unit}.`;
    case "daily_min":
      return `The minimum ${variable.label} in ${loc.name} on ${dateStr} was ${fmt(Math.min(...vals), variable)} ${variable.unit}.`;
    case "daily_rain_total": {
      const total = vals.reduce((a, b) => a + b, 0);
      return `The total precipitation in ${loc.name} on ${dateStr} was ${fmt(total, variable)} ${variable.unit}.`;
    }
    default:
      return `The average ${variable.label} in ${loc.name} on ${dateStr} was ${fmt(average(vals), variable)} ${variable.unit}.`;
  }
}

async function monthlyAnswer(p: ParsedQuestion, loc: LocationInfo): Promise<string> {
  const variable = VARIABLES[p.variable];
  const { year, month } = p.month!;
  const { start, end } = monthBounds(year, month);
  const rows = await fetchRows(loc, start, end, variable.column);
  const vals = values(rows, variable.column);
  if (vals.length === 0) return noData(`${loc.name} in ${formatMonth(year, month)}`);
  const monthStr = formatMonth(year, month);
  switch (p.type) {
    case "monthly_max":
      return `The maximum ${variable.label} in ${loc.name} in ${monthStr} was ${fmt(Math.max(...vals), variable)} ${variable.unit}.`;
    case "monthly_min":
      return `The minimum ${variable.label} in ${loc.name} in ${monthStr} was ${fmt(Math.min(...vals), variable)} ${variable.unit}.`;
    case "monthly_rain_total": {
      const total = vals.reduce((a, b) => a + b, 0);
      return `The total precipitation in ${loc.name} in ${monthStr} was ${fmt(total, variable)} ${variable.unit}.`;
    }
    default:
      return (
        `The average ${variable.label} in ${loc.name} in ${monthStr} ` +
        `was ${fmt(average(vals), variable)} ${variable.unit}.`
      );
  }
}

async function yearlyAnswer(p: ParsedQuestion, loc: LocationInfo): Promise<string> {
  const variable = VARIABLES[p.variable];
  const year = p.year!;
  const { start, end } = yearBounds(year);
  const rows = await fetchAllRows(loc, start, end, variable.column);
  const vals = values(rows, variable.column);
  if (vals.length === 0) return noData(`${loc.name} in ${year}`);
  switch (p.type) {
    case "yearly_max":
      return `The maximum ${variable.label} in ${loc.name} in ${year} was ${fmt(Math.max(...vals), variable)} ${variable.unit}.`;
    case "yearly_min":
      return `The minimum ${variable.label} in ${loc.name} in ${year} was ${fmt(Math.min(...vals), variable)} ${variable.unit}.`;
    case "yearly_rain_total": {
      const total = vals.reduce((a, b) => a + b, 0);
      return `The total precipitation in ${loc.name} in ${year} was ${fmt(total, variable)} ${variable.unit}.`;
    }
    default:
      return `The average ${variable.label} in ${loc.name} in ${year} was ${fmt(average(vals), variable)} ${variable.unit}.`;
  }
}

async function seasonAnswer(p: ParsedQuestion, loc: LocationInfo): Promise<string> {
  const variable = VARIABLES[p.variable];
  const season = p.season!;
  const years =
    season.year !== null
      ? [season.year]
      : [2020, 2021, 2022, 2023, 2024];
  const vals: number[] = [];
  for (const y of years) {
    const { start, end } = seasonBounds(season.name, y);
    const rows = await fetchAllRows(loc, start, end, variable.column);
    vals.push(...values(rows, variable.column));
  }
  const label =
    season.year !== null
      ? `the ${season.name} of ${season.year}`
      : `the ${season.name} season (2020-2024)`;
  if (vals.length === 0) return noData(`${loc.name} in ${label}`);
  if (p.type === "season_rain_total") {
    const total = vals.reduce((a, b) => a + b, 0);
    return `The total precipitation in ${loc.name} in ${label} was ${fmt(total, variable)} ${variable.unit}.`;
  }
  return `The average ${variable.label} in ${loc.name} in ${label} was ${fmt(average(vals), variable)} ${variable.unit}.`;
}

async function overallAnswer(p: ParsedQuestion, loc: LocationInfo): Promise<string> {
  const variable = VARIABLES[p.variable];
  const from = yearBounds(2020).start; // 2020-01-01
  const to = yearBounds(2025).start; // 2025-01-01, exclusive end
  const rows = await fetchAllRows(loc, from, to, variable.column);
  const vals = values(rows, variable.column);
  if (vals.length === 0) return noData(`${loc.name} overall`);
  if (p.variable === "precipitation") {
    const total = vals.reduce((a, b) => a + b, 0);
    return `The total precipitation in ${loc.name} across the whole dataset (2020-2024) was ${fmt(total, variable)} ${variable.unit}.`;
  }
  return `The overall average ${variable.label} in ${loc.name} across the whole dataset (2020-2024) was ${fmt(average(vals), variable)} ${variable.unit}.`;
}

async function yearExtremeAnswer(p: ParsedQuestion, loc: LocationInfo): Promise<string> {
  const variable = VARIABLES[p.variable];
  const perYear: { year: number; avg: number }[] = [];
  for (const y of [2020, 2021, 2022, 2023, 2024]) {
    const { start, end } = yearBounds(y);
    const rows = await fetchAllRows(loc, start, end, variable.column);
    const vals = values(rows, variable.column);
    if (vals.length > 0) perYear.push({ year: y, avg: average(vals) });
  }
  if (perYear.length === 0) return noData(`${loc.name}`);
  const wantMax = p.type === "wettest_year";
  perYear.sort((a, b) => (wantMax ? b.avg - a.avg : a.avg - b.avg));
  const best = perYear[0];
  const word = wantMax ? "wettest" : "driest";
  return (
    `${best.year} was the ${word} year in ${loc.name}, with an average ` +
    `${variable.label} of ${fmt(best.avg, variable)} ${variable.unit}.`
  );
}

async function comparisonAnswer(p: ParsedQuestion): Promise<string> {
  if (!p.date) return needDate();
  const variable = VARIABLES[p.variable];
  const names =
    p.cities.length >= 2 ? p.cities : LOCATIONS.map((l) => l.name);
  const results: { loc: LocationInfo; avg: number }[] = [];
  for (const name of names) {
    const loc = locationByName(name)!;
    const { start, end } = dayBounds(p.date);
    const rows = await fetchRows(loc, start, end, variable.column);
    const vals = values(rows, variable.column);
    if (vals.length > 0) results.push({ loc, avg: average(vals) });
  }
  if (results.length < 2) return noData(`a comparison on ${formatDate(p.date)}`);
  results.sort((a, b) => b.avg - a.avg);
  const dateStr = formatDate(p.date);
  const [first, second] = results;
  if (results.length === 2) {
    return (
      `${first.loc.name} was wetter than ${second.loc.name} on ${dateStr}. ` +
      `The average ${variable.label} was ${fmt(first.avg, variable)} ${variable.unit} in ${first.loc.name} ` +
      `compared with ${fmt(second.avg, variable)} ${variable.unit} in ${second.loc.name}.`
    );
  }
  const detail = results
    .map((r) => `${r.loc.name} ${fmt(r.avg, variable)}`)
    .join(", ");
  return (
    `${first.loc.name} was the wettest of ${results.map((r) => r.loc.name).join(", ")} on ${dateStr}, ` +
    `with an average ${variable.label} of ${fmt(first.avg, variable)} ${variable.unit} (${detail}).`
  );
}

async function irrigationAnswer(p: ParsedQuestion, loc: LocationInfo): Promise<string> {
  const surface = VARIABLES.sm_0_7;
  const date = p.date ?? DATA_END;
  const defaulted = p.date === null;
  let value: number | null = null;
  if (p.time) {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("soil_moisture_cleaned")
      .select(`recorded_at, ${surface.column}`)
      .eq("latitude", loc.latitude)
      .eq("longitude", loc.longitude)
      .eq("recorded_at", `${date}T${p.time}:00.000Z`)
      .maybeSingle();
    if (error) throw new Error(`Database error: ${error.message}`);
    const v = data ? (data as unknown as Row)[surface.column] : null;
    value = typeof v === "number" ? v : null;
  } else {
    const { start, end } = dayBounds(date);
    const rows = await fetchRows(loc, start, end, surface.column);
    const vals = values(rows, surface.column);
    value = vals.length > 0 ? average(vals) : null;
  }
  if (value === null) return noData(`${loc.name} on ${formatDate(date)}`);

  let band: string;
  let advice: string;
  if (value < 0.15) {
    band = "dry";
    advice = "The soil is dry, so irrigation is recommended.";
  } else if (value <= 0.25) {
    band = "moderate";
    advice =
      "The soil is moderately moist, so irrigate only lightly if the crop needs it.";
  } else {
    band = "wet";
    advice = "The soil is wet enough, so no irrigation is needed.";
  }
  const when = defaulted
    ? `on the most recent day in the dataset, ${formatDate(date)}`
    : `on ${formatDate(date)}`;
  const how = p.time ? `at ${p.time} UTC was` : "averaged";
  return (
    `The surface soil moisture (0-7 cm) in ${loc.name} ${when} ${how} ` +
    `${fmt(value, surface)} ${surface.unit}, which is ${band}. ${advice}`
  );
}

async function datasetInfoAnswer(): Promise<string> {
  const supabase = getSupabase();
  const { data, error } = await supabase.from("qa_batches").select("pairs");
  if (error) throw new Error(`Database error: ${error.message}`);
  const rows = (data ?? []) as unknown as { pairs: number }[];
  const totalPairs = rows.reduce((a, r) => a + (r.pairs ?? 0), 0);
  return (
    `This chatbot answers from 131,544 hourly soil-moisture records for Faisalabad, ` +
    `Multan and Lahore, covering 1 January 2020 to 31 December 2024 (ERA5-Land soil ` +
    `moisture with ERA5 precipitation, via Open-Meteo). Its question-answer dataset ` +
    `contains ${totalPairs.toLocaleString("en-US")} pairs in ${rows.length} batches.`
  );
}

export async function answerQuestion(p: ParsedQuestion): Promise<string> {
  switch (p.type) {
    case "dataset_info":
      return datasetInfoAnswer();
    case "comparison":
      return comparisonAnswer(p);
    case "irrigation_advice": {
      if (!p.city) return needCity();
      return irrigationAnswer(p, locationByName(p.city)!);
    }
    case "monthly_average":
    case "monthly_max":
    case "monthly_min":
    case "monthly_rain_total": {
      if (!p.city) return needCity();
      return monthlyAnswer(p, locationByName(p.city)!);
    }
    case "yearly_average":
    case "yearly_max":
    case "yearly_min":
    case "yearly_rain_total": {
      if (!p.city) return needCity();
      if (p.year === null) return needDate();
      return yearlyAnswer(p, locationByName(p.city)!);
    }
    case "season_average":
    case "season_rain_total": {
      if (!p.city) return needCity();
      return seasonAnswer(p, locationByName(p.city)!);
    }
    case "overall_average": {
      if (!p.city) return needCity();
      return overallAnswer(p, locationByName(p.city)!);
    }
    case "wettest_year":
    case "driest_year": {
      if (!p.city) return needCity();
      return yearExtremeAnswer(p, locationByName(p.city)!);
    }
    case "point_value": {
      if (!p.city) return needCity();
      if (!p.date || !p.time) return needDate();
      return pointAnswer(p, locationByName(p.city)!);
    }
    case "daily_average":
    case "daily_max":
    case "daily_min":
    case "daily_rain_total": {
      if (!p.city) return needCity();
      if (!p.date) return needDate();
      return dayAnswer(p, locationByName(p.city)!);
    }
    default:
      return HELP_ANSWER;
  }
}
