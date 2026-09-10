import { describe, it, expect } from "vitest";
import { createApp } from "../server/app";
import { CalDAV } from "../server/caldav";
const headers = { "tailscale-user-login": "owner@example.com" };
class FakeDav extends CalDAV {
  constructor() {
    super("http://unused");
  }
  async ensure() {}
  async calendars() {
    return [{ id: "default", name: "내 달력", color: "#b59ae8" }];
  }
  async list() {
    return [];
  }
}
describe("private API boundaries", () => {
  it("requires the exact allowed identity for data", async () => {
    const app = createApp(
      { allowedLogins: ["owner@example.com"], davOrigin: "http://unused" },
      new FakeDav(),
    );
    expect((await app.inject("/api/events")).statusCode).toBe(403);
    expect(
      (
        await app.inject({
          url: "/api/events",
          headers: { "tailscale-user-login": "attacker@example.com" },
        })
      ).statusCode,
    ).toBe(403);
    expect((await app.inject({ url: "/api/events", headers })).statusCode).toBe(200);
    await app.close();
  });
  it("denies public cross-origin requests and keeps health non-sensitive", async () => {
    const app = createApp(
      { allowedLogins: ["owner@example.com"], davOrigin: "http://unused" },
      new FakeDav(),
    );
    expect(
      (
        await app.inject({
          url: "/api/events",
          headers: { ...headers, origin: "https://calendar.3chan.kr" },
        })
      ).statusCode,
    ).toBe(403);
    expect((await app.inject("/api/health")).json()).toEqual({ ok: true });
    await app.close();
  });
  it("rejects unconditional DAV writes, cross-principal paths and malformed ICS", async () => {
    const app = createApp(
      { allowedLogins: ["owner@example.com"], davOrigin: "http://unused" },
      new FakeDav(),
    );
    expect(
      (await app.inject({ method: "DELETE", url: "/dav/calendar/default/test.ics", headers }))
        .statusCode,
    ).toBe(428);
    expect((await app.inject({ method: "GET", url: "/dav/other/", headers })).statusCode).toBe(403);
    expect(
      (
        await app.inject({
          method: "PUT",
          url: "/api/events/default/test.ics",
          headers,
          payload: { ical: "bad", etag: null },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (await app.inject({ method: "DELETE", url: "/dav/calendar/default/", headers })).statusCode,
    ).toBe(403);
    await app.close();
  });
  it("fails closed without an allowlist", () => {
    expect(() => createApp({ allowedLogins: [], davOrigin: "http://unused" })).toThrow();
  });
});
