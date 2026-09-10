import { describe, expect, it } from "vitest";
import { buildWidgetData } from "../src/lib/widget-data";
import { type EventRecord, defaultCalendar } from "../src/lib/database";
const event = (properties: string, overrides: Partial<EventRecord> = {}): EventRecord => ({
  key: "default/a.ics", id: "a.ics", calendarId: "default", etag: null, dirty: false, deleted: false, version: 1, updatedAt: 1,
  ical: `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:a\r\nDTSTAMP:20260911T000000Z\r\nSUMMARY:일정\r\n${properties}\r\nEND:VEVENT\r\nEND:VCALENDAR`, ...overrides,
});
const now=new Date(2026,8,11,10);
describe("native widget snapshot",()=>{
  it("preserves per-occurrence identity and colors before calendar fallback",()=>{
    const record=event("DTSTART:20260911T090000Z\r\nDTEND:20260911T100000Z\r\nRRULE:FREQ=DAILY;COUNT=3\r\nCOLOR:Tomato");
    record.ical=record.ical.replace("END:VCALENDAR","BEGIN:VEVENT\r\nUID:a\r\nRECURRENCE-ID:20260912T090000Z\r\nDTSTART:20260912T110000Z\r\nDTEND:20260912T120000Z\r\nSUMMARY:예외\r\nCOLOR:#0F8\r\nEND:VEVENT\r\nEND:VCALENDAR");
    const data=buildWidgetData([record],[defaultCalendar],0,now);
    expect(data.events.map(e=>e.color)).toEqual(["#ff6347","#00ff88","#ff6347"]);
    expect(data.events[1]).toMatchObject({key:record.key,recurrenceId:"2026-09-12T09:00:00Z"});
  });
  it("includes hidden calendars for independent widget filters and excludes deletions",()=>{
    const record=event("DTSTART;VALUE=DATE:20260911\r\nDTEND;VALUE=DATE:20260913",{dirty:true});
    const data=buildWidgetData([record,{...record,key:"deleted",deleted:true}],[{...defaultCalendar,hidden:true}],42,now);
    expect(data.events).toHaveLength(1);expect(data.events[0]).toMatchObject({startDay:"2026-09-11",endDay:"2026-09-13",allDay:true});
    expect(data.calendars[0].hidden).toBe(true);expect(data.lastSync).toBe(42);expect(data.pending).toBe(2);
  });
  it("expands recurrence exceptions and cancellations without duplicate occurrences",()=>{
    const record=event("DTSTART:20260911T090000Z\r\nDTEND:20260911T100000Z\r\nRRULE:FREQ=DAILY;COUNT=3\r\nEXDATE:20260912T090000Z");
    record.ical=record.ical.replace("END:VCALENDAR","BEGIN:VEVENT\r\nUID:a\r\nRECURRENCE-ID:20260913T090000Z\r\nDTSTART:20260914T110000Z\r\nDTEND:20260914T120000Z\r\nSUMMARY:옮긴 일정\r\nEND:VEVENT\r\nEND:VCALENDAR");
    const data=buildWidgetData([record],[defaultCalendar],0,now);
    expect(data.events).toHaveLength(2);expect(data.events.map(e=>e.title)).toContain("옮긴 일정");
    expect(data.events.some(e=>e.start===Date.parse("2026-09-12T09:00Z"))).toBe(false);
  });
  it("retains floating wall times and seconds and reports invalid resources",()=>{
    const data=buildWidgetData([event("DTSTART:20260911T090031\r\nDTEND:20260911T100031"),event("not-valid")],[defaultCalendar],0,now);
    expect(data.events[0]).toMatchObject({floating:true,startLocal:"2026-09-11T09:00:31",endLocal:"2026-09-11T10:00:31"});
    expect(data.failures).toBe(1);expect(data.rangeStart).toBe("2024-09-01");expect(data.rangeEnd).toBe("2028-10-01");
  });
});
