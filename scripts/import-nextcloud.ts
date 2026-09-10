// One-time, resumable migration. Source exports and reports contain private data.
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import ICAL from "ical.js";
import { z } from "zod";
import { validateEvent, readEvent } from "../src/lib/ical";

const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");
const schema = z.object({
  format: z.literal("calendar-nextcloud-export-v1"),
  user: z.string().min(1), exportedAt: z.string(),
  calendars: z.array(z.object({
    sourceId: z.string().min(1), uri: z.string().min(1),
    name: z.string().trim().min(1).max(80),
    color: z.string().regex(/^#[\da-f]{6}([\da-f]{2})?$/i),
    description: z.string(), timezone: z.string(), syncToken: z.string(),
    objects: z.array(z.object({
      uri: z.string().min(1), component: z.literal("vevent"),
      etag: z.string(), ical: z.string(), sha256: z.string().regex(/^[a-f\d]{64}$/),
    }).strict()),
  }).strict()),
}).strict();

// Compare all calendar properties, alarms, exceptions and VTIMEZONE definitions.
// DAV serializers may reorder properties and fold lines without changing data.
export function canonicalCalendar(text: string): string {
  const sortObject = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(sortObject);
    if (v && typeof v === "object")
      return Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))
        .map(([k, value]) => [k, sortObject(value)]));
    return v;
  };
  const sorted = (values: unknown[]) => values.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  const component = (c: ICAL.Component): unknown => [c.name,
    sorted(c.getAllProperties().map(p => {
      const property = structuredClone(p.toJSON());
      // vobject adds this internal marker to floating times. The date value and
      // absence of TZID/Z already represent that meaning; retain every other parameter.
      if (["date", "date-time"].includes(property[2]) && property[1]["x-vobj-floatingtime-allowed"] === "TRUE")
        delete property[1]["x-vobj-floatingtime-allowed"];
      return sortObject(property);
    })),
    sorted(c.getAllSubcomponents().map(component))];
  return JSON.stringify(component(new ICAL.Component(ICAL.parse(text))));
}

export function planImport(input: unknown) {
  const source = schema.parse(input);
  const seenCalendars = new Set<string>();
  const calendars = source.calendars.map(c => {
    const id = "nextcloud-" + sha256(JSON.stringify([source.user, c.sourceId, c.uri])).slice(0, 24);
    if (seenCalendars.has(id)) throw new Error("Duplicate source calendar");
    seenCalendars.add(id);
    const uris = new Set<string>(), uids = new Set<string>();
    const events = c.objects.map(o => {
      if (sha256(o.ical) !== o.sha256) throw new Error("Source checksum mismatch");
      validateEvent(o.ical);
      const uid = readEvent(o.ical).uid;
      if (uris.has(o.uri) || uids.has(uid)) throw new Error("Duplicate URI or UID in source calendar");
      uris.add(o.uri); uids.add(uid);
      const resourceId = "nextcloud-" + sha256(o.uri).slice(0, 32) + ".ics";
      return { id: resourceId, key: id + "/" + resourceId, ical: o.ical,
        sourceUri: o.uri, sourceSha256: o.sha256, canonical: canonicalCalendar(o.ical) };
    });
    return { id, name: c.name, color: c.color.slice(0, 7), events };
  });
  return { source, calendars };
}

