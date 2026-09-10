import "fake-indexeddb/auto";
import { describe, it, expect, afterEach } from "vitest";
import { CalendarDB, saveEvent, deleteEvent, addEvents } from "../src/lib/database";
import { synchronize, type Remote, type RemoteEvent } from "../src/lib/sync-engine";
import { writeEvent, readEvent, emptyEvent } from "../src/lib/ical";
const databases: CalendarDB[] = [];
const database = () => {
  const d = new CalendarDB("test-" + crypto.randomUUID());
  databases.push(d);
  return d;
};
afterEach(async () => {
  for (const d of databases.splice(0)) await d.delete();
});
const event = (title = "회의") =>
  writeEvent({
    ...emptyEvent(),
    uid: "test-uid",
    title,
    start: "2026-09-11T09:00",
    end: "2026-09-11T10:00",
  });
function server() {
  const data = new Map<string, RemoteEvent>();
  let version = 0;
  const remote: Remote = {
    async list() {
      return [...data.values()];
    },
    async get(key) {
      return data.get(key) ?? null;
    },
    async put(key, ical, etag) {
      const current = data.get(key);
      if (current ? current.etag !== etag : etag !== null) return "conflict";
      const [calendarId, id] = key.split("/"),
        e = { key, id, calendarId, ical, etag: `"${++version}"` };
      data.set(key, e);
      return e;
    },
    async remove(key, etag) {
      const c = data.get(key);
      if (c && c.etag !== etag) return "conflict";
      data.delete(key);
      return "ok";
    },
  };
  return { remote, data };
}
describe("durable offline CalDAV sync", () => {
  it("uploads offline creation and deletion and downloads across devices", async () => {
    const a = database(),
      b = database(),
      { remote, data } = server();
    const key = await saveEvent(event(), "default", undefined, a);
    await synchronize(a, remote);
    await synchronize(b, remote);
    expect(await b.events.count()).toBe(1);
    await deleteEvent(key, a);
    await synchronize(a, remote);
    await synchronize(b, remote);
    expect(data.size).toBe(0);
    expect(await b.events.count()).toBe(0);
  });
  it("preserves both devices when they edit the same ETag", async () => {
    const a = database(),
      b = database(),
      { remote, data } = server();
    const key = await saveEvent(event(), "default", undefined, a);
    await synchronize(a, remote);
    await synchronize(b, remote);
    await saveEvent(event("기기 A"), "default", key, a);
    await saveEvent(event("기기 B"), "default", key, b);
    await synchronize(a, remote);
    const result = await synchronize(b, remote);
    expect(result.conflicts).toBe(1);
    await synchronize(b, remote);
    expect(data.size).toBe(2);
    expect([...data.values()].map((e) => readEvent(e.ical).title).sort()).toEqual([
      "기기 A",
      "기기 B (충돌 사본)",
    ]);
  });
  it("does not acknowledge edits made while upload is in flight", async () => {
    const a = database(),
      { remote } = server();
    const key = await saveEvent(event(), "default", undefined, a);
    const original = remote.put;
    remote.put = async (k, ical, etag) => {
      await saveEvent(event("편집 계속"), "default", key, a);
      return original(k, ical, etag);
    };
    await synchronize(a, remote);
    const stored = await a.events.get(key);
    expect(stored?.dirty).toBe(true);
    expect(readEvent(stored!.ical).title).toBe("편집 계속");
  });
  it("recognizes a successful upload after its response was lost", async () => {
    const a = database(),
      { remote, data } = server();
    await saveEvent(event(), "default", undefined, a);
    const original = remote.put;
    let once = true;
    remote.put = async (...args) => {
      const r = await original(...args);
      if (once) {
        once = false;
        throw new Error("connection lost");
      }
      return r;
    };
    await expect(synchronize(a, remote)).rejects.toThrow();
    await synchronize(a, remote);
    expect(data.size).toBe(1);
    expect((await a.events.toArray())[0].dirty).toBe(false);
  });
  it("preserves remote edits instead of applying a stale delete", async () => {
    const a = database(),
      { remote } = server();
    const key = await saveEvent(event(), "default", undefined, a);
    await synchronize(a, remote);
    const previous = await remote.get(key);
    await deleteEvent(key, a);
    await remote.put(key, event("서버에서 수정"), previous!.etag);
    await synchronize(a, remote);
    expect(readEvent((await a.events.get(key))!.ical).title).toBe("서버에서 수정");
    expect((await a.events.get(key))!.deleted).toBe(false);
  });
  it("does not prune any local rows after an invalid manifest", async () => {
    const a = database(),
      { remote } = server();
    await saveEvent(event(), "default", undefined, a);
    await synchronize(a, remote);
    remote.list = async () => {
      throw new Error("truncated XML");
    };
    await expect(synchronize(a, remote)).rejects.toThrow();
    expect(await a.events.count()).toBe(1);
  });
  it("retains offline changes during network failures", async () => {
    const a = database(),
      { remote } = server();
    await saveEvent(event(), "default", undefined, a);
    remote.put = async () => {
      throw new Error("offline");
    };
    await expect(synchronize(a, remote)).rejects.toThrow();
    expect((await a.events.toArray())[0].dirty).toBe(true);
  });
  it("skips duplicate UID imports within each calendar without replacing originals", async () => {
    const a = database();
    expect(await addEvents([event()], "default", a)).toEqual({ added: 1, skipped: 0 });
    expect(await addEvents([event("duplicate")], "default", a)).toEqual({ added: 0, skipped: 1 });
    expect(await addEvents([event()], "work", a)).toEqual({ added: 1, skipped: 0 });
  });
});
