import {
  useState,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type CSSProperties,
} from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Capacitor } from "@capacitor/core";
import { App as NativeApp } from "@capacitor/app";
import {
  Plus,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  Columns3,
  List,
  Search,
  Settings2,
  RefreshCw,
  CloudCheck,
  CloudOff,
  LockKeyhole,
  ArrowRight,
  Download,
  LoaderCircle,
  Check,
  Menu,
  X,
  Repeat2,
  MapPin,
  LogOut,
  Upload,
  ExternalLink,
} from "lucide-react";
import {
  db,
  initializeDatabase,
  defaultCalendar,
  type EventRecord,
  addEvents,
} from "./lib/database";
import { addDays, localDate, expandEvent, importEvents, type Occurrence } from "./lib/ical";
import {
  ensureTailscale,
  getTailscaleSnapshot,
  subscribeTailscale,
  logoutTailscale,
  subscribeTailEvents,
} from "./lib/tailscale";
import { identity, syncNow, getSync, subscribeSync, api, createCalendar } from "./lib/sync";
import { openAuthBrowser } from "./lib/auth-browser";
import { exportICS } from "./lib/export";
import Editor, { Modal } from "./Editor";
import WidgetSettings from "./WidgetSettings";
import { startWidgetBridge, type WidgetAction } from "./lib/widgets";
import { restoreLocalProfile } from "./lib/local-session";
import { resolveWidgetEvent } from "./lib/widget-action";

const preview = import.meta.env.DEV && new URLSearchParams(location.search).has("preview");
const DOWNLOAD = "https://calendar.3chan.kr/downloads/calendar-0.2.2.apk";
const weekday = ["일", "월", "화", "수", "목", "금", "토"];
const timeFormat = new Intl.DateTimeFormat("ko-KR", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
const dateLabel = (d: Date) =>
  d.toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "long" });
const sameDay = (a: Date, b: Date) => localDate(a) === localDate(b);
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const onDay = (e: Occurrence, d: Date) =>
  e.start < addDays(d, 1) && (e.end > d || (+e.start === +e.end && e.start >= d));
