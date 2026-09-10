import { expandEvent, localDate, localTime } from "./ical";
import type { Calendar, EventRecord } from "./database";

export type WidgetEvent = {
  key: string; recurrenceId: string; color?: string; calendarId: string; title: string; start: number; end: number;
  startDay: string; endDay: string; startLocal: string; endLocal: string;
  allDay: boolean; floating: boolean;
};
export function buildWidgetData(records: EventRecord[], calendars: Calendar[], lastSync: number, now = new Date()) {
  // A durable rolling window allows month navigation with the app process stopped.
  const from = new Date(now.getFullYear() - 2, now.getMonth(), 1);
  const until = new Date(now.getFullYear() + 2, now.getMonth() + 1, 1);
  const events: WidgetEvent[] = [];
  let failures = 0;
  for (const record of records) {
    if (record.deleted) continue;
    try {
      const expanded = expandEvent(record.ical, record.key, from, until);
      if (events.length + expanded.length > 40000) throw new Error("Widget snapshot capacity");
      for (const e of expanded) events.push({
        key: e.key, recurrenceId: e.recurrenceId, color: e.color, calendarId: record.calendarId,
        title: e.title.replace(/[\r\n\t]+/g, " ").slice(0, 300),
        start: +e.start, end: +e.end, allDay: e.allDay, floating: e.floating,
        startDay: localDate(e.start), endDay: localDate(e.end),
        startLocal: localTime(e.start) + `:${String(e.start.getSeconds()).padStart(2, "0")}`,
        endLocal: localTime(e.end) + `:${String(e.end.getSeconds()).padStart(2, "0")}`,
      });
    } catch { failures++; }
  }
  return {
    version: 1, generatedAt: +now, lastSync, rangeStart: localDate(from), rangeEnd: localDate(until),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    pending: records.filter(e => e.dirty).length, failures,
    calendars: calendars.map(({ id, name, color, hidden }) => ({ id, name, color, hidden: !!hidden })), events,
  };
}
