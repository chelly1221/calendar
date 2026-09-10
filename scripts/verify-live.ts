// Integration test through the host's real Tailscale connection. Only its own UUIDs are removed.
import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { CalendarDB, saveEvent, deleteEvent } from "../src/lib/database";
import { synchronize, type Remote, type RemoteEvent } from "../src/lib/sync-engine";
import { writeEvent, readEvent, emptyEvent } from "../src/lib/ical";
const origin = "https://audax-vm.tail62313c.ts.net:8445";
const request = async (path: string, options: RequestInit = {}) =>
  fetch(origin + path, { ...options, signal: AbortSignal.timeout(45000) });
const path = (key: string) => "/api/events/" + key.split("/").map(encodeURIComponent).join("/");
const known = new Set<string>();
const remote: Remote = {
  async list() {
    const r = await request("/api/events");
    assert.equal(r.status, 200);
    return (await r.json()).filter((e: RemoteEvent) => known.has(e.key));
  },
  async get(key) {
    const r = await request(path(key));
    if (r.status === 404) return null;
    assert.equal(r.status, 200);
    return r.json();
  },
  async put(key, ical, etag) {
    known.add(key);
    const r = await request(path(key), {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ical, etag }),
    });
    if (r.status === 412) return "conflict";
    assert.equal(r.status, 200, await r.clone().text());
    return r.json();
  },
  async remove(key, etag) {
    assert(known.has(key));
    const r = await request(path(key) + "/delete", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ etag }),
    });
    if (r.status === 412) return "conflict";
    assert.equal(r.status, 200);
    return "ok";
  },
};
const a = new CalendarDB("live-a-" + crypto.randomUUID()),
  b = new CalendarDB("live-b-" + crypto.randomUUID());
const fixture = (title: string, uid = crypto.randomUUID()) =>
  writeEvent({
    ...emptyEvent(),
    uid,
    title,
    start: "2026-09-11T09:00",
    end: "2026-09-11T10:00",
    recurrence: "FREQ=WEEKLY;COUNT=3",
  });
try {
  assert.equal((await request("/api/identity")).status, 200);
  assert.equal((await fetch("https://calendar.3chan.kr/api/events")).status, 404);
  const key = await saveEvent(fixture("달력 연결 검증용"), "default", undefined, a);
  known.add(key);
  await synchronize(a, remote);
  await synchronize(b, remote);
  assert.equal(await b.events.count(), 1);
  const received = (await b.events.get(key))!;
  assert.equal(readEvent(received.ical).title, "달력 연결 검증용");
  const roundtrip = await request("/dav/calendar/default/" + encodeURIComponent(received.id));
  assert.equal(roundtrip.status, 200);
  assert((await roundtrip.text()).includes("RRULE:FREQ=WEEKLY;COUNT=3"));
  const davList = await request("/dav/calendar/default/", {
    method: "PROPFIND",
    headers: { depth: "1", "content-type": "application/xml" },
    body: '<d:propfind xmlns:d="DAV:"><d:prop><d:getetag/></d:prop></d:propfind>',
  });
  assert.equal(davList.status, 207);
  assert((await davList.text()).includes(received.id));
  const uid = readEvent(received.ical).uid;
  if (process.argv.includes("--backup"))
    execFileSync(
      "ssh",
      [
        "3chan@100.89.61.28",
        `cd /srv/caldav && sudo -n systemctl start calendar-backup.service && sudo -n python3 scripts/verify-backup.py ${uid}`,
      ],
      { stdio: "inherit" },
    );
  await saveEvent(fixture("기기 A 검증", uid), "default", key, a);
  await saveEvent(fixture("기기 B 검증", uid), "default", key, b);
  await synchronize(a, remote);
  const result = await synchronize(b, remote);
  assert.equal(result.conflicts, 1);
  await synchronize(b, remote);
  assert.equal((await remote.list()).length, 2);
  // All generated collision keys are recorded by remote.put before transmission.
  for (const row of await b.events.toArray()) known.add(row.key);
  for (const row of await b.events.toArray()) await deleteEvent(row.key, b);
  await synchronize(b, remote);
  assert.equal((await remote.list()).length, 0);
  console.log(
    "PASS: Tailscale identity, private API isolation, live CalDAV PROPFIND/GET, two-device create/read/update, conflict-copy preservation, and deletion.",
  );
} finally {
  for (const key of known) {
    const item = await remote.get(key);
    if (item) await remote.remove(key, item.etag);
  }
  await a.delete();
  await b.delete();
}
