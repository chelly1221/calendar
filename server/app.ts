import Fastify from "fastify";
import { z } from "zod";
import fs from "node:fs/promises";
import { CalDAV, DavError, validCalendarId, validId, validEtag } from "./caldav";
import { validateEvent } from "../src/lib/ical";
import { displayName } from "./identity";
export type Config = { allowedLogins: string[]; davOrigin: string; backupStatusPath?: string };
export function createApp(config: Config, dav = new CalDAV(config.davOrigin)) {
  if (!config.allowedLogins.length || config.allowedLogins.some((x) => !x.trim()))
    throw new Error("Tailscale allowlist required");
  const allowed = new Set(config.allowedLogins.map((x) => x.toLowerCase()));
  const app = Fastify({ logger: false, bodyLimit: 3 * 1024 * 1024, requestTimeout: 45000 });
  for (const method of ["PROPFIND", "REPORT", "MKCOL", "MKCALENDAR", "PROPPATCH"])
    app.addHttpMethod(method, { hasBody: true });
  app.addHook("onRequest", async (req, reply) => {
    reply.header("Cache-Control", "no-store").header("X-Content-Type-Options", "nosniff");
    if (req.url === "/api/health" && req.method === "GET") return;
    if (req.headers.origin && req.headers.origin !== "https://audax-vm.tail62313c.ts.net:8445")
      return reply.code(403).send({ error: "Origin denied" });
    const login = req.headers["tailscale-user-login"];
    if (typeof login !== "string" || !allowed.has(login.toLowerCase()))
      return reply.code(403).send({ error: "Tailscale identity required" });
  });
  app.setErrorHandler((e, _req, reply) => {
    const code =
      e instanceof DavError ? e.status : ((e as { statusCode?: number }).statusCode ?? 500);
    reply
      .code(code >= 400 && code < 600 ? code : 500)
      .send({ error: code >= 500 ? "서버 연결을 확인해 주세요." : "요청 내용을 확인해 주세요." });
  });
  app.get("/api/health", async (_req, reply) => {
    try {
      await dav.calendars();
      return { ok: true };
    } catch {
      return reply.code(503).send({ ok: false });
    }
  });
  app.get("/api/identity", async (req) => ({
    login: req.headers["tailscale-user-login"],
    name: displayName(req.headers["tailscale-user-name"]),
  }));
  app.get("/api/calendars", () => dav.calendars());
  app.put<{ Params: { calendar: string } }>("/api/calendars/:calendar", async (req, reply) => {
    const parsed = z
      .object({ name: z.string().trim().min(1).max(80), color: z.string().regex(/^#[a-f\d]{6}$/i) })
      .strict()
      .safeParse(req.body);
    if (!validCalendarId(req.params.calendar) || !parsed.success)
      return reply.code(400).send({ error: "Invalid calendar" });
    await dav.ensure();
    await dav.createCalendar(req.params.calendar, parsed.data.name, parsed.data.color);
    return { ok: true };
  });
  app.get("/api/events", () => dav.list());
  const valid = (p: { calendar: string; id: string }) =>
    validCalendarId(p.calendar) && validId(p.id);
  app.get<{ Params: { calendar: string; id: string } }>(
    "/api/events/:calendar/:id",
    async (req, reply) => {
      if (!valid(req.params)) return reply.code(400).send();
      return (await dav.get(req.params.calendar, req.params.id)) ?? reply.code(404).send();
    },
  );
  app.put<{ Params: { calendar: string; id: string } }>(
    "/api/events/:calendar/:id",
    async (req, reply) => {
      const parsed = z
        .object({
          etag: z.string().refine(validEtag).nullable(),
          ical: z.string().max(2 * 1024 * 1024),
        })
        .strict()
        .safeParse(req.body);
      if (!valid(req.params) || !parsed.success)
        return reply.code(400).send({ error: "Invalid event" });
      try {
        if (Buffer.byteLength(parsed.data.ical) > 2 * 1024 * 1024) throw new Error();
        validateEvent(parsed.data.ical);
      } catch {
        return reply.code(400).send({ error: "Invalid iCalendar" });
      }
      const result = await dav.put(
        req.params.calendar,
        req.params.id,
        parsed.data.ical,
        parsed.data.etag,
      );
      return result === "conflict" ? reply.code(412).send({ error: "Event changed" }) : result;
    },
  );
  app.post<{ Params: { calendar: string; id: string } }>(
    "/api/events/:calendar/:id/delete",
    async (req, reply) => {
      const parsed = z
        .object({ etag: z.string().refine(validEtag) })
        .strict()
        .safeParse(req.body);
      if (!valid(req.params) || !parsed.success) return reply.code(400).send();
      return (await dav.remove(req.params.calendar, req.params.id, parsed.data.etag)) === "conflict"
        ? reply.code(412).send()
        : { ok: true };
    },
  );
  app.get("/api/backup", async () => {
    try {
      return JSON.parse(
        await fs.readFile(config.backupStatusPath ?? "/status/backup.json", "utf8"),
      );
    } catch {
      return { ok: false, message: "아직 완료된 NAS 백업이 없어요." };
    }
  });
  app.all("/.well-known/caldav", async (_req, reply) => reply.redirect("/dav/", 301));
  app.addContentTypeParser(
    ["application/xml", "text/xml", "text/calendar", "application/octet-stream"],
    { parseAs: "buffer" },
    (_req, body, done) => done(null, body),
  );
  app.route({
    method: [
      "OPTIONS",
      "GET",
      "HEAD",
      "PROPFIND",
      "REPORT",
      "PUT",
      "DELETE",
      "MKCOL",
      "MKCALENDAR",
      "PROPPATCH",
    ],
    url: "/dav/*",
    handler: async (req, reply) => {
      const path = req.url.slice(4);
      let decoded: string;
      try {
        decoded = decodeURIComponent(path.split("?")[0]);
      } catch {
        return reply.code(400).send();
      }
      if (
        /[\\\u0000-\u001f\u007f]/.test(decoded) ||
        decoded.split("/").some((s) => s === "." || s === "..")
      )
        return reply.code(400).send();
      const parts = decoded.split("/").filter(Boolean);
      if (
        decoded !== "/" &&
        (parts[0] !== "calendar" ||
          parts.length > 3 ||
          (parts[1] && !validCalendarId(parts[1])) ||
          (parts[2] && !validId(parts[2])))
      )
        return reply.code(403).send();
      if (
        ["PUT", "DELETE", "MKCOL", "MKCALENDAR", "PROPPATCH"].includes(req.method) &&
        parts.length < 3
      )
        return reply.code(403).send({ error: "Manage calendars in the app" });
      if (req.method === "DELETE" && !validEtag(req.headers["if-match"]))
        return reply.code(428).send();
      if (
        req.method === "PUT" &&
        !validEtag(req.headers["if-match"]) &&
        req.headers["if-none-match"] !== "*"
      )
        return reply.code(428).send();
      if (req.method === "PUT") {
        try {
          validateEvent(Buffer.isBuffer(req.body) ? req.body.toString() : String(req.body));
        } catch {
          return reply.code(400).send();
        }
      }
      await dav.ensure();
      const headers: Record<string, string> = { "x-script-name": "/dav" };
      for (const key of ["content-type", "depth", "if-match", "if-none-match"])
        if (typeof req.headers[key] === "string") headers[key] = req.headers[key];
      const result = await dav.request(
        path,
        req.method,
        Buffer.isBuffer(req.body) ? req.body : typeof req.body === "string" ? req.body : undefined,
        headers,
      );
      for (const key of ["content-type", "etag", "dav", "allow", "location"]) {
        const value = result.headers.get(key);
        if (value) reply.header(key, value);
      }
      return reply.code(result.status).send(Buffer.from(await result.arrayBuffer()));
    },
  });
  return app;
}
