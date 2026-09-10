import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import { App } from "@capacitor/app";
import { liveQuery } from "dexie";
import { db } from "./database";
import { buildWidgetData } from "./widget-data";

export type WidgetAction = { date: string; action: "day" | "new" | "sync" };
const native = registerPlugin<{
  publish(options: { snapshot: ReturnType<typeof buildWidgetData> }): Promise<void>;
  configure(options: { widgetId?: number }): Promise<void>;
  list(): Promise<{ supported: boolean; widgets: { id: number; name: string }[] }>;
  consumeAction(): Promise<{ action?: WidgetAction }>;
  addListener(event: "openDate", listener: () => void): Promise<PluginListenerHandle>;
}>("CalendarWidgets");
export const configureWidget = (widgetId?: number) => native.configure({ widgetId });
export const listWidgets = () => native.list();

export function startWidgetBridge(onAction: (action: WidgetAction) => void) {
  if (Capacitor.getPlatform() !== "android") return () => {};
  let stopped = false, dirty = false, running = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const publish = async () => {
    if (stopped || running) return;
    running = true;
    try {
      while (dirty && !stopped) {
        dirty = false;
        const data = await db.transaction("r", db.events, db.calendars, db.meta, async () => ({
          records: await db.events.toArray(), calendars: await db.calendars.toArray(),
          lastSync: Number((await db.meta.get("lastSync"))?.value || 0),
        }));
        await native.publish({ snapshot: buildWidgetData(data.records, data.calendars, data.lastSync) });
      }
    } catch {
      // Keep the previous complete native snapshot. Retry on the next app change/resume.
      window.dispatchEvent(new CustomEvent("calendar-widget-error"));
    } finally { running = false; }
  };
  const schedule = () => {
    dirty = true;
    clearTimeout(timer);
    timer = setTimeout(() => void publish(), 600);
  };
  const consume = async () => {
    try {
      const result = await native.consumeAction();
      if (!stopped && result.action) onAction(result.action);
    } catch { /* Resume retries actions if the bridge is temporarily unavailable. */ }
  };
  const subscription = liveQuery(async () => {
    await db.events.toArray(); await db.calendars.toArray(); await db.meta.get("lastSync");
  }).subscribe({ next: schedule, error: () => {} });
  const listener = native.addListener("openDate", () => void consume());
  const resume = App.addListener("appStateChange", ({ isActive }) => {
    if (isActive) { schedule(); void consume(); }
    else { clearTimeout(timer); void publish(); }
  });
  void consume();
  return () => {
    stopped = true; clearTimeout(timer); subscription.unsubscribe();
    void listener.then(l => l.remove()); void resume.then(l => l.remove());
  };
}
