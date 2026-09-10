import { it, expect } from "vitest";
import { unzipSync, strFromU8 } from "fflate";
import { calendarArchive } from "../src/lib/archive";
import { writeEvent, emptyEvent, importEvents, readEvent } from "../src/lib/ical";
import type { EventRecord } from "../src/lib/database";
it("exports identical UIDs in different calendars as independent valid ICS files", () => {
  const make = (calendarId: string): EventRecord => ({
    key: calendarId + "/x.ics",
    id: "x.ics",
    calendarId,
    ical: writeEvent({ ...emptyEvent(), uid: "shared-uid", title: calendarId }),
    etag: null,
    dirty: true,
    deleted: false,
    version: 1,
    updatedAt: Date.now(),
  });
  const files = unzipSync(
    calendarArchive(
      [make("default"), make("work")],
      [
        { id: "default", name: "내 달력", color: "#b59ae8" },
        { id: "work", name: "업무", color: "#87b8d1" },
      ],
    ),
  );
  const calendars = Object.entries(files).filter(([key]) => key.endsWith(".ics"));
  expect(calendars).toHaveLength(2);
  expect(
    calendars.map(([, data]) => readEvent(importEvents(strFromU8(data))[0]).title).sort(),
  ).toEqual(["default", "work"]);
  expect(files["calendars.json"]).toBeDefined();
});
