import { type CalendarDB, type EventRecord } from "./database";
import { conflictCopy, sameEvent, validateEvent } from "./ical";
export type RemoteEvent = Pick<EventRecord, "key" | "id" | "calendarId" | "ical"> & {
  etag: string;
};
export interface Remote {
  list(): Promise<Pick<RemoteEvent, "key" | "id" | "calendarId" | "etag">[]>;
  get(key: string): Promise<RemoteEvent | null>;
  put(key: string, ical: string, etag: string | null): Promise<RemoteEvent | "conflict">;
  remove(key: string, etag: string): Promise<"ok" | "conflict">;
}
export async function synchronize(database: CalendarDB, remote: Remote) {
  let conflicts = 0;
  for (const sent of await database.events.filter((e) => e.dirty).toArray()) {
    let result: RemoteEvent | "conflict" | "ok";
    if (sent.deleted) {
      if (!sent.etag) {
        await database.transaction("rw", database.events, async () => {
          const c = await database.events.get(sent.key);
          if (c?.deleted && c.version === sent.version) await database.events.delete(sent.key);
        });
        continue;
      }
      result = await remote.remove(sent.key, sent.etag);
    } else result = await remote.put(sent.key, sent.ical, sent.etag);
    if (result === "conflict") {
      const theirs = await remote.get(sent.key);
      if (theirs) validateEvent(theirs.ical);
      // A lost successful PUT response must not duplicate the event on retry.
      if (!sent.deleted && theirs && sameEvent(sent.ical, theirs.ical)) result = theirs;
      else {
        await database.transaction("rw", database.events, async () => {
          const current = await database.events.get(sent.key);
          if (!current) return;
          if (!current.deleted) {
            const id = crypto.randomUUID() + ".ics";
            await database.events.add({
              ...current,
              key: current.calendarId + "/" + id,
              id,
              ical: conflictCopy(current.ical),
              etag: null,
              dirty: true,
              deleted: false,
              version: 1,
              conflict: true,
            });
          }
          if (theirs)
            await database.events.put({
              ...current,
              ...theirs,
              dirty: false,
              deleted: false,
              version: current.version + 1,
              updatedAt: Date.now(),
              conflict: true,
            });
          else await database.events.delete(sent.key);
        });
        conflicts++;
        continue;
      }
    }
    await database.transaction("rw", database.events, async () => {
      const current = await database.events.get(sent.key);
      if (!current) return;
      if (result === "ok") {
        if (current.version === sent.version) await database.events.delete(sent.key);
        else await database.events.put({ ...current, etag: null });
      } else if (typeof result === "object") {
        validateEvent(result.ical);
        await database.events.put(
          current.version === sent.version
            ? { ...current, ical: result.ical, etag: result.etag, dirty: false }
            : { ...current, etag: result.etag },
        );
      }
    });
  }
  // Snapshot local versions before LIST so another tab cannot lose an in-flight edit.
  const before = new Map((await database.events.toArray()).map((e) => [e.key, e.version]));
  const manifest = await remote.list();
  if (
    !Array.isArray(manifest) ||
    manifest.some((e) => typeof e.key !== "string" || typeof e.etag !== "string") ||
    new Set(manifest.map((e) => e.key)).size !== manifest.length
  )
    throw new Error("서버 일정 목록을 확인하지 못했어요.");
  const keys = new Set(manifest.map((e) => e.key));
  for (const item of manifest) {
    const cached = await database.events.get(item.key);
    if (cached?.dirty || cached?.etag === item.etag) continue;
    const fresh = await remote.get(item.key);
    if (!fresh) continue;
    validateEvent(fresh.ical);
    await database.transaction("rw", database.events, async () => {
      const current = await database.events.get(item.key);
      if (!current?.dirty)
        await database.events.put({
          ...fresh,
          dirty: false,
          deleted: false,
          version: (current?.version ?? 0) + 1,
          updatedAt: Date.now(),
          conflict: current?.conflict,
        });
    });
  }
  await database.transaction("rw", database.events, async () => {
    for (const c of await database.events.toArray())
      if (!c.dirty && !keys.has(c.key) && before.get(c.key) === c.version)
        await database.events.delete(c.key);
  });
  return { conflicts, pending: await database.events.filter((e) => e.dirty).count() };
}
