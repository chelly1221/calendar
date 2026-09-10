import { DOMParser } from "@xmldom/xmldom";
import { validateEvent } from "../src/lib/ical";
import type { Calendar } from "../src/lib/database";
export const PRINCIPAL = "/calendar/";
export const validId = (id: string) =>
  id.length > 0 &&
  id.length <= 255 &&
  id !== "." &&
  id !== ".." &&
  !/[\/\\\u0000-\u001f\u007f]/.test(id);
export const validCalendarId = (id: string) => /^[a-zA-Z0-9_-]{1,80}$/.test(id);
export const validEtag = (v: unknown): v is string =>
  typeof v === "string" && /^"[^"\r\n]{1,200}"$/.test(v);
export class DavError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
const xmlEscape = (s: string) =>
  s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
const bookPath = (id: string) => PRINCIPAL + encodeURIComponent(id) + "/";
function parseXml(text: string) {
  if (text.length > 12 * 1024 * 1024 || /<!DOCTYPE|<!ENTITY/i.test(text))
    throw new DavError(502, "Invalid DAV XML");
  let invalid = false;
  const doc = new DOMParser({
    onError: () => {
      invalid = true;
    },
  }).parseFromString(text, "text/xml");
  if (invalid || doc.documentElement?.localName !== "multistatus")
    throw new DavError(502, "Incomplete DAV XML");
  return doc;
}
export class CalDAV {
  private ready?: Promise<void>;
  constructor(public origin: string) {}
  request(
    path: string,
    method: string,
    body?: string | Buffer,
    headers: Record<string, string> = {},
  ) {
    return fetch(this.origin + path, {
      method,
      body: Buffer.isBuffer(body) ? new Uint8Array(body) : body,
      redirect: "manual",
      signal: AbortSignal.timeout(30000),
      headers: { "x-remote-user": "calendar", ...headers },
    });
  }
  async ensure() {
    this.ready ??= (async () => {
      const p = await this.request(PRINCIPAL, "MKCOL");
      if (![201, 405].includes(p.status)) throw new DavError(503, "Principal unavailable");
      await this.createCalendar("default", "내 달력", "#b59ae8");
    })().catch((e) => {
      this.ready = undefined;
      throw e;
    });
    return this.ready;
  }
  async createCalendar(id: string, name: string, color: string) {
    const r = await this.request(
      bookPath(id),
      "MKCALENDAR",
      `<c:mkcalendar xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:d="DAV:" xmlns:a="http://apple.com/ns/ical/"><d:set><d:prop><d:displayname>${xmlEscape(name)}</d:displayname><a:calendar-color>${xmlEscape(color)}</a:calendar-color><c:supported-calendar-component-set><c:comp name="VEVENT"/></c:supported-calendar-component-set></d:prop></d:set></c:mkcalendar>`,
      { "content-type": "application/xml" },
    );
    if(r.status===201)return;
    // MKCALENDAR returns 409 resource-must-be-null for an existing calendar.
    // Confirm its resource type before treating a conflict as an idempotent retry.
    if([405,409].includes(r.status)){
      const existing=await this.request(bookPath(id),'PROPFIND','<d:propfind xmlns:d="DAV:"><d:prop><d:resourcetype/></d:prop></d:propfind>',{depth:'0','content-type':'application/xml'});
      if(existing.status===207){
        const doc=parseXml(await existing.text());
        const item=Array.from(doc.getElementsByTagNameNS('DAV:','response')).find(entry=>{
          const href=entry.getElementsByTagNameNS('DAV:','href')[0]?.textContent;
          return href && new URL(href,this.origin).pathname===bookPath(id);
        });
        if(item?.getElementsByTagNameNS('urn:ietf:params:xml:ns:caldav','calendar').length && item.getElementsByTagNameNS('DAV:','status')[0]?.textContent?.includes(' 200 '))return;
      }
    }
    throw new DavError(503, "Cannot create or confirm calendar");
  }
  async calendars(): Promise<Calendar[]> {
    await this.ensure();
    const r = await this.request(
      PRINCIPAL,
      "PROPFIND",
      '<d:propfind xmlns:d="DAV:" xmlns:a="http://apple.com/ns/ical/"><d:prop><d:resourcetype/><d:displayname/><a:calendar-color/></d:prop></d:propfind>',
      { depth: "1", "content-type": "application/xml" },
    );
    if (r.status !== 207) throw new DavError(503, "Calendar list unavailable");
    const doc = parseXml(await r.text()),
      calendars: Calendar[] = [];
    for (const e of Array.from(doc.getElementsByTagNameNS("DAV:", "response"))) {
      if (!e.getElementsByTagNameNS("urn:ietf:params:xml:ns:caldav", "calendar").length) continue;
      const href = e.getElementsByTagNameNS("DAV:", "href")[0]?.textContent;
      if (!href) throw new DavError(502, "Missing calendar href");
      const pathname = new URL(href, this.origin).pathname;
      if (!pathname.startsWith(PRINCIPAL) || !pathname.endsWith("/"))
        throw new DavError(502, "Unexpected calendar");
      const id = decodeURIComponent(pathname.slice(PRINCIPAL.length, -1));
      if (!validCalendarId(id)) throw new DavError(502, "Invalid calendar id");
      const color =
        e.getElementsByTagNameNS("http://apple.com/ns/ical/", "calendar-color")[0]?.textContent ||
        "#b59ae8";
      calendars.push({
        id,
        name: e.getElementsByTagNameNS("DAV:", "displayname")[0]?.textContent || id,
        color: /^#[a-f\d]{6}([a-f\d]{2})?$/i.test(color) ? color.slice(0, 7) : "#b59ae8",
      });
    }
    return calendars;
  }
  async list() {
    const result: { key: string; calendarId: string; id: string; etag: string }[] = [];
    for (const calendar of await this.calendars()) {
      const book = bookPath(calendar.id),
        r = await this.request(
          book,
          "PROPFIND",
          '<d:propfind xmlns:d="DAV:"><d:prop><d:getetag/><d:resourcetype/></d:prop></d:propfind>',
          { depth: "1", "content-type": "application/xml" },
        );
      if (r.status !== 207) throw new DavError(503, "Cannot list events");
      const doc = parseXml(await r.text());
      for (const e of Array.from(doc.getElementsByTagNameNS("DAV:", "response"))) {
        const href = e.getElementsByTagNameNS("DAV:", "href")[0]?.textContent;
        if (!href) throw new DavError(502, "Missing resource href");
        const pathname = new URL(href, this.origin).pathname;
        if (pathname === book) continue;
        if (!pathname.startsWith(book)) throw new DavError(502, "Unexpected resource");
        const id = decodeURIComponent(pathname.slice(book.length)),
          etag = e.getElementsByTagNameNS("DAV:", "getetag")[0]?.textContent,
          status = e.getElementsByTagNameNS("DAV:", "status")[0]?.textContent;
        if (!validId(id) || !validEtag(etag) || !status?.includes(" 200 "))
          throw new DavError(502, "Incomplete event manifest");
        result.push({ key: calendar.id + "/" + id, calendarId: calendar.id, id, etag });
      }
    }
    return result;
  }
  async get(calendarId: string, id: string) {
    const r = await this.request(bookPath(calendarId) + encodeURIComponent(id), "GET");
    if (r.status === 404) return null;
    if (!r.ok) throw new DavError(503, "Cannot read event");
    const ical = await r.text(),
      etag = r.headers.get("etag");
    if (Buffer.byteLength(ical) > 2 * 1024 * 1024 || !validEtag(etag))
      throw new DavError(502, "Invalid event");
    validateEvent(ical);
    return { key: calendarId + "/" + id, calendarId, id, ical, etag };
  }
  async put(calendarId: string, id: string, ical: string, etag: string | null) {
    await this.ensure();
    const r = await this.request(bookPath(calendarId) + encodeURIComponent(id), "PUT", ical, {
      "content-type": "text/calendar; charset=utf-8",
      ...(etag ? { "if-match": etag } : { "if-none-match": "*" }),
    });
    if ([409, 412].includes(r.status)) return "conflict" as const;
    if (![201, 204].includes(r.status))
      throw new DavError(r.status === 400 ? 400 : 503, "Cannot store event");
    const stored = await this.get(calendarId, id);
    if (!stored || (r.headers.get("etag") && r.headers.get("etag") !== stored.etag))
      return "conflict" as const;
    return stored;
  }
  async remove(calendarId: string, id: string, etag: string) {
    const r = await this.request(
      bookPath(calendarId) + encodeURIComponent(id),
      "DELETE",
      undefined,
      { "if-match": etag },
    );
    if (r.status === 412) return "conflict" as const;
    if (![200, 204, 404].includes(r.status)) throw new DavError(503, "Cannot delete event");
    return "ok" as const;
  }
}
