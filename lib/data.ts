/**
 * Shared facts about the soil moisture dataset.
 *
 * Data source: ERA5-Land (soil moisture, temperature, humidity) and ERA5
 * (precipitation) via the Open-Meteo archive API, stored in Supabase in
 * the table public.soil_moisture_cleaned. Hourly, UTC, 2020-2024.
 */

export interface LocationInfo {
  name: string;
  latitude: number;
  longitude: number;
}

export const LOCATIONS: LocationInfo[] = [
  { name: "Multan", latitude: 30.1575, longitude: 71.5249 },
  { name: "Faisalabad", latitude: 31.4504, longitude: 73.135 },
  { name: "Lahore", latitude: 31.5204, longitude: 74.3587 },
];

export type CityName = "Multan" | "Faisalabad" | "Lahore";

export function locationByName(name: string): LocationInfo | undefined {
  return LOCATIONS.find((l) => l.name.toLowerCase() === name.toLowerCase());
}

export type VariableKey =
  | "sm_0_7"
  | "sm_7_28"
  | "sm_28_100"
  | "sm_100_255"
  | "temperature"
  | "humidity"
  | "precipitation";

export interface VariableInfo {
  key: VariableKey;
  /** Column name in public.soil_moisture_cleaned */
  column: string;
  /** Phrase used inside answer sentences, e.g. "soil moisture at 0-7 cm depth" */
  label: string;
  /** Unit printed after the value */
  unit: string;
  /** Decimal places, matching the generated Q&A pairs */
  decimals: number;
  /** True for the four soil-moisture depth layers */
  isMoisture: boolean;
}

export const VARIABLES: Record<VariableKey, VariableInfo> = {
  sm_0_7: {
    key: "sm_0_7",
    column: "soil_moisture_0_7cm",
    label: "soil moisture at 0-7 cm depth",
    unit: "m3/m3",
    decimals: 3,
    isMoisture: true,
  },
  sm_7_28: {
    key: "sm_7_28",
    column: "soil_moisture_7_28cm",
    label: "soil moisture at 7-28 cm depth",
    unit: "m3/m3",
    decimals: 3,
    isMoisture: true,
  },
  sm_28_100: {
    key: "sm_28_100",
    column: "soil_moisture_28_100cm",
    label: "soil moisture at 28-100 cm depth",
    unit: "m3/m3",
    decimals: 3,
    isMoisture: true,
  },
  sm_100_255: {
    key: "sm_100_255",
    column: "soil_moisture_100_255cm",
    label: "soil moisture at 100-255 cm depth",
    unit: "m3/m3",
    decimals: 3,
    isMoisture: true,
  },
  temperature: {
    key: "temperature",
    column: "temperature_2m",
    label: "temperature",
    unit: "deg C",
    decimals: 1,
    isMoisture: false,
  },
  humidity: {
    key: "humidity",
    column: "relative_humidity_2m",
    label: "relative humidity",
    unit: "%",
    decimals: 0,
    isMoisture: false,
  },
  precipitation: {
    key: "precipitation",
    column: "precipitation",
    label: "precipitation",
    unit: "mm",
    decimals: 2,
    isMoisture: false,
  },
};

/** First and last timestamps covered by the dataset (UTC). */
export const DATA_START = "2020-01-01";
export const DATA_END = "2024-12-31";

export const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** "2023-05-14" -> "14 May 2023" */
export function formatDate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map((s) => parseInt(s, 10));
  return `${d} ${MONTH_NAMES[m - 1]} ${y}`;
}

/** { year: 2022, month: 6 } -> "June 2022" */
export function formatMonth(year: number, month: number): string {
  return `${MONTH_NAMES[month - 1]} ${year}`;
}
