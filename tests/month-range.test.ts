import { expect, it } from "vitest";
import { monthRange } from "../src/lib/month-range";
import { localDate } from "../src/lib/ical";

it.each([
  [2026, 1, 4, "2026-02-01", "2026-03-01"],
  [2026, 8, 5, "2026-08-30", "2026-10-04"],
  [2026, 7, 6, "2026-07-26", "2026-09-06"],
  [2024, 1, 5, "2024-01-28", "2024-03-03"],
  [2026, 11, 5, "2026-11-29", "2027-01-03"],
] as const)("includes only weeks intersecting %i/%i", (year, month, weeks, from, until) => {
  const range = monthRange(new Date(year, month, 15));
  expect(range.weeks).toBe(weeks);
  expect(range.days).toHaveLength(weeks * 7);
  expect(localDate(range.from)).toBe(from);
  expect(localDate(range.until)).toBe(until);
  expect(range.days[0].getDay()).toBe(0);
  expect(range.days.at(-1)!.getDay()).toBe(6);
  expect(range.days.filter(day => day.getMonth() === month)).toHaveLength(new Date(year, month + 1, 0).getDate());
});
