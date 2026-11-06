/**
 * Parser test: runs sample questions through lib/parser.ts and checks the
 * parsed { type, city, date, time, variable } against expectations.
 *
 * Run with: npm run test:parser
 */

import { parseQuestion, type ParsedQuestion } from "../lib/parser";

interface Expected {
  type: ParsedQuestion["type"];
  city?: string | null;
  date?: string | null;
  time?: string | null;
  variable?: string;
  month?: { year: number; month: number } | null;
}

const CASES: { question: string; expect: Expected }[] = [
  {
    question:
      "What was the soil moisture at 0-7 cm depth in Lahore on 14 May 2023 at 3 pm?",
    expect: {
      type: "point_value",
      city: "Lahore",
      date: "2023-05-14",
      time: "15:00",
      variable: "sm_0_7",
    },
  },
  {
    question:
      "What was the soil moisture at 7-28 cm depth in Multan on 01 January 2020 at 00:00?",
    expect: {
      type: "point_value",
      city: "Multan",
      date: "2020-01-01",
      time: "00:00",
      variable: "sm_7_28",
    },
  },
  {
    question: "What was the soil moisture in Lahore on 2023-05-14 at 15:00?",
    expect: {
      type: "point_value",
      city: "Lahore",
      date: "2023-05-14",
      time: "15:00",
      variable: "sm_0_7",
    },
  },
  {
    question:
      "What was the average soil moisture in Faisalabad on 10 June 2022?",
    expect: {
      type: "daily_average",
      city: "Faisalabad",
      date: "2022-06-10",
      time: null,
      variable: "sm_0_7",
    },
  },
  {
    question: "What was the maximum temperature in Multan on 5 August 2021?",
    expect: {
      type: "daily_max",
      city: "Multan",
      date: "2021-08-05",
      variable: "temperature",
    },
  },
  {
    question:
      "What was the minimum relative humidity in Lahore on 20 January 2024?",
    expect: {
      type: "daily_min",
      city: "Lahore",
      date: "2024-01-20",
      variable: "humidity",
    },
  },
  {
    question: "How much rain fell in Faisalabad on 18 July 2022?",
    expect: {
      type: "daily_rain_total",
      city: "Faisalabad",
      date: "2022-07-18",
      variable: "precipitation",
    },
  },
  {
    question: "What was the average soil moisture in Faisalabad in June 2022?",
    expect: {
      type: "monthly_average",
      city: "Faisalabad",
      date: null,
      month: { year: 2022, month: 6 },
      variable: "sm_0_7",
    },
  },
  {
    question: "Which city was wetter on 14 May 2023, Lahore or Multan?",
    expect: {
      type: "comparison",
      date: "2023-05-14",
      variable: "sm_0_7",
    },
  },
  {
    question: "Should I irrigate in Multan on 1 January 2020?",
    expect: {
      type: "irrigation_advice",
      city: "Multan",
      date: "2020-01-01",
      variable: "sm_0_7",
    },
  },
  {
    question: "How many question-answer pairs are in the dataset?",
    expect: { type: "dataset_info", city: null },
  },
  {
    question:
      "Give me the soil moisture at 28-100 cm depth in Faisalabad on 3 March 2021 at 6 am",
    expect: {
      type: "point_value",
      city: "Faisalabad",
      date: "2021-03-03",
      time: "06:00",
      variable: "sm_28_100",
    },
  },
];

let failures = 0;
for (const { question, expect } of CASES) {
  const p = parseQuestion(question);
  const got = {
    type: p.type,
    city: p.city,
    date: p.date,
    time: p.time,
    variable: p.variable,
    month: p.month,
  };
  const problems: string[] = [];
  for (const [key, want] of Object.entries(expect)) {
    const actual = (got as Record<string, unknown>)[key];
    if (JSON.stringify(actual) !== JSON.stringify(want)) {
      problems.push(`${key}: expected ${JSON.stringify(want)}, got ${JSON.stringify(actual)}`);
    }
  }
  if (expect.type === "comparison" && p.cities.length < 2) {
    problems.push(`cities: expected at least 2, got ${JSON.stringify(p.cities)}`);
  }
  const status = problems.length === 0 ? "PASS" : "FAIL";
  if (problems.length > 0) failures++;
  console.log(`\n[${status}] ${question}`);
  console.log(
    `  parsed: type=${p.type} city=${p.city} cities=${JSON.stringify(p.cities)} date=${p.date} time=${p.time} month=${JSON.stringify(p.month)} variable=${p.variable}`
  );
  for (const prob of problems) console.log(`  !! ${prob}`);
}

console.log(
  `\n${CASES.length - failures}/${CASES.length} parser tests passed.`
);
if (failures > 0) process.exit(1);
