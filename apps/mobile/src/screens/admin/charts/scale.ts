import { Platform } from "react-native";

/** Axis helpers shared by BarChart and LineChart (owner: Huy). */

/**
 * SVG <text> does not inherit the React Native font, and browsers fall back to a serif font.
 * On web use the same system stack as react-native-web; native already uses the system font.
 */
export const chartFontFamily = Platform.OS === "web" ? 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif' : undefined;

export type Scale = { min: number; max: number; step: number; ticks: number[] };

/**
 * "Nice" axis: a step of 1, 2 or 5 x 10^k with at most `maxTicks` intervals, so ticks read as round numbers.
 * `integer` keeps the step >= 1 (counts); a fixed `domainMax` (e.g. 100 for %) overrides the data maximum;
 * `domainMin` (default 0) lets a line chart zoom in, e.g. 90–100 % so small uptime dips stay visible.
 */
export function niceScale(dataMax: number, options: { maxTicks?: number; integer?: boolean; domainMax?: number; domainMin?: number } = {}): Scale {
  const { maxTicks = 4, integer = false, domainMax, domainMin = 0 } = options;
  const top = domainMax ?? (dataMax > domainMin ? dataMax : domainMin + 1);
  const span = top - domainMin;
  const rough = span / maxTicks;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  let step = [1, 2, 5, 10].map((multiple) => multiple * magnitude).find((candidate) => candidate >= rough) ?? 10 * magnitude;
  if (integer) step = Math.max(1, Math.round(step));
  const max = domainMax ?? domainMin + Math.ceil(span / step) * step;
  const ticks: number[] = [];
  for (let value = domainMin; value <= max + step / 1000; value += step) ticks.push(Number(value.toFixed(6)));
  return { min: domainMin, max, step, ticks };
}

/** Compact number for axis/value labels: 1250 -> "1.3k", 12.5 -> "12.5", 3 -> "3". */
export function formatNumber(value: number): string {
  if (Math.abs(value) >= 1000) return `${(value / 1000).toFixed(value >= 10_000 ? 0 : 1).replace(/\.0$/, "")}k`;
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(1).replace(/\.0$/, "");
}

/** Shortens a label to `max` characters with an ellipsis (SVG text does not wrap). */
export const truncate = (label: string, max: number): string => (label.length <= max ? label : `${label.slice(0, Math.max(1, max - 1))}…`);