export async function migrate(input: unknown, origin: string, apply: boolean) {
  const plan = planImport(input); // Validate the entire export before any writes.
  const request = async (path: string, init: RequestInit = {}) => {
    const r = await fetch(origin + path, { ...init, redirect: "error", signal: AbortSignal.timeout(45000) });
    if (!r.ok) throw new Error(`Calendar API ${init.method ?? "GET"} failed (${r.status})`);
    return r.json();
  };
  const path = (key: string) => "/api/events/" + key.split("/").map(encodeURIComponent).join("/");
  const existing: { id: string; name: string; color: string }[] = await request("/api/calendars");
  const manifest: { key: string; etag: string }[] = await request("/api/events");
  const keys = new Set(manifest.map(e => e.key));
  const verify = (event: { canonical: string }, stored: { ical: string }) => {
    validateEvent(stored.ical);
    if (canonicalCalendar(stored.ical) !== event.canonical)
      throw new Error("Destination differs from source; no existing event will be overwritten");
  };
  // Check every existing target before creating anything. Unrelated calendars stay intact.
  for (const c of plan.calendars) {
    const old = existing.find(x => x.id === c.id);
    if (old && (old.name !== c.name || old.color.toLowerCase() !== c.color.toLowerCase()))
      throw new Error("Destination calendar metadata differs from source");
    if (!apply && !old) throw new Error("Destination calendar missing");
    for (const event of c.events) {
      if (keys.has(event.key)) verify(event, await request(path(event.key)));
      else if (!apply) throw new Error("Destination event missing");
    }
  }
  const report = { format: "calendar-nextcloud-import-v1", completedAt: "", created: 0, verified: 0,
    calendars: [] as { id: string; name: string; resources: number; events: { id: string; sourceUri: string; sourceSha256: string; storedSha256: string }[] }[] };
  for (const c of plan.calendars) {
    if (apply && !existing.some(x => x.id === c.id))
      await request("/api/calendars/" + c.id, { method: "PUT", headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: c.name, color: c.color }) });
    const records = [];
    for (const event of c.events) {
      if (apply && !keys.has(event.key)) {
        // If-None-Match:* via etag:null; never overwrite, even after a concurrent write.
        const stored = await request(path(event.key), { method: "PUT", headers: { "content-type": "application/json" },
          body: JSON.stringify({ ical: event.ical, etag: null }) });
        verify(event, stored); report.created++;
      }
      const stored = await request(path(event.key));
      verify(event, stored); report.verified++;
      records.push({ id: event.id, sourceUri: event.sourceUri, sourceSha256: event.sourceSha256, storedSha256: sha256(stored.ical) });
    }
    report.calendars.push({ id: c.id, name: c.name, resources: records.length, events: records });
    console.log(`${c.name}: ${records.length} verified`);
  }
  const finalCalendars = await request("/api/calendars");
  const finalManifest = await request("/api/events");
  for (const c of plan.calendars) {
    const stored = finalCalendars.find((x: { id: string }) => x.id === c.id);
    if (!stored || stored.name !== c.name || stored.color.toLowerCase() !== c.color.toLowerCase())
      throw new Error("Final calendar metadata mismatch");
    if (finalManifest.filter((e: { calendarId: string }) => e.calendarId === c.id).length !== c.events.length)
      throw new Error("Final destination count changed; inspect concurrent edits");
  }
  report.completedAt = new Date().toISOString();
  return report;
}

async function main() {
  const [file, mode] = process.argv.slice(2);
  if (!file || !["--check", "--apply", "--verify"].includes(mode))
    throw new Error("Usage: npx tsx scripts/import-nextcloud.ts PRIVATE_EXPORT.json --check|--apply|--verify");
  const raw = await fs.readFile(file, "utf8"), input = JSON.parse(raw);
  const plan = planImport(input);
  if (mode === "--check") {
    console.log(JSON.stringify(plan.calendars.map(c => ({ name: c.name, resources: c.events.length })), null, 2));
    return;
  }
  const report = await migrate(input, "https://audax-vm.tail62313c.ts.net:8445", mode === "--apply");
  await fs.writeFile(file + ".import-report.json", JSON.stringify({ ...report, sourceSha256: sha256(raw) }, null, 2) + "\n", { mode: 0o600 });
  console.log(JSON.stringify({ created: report.created, verified: report.verified, calendars: report.calendars.length }));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch(e => { console.error(e instanceof Error ? e.message : "Import failed"); process.exitCode = 1; });
