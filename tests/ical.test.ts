import { describe, it, expect } from "vitest";
import {
  writeEvent,
  readEvent,
  expandEvent,
  cancelOccurrence,
  importEvents,
  exportEvents,
  validateEvent,
  conflictCopy,
  emptyEvent,
} from "../src/lib/ical";
const draft = () => ({
  ...emptyEvent(),
  uid: "event-1",
  title: "회의",
  start: "2026-09-11T10:00",
  end: "2026-09-11T11:00",
});
describe("iCalendar interoperability", () => {
  it("round trips Unicode and escaped description text", () => {
    const d = { ...draft(), description: "안녕, 달력;\n두 번째 줄", location: "서울" };
    const text = writeEvent(d);
    expect(readEvent(text)).toEqual(d);
    validateEvent(text);
  });
  it("uses an exclusive DTEND for inclusive multi-day editing", () => {
    const d = { ...draft(), allDay: true, start: "2026-09-11", end: "2026-09-13" };
    const text = writeEvent(d);
    expect(text).toContain("DTEND;VALUE=DATE:20260914");
    expect(readEvent(text)).toEqual(d);
    const e = expandEvent(text, "a", new Date("2026-09-13T00:00"), new Date("2026-09-14T00:00"));
    expect(e).toHaveLength(1);
    expect(
      expandEvent(text, "a", new Date("2026-09-14T00:00"), new Date("2026-09-15T00:00")),
    ).toHaveLength(0);
  });
  it("expands weekly recurrences and deletes only the selected occurrence", () => {
    const text = writeEvent({ ...draft(), recurrence: "FREQ=WEEKLY;COUNT=4" });
    const first = expandEvent(text, "a", new Date("2026-09-01"), new Date("2026-10-31"));
    expect(first).toHaveLength(4);
    const changed = cancelOccurrence(text, first[1].recurrenceId);
    expect(expandEvent(changed, "a", new Date("2026-09-01"), new Date("2026-10-31"))).toHaveLength(
      3,
    );
    expect(readEvent(changed).title).toBe("회의");
  });
  it("preserves unknown properties and exception dates during title edits", () => {
    const text = writeEvent({ ...draft(), recurrence: "FREQ=WEEKLY;COUNT=4" }).replace(
      "END:VEVENT",
      "X-TEST:preserve-me\r\nEND:VEVENT",
    );
    const rows = expandEvent(text, "a", new Date("2026-09-01"), new Date("2026-10-31"));
    const cancelled = cancelOccurrence(text, rows[1].recurrenceId);
    const changed = writeEvent({ ...readEvent(cancelled), title: "수정" }, cancelled);
    expect(changed).toContain("X-TEST:preserve-me");
    expect(expandEvent(changed, "a", new Date("2026-09-01"), new Date("2026-10-31"))).toHaveLength(
      3,
    );
  });
  it("groups imported recurring events and exports them without loss", () => {
    const a = writeEvent(draft()),
      b = writeEvent({ ...draft(), uid: "another", title: "두 번째" });
    const items = importEvents(exportEvents([a, b]));
    expect(items).toHaveLength(2);
    expect(items.map(readEvent).map((e) => e.title)).toEqual(["회의", "두 번째"]);
  });
  it("rejects reversed time and malformed multi-UID resources", () => {
    expect(() => writeEvent({ ...draft(), end: "2026-09-11T09:00" })).toThrow();
    expect(() =>
      validateEvent(
        exportEvents([writeEvent(draft()), writeEvent({ ...draft(), uid: "another" })]),
      ),
    ).toThrow();
  });
  it("changes UID on conflict copies", () => {
    const c = readEvent(conflictCopy(writeEvent(draft())));
    expect(c.uid).not.toBe("event-1");
    expect(c.title).toContain("충돌 사본");
  });
  it("honors imported time zone transitions", () => {
    const text =
      "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VTIMEZONE\r\nTZID:Test/Eastern\r\nBEGIN:STANDARD\r\nDTSTART:19701101T020000\r\nRRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU\r\nTZOFFSETFROM:-0400\r\nTZOFFSETTO:-0500\r\nEND:STANDARD\r\nBEGIN:DAYLIGHT\r\nDTSTART:19700308T020000\r\nRRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU\r\nTZOFFSETFROM:-0500\r\nTZOFFSETTO:-0400\r\nEND:DAYLIGHT\r\nEND:VTIMEZONE\r\nBEGIN:VEVENT\r\nUID:dst-test\r\nDTSTART;TZID=Test/Eastern:20261025T090000\r\nDTEND;TZID=Test/Eastern:20261025T100000\r\nRRULE:FREQ=WEEKLY;COUNT=3\r\nSUMMARY:DST\r\nEND:VEVENT\r\nEND:VCALENDAR";
    const rows = expandEvent(text, "a", new Date("2026-10-24"), new Date("2026-11-15"));
    expect(rows.map((r) => r.start.toISOString())).toEqual([
      "2026-10-25T13:00:00.000Z",
      "2026-11-01T14:00:00.000Z",
      "2026-11-08T14:00:00.000Z",
    ]);
    const renamed=writeEvent({...readEvent(text),title:'Renamed'},text);
    expect(renamed).toContain('DTSTART;TZID=Test/Eastern:20261025T090000');
    expect(expandEvent(renamed,'a',new Date('2026-10-24'),new Date('2026-11-15')).map(r=>r.start.toISOString())).toEqual(rows.map(r=>r.start.toISOString()));
  });
  it('includes exceptions moved from beyond the visible range',()=>{
    const text=writeEvent({...draft(),recurrence:'FREQ=WEEKLY;COUNT=4'});
    const dates=expandEvent(text,'a',new Date('2026-09-01'),new Date('2026-10-31'));
    const original=dates[3].start.toISOString().replace(/[-:]/g,'').replace('.000','');
    const exception=`BEGIN:VEVENT\r\nUID:event-1\r\nRECURRENCE-ID:${original}\r\nDTSTART:20260915T010000Z\r\nDTEND:20260915T020000Z\r\nSUMMARY:Moved\r\nEND:VEVENT\r\n`;
    const moved=text.replace('END:VCALENDAR',exception+'END:VCALENDAR');
    const results=expandEvent(moved,'a',new Date('2026-09-14'),new Date('2026-09-16'));
    expect(results.map(e=>e.title)).toEqual(['Moved']);
  });
});
