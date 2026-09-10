import { db, type Calendar } from "./database";
import { synchronize, type Remote } from "./sync-engine";
import { tailscaleFetch, getTailscaleSnapshot } from "./tailscale";
export const ORIGIN = "https://audax-vm.tail62313c.ts.net:8445";
type Status = {
  busy: boolean;
  message: string;
  lastSync: number;
  error: boolean;
  conflicts: number;
};
let state: Status = { busy: false, message: "연결 대기", lastSync: 0, error: false, conflicts: 0 };
const listeners = new Set<() => void>();
export const subscribeSync = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};
export const getSync = () => state;
function publish(patch: Partial<Status>) {
  state = { ...state, ...patch };
  for (const fn of listeners) fn();
}
export async function api(path: string, options: RequestInit = {}) {
  const r = await tailscaleFetch(ORIGIN + path, options);
  if (r.status === 401 || r.status === 403)
    throw new Error("이 계정은 달력 서버에 접근할 수 없어요. 로그인 계정을 확인해 주세요.");
  if (!r.ok && ![404, 412].includes(r.status))
    throw new Error("서버와 연결하지 못했어요. 변경한 일정은 이 기기에 보관돼요.");
  return r;
}
export async function identity(): Promise<{ login: string; name: string }> {
  const r = await api("/api/identity");
  if (!r.ok) throw new Error("서버 인증을 확인할 수 없어요.");
  return r.json();
}
const eventPath = (key: string) =>
  "/api/events/" + key.split("/").map(encodeURIComponent).join("/");
const remote: Remote = {
  async list() {
    const r = await api("/api/events");
    if (!r.ok) throw new Error("일정 목록을 읽지 못했어요.");
    return r.json();
  },
  async get(key) {
    const r = await api(eventPath(key));
    if (r.status === 404) return null;
    if (!r.ok) throw new Error("일정을 읽지 못했어요.");
    return r.json();
  },
  async put(key, ical, etag) {
    const r = await api(eventPath(key), {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ical, etag }),
    });
    if (r.status === 412) return "conflict";
    if (!r.ok) throw new Error("일정을 저장하지 못했어요.");
    return r.json();
  },
  async remove(key, etag) {
    const r = await api(eventPath(key) + "/delete", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ etag }),
    });
    if (r.status === 412) return "conflict";
    if (!r.ok) throw new Error("서버에서 삭제를 확인하지 못했어요. 다시 시도해 주세요.");
    return "ok";
  },
};
let running: Promise<void> | undefined;
export async function refreshCalendars() {
  const r = await api("/api/calendars");
  if (!r.ok) throw new Error("캘린더 목록을 읽지 못했어요.");
  const calendars: Calendar[] = await r.json();
  await db.transaction("rw", db.calendars, async () => {
    for (const c of calendars) {
      const old = await db.calendars.get(c.id);
      await db.calendars.put({ ...c, hidden: old?.hidden });
    }
  });
}
export async function createCalendar(name: string, color: string) {
  const id = crypto.randomUUID();
  const r = await api("/api/calendars/" + id, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, color }),
  });
  if (!r.ok) throw new Error("캘린더를 만들지 못했어요.");
  await refreshCalendars();
  return id;
}
export function syncNow() {
  if (running) return running;
  if (getTailscaleSnapshot().state !== "Running") {
    publish({ message: "기기에 저장됨 · 연결되면 동기화", error: false });
    return Promise.resolve();
  }
  running = (async () => {
    publish({ busy: true, error: false, message: "일정 동기화 중" });
    try {
      const result = await navigator.locks.request("calendar-sync", async () => {
        await refreshCalendars();
        const first = await synchronize(db, remote);
        if (first.conflicts) {
          const second = await synchronize(db, remote);
          return { ...second, conflicts: first.conflicts + second.conflicts };
        }
        return first;
      });
      const lastSync = Date.now();
      await db.meta.put({ key: "lastSync", value: String(lastSync) });
      publish({
        lastSync,
        conflicts: state.conflicts + result.conflicts,
        message: result.conflicts
          ? "동시 수정한 일정을 충돌 사본으로 보존했어요."
          : result.pending
            ? "남은 일정 동기화 대기"
            : "모든 일정 동기화됨",
      });
    } catch (e) {
      publish({ error: true, message: e instanceof Error ? e.message : "연결을 확인해 주세요." });
    } finally {
      publish({ busy: false });
      running = undefined;
    }
  })();
  return running;
}
