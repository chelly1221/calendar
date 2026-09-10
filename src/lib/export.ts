import { Capacitor } from "@capacitor/core";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { localDate } from "./ical";
import { calendarArchive } from "./archive";
import type { EventRecord, Calendar } from "./database";
export async function exportICS(events: EventRecord[], calendars: Calendar[]) {
  const data = calendarArchive(events, calendars),
    filename = `달력-${localDate(new Date())}.zip`;
  if (Capacitor.isNativePlatform()) {
    const file = await Filesystem.writeFile({
      path: "exports/" + filename,
      data: btoa(Array.from(data, (b) => String.fromCharCode(b)).join("")),
      directory: Directory.Cache,
      recursive: true,
    });
    await Share.share({ title: "달력 내보내기", url: file.uri, dialogTitle: "달력 ZIP 파일 저장" });
    return;
  }
  const url = URL.createObjectURL(new Blob([new Uint8Array(data)], { type: "application/zip" })),
    a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
