import { db, type CalendarDB } from "./database";
import { addDays, expandEvent } from "./ical";

export type WidgetAction = { date: string; action: "day" | "new" | "sync" | "event"; key?: string; recurrenceId?: string };

export async function resolveWidgetEvent(action: WidgetAction, database: CalendarDB = db) {
  if (action.action !== "event" || !action.key) return null;
  const record = await database.events.get(action.key);
  if (!record || record.deleted) return null;
  const day = new Date(action.date + "T00:00:00");
  if (!Number.isFinite(+day)) return null;
  const occurrence = expandEvent(record.ical, record.key, day, addDays(day, 1))
    .find(e => action.recurrenceId ? e.recurrenceId === action.recurrenceId : true);
  return occurrence ? { record, occurrence } : null;
}
