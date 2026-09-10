// Local development fixture. Vite removes this module from production builds.
import { db } from "./database";
import { writeEvent, emptyEvent, localDate } from "./ical";
export async function preparePreview() {
  if (await db.meta.get("preview-ready")) return;
  await db.calendars.bulkPut([
    { id: "default", name: "내 달력", color: "#b59ae8" },
    { id: "work", name: "업무", color: "#87b8d1" },
    { id: "personal", name: "개인", color: "#d9a887" },
  ]);
  const now = new Date(),
    prefix = localDate(new Date(now.getFullYear(), now.getMonth(), 1)).slice(0, 7);
  const fixtures = [
    ["default", 3, "병원 예약", "10:00", "11:00"],
    ["work", 7, "프로젝트 미팅", "14:00", "15:30"],
    ["default", 11, "함께하는 저녁", "18:30", "20:00"],
    ["personal", 12, "주말 여행", "09:00", "10:00"],
    ["work", 16, "디자인 리뷰", "11:00", "12:00"],
    ["personal", 19, "가족과 점심", "12:00", "14:00"],
    ["work", 23, "다음 달 계획", "10:00", "11:00"],
    ["default", 25, "책 반납", "18:00", "19:00"],
  ] as const;
  for (const [calendarId, day, title, start, end] of fixtures) {
    const date = prefix + "-" + String(day).padStart(2, "0"),
      id = `preview-${day}.ics`;
    const draft = {
      ...emptyEvent(),
      title,
      start: date + "T" + start,
      end: date + "T" + end,
      allDay: day === 12,
    };
    if (draft.allDay) {
      draft.start = date;
      draft.end = prefix + "-13";
    }
    await db.events.put({
      key: calendarId + "/" + id,
      id,
      calendarId,
      ical: writeEvent(draft),
      etag: null,
      dirty: false,
      deleted: false,
      version: 1,
      updatedAt: Date.now(),
    });
  }
  await db.meta.put({ key: "preview-ready", value: "true" });
}
