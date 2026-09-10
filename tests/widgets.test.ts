import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const bridge = vi.hoisted(() => ({
  publish: vi.fn(async (_: unknown) => {}), consumeAction: vi.fn(async (): Promise<{ action?: { date: string; action: "day" } }> => ({})),
  events: new Map<string, (value?: any) => void>(),
}));
vi.mock("@capacitor/core", () => ({
  Capacitor: { getPlatform: () => "android" },
  registerPlugin: () => ({ ...bridge, addListener: async (name: string, cb: () => void) => {
    bridge.events.set(name, cb); return { remove: async () => { bridge.events.delete(name); } };
  } }),
}));
vi.mock("@capacitor/app", () => ({ App: { addListener: async (name: string, cb: () => void) => {
  bridge.events.set(name, cb); return { remove: async () => { bridge.events.delete(name); } };
} } }));
import { db, defaultCalendar, saveEvent, deleteEvent } from "../src/lib/database";
import { startWidgetBridge } from "../src/lib/widgets";
const ical = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:widget-test\r\nDTSTAMP:20260911T000000Z\r\nDTSTART;VALUE=DATE:20260911\r\nDTEND;VALUE=DATE:20260912\r\nSUMMARY:위젯 연결 검증\r\nEND:VEVENT\r\nEND:VCALENDAR";
let stop: (() => void) | undefined;
beforeEach(async () => {
  vi.stubGlobal("window", new EventTarget()); bridge.publish.mockClear(); bridge.consumeAction.mockReset().mockResolvedValue({});
  await db.events.clear(); await db.calendars.clear(); await db.meta.clear(); await db.calendars.put(defaultCalendar);
});
afterEach(async () => { stop?.(); stop = undefined; await Promise.resolve(); vi.unstubAllGlobals(); });
describe("widget database and lifecycle bridge", () => {
  it("publishes local edits and deletions without waiting for server sync", async () => {
    stop = startWidgetBridge(() => {});
    const key = await saveEvent(ical, "default");
    await expect.poll(() => (bridge.publish.mock.lastCall?.[0] as any)?.snapshot.events.length, { timeout: 4000 }).toBe(1);
    expect((bridge.publish.mock.lastCall?.[0] as any).snapshot.pending).toBe(1);
    await deleteEvent(key);
    await expect.poll(() => (bridge.publish.mock.lastCall?.[0] as any)?.snapshot.events.length, { timeout: 4000 }).toBe(0);
  });
  it("consumes pending date actions and refreshes on resume", async () => {
    const action = { date: "2026-09-11", action: "day" as const };
    bridge.consumeAction.mockResolvedValueOnce({ action }); const receive = vi.fn();
    stop = startWidgetBridge(receive);
    await expect.poll(() => receive.mock.calls.length).toBe(1); expect(receive).toHaveBeenCalledWith(action);
    await expect.poll(() => bridge.publish.mock.calls.length, { timeout: 4000 }).toBe(1);
    bridge.events.get("appStateChange")?.({ isActive: true });
    await expect.poll(() => bridge.publish.mock.calls.length, { timeout: 4000 }).toBe(2);
    stop(); stop = undefined; await Promise.resolve(); expect(bridge.events.size).toBe(0);
  });
});