function Brand() {
  return (
    <div className="brand">
      <img src="/favicon.svg" alt="" width="39" height="39" />
      <span>달력</span>
    </div>
  );
}
function DownloadLink() {
  return !Capacitor.isNativePlatform() ? (
    <a className="download-link" href={DOWNLOAD}>
      <Download size={17} /> Android 앱 다운로드 <ExternalLink size={13} />
    </a>
  ) : null;
}
type Profile = { login: string; name: string };
type Backup = {
  ok: boolean;
  completedAt?: string;
  failedAt?: string;
  message?: string;
  archive?: string;
};
type EditorState = { record?: EventRecord; occurrence?: Occurrence };
export default function App() {
  const [widgetAction, setWidgetAction] = useState<WidgetAction | null>(null);
  const [booting, setBooting] = useState(!preview);
  const connectionAttempt = useRef(0);
  const tail = useSyncExternalStore(subscribeTailscale, getTailscaleSnapshot),
    sync = useSyncExternalStore(subscribeSync, getSync);
  const [ready, setReady] = useState(false),
    [profile, setProfile] = useState<Profile | null>(null),
    [cached, setCached] = useState(false),
    [connecting, setConnecting] = useState(false),
    [error, setError] = useState("");
  const [view, setView] = useState<"month" | "week" | "agenda">("month"),
    [selected, setSelected] = useState(startOfDay(new Date())),
    [anchor, setAnchor] = useState(startOfDay(new Date()));
  const [query, setQuery] = useState(""),
    [settings, setSettings] = useState(false),
    [sidebar, setSidebar] = useState(false),
    [editor, setEditor] = useState<EditorState | null>(null),
    [notice, setNotice] = useState("");
  const [calendarName, setCalendarName] = useState(""),
    [calendarColor, setCalendarColor] = useState("#b59ae8"),
    [adding, setAdding] = useState(false),
    [backup, setBackup] = useState<Backup | null>(null),
    [importTarget, setImportTarget] = useState("default"),
    [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null),
    connectingRef = useRef(false);
  const calendars = useLiveQuery(() => db.calendars.toArray(), []) ?? [defaultCalendar];
  const records = useLiveQuery(() => db.events.toArray(), []) ?? [];
  const pending = records.filter((e) => e.dirty).length;
  useEffect(() => startWidgetBridge(setWidgetAction), []);
  useEffect(() => {
    const failed = () => setNotice("위젯에 최신 일정을 반영하지 못했어요. 앱을 다시 실행해 주세요.");
    window.addEventListener("calendar-widget-error", failed);
    return () => window.removeEventListener("calendar-widget-error", failed);
  }, []);
  useEffect(() => {
    if (!ready || !widgetAction) return;
    const day = new Date(widgetAction.date + "T00:00:00");
    if (Number.isFinite(+day)) {
      setAnchor(day); setSelected(day); setView("month"); setQuery(""); setSettings(false);
      if (widgetAction.action === "new") setEditor({});
      else if (widgetAction.action === "day")
        setTimeout(() => document.querySelector(".day-panel")?.scrollIntoView({ block: "start" }), 100);
    }
    if (widgetAction.action === "sync") void syncNow();
    if (widgetAction.action === "event") {
      let active = true;
      setEditor(null);
      void resolveWidgetEvent(widgetAction).then(target => {
        if (!active) return;
        if (target) setEditor(target);
        else setNotice("일정이 변경되었거나 삭제됐어요. 달력에서 확인해 주세요.");
      }).catch(() => {
        if (active) setNotice("일정을 열지 못했어요. 달력에서 다시 선택해 주세요.");
      }).finally(() => { if (active) setWidgetAction(null); });
      return () => { active = false; };
    }
    setWidgetAction(null);
  }, [ready, widgetAction]);
  const connect = async () => {
    if (connectingRef.current) return;
    connectingRef.current = true;
    const attempt = ++connectionAttempt.current;
    setConnecting(true);
    setError("");
    try {
      await initializeDatabase();
      await ensureTailscale();
      const me = await identity();
      if (attempt !== connectionAttempt.current) return;
      await db.meta.put({ key: "profile", value: JSON.stringify(me) });
      if (attempt !== connectionAttempt.current) return;
      setProfile(me);
      setCached(true);
      setReady(true);
      void syncNow();
    } catch (e) {
      if (attempt === connectionAttempt.current) setError(e instanceof Error ? e.message : "연결하지 못했어요. 다시 시도해 주세요.");
    } finally {
      if (attempt === connectionAttempt.current) { connectingRef.current = false; setConnecting(false); }
    }
  };
  useEffect(() => {
    if (preview) {
      void initializeDatabase()
        .then(() => import("./lib/preview"))
        .then((m) => m.preparePreview())
        .then(() => {
          setReady(true);
          setProfile({ name: "미리보기", login: "개발 화면 · 예시 일정" });
        });
      return;
    }
    let active = true;
    void restoreLocalProfile()
      .then((stored) => {
        if (!active) return;
        if (stored) {
          setProfile(stored);
          setCached(true);
          setReady(true);
          void connect();
        }
        setBooting(false);
      })
      .catch(() => { if (active) { setBooting(false); setError("기기 저장소를 열지 못했어요. 브라우저 저장 공간을 확인해 주세요."); } });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!ready || preview) return;
    const pull = () => {
      if (document.visibilityState !== "hidden") void syncNow();
    };
    const timer = setInterval(pull, 30000);
    window.addEventListener("online", pull);
    document.addEventListener("visibilitychange", pull);
    const stop = subscribeTailEvents(pull);
    const native = Capacitor.isNativePlatform()
      ? NativeApp.addListener("appStateChange", ({ isActive }) => {
          if (isActive) pull();
        })
      : null;
    return () => {
      clearInterval(timer);
      window.removeEventListener("online", pull);
      document.removeEventListener("visibilitychange", pull);
      stop();
      void native?.then((l) => l.remove());
    };
  }, [ready]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 5000);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    if (!settings) return;
    setBackup(null);
    void api("/api/backup")
      .then((r) => r.json())
      .then(setBackup)
      .catch(() => setBackup({ ok: false, message: "서버 연결 후 백업 상태를 확인할 수 있어요." }));
  }, [settings]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        !ready ||
        settings ||
        editor ||
        e.ctrlKey ||
        e.metaKey ||
        e.altKey ||
        (e.target as HTMLElement)?.matches("input,textarea,select")
      )
        return;
      if (e.key === "n") {
        e.preventDefault();
        setEditor({});
      }
      if (e.key === "t") {
        setAnchor(startOfDay(new Date()));
        setSelected(startOfDay(new Date()));
      }
      if (e.key === "Escape") {
        setSidebar(false);
        setQuery("");
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [ready, settings, editor]);
  const range = useMemo(() => {
    const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1),
      week = addDays(startOfDay(anchor), -anchor.getDay());
    const from = view === "week" ? week : addDays(first, -first.getDay());
    return {
      from,
      until: addDays(from, view === "week" ? 7 : 42),
      days: Array.from({ length: view === "week" ? 7 : 42 }, (_, i) => addDays(from, i)),
    };
  }, [anchor, view]);
  const expanded = useMemo(() => {
    const events: Occurrence[] = [];
    let failures = 0;
    for (const record of records) {
      if (record.deleted || calendars.find((c) => c.id === record.calendarId)?.hidden) continue;
      try {
        const list = expandEvent(record.ical, record.key, range.from, range.until);
        events.push(
          ...list.filter(
            (e) =>
              !query ||
              `${e.title} ${e.location} ${record.ical}`.toLowerCase().includes(query.toLowerCase()),
          ),
        );
      } catch {
        failures++;
      }
    }
    events.sort(
      (a, b) =>
        +a.start - +b.start ||
        Number(b.allDay) - Number(a.allDay) ||
        a.title.localeCompare(b.title, "ko"),
    );
    return { events, failures };
  }, [records, calendars, range, query]);
  const dayEvents = expanded.events.filter((e) => onDay(e, selected));
  const eventCalendar = (e: Occurrence) =>
    calendars.find((c) => c.id === records.find((r) => r.key === e.key)?.calendarId) ??
    defaultCalendar;
  const colorStyle = (color: string) => ({ "--event-color": color }) as CSSProperties;
  const openEvent = (event: Occurrence) => {
    const record = records.find((r) => r.key === event.key);
    if (record) setEditor({ record, occurrence: event });
  };
  const move = (direction: number) => {
    const next =
      view === "week"
        ? addDays(anchor, direction * 7)
        : new Date(anchor.getFullYear(), anchor.getMonth() + direction, 1);
    setAnchor(next);
    setSelected(next);
  };
  const chooseDate = (date: Date) => {
    setSelected(date);
    if (date.getMonth() !== anchor.getMonth() && view !== "week") setAnchor(date);
  };
  const today = () => {
    const d = startOfDay(new Date());
    setAnchor(d);
    setSelected(d);
  };
  const showError = (e: unknown) =>
    setNotice(e instanceof Error ? e.message : "작업을 완료하지 못했어요. 다시 시도해 주세요.");
  const addCalendar = async () => {
    if (!calendarName.trim()) return;
    setAdding(true);
    try {
      await createCalendar(calendarName.trim(), calendarColor);
      setCalendarName("");
      setNotice("새 캘린더를 만들었어요.");
    } catch (e) {
      showError(e);
    } finally {
      setAdding(false);
    }
  };
  const importFile = async (file?: File) => {
    if (!file) return;
    setImporting(true);
    try {
      if (file.size > 20 * 1024 * 1024) throw new Error("ICS 파일은 20MB까지 가져올 수 있어요.");
      const result = await addEvents(importEvents(await file.text()), importTarget);
      setNotice(
        `${result.added}개 일정 가져옴${result.skipped ? ` · 기존 일정 ${result.skipped}개 건너뜀` : ""}`,
      );
      void syncNow();
    } catch (e) {
      showError(e);
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };
  const logout = () => {
    connectionAttempt.current++; connectingRef.current = false; setConnecting(false);
    logoutTailscale();
    setReady(false);
    setSettings(false);
    void db.meta.delete("profile");
    setCached(false);
    setProfile(null);
  };
  const eventRow = (event: Occurrence) => (
    <button
      key={event.key + event.recurrenceId}
      className="event-row"
      style={colorStyle(event.color ?? eventCalendar(event).color)}
      onClick={() => openEvent(event)}
    >
      <span className="event-dot" />
      <span className="event-row-content">
        <strong>{event.title}</strong>
        <span>
          {event.allDay
            ? "하루 종일"
            : `${timeFormat.format(event.start)} – ${timeFormat.format(event.end)}`}
          {event.location && <> · {event.location}</>}
        </span>
        <small>{eventCalendar(event).name}</small>
      </span>
      {event.recurring && <Repeat2 size={14} />}
    </button>
  );
  if (booting) return <main className="access-page"><p role="status">기기에 저장된 일정을 여는 중…</p></main>;
  if (!ready)
    return (
      <main className="access-page">
        <div className="access-content">
          <Brand />
          <h1>
            {connecting
              ? tail.state === "Running"
                ? "서버에 연결하고 있어요."
                : tail.loginUrl
                  ? "내 달력으로\n들어가는 한 걸음."
                  : "안전한 연결을\n준비하고 있어요."
              : "하루를 담고,\n어디서나 이어서."}
          </h1>
          <p className="access-description">
            내 일정은 내 서버에.
            <br />
            Tailscale로 연결하면 모든 기기에서
            <br className="mobile-break" /> 같은 달력을 만날 수 있어요.
          </p>
          {connecting && (
            <ol className="connection-steps">
              <li className={tail.state === "Running" ? "complete" : "active"}>
                <span>{tail.state === "Running" ? <Check size={15} /> : "1"}</span>Tailscale 계정
                인증
              </li>
              <li className={tail.state === "Running" ? "active" : ""}>
                <span>2</span>달력 서버 연결
              </li>
              <li>
                <span>3</span>달력 열기
              </li>
            </ol>
          )}
          {error && (
            <p className="error-message" role="alert">
              {error}
            </p>
          )}
          {tail.loginUrl ? (
            <a
              className="primary access-action"
              href={tail.loginUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => {
                if (Capacitor.isNativePlatform()) {
                  e.preventDefault();
                  void openAuthBrowser(tail.loginUrl).catch(showError);
                }
              }}
            >
              Tailscale 계정 인증하기 <ArrowRight size={18} />
            </a>
          ) : (
            <button
              className="primary access-action"
              disabled={connecting}
              onClick={() => void connect()}
            >
              {connecting ? <LoaderCircle className="spin" size={18} /> : <LockKeyhole size={18} />}{" "}
              {connecting ? "연결 확인 중" : "Tailscale로 로그인"}{" "}
              {!connecting && <ArrowRight size={18} />}
            </button>
          )}
          <p className="access-help">
            {connecting ? tail.message : "Tailscale 앱을 따로 설치하지 않아도 됩니다."}
          </p>
          {tail.state === "Error" && (
            <button className="secondary" onClick={() => location.reload()}>
              앱 새로 열기
            </button>
          )}
          {cached && (
            <button className="secondary access-action" onClick={() => setReady(true)}>
              <CloudOff size={17} /> 기기에 저장된 달력 열기
            </button>
          )}
          <DownloadLink />
          <footer className="access-footer">
            <span />
            기기에 먼저 저장 · CalDAV 동기화 · NAS 백업
          </footer>
        </div>
        {notice && (
          <div role="status" className="toast">
            {notice}
          </div>
        )}
      </main>
    );
  return (
    <div className="workspace">
      {sidebar && (
        <button
          className="sidebar-shade"
          aria-label="메뉴 닫기"
          onClick={() => setSidebar(false)}
        />
      )}
      <aside className={`sidebar ${sidebar ? "open" : ""}`} aria-label="달력 탐색">
        <div className="sidebar-brand">
          <Brand />
          <button
            className="icon-button mobile-only"
            aria-label="메뉴 닫기"
            onClick={() => setSidebar(false)}
          >
            <X size={19} />
          </button>
        </div>
        <button
          className="primary new-event"
          onClick={() => {
            setEditor({});
            setSidebar(false);
          }}
        >
          <Plus size={19} /> 새 일정 <kbd>N</kbd>
        </button>
        <nav className="view-nav">
          {(
            [
              ["month", "월간", CalendarDays],
              ["week", "주간", Columns3],
              ["agenda", "일정 목록", List],
            ] as const
          ).map(([id, label, Icon]) => (
            <button
              key={id}
              className={`nav-item ${view === id ? "selected" : ""}`}
              aria-current={view === id ? "page" : undefined}
              onClick={() => {
                setView(id);
                setSidebar(false);
              }}
            >
              <Icon size={18} />
              {label}
            </button>
          ))}
        </nav>
        <div className="calendar-list-head">
          <h2>내 캘린더</h2>
          <button
            className="icon-button"
            aria-label="캘린더 추가"
            onClick={() => setSettings(true)}
          >
            <Plus size={16} />
          </button>
        </div>
        <div className="calendar-list">
          {calendars.map((c) => (
            <label key={c.id} className="calendar-toggle" style={colorStyle(c.color)}>
              <input
                type="checkbox"
                checked={!c.hidden}
                onChange={() => void db.calendars.update(c.id, { hidden: !c.hidden })}
              />
              <span>{c.name}</span>
            </label>
          ))}
        </div>
        <p className="sidebar-hint">
          날짜를 선택하고
          <br />
          새로운 하루를 기록해 보세요.
        </p>
        <div className="sidebar-bottom">
          <button
            className="sync-detail"
            onClick={() => void syncNow()}
            disabled={sync.busy}
            title={sync.message}
          >
            {sync.busy ? (
              <RefreshCw className="spin" size={17} />
            ) : tail.state === "Running" && !sync.error ? (
              <CloudCheck size={17} />
            ) : (
              <CloudOff size={17} />
            )}
            <span>
              <strong>
                {sync.busy
                  ? "동기화 중"
                  : pending
                    ? `${pending}개 변경 동기화 대기`
                    : sync.error
                      ? "연결 확인 필요"
                      : sync.lastSync
                        ? "동기화 완료"
                        : "기기에 저장됨"}
              </strong>
              <small>
                {sync.lastSync
                  ? `${timeFormat.format(sync.lastSync)} 마지막 동기화`
                  : "연결되면 자동 동기화"}
              </small>
            </span>
          </button>
          <button className="nav-item" onClick={() => setSettings(true)}>
            <Settings2 size={18} />
            설정<span className="account-initial">{profile?.name?.slice(0, 1) || "나"}</span>
          </button>
        </div>
      </aside>
      <main className="main-content">
        <header className="toolbar">
          <div className="month-title">
            <button
              className="icon-button mobile-only"
              aria-label="메뉴 열기"
              onClick={() => setSidebar(true)}
            >
              <Menu size={21} />
            </button>
            <h1>
              <span className="year">{anchor.getFullYear()}년</span> {anchor.getMonth() + 1}월
            </h1>
            <div className="date-navigation">
              <button
                className="icon-button"
                aria-label={view === "week" ? "이전 주" : "이전 달"}
                onClick={() => move(-1)}
              >
                <ChevronLeft size={20} />
              </button>
              <button
                className="icon-button"
                aria-label={view === "week" ? "다음 주" : "다음 달"}
                onClick={() => move(1)}
              >
                <ChevronRight size={20} />
              </button>
            </div>
            <button className="today-button" onClick={today}>
              오늘
            </button>
          </div>
          <div className="toolbar-right">
            <label className="search-box">
              <Search size={17} />
              <input
                aria-label="일정 검색"
                placeholder="일정 검색"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {query && (
                <button
                  className="icon-button"
                  aria-label="검색 지우기"
                  onClick={() => setQuery("")}
                >
                  <X size={15} />
                </button>
              )}
            </label>
            <select
              aria-label="보기 방식"
              value={view}
              onChange={(e) => setView(e.target.value as typeof view)}
            >
              <option value="month">월간</option>
              <option value="week">주간</option>
              <option value="agenda">일정 목록</option>
            </select>
            <button
              className="icon-button"
              aria-label="지금 동기화"
              onClick={() => void syncNow()}
              disabled={sync.busy}
            >
              <RefreshCw size={18} className={sync.busy ? "spin" : ""} />
            </button>
          </div>
        </header>
        {(sync.error || expanded.failures > 0) && (
          <div className="status-bar" role="status">
            {expanded.failures
              ? `${expanded.failures}개 일정의 반복 규칙을 표시하지 못했어요. 원본은 보관되어 있어요.`
              : sync.message}
            <button className="text-button" onClick={() => void syncNow()}>
              다시 시도
            </button>
          </div>
        )}
        <div className={`calendar-body view-${view}`}>
          {view === "month" ? (
            <section
              className="month-calendar"
              aria-label={`${anchor.getFullYear()}년 ${anchor.getMonth() + 1}월 달력`}
            >
              <div className="weekday-row">
                {weekday.map((d, i) => (
                  <span key={d} className={i === 0 ? "sunday" : i === 6 ? "saturday" : ""}>
                    {d}
                  </span>
                ))}
              </div>
              <div className="month-grid">
                {range.days.map((day) => {
                  const items = expanded.events.filter((e) => onDay(e, day));
                  return (
                    <div
                      key={localDate(day)}
                      className={`day-cell ${day.getMonth() !== anchor.getMonth() ? "outside" : ""} ${sameDay(day, selected) ? "chosen" : ""}`}
                    >
                      <button
                        className="day-select"
                        aria-label={dateLabel(day) + (sameDay(day, new Date()) ? " 오늘" : "")}
                        aria-pressed={sameDay(day, selected)}
                        onClick={() => chooseDate(day)}
                        onDoubleClick={() => {
                          chooseDate(day);
                          setEditor({});
                        }}
                      >
                        <span
                          className={`day-number ${sameDay(day, new Date()) ? "is-today" : ""} ${day.getDay() === 0 ? "sunday" : day.getDay() === 6 ? "saturday" : ""}`}
                        >
                          {day.getDate()}
                        </span>
                      </button>
                      <div className="day-events">
                        {items.slice(0, 3).map((event) => (
                          <button
                            key={event.key + event.recurrenceId}
                            className={`event-chip ${event.allDay ? "all-day" : ""}`}
                            style={colorStyle(event.color ?? eventCalendar(event).color)}
                            onClick={() => openEvent(event)}
                          >
                            <span className="event-dot" />
                            {!event.allDay && <time>{timeFormat.format(event.start)}</time>}
                            <span>{event.title}</span>
                          </button>
                        ))}
                        {items.length > 3 && (
                          <button className="more-events" onClick={() => chooseDate(day)}>
                            +{items.length - 3}개 더 보기
                          </button>
                        )}
                      </div>
                      <div className="mobile-dots" aria-hidden="true">
                        {items.slice(0, 4).map((e, i) => (
                          <i key={i} style={{ background: e.color ?? eventCalendar(e).color }} />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ) : view === "week" ? (
            <section className="week-calendar" aria-label="주간 달력">
              {range.days.map((day) => (
                <div
                  className={`week-column ${sameDay(day, selected) ? "chosen" : ""}`}
                  key={localDate(day)}
                >
                  <button className="week-heading" onClick={() => chooseDate(day)}>
                    <span>{weekday[day.getDay()]}</span>
                    <strong className={sameDay(day, new Date()) ? "is-today" : ""}>
                      {day.getDate()}
                    </strong>
                  </button>
                  <div className="week-events">
                    {expanded.events
                      .filter((e) => onDay(e, day))
                      .map((event) => (
                        <button
                          key={event.key + event.recurrenceId}
                          className="week-event"
                          style={colorStyle(event.color ?? eventCalendar(event).color)}
                          onClick={() => openEvent(event)}
                        >
                          <span className="event-dot" />
                          <strong>{event.title}</strong>
                          <time>
                            {event.allDay
                              ? "하루 종일"
                              : timeFormat.format(event.start) +
                                " – " +
                                timeFormat.format(event.end)}
                          </time>
                        </button>
                      ))}
                    <button
                      className="add-day"
                      aria-label={`${dateLabel(day)} 일정 추가`}
                      onClick={() => {
                        setSelected(day);
                        setEditor({});
                      }}
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </section>
          ) : (
            <section className="agenda-list" aria-label="일정 목록">
              {query && (
                <p className="search-caption">
                  표시 기간에서 “{query}” 검색 · {expanded.events.length}개 일정
                </p>
              )}
              {range.days
                .filter((d) => expanded.events.some((e) => onDay(e, d)))
                .map((day) => (
                  <div className="agenda-day" key={localDate(day)}>
                    <div className="agenda-date">
                      <strong className={sameDay(day, new Date()) ? "is-today" : ""}>
                        {day.getDate()}
                      </strong>
                      <span>
                        {day.getMonth() + 1}월 {weekday[day.getDay()]}요일
                      </span>
                    </div>
                    <div>{expanded.events.filter((e) => onDay(e, day)).map(eventRow)}</div>
                  </div>
                ))}
              {!expanded.events.length && (
                <div className="empty-agenda">
                  <CalendarDays size={36} />
                  <h2>{query ? "검색 결과가 없어요." : "아직 일정이 없어요."}</h2>
                  <p>
                    {query
                      ? "다른 검색어나 다른 달을 살펴보세요."
                      : "작은 약속부터, 하루를 채워 보세요."}
                  </p>
                  <button className="secondary" onClick={() => setEditor({})}>
                    <Plus size={17} /> 새 일정
                  </button>
                </div>
              )}
            </section>
          )}
          {view !== "agenda" && (
            <aside className="day-panel" aria-label="선택한 날짜의 일정">
              <div className="day-panel-title">
                <div>
                  <p>
                    {selected.getFullYear()}년 {selected.getMonth() + 1}월
                  </p>
                  <h2>
                    {selected.getDate()}일 <span>{weekday[selected.getDay()]}요일</span>
                    {sameDay(selected, new Date()) && <small>오늘</small>}
                  </h2>
                </div>
                <button
                  className="icon-button"
                  aria-label="선택일 일정 추가"
                  onClick={() => setEditor({})}
                >
                  <Plus size={20} />
                </button>
              </div>
              <p className="day-count">
                {dayEvents.length
                  ? `${dayEvents.length}개의 일정`
                  : query
                    ? "검색된 일정 없음"
                    : "여유로운 하루"}
              </p>
              {dayEvents.length ? (
                dayEvents.map(eventRow)
              ) : (
                <div className="empty-day">
                  <CalendarDays size={28} />
                  <p>{query ? "이 날에는 검색 결과가 없어요." : "아직 예정된 일정이 없어요."}</p>
                  <button className="text-button" onClick={() => setEditor({})}>
                    <Plus size={15} /> 일정 추가하기
                  </button>
                </div>
              )}
              <div className="day-panel-bottom">
                <LockKeyhole size={13} />
                <span>나의 서버에 안전하게 보관</span>
              </div>
            </aside>
          )}
        </div>
        <button
          className="mobile-add primary"
          aria-label="새 일정 추가"
          onClick={() => setEditor({})}
        >
          <Plus size={24} />
        </button>
      </main>
      {editor && (
        <Editor
          record={editor.record}
          date={selected}
          calendars={calendars}
          occurrence={editor.occurrence}
          onClose={() => setEditor(null)}
          onSaved={(message) => {
            setEditor(null);
            setNotice(message);
          }}
        />
      )}
      {settings && (
        <Modal title="설정" onClose={() => setSettings(false)}>
          <div className="settings-body">
            {Capacitor.getPlatform() === "android" && <WidgetSettings />}
            <section>
              <h3>내 계정</h3>
              <div className="setting-row">
                <span>
                  <strong>{profile?.name || "내 계정"}</strong>
                  <small>{profile?.login}</small>
                </span>
                <button className="secondary" onClick={logout}>
                  <LogOut size={15} /> 로그아웃
                </button>
              </div>
              <p className="field-hint">로그아웃해도 기기의 일정은 보관돼요.</p>
            </section>
            <section>
              <h3>동기화와 백업</h3>
              <div className="setting-row">
                <span>
                  <strong>
                    {tail.state === "Running" ? "내장 Tailscale 연결됨" : "기기에서 사용 중"}
                  </strong>
                  <small>{sync.message}</small>
                </span>
                <button
                  className="icon-button"
                  aria-label="동기화 재시도"
                  onClick={() => void (tail.state === "Running" ? syncNow() : connect())}
                >
                  <RefreshCw size={18} />
                </button>
              </div>
              {tail.state !== "Running" && <p className="field-hint">일정은 이 기기에서 계속 사용할 수 있어요. 연결되면 변경 내용을 동기화해요.</p>}
              {(tail.loginUrl || tail.state === "NeedsMachineAuth") && <a className="secondary" href={tail.loginUrl || "https://console.tailscale.com/admin/machines"} target="_blank" rel="noopener noreferrer" onClick={e => {
                if (Capacitor.isNativePlatform()) { e.preventDefault(); void openAuthBrowser(e.currentTarget.href).catch(showError); }
              }}>동기화를 위해 Tailscale 다시 인증</a>}
              {error && <p role="alert" className="field-hint">{error}</p>}
              <div className="backup-status">
                <CloudCheck size={18} />
                <span>
                  NAS 백업
                  <small>
                    {backup === null
                      ? "확인 중…"
                      : backup.ok && backup.completedAt
                        ? new Date(backup.completedAt).toLocaleString("ko-KR")
                        : backup.message || "최근 백업을 완료하지 못했어요."}
                  </small>
                </span>
                {backup?.ok && <Check size={16} />}
              </div>
              <p className="field-hint">
                매일 오전 4시(한국 시간) · 최근 30개 보관
                <br />
                일정은 서버에 저장하고 NAS에 별도로 백업해요.
              </p>
              <p className="field-hint">
                표시 시간대 · {Intl.DateTimeFormat().resolvedOptions().timeZone}
              </p>
            </section>
            <section>
              <h3>캘린더 추가</h3>
              <form
                className="new-calendar-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void addCalendar();
                }}
              >
                <input
                  aria-label="캘린더 색상"
                  type="color"
                  value={calendarColor}
                  onChange={(e) => setCalendarColor(e.target.value)}
                />
                <input
                  aria-label="새 캘린더 이름"
                  placeholder="예: 개인, 업무, 가족"
                  maxLength={80}
                  required
                  value={calendarName}
                  onChange={(e) => setCalendarName(e.target.value)}
                />
                <button className="secondary" disabled={adding || tail.state !== "Running"}>
                  추가
                </button>
              </form>
              {tail.state !== "Running" && (
                <p className="field-hint">새 캘린더는 서버 연결 후 만들 수 있어요.</p>
              )}
            </section>
            <section>
              <h3>일정 가져오기·내보내기</h3>
              <label className="import-label">
                가져올 캘린더
                <select value={importTarget} onChange={(e) => setImportTarget(e.target.value)}>
                  {calendars.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="button-row">
                <button
                  className="secondary"
                  disabled={importing}
                  onClick={() => fileRef.current?.click()}
                >
                  <Upload size={16} />
                  {importing ? "가져오는 중…" : "ICS 가져오기"}
                </button>
                <button
                  className="secondary"
                  onClick={() => void exportICS(records, calendars).catch(showError)}
                >
                  <Download size={16} />
                  전체 내보내기
                </button>
              </div>
              <input
                ref={fileRef}
                className="file-input"
                type="file"
                accept=".ics,text/calendar"
                onChange={(e) => void importFile(e.target.files?.[0])}
              />
              <p className="field-hint">
                같은 캘린더에 같은 UID가 있으면 건너뛰어요. 기존 일정을 덮어쓰지 않아요.
              </p>
            </section>
            <section>
              <h3>달력 0.2.2</h3>
              <DownloadLink />
              <p className="field-hint">
                노트 · 연락처 · 달력
                <br />
                서로 다른 기록, 같은 편안함.
              </p>
            </section>
          </div>
        </Modal>
      )}
      {notice && (
        <div className="toast" role="status">
          {notice}
          <button className="icon-button" aria-label="알림 닫기" onClick={() => setNotice("")}>
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
