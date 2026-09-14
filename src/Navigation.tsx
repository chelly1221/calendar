import { useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";

export function useMobileNavigation(breakpoint = 760) {
  return useSyncExternalStore(
    (notify) => { const media = matchMedia('(max-width: ' + breakpoint + 'px)'); media.addEventListener('change', notify); return () => media.removeEventListener('change', notify); },
    () => matchMedia('(max-width: ' + breakpoint + 'px)').matches,
    () => false,
  );
}

export default function Navigation({ open, onOpenChange, label, hidden = false, breakpoint = 760, children, panel, onPanelClose }: {
  open: boolean; onOpenChange(open: boolean): void; label: string; hidden?: boolean; breakpoint?: number; children: ReactNode;
  panel?: ReactNode; onPanelClose?: () => void;
}) {
  const mobile = useMobileNavigation(breakpoint);
  const root = useRef<HTMLDivElement>(null);
  const panelOpen = Boolean(panel);
  const expanded = open || panelOpen;
  const modal = (mobile && open) || panelOpen;
  useEffect(() => { if (!mobile) onOpenChange(false); }, [mobile, onOpenChange]);
  useEffect(() => {
    if (!modal) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    root.current?.querySelector<HTMLButtonElement>('.navigation-toggle')?.focus();
    const keyboard = (event: KeyboardEvent) => {
      if (event.defaultPrevented || document.querySelector('dialog[open]')) return;
      if (event.key === 'Escape') { event.preventDefault(); if (panelOpen) onPanelClose?.(); else onOpenChange(false); }
      if (event.key !== 'Tab') return;
      const items = [...root.current!.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, [tabindex="0"]')].filter(el => el.getClientRects().length && !el.closest('[inert]'));
      const first = items[0], last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', keyboard);
    return () => { document.removeEventListener('keydown', keyboard); if (previous?.isConnected) previous.focus(); };
  }, [modal, panelOpen, onOpenChange, onPanelClose]);
  return <div ref={root} className={'navigation-layer' + (panelOpen ? ' has-panel' : '')} role={modal ? 'dialog' : undefined} aria-modal={modal || undefined} aria-label={modal ? (panelOpen ? '설정' : label) : undefined}>
    <button className="icon-button navigation-toggle" hidden={hidden && !expanded} aria-label={panelOpen ? '설정 닫기' : open ? '메뉴 닫기' : '메뉴 열기'} aria-expanded={expanded} aria-controls={panelOpen ? 'settings-panel' : 'navigation-panel'} onClick={() => panelOpen ? onPanelClose?.() : onOpenChange(!open)}>
      <span className={'menu-glyph' + (expanded ? ' is-open' : '')} aria-hidden="true"><span/><span/><span/></span>
    </button>
    <aside id="navigation-panel" className={'sidebar' + (open ? ' open' : '')} aria-label={label} inert={panelOpen || (mobile && !open)} aria-hidden={panelOpen || (mobile && !open) || undefined}>{children}</aside>
    {panel}
  </div>;
}
