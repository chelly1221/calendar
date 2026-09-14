import { useRef, useEffect, useState, useId, type ReactNode } from "react";
import { X, Trash2 } from "lucide-react";
import { type Calendar, type EventRecord, saveEvent, deleteEvent } from "./lib/database";
import {
  type Occurrence,
  type EventDraft,
  emptyEvent,
  readEvent,
  writeEvent,
  cancelOccurrence,
  localTime,
} from "./lib/ical";
import { syncNow } from "./lib/sync";
export function Modal({
  title,
  children,
  onClose,
  wide = false,
  fullScreen = false,
  actions,
  className = "",
}: {
  title: string;
  children: ReactNode;
  onClose(): void;
  wide?: boolean;
  fullScreen?: boolean;
  actions?: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    el?.showModal();
    return () => {
      el?.close();
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? "wide" : ""} ${fullScreen ? "day-detail" : ""} ${className}`}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      aria-label={title}
    >
      <div className="modal-head">
        <h2>{title}</h2>
        <button className="icon-button modal-close" aria-label="닫기" onClick={onClose}>
          <X size={20} />
        </button>
        {actions}
      </div>
      {children}
    </dialog>
  );
}
const rules = [
  ["", "반복 안 함"],
  ["FREQ=DAILY", "매일"],
  ["FREQ=WEEKLY", "매주"],
  ["FREQ=MONTHLY", "매월"],
  ["FREQ=YEARLY", "매년"],
];
export default function Editor({
  record,
  date,
  calendars,
  occurrence,
  onClose,
  onSaved,
}: {
  record?: EventRecord;
  date: Date;
  calendars: Calendar[];
  occurrence?: Occurrence;
  onClose(): void;
  onSaved(message: string): void;
}) {
  const [draft, setDraft] = useState<EventDraft>(() =>
    record ? readEvent(record.ical) : emptyEvent(date),
  );
  const initial = useRef(JSON.stringify(draft));
  const [calendarId, setCalendarId] = useState(
    record?.calendarId ?? calendars.find((c) => !c.hidden)?.id ?? "default",
  );
  const initialCalendar = useRef(calendarId);
  const formId = useId();
  const confirmation = useRef<HTMLDivElement>(null);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [confirmDelete, setConfirmDelete] = useState(false),
    [discard, setDiscard] = useState(false);
  const update = <K extends keyof EventDraft>(key: K, value: EventDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));
  const close = () => {
    if (busy) return;
    if (initial.current !== JSON.stringify(draft) || initialCalendar.current !== calendarId) { setConfirmDelete(false); setDiscard(true); }
    else onClose();
  };
  useEffect(() => {
    if (!discard && !confirmDelete) return;
    confirmation.current?.scrollIntoView({ block: "nearest" });
    confirmation.current?.focus({ preventScroll: true });
  }, [discard, confirmDelete]);
  const save = async () => {
    if (busy) return;
    setError("");
    setBusy(true);
    try {
      await saveEvent(writeEvent(draft, record?.ical), calendarId, record?.key);
      void syncNow();
      onSaved("일정을 기기에 저장했어요.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장하지 못했어요. 다시 시도해 주세요.");
      setBusy(false);
    }
  };
  const remove = async (onlyThis = false) => {
    if (!record) return;
    setBusy(true);
    setError("");
    try {
      if (onlyThis && occurrence)
        await saveEvent(
          cancelOccurrence(record.ical, occurrence.recurrenceId),
          record.calendarId,
          record.key,
        );
      else await deleteEvent(record.key);
      void syncNow();
      onSaved(onlyThis ? "이번 일정만 삭제했어요." : "일정을 삭제했어요.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "삭제하지 못했어요.");
      setBusy(false);
    }
  };
  return (
    <Modal fullScreen className="event-editor" title={record ? "일정 편집" : "새 일정"} onClose={close}
      actions={<button type="submit" form={formId} className="editor-save" disabled={busy || discard || confirmDelete}>{busy ? "저장 중…" : "저장"}</button>}>
      <form
        id={formId}
        className="event-form"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <label className="title-label">
          <span className="visually-hidden">제목</span>
          <input
            placeholder="어떤 일정인가요?"
            maxLength={300}
            required
            value={draft.title}
            onChange={(e) => update("title", e.target.value)}
          />
        </label>
        <label className="check-row">
          <input
            type="checkbox"
            role="switch"
            checked={draft.allDay}
            onChange={(e) => {
              const allDay = e.target.checked;
              setDraft((d) => ({
                ...d,
                allDay,
                start: allDay ? d.start.slice(0, 10) : d.start.slice(0, 10) + "T09:00",
                end: allDay ? d.end.slice(0, 10) : d.end.slice(0, 10) + "T10:00",
              }));
            }}
          />
          하루 종일
        </label>
        <div className="date-fields">
          <label>
            시작
            <input
              aria-label="시작"
              type={draft.allDay ? "date" : "datetime-local"}
              required
              value={draft.start}
              onChange={(e) => update("start", e.target.value)}
            />
          </label>
          <label>
            종료
            <input
              aria-label="종료"
              type={draft.allDay ? "date" : "datetime-local"}
              required
              value={draft.end}
              onChange={(e) => update("end", e.target.value)}
            />
          </label>
        </div>
        {draft.allDay && <p className="field-hint">종료 날짜까지 하루 종일 표시해요.</p>}
        <label className="icon-field">
          <span>
            <span className="field-name">캘린더</span>
            <select
              value={calendarId}
              disabled={!!record}
              onChange={(e) => setCalendarId(e.target.value)}
            >
              {calendars.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </span>
        </label>
        <label className="icon-field">
          <span>
            <span className="field-name">반복</span>
            <select value={draft.recurrence} onChange={(e) => update("recurrence", e.target.value)}>
              {rules.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
              {!rules.some((r) => r[0] === draft.recurrence) && (
                <option value={draft.recurrence}>가져온 반복 규칙 유지</option>
              )}
            </select>
          </span>
        </label>
        {record && draft.recurrence && (
          <p className="field-hint">
            저장하면 반복 일정 전체에 적용돼요. 반복 방식을 바꾸면 기존 예외 날짜가 초기화돼요.
          </p>
        )}
        <label className="icon-field text-field">
          <span>
            <span className="field-name">장소</span>
            <input
              placeholder="장소 추가"
              maxLength={500}
              value={draft.location}
              onChange={(e) => update("location", e.target.value)}
            />
          </span>
        </label>
        <label className="icon-field text-field memo-field">
          <span>
            <span className="field-name">메모</span>
            <textarea
              placeholder="기억해 둘 내용을 적어 주세요."
              maxLength={100000}
              rows={3}
              value={draft.description}
              onChange={(e) => update("description", e.target.value)}
            />
          </span>
        </label>
        <p className="field-hint">시간대 · {Intl.DateTimeFormat().resolvedOptions().timeZone}</p>
        {error && (
          <p role="alert" className="error-message">
            {error}
          </p>
        )}
        {confirmDelete ? (
          <div className="confirm-panel" ref={confirmation} tabIndex={-1} role="group" aria-label="일정 삭제 확인">
            <strong>
              {draft.recurrence ? "어떤 일정을 삭제할까요?" : "이 일정을 삭제할까요?"}
            </strong>
            <p>동기화하면 다른 기기에서도 삭제돼요.</p>
            <div className="button-row">
              {occurrence?.recurring && (
                <button
                  type="button"
                  className="secondary"
                  disabled={busy}
                  onClick={() => void remove(true)}
                >
                  이번 일정만
                </button>
              )}
              <button
                type="button"
                className="danger"
                disabled={busy}
                onClick={() => void remove()}
              >
                {draft.recurrence ? "전체 일정 삭제" : "삭제"}
              </button>
              <button type="button" className="text-button" onClick={() => setConfirmDelete(false)}>
                취소
              </button>
            </div>
          </div>
        ) : (
          <div className="form-actions">
            {record && (
              <button
                type="button"
                className="icon-button danger-text"
                aria-label="일정 삭제"
                disabled={busy || discard}
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 size={19} />
                일정 삭제
              </button>
            )}
          </div>
        )}
        {discard && (
          <div className="confirm-panel" ref={confirmation} tabIndex={-1} role="group" aria-label="변경 내용 확인">
            <strong>작성 중인 내용을 닫을까요?</strong>
            <div className="button-row">
              <button className="secondary" type="button" onClick={() => setDiscard(false)}>
                계속 작성
              </button>
              <button className="danger" type="button" onClick={onClose}>
                저장하지 않고 닫기
              </button>
            </div>
          </div>
        )}
      </form>
    </Modal>
  );
}
