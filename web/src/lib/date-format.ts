import { format, formatDistanceToNow, parseISO } from "date-fns";

export function safeDate(value: unknown) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (value == null || value === "") return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

export function safeFormatDate(value: unknown, pattern: string, fallback = "—") {
  const date = safeDate(value);
  return date ? format(date, pattern) : fallback;
}

export function safeFormatDistanceToNow(value: unknown, fallback = "—") {
  const date = safeDate(value);
  return date ? formatDistanceToNow(date, { addSuffix: true }) : fallback;
}

export function safeLocaleString(value: unknown, fallback = "—") {
  const date = safeDate(value);
  return date ? date.toLocaleString() : fallback;
}

export function safeLocaleDateString(value: unknown, fallback = "—") {
  const date = safeDate(value);
  return date ? date.toLocaleDateString() : fallback;
}

export function safeFormatIsoDate(value: unknown, pattern: string, fallback = "—") {
  if (value == null || value === "") return fallback;
  const date = parseISO(String(value));
  return Number.isNaN(date.getTime()) ? fallback : format(date, pattern);
}
