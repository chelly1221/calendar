import { zipSync, strToU8 } from "fflate";
import { exportEvents } from "./ical";
import type { EventRecord, Calendar } from "./database";
export function calendarArchive(records: EventRecord[], calendars: Calendar[]) {
  const files: Record<string, Uint8Array> = {};
  const ids = new Set([
    ...calendars.map((c) => c.id),
    ...records.filter((e) => !e.deleted).map((e) => e.calendarId),
  ]);
  const index: { id: string; name: string; color: string; file: string }[] = [];
  for (const id of ids) {
    const calendar = calendars.find((c) => c.id === id) ?? { id, name: id, color: "#b59ae8" };
    const name = calendar.name.replace(/[^\p{L}\p{N} _-]/gu, "_").slice(0, 60) || "달력";
    const file = `${name}-${id}.ics`;
    files[file] = strToU8(
      exportEvents(records.filter((e) => !e.deleted && e.calendarId === id).map((e) => e.ical)),
    );
    index.push({ ...calendar, file });
  }
  files["calendars.json"] = strToU8(JSON.stringify(index, null, 2));
  files["읽어주세요.txt"] = strToU8(
    "캘린더마다 별도 ICS 파일입니다. 압축을 풀고 달력의 설정에서 대상 캘린더를 선택하여 가져오세요. calendars.json에 이름과 색상이 기록되어 있습니다. Tailscale 연결 정보는 포함하지 않습니다.",
  );
  return zipSync(files, { level: 6 });
}
