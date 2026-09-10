import "fake-indexeddb/auto";
import { expect, it } from "vitest";
import { CalendarDB, type EventRecord } from "../src/lib/database";
import { resolveWidgetEvent } from "../src/lib/widget-action";
import { eventColor } from "../src/lib/event-color";

it("opens the exact local recurrence and rejects deleted or stale widget entries",async()=>{
  const database=new CalendarDB("widget-action-"+crypto.randomUUID());
  const record:EventRecord={key:"work/a #한글.ics",id:"a #한글.ics",calendarId:"work",dirty:false,deleted:false,etag:null,version:1,updatedAt:1,
    ical:"BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:a\r\nSUMMARY:원본\r\nDTSTART;VALUE=DATE:20260911\r\nDTEND;VALUE=DATE:20260913\r\nRRULE:FREQ=WEEKLY;COUNT=3\r\nEND:VEVENT\r\nEND:VCALENDAR"};
  try{
    await database.events.put(record);
    const action={action:"event" as const,key:record.key,date:"2026-09-19",recurrenceId:"2026-09-18"};
    expect((await resolveWidgetEvent(action,database))?.occurrence.recurrenceId).toBe("2026-09-18");
    expect(await resolveWidgetEvent({...action,recurrenceId:"2026-09-11"},database)).toBeNull();
    expect(await resolveWidgetEvent({...action,key:"other/a #한글.ics"},database)).toBeNull();
    await database.events.update(record.key,{deleted:true});
    expect(await resolveWidgetEvent(action,database)).toBeNull();
  }finally{await database.delete();}
});

it("normalizes colors without letting invalid values replace calendar colors",()=>{
  expect(eventColor("Green")).toBe("#008000");
  expect(eventColor("#12AB34FF")).toBe("#12ab34");
  expect(eventColor("invalid")).toBeUndefined();
  expect(eventColor("constructor")).toBeUndefined();
  expect(eventColor(null)).toBeUndefined();
});
