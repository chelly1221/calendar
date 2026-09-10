import Dexie, { type EntityTable } from "dexie";
import { calendarComponent, masterOf, validateEvent } from "./ical";
export type Calendar = { id: string; name: string; color: string; hidden?: boolean };
export type EventRecord = {
  key: string;
  id: string;
  calendarId: string;
  ical: string;
  etag: string | null;
  dirty: boolean;
  deleted: boolean;
  version: number;
  updatedAt: number;
  conflict?: boolean;
};
export const defaultCalendar: Calendar = { id: "default", name: "내 달력", color: "#b59ae8" };
export class CalendarDB extends Dexie {
  events!: EntityTable<EventRecord, "key">;
  calendars!: EntityTable<Calendar, "id">;
  meta!: EntityTable<{ key: string; value: string }, "key">;
  constructor(name = "calendar-data") {
    super(name);
    this.version(1).stores({ events: "key,calendarId,updatedAt", calendars: "id", meta: "key" });
  }
}
export const db = new CalendarDB(
  import.meta.env?.DEV &&
    typeof location !== "undefined" &&
    new URLSearchParams(location.search).has("preview")
    ? "calendar-preview-data"
    : "calendar-data",
);
export async function initializeDatabase() {
  if (!(await db.calendars.get("default"))) await db.calendars.put(defaultCalendar);
}
export async function saveEvent(ical: string, calendarId: string, key?: string, database = db) {
  validateEvent(ical);
  const id = key ? key.slice(key.indexOf("/") + 1) : crypto.randomUUID() + ".ics";
  key ??= calendarId + "/" + id;
  await database.transaction("rw", database.events, async () => {
    const old = await database.events.get(key!);
    if (old && old.calendarId !== calendarId)
      throw new Error("기존 일정의 캘린더는 변경할 수 없어요.");
    await database.events.put({
      ...old,
      key: key!,
      id,
      calendarId,
      ical,
      etag: old?.etag ?? null,
      dirty: true,
      deleted: false,
      version: (old?.version ?? 0) + 1,
      updatedAt: Date.now(),
    });
  });
  return key;
}
export async function deleteEvent(key: string, database = db) {
  await database.transaction("rw", database.events, async () => {
    const old = await database.events.get(key);
    if (old)
      await database.events.put({
        ...old,
        deleted: true,
        dirty: true,
        version: old.version + 1,
        updatedAt: Date.now(),
      });
  });
}
export async function addEvents(events: string[], calendarId: string, database = db) {
  let added = 0,
    skipped = 0;
  await database.transaction("rw", database.events, async () => {
    const existing = await database.events.where("calendarId").equals(calendarId).toArray();
    const uids = new Set(
      existing
        .filter((e) => !e.deleted)
        .map((e) => String(masterOf(calendarComponent(e.ical))?.getFirstPropertyValue("uid"))),
    );
    for (const ical of events) {
      validateEvent(ical);
      const uid = String(masterOf(calendarComponent(ical))?.getFirstPropertyValue("uid"));
      if (uids.has(uid)) {
        skipped++;
        continue;
      }
      uids.add(uid);
      const id = crypto.randomUUID() + ".ics";
      await database.events.add({
        key: calendarId + "/" + id,
        id,
        calendarId,
        ical,
        etag: null,
        dirty: true,
        deleted: false,
        version: 1,
        updatedAt: Date.now(),
      });
      added++;
    }
  });
  return { added, skipped };
}
