import ICAL from "ical.js";

export type EventDraft = {
  uid: string;
  title: string;
  description: string;
  location: string;
  start: string;
  end: string;
  allDay: boolean;
  recurrence: string;
};
export type Occurrence = {
  key: string;
  start: Date;
  end: Date;
  allDay: boolean;
  title: string;
  location: string;
  recurrenceId: string;
  recurring: boolean;
  floating: boolean;
};
export const localDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
export const localTime = (date: Date) =>
  `${localDate(date)}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
export function addDays(date: Date, days: number) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}
export function emptyEvent(date = new Date()): EventDraft {
  const start = new Date(date);
  start.setHours(Math.min(new Date().getHours() + 1, 23), 0, 0, 0);
  return {
    uid: crypto.randomUUID(),
    title: "",
    description: "",
    location: "",
    start: localTime(start),
    end: localTime(new Date(+start + 3600000)),
    allDay: false,
    recurrence: "",
  };
}
export function calendarComponent(text: string, limit = 2 * 1024 * 1024) {
  if (text.length > limit) throw new Error("일정 파일이 너무 커요.");
  const cal = new ICAL.Component(ICAL.parse(text));
  if (cal.name !== "vcalendar") throw new Error("올바른 iCalendar 파일이 아니에요.");
  for (const zone of cal.getAllSubcomponents("vtimezone")) {
    const id = zone.getFirstPropertyValue("tzid");
    if (typeof id === "string")
      ICAL.TimezoneService.register(new ICAL.Timezone({ component: zone, tzid: id }));
  }
  return cal;
}
export function masterOf(cal: ICAL.Component) {
  return (
    cal.getAllSubcomponents("vevent").find((c) => !c.hasProperty("recurrence-id")) ??
    cal.getFirstSubcomponent("vevent")
  );
}
function eventTime(value: string, allDay: boolean) {
  return allDay
    ? ICAL.Time.fromDateString(value.slice(0, 10))
    : ICAL.Time.fromJSDate(new Date(value), true);
}
export function readEvent(text: string): EventDraft {
  const cal = calendarComponent(text),
    component = masterOf(cal);
  if (!component) throw new Error("일정이 없는 파일이에요.");
  const event = new ICAL.Event(component);
  const allDay = event.startDate.isDate;
  const start = event.startDate.toJSDate(),
    end = event.endDate.toJSDate();
  return {
    uid: event.uid,
    title: event.summary || "제목 없는 일정",
    description: event.description || "",
    location: event.location || "",
    allDay,
    start: allDay ? localDate(start) : localTime(start),
    // The editor shows the last inclusive day; RFC 5545 DTEND remains exclusive.
    end: allDay ? localDate(addDays(end, -1)) : localTime(end),
    recurrence: component.getFirstPropertyValue("rrule")?.toString() ?? "",
  };
}
export function writeEvent(draft: EventDraft, previous?: string) {
  if (!draft.title.trim()) throw new Error("일정 제목을 입력해 주세요.");
  const start = new Date(draft.start),
    end = new Date(draft.end);
  if (
    !Number.isFinite(+start) ||
    !Number.isFinite(+end) ||
    (draft.allDay ? end < start : end <= start)
  )
    throw new Error("종료 날짜와 시간을 시작 이후로 설정해 주세요.");
  const cal = previous ? calendarComponent(previous) : new ICAL.Component(["vcalendar", [], []]);
  cal.updatePropertyWithValue("version", "2.0");
  cal.updatePropertyWithValue("prodid", "-//3chan//달력 0.1//KO");
  let component = masterOf(cal);
  if (!component) {
    component = new ICAL.Component("vevent");
    cal.addSubcomponent(component);
  }
  component.updatePropertyWithValue("uid", draft.uid);
  component.updatePropertyWithValue("summary", draft.title.trim());
  component.updatePropertyWithValue("description", draft.description);
  component.updatePropertyWithValue("location", draft.location);
  const oldDraft = previous ? readEvent(previous) : null;
  // Preserve TZID, VTIMEZONE and seconds when only the event's text changes.
  if (
    !oldDraft ||
    oldDraft.start !== draft.start ||
    oldDraft.end !== draft.end ||
    oldDraft.allDay !== draft.allDay
  ) {
    component.removeAllProperties("dtstart");
    component.removeAllProperties("dtend");
    component.removeAllProperties("duration");
    component.updatePropertyWithValue("dtstart", eventTime(draft.start, draft.allDay));
    component.updatePropertyWithValue(
      "dtend",
      draft.allDay
        ? ICAL.Time.fromDateString(localDate(addDays(new Date(draft.end + "T00:00:00"), 1)))
        : eventTime(draft.end, false),
    );
  }
  component.updatePropertyWithValue("dtstamp", ICAL.Time.fromJSDate(new Date(), true));
  component.updatePropertyWithValue("last-modified", ICAL.Time.fromJSDate(new Date(), true));
  component.updatePropertyWithValue(
    "sequence",
    Number(component.getFirstPropertyValue("sequence") || 0) + 1,
  );
  const oldRule = component.getFirstPropertyValue("rrule")?.toString() ?? "";
  if (oldRule !== draft.recurrence) {
    component.removeAllProperties("rrule");
    component.removeAllProperties("exdate");
    component.removeAllProperties("rdate");
    for (const exception of cal
      .getAllSubcomponents("vevent")
      .filter((c) => c.hasProperty("recurrence-id")))
      cal.removeSubcomponent(exception);
    if (draft.recurrence)
      component.addPropertyWithValue("rrule", ICAL.Recur.fromString(draft.recurrence));
  }
  return cal.toString();
}
export function validateEvent(text: string) {
  const cal = calendarComponent(text),
    components = cal.getAllSubcomponents("vevent");
  if (
    !components.length ||
    cal.getAllSubcomponents().some((c) => !["vevent", "vtimezone"].includes(c.name))
  )
    throw new Error("VEVENT 일정만 지원해요.");
  const uids = new Set(components.map((c) => String(c.getFirstPropertyValue("uid") || "")));
  if (
    uids.size !== 1 ||
    uids.has("") ||
    components.filter((c) => !c.hasProperty("recurrence-id")).length !== 1
  )
    throw new Error("일정의 UID 또는 반복 원본을 확인해 주세요.");
  for (const c of components) {
    const e = new ICAL.Event(c);
    if (
      !c.hasProperty("dtstart") ||
      !Number.isFinite(+e.startDate.toJSDate()) ||
      !Number.isFinite(+e.endDate.toJSDate()) ||
      e.endDate.compare(e.startDate) < 0
    )
      throw new Error("일정 시간이 올바르지 않아요.");
  }
  return cal;
}
export function expandEvent(text: string, key: string, from: Date, until: Date): Occurrence[] {
  const cal = calendarComponent(text),
    master = masterOf(cal);
  if (!master) return [];
  const event = new ICAL.Event(master, {
    exceptions: cal
      .getAllSubcomponents("vevent")
      .filter((c) => c.hasProperty("recurrence-id"))
      .map((c) => new ICAL.Event(c)),
  });
  if (event.component.getFirstPropertyValue("status") === "CANCELLED") return [];
  const result: Occurrence[] = [];
  const seen = new Set<string>();
  const push = (e: ICAL.Event, start: ICAL.Time, end: ICAL.Time, rid: ICAL.Time) => {
    if (seen.has(rid.toString())) return;
    seen.add(rid.toString());
    const s = start.toJSDate(),
      t = end.toJSDate();
    if (
      s < until &&
      (t > from || (+s === +t && s >= from)) &&
      e.component.getFirstPropertyValue("status") !== "CANCELLED"
    )
      result.push({
        key,
        start: s,
        end: t,
        title: e.summary || "제목 없는 일정",
        location: e.location || "",
        allDay: start.isDate,
        recurrenceId: rid.toString(),
        recurring: event.isRecurring(),
        floating: !start.isDate && start.zone.tzid === "floating",
      });
  };
  if (!event.isRecurring()) {
    push(event, event.startDate, event.endDate, event.startDate);
    return result;
  }
  const iterator = event.iterator();
  const finish = () => {
    // An exception can move an occurrence from beyond the query window into it.
    for (const c of cal
      .getAllSubcomponents("vevent")
      .filter((c) => c.hasProperty("recurrence-id"))) {
      const exception = new ICAL.Event(c);
      push(
        exception,
        exception.startDate,
        exception.endDate,
        c.getFirstPropertyValue("recurrence-id") as ICAL.Time,
      );
    }
    return result.sort((a, b) => +a.start - +b.start);
  };
  // Bound hostile or extremely dense rules. Never silently show a partial calendar.
  for (let count = 0; count < 100000; count++) {
    const next = iterator.next();
    if (!next || next.toJSDate() >= until) return finish();
    const occurrence = event.getOccurrenceDetails(next);
    push(occurrence.item, occurrence.startDate, occurrence.endDate, next);
    if (result.length > 5000) throw new Error("반복 일정이 너무 많아요. 표시 기간을 줄여 주세요.");
  }
  throw new Error("반복 일정의 범위가 너무 넓어요. ICS 파일의 반복 시작일을 확인해 주세요.");
}
export function cancelOccurrence(text: string, recurrenceId: string) {
  const cal = calendarComponent(text),
    master = masterOf(cal);
  if (!master) throw new Error("반복 원본을 찾지 못했어요.");
  const time = ICAL.Time.fromString(recurrenceId, master.getFirstProperty("dtstart"));
  const start = master.getFirstPropertyValue("dtstart") as ICAL.Time;
  time.zone = start.zone;
  master.addPropertyWithValue("exdate", time);
  for (const c of cal.getAllSubcomponents("vevent"))
    if (c.getFirstPropertyValue("recurrence-id")?.toString() === recurrenceId)
      cal.removeSubcomponent(c);
  master.updatePropertyWithValue("dtstamp", ICAL.Time.fromJSDate(new Date(), true));
  return cal.toString();
}
export function conflictCopy(text: string) {
  const cal = calendarComponent(text),
    uid = crypto.randomUUID();
  for (const c of cal.getAllSubcomponents("vevent")) {
    c.updatePropertyWithValue("uid", uid);
    c.updatePropertyWithValue(
      "summary",
      `${c.getFirstPropertyValue("summary") || "일정"} (충돌 사본)`,
    );
  }
  return cal.toString();
}
export function sameEvent(a: string, b: string) {
  const normalize = (text: string) => {
    const cal = calendarComponent(text);
    const sort = (value: unknown): unknown => {
      if (Array.isArray(value)) return value.map(sort);
      if (value && typeof value === "object")
        return Object.fromEntries(
          Object.entries(value)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => [k, sort(v)]),
        );
      return value;
    };
    const canonical = (c: ICAL.Component): unknown => [
      c.name,
      c
        .getAllProperties()
        .map((p) => sort(p.toJSON()))
        .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
      c
        .getAllSubcomponents()
        .map(canonical)
        .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    ];
    return JSON.stringify(
      sort(
        cal
          .getAllSubcomponents("vevent")
          .map(canonical)
          .sort((x, y) => JSON.stringify(x).localeCompare(JSON.stringify(y))),
      ),
    );
  };
  return normalize(a) === normalize(b);
}
export function importEvents(text: string) {
  if (new TextEncoder().encode(text).length > 20 * 1024 * 1024)
    throw new Error("ICS 파일은 20MB까지 가져올 수 있어요.");
  const cal = calendarComponent(text, 20 * 1024 * 1024),
    groups = new Map<string, ICAL.Component[]>();
  for (const e of cal.getAllSubcomponents("vevent")) {
    const uid = String(e.getFirstPropertyValue("uid") || "");
    if (!uid) throw new Error("UID가 없는 일정이 있어요.");
    const list = groups.get(uid) || [];
    list.push(e);
    groups.set(uid, list);
  }
  if (!groups.size || groups.size > 10000)
    throw new Error("1개부터 10,000개까지의 일정을 가져올 수 있어요.");
  return [...groups.values()].map((events) => {
    const result = new ICAL.Component(["vcalendar", [], []]);
    result.updatePropertyWithValue("version", "2.0");
    result.updatePropertyWithValue("prodid", "-//3chan//Calendar//KO");
    for (const zone of cal.getAllSubcomponents("vtimezone"))
      result.addSubcomponent(new ICAL.Component(zone.toJSON()));
    for (const e of events) result.addSubcomponent(new ICAL.Component(e.toJSON()));
    const data = result.toString();
    validateEvent(data);
    return data;
  });
}
export function exportEvents(events: string[]) {
  const result = new ICAL.Component(["vcalendar", [], []]),
    zones = new Set<string>();
  result.updatePropertyWithValue("version", "2.0");
  result.updatePropertyWithValue("prodid", "-//3chan//Calendar//KO");
  for (const text of events) {
    const cal = calendarComponent(text);
    for (const c of cal.getAllSubcomponents()) {
      if (c.name === "vtimezone") {
        const id = String(c.getFirstPropertyValue("tzid"));
        if (zones.has(id)) continue;
        zones.add(id);
      }
      result.addSubcomponent(new ICAL.Component(c.toJSON()));
    }
  }
  return result.toString();
}
