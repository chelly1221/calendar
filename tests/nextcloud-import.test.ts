import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { canonicalCalendar, migrate, planImport } from "../scripts/import-nextcloud";
const ical = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//test//EN\r\nBEGIN:VEVENT\r\nUID:source-event\r\nDTSTAMP:20260911T000000Z\r\nDTSTART:20260911T090000\r\nDTEND:20260911T100000\r\nSUMMARY:원본 일정\r\nRRULE:FREQ=WEEKLY;COUNT=2\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n";
function fixture(text = ical) {
  return { format: "calendar-nextcloud-export-v1", user: "test", exportedAt: "2026-09-11T00:00:00Z",
    calendars: [{ sourceId: "1", uri: "work", name: "근무", color: "#F8FFA0FF", description: "", timezone: "", syncToken: "2",
      objects: [{ uri: "one.ics", component: "vevent", etag: '"source"', ical: text,
        sha256: createHash("sha256").update(text).digest("hex") }] }] };
}
afterEach(() => vi.unstubAllGlobals());
describe("Nextcloud migration", () => {
  it("validates checksums and duplicate UIDs before any API request", async () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    const corrupted = fixture(); corrupted.calendars[0].objects[0].ical += "corrupt";
    await expect(migrate(corrupted, "https://example.invalid", true)).rejects.toThrow("checksum");
    const duplicate = fixture();
    duplicate.calendars[0].objects.push({ ...duplicate.calendars[0].objects[0], uri: "two.ics" });
    await expect(migrate(duplicate, "https://example.invalid", true)).rejects.toThrow("Duplicate URI or UID");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("keeps identities stable across retries and separates calendars", () => {
    expect(planImport(fixture()).calendars[0].id).toBe(planImport(fixture()).calendars[0].id);
    const source = fixture(); source.calendars.push({ ...source.calendars[0], sourceId: "2", uri: "other" });
    const plan = planImport(source);
    expect(plan.calendars[0].events[0].key).not.toBe(plan.calendars[1].events[0].key);
    expect(plan.calendars[0].color).toBe("#F8FFA0");
  });
  it("allows serializer floating-time markers but detects actual time, alarm and timezone changes", () => {
    const marked = ical.replace("DTSTART:", "DTSTART;X-VOBJ-FLOATINGTIME-ALLOWED=TRUE:");
    expect(canonicalCalendar(marked)).toBe(canonicalCalendar(ical));
    expect(canonicalCalendar(ical.replace("T090000", "T080000"))).not.toBe(canonicalCalendar(ical));
    const withAlarm = ical.replace("END:VEVENT", "BEGIN:VALARM\r\nACTION:DISPLAY\r\nTRIGGER:-PT15M\r\nDESCRIPTION:Reminder\r\nEND:VALARM\r\nEND:VEVENT");
    expect(canonicalCalendar(withAlarm)).not.toBe(canonicalCalendar(ical));
    const zoned = ical.replace("BEGIN:VEVENT", "BEGIN:VTIMEZONE\r\nTZID:Custom\r\nBEGIN:STANDARD\r\nDTSTART:19700101T000000\r\nTZOFFSETFROM:+0900\r\nTZOFFSETTO:+0900\r\nEND:STANDARD\r\nEND:VTIMEZONE\r\nBEGIN:VEVENT");
    expect(canonicalCalendar(zoned.replace("TZOFFSETTO:+0900", "TZOFFSETTO:+0800"))).not.toBe(canonicalCalendar(zoned));
  });
  it("resumes a completed import without writes and refuses destination edits", async () => {
    const input = fixture(), c = planImport(input).calendars[0], e = c.events[0];
    let edited = false;
    const fetch = vi.fn(async (url: string, init: RequestInit) => {
      if (init.method) throw new Error("Unexpected write");
      const data = url.endsWith("/api/calendars") ? [{ id: c.id, name: c.name, color: c.color }]
        : url.endsWith("/api/events") ? [{ key: e.key, calendarId: c.id, etag: '"stored"' }]
        : { ical: edited ? ical.replace("원본 일정", "기기에서 수정") : ical };
      return new Response(JSON.stringify(data));
    });
    vi.stubGlobal("fetch", fetch);
    const report = await migrate(input, "https://example.invalid", true);
    expect(report.created).toBe(0); expect(report.verified).toBe(1);
    edited = true;
    await expect(migrate(input, "https://example.invalid", true)).rejects.toThrow("no existing event will be overwritten");
  });
});
