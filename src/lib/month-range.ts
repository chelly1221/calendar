import { addDays } from "./ical";

/** Whole Sunday–Saturday weeks intersecting the requested local month. */
export function monthRange(anchor: Date) {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const last = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
  const weeks = Math.ceil((first.getDay() + last.getDate()) / 7);
  const from = addDays(first, -first.getDay());
  return {
    from,
    until: addDays(from, weeks * 7),
    weeks,
    days: Array.from({ length: weeks * 7 }, (_, index) => addDays(from, index)),
  };
}
