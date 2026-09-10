# Android month widget: event tap and color extension

Documented 2026-09-11. This is a bounded extension record for `.impeccable/surfaces/android-widget.md`, based on the implemented native renderer and app action path. The finish reviewer reported **ship**, with no material fixes at this extension scope. This document does not independently certify deployment or replace the finish review.

## Overview

The widget continues the note-series calendar world described by `PRODUCT.md` and `DESIGN.md`: a quiet dark surface, restrained lavender emphasis, compact schedule-first month geometry, and subdued separators. The extension gives each visible schedule its own event action and preserves its registered color in a thin marker. It does not establish a new global visual identity.

Root `PRODUCT.md` and `DESIGN.md` are preserved. No root `.impeccable/design.json` was present when checked; none was created. The only authored artifact of this documentation pass is this file.

## Colors

The native default surface is near-black (`#141414`), with near-white foreground (`#f1f1f1`) and a muted foreground blended at 70% against the surface. Light mode uses `#fafafa` with `#1e1e1e` foreground. The default today accent is lavender (`#b59ae8`), adjusted against the chosen background when needed. These are observed native surface values, not replacement web tokens.

**Exact marker rule.** Each schedule retains its resolved RGB color in a 1dp vertical marker across tint, solid, and plain modes. Tint backgrounds blend 22% event color into the widget background; solid uses the event color directly; plain has no event fill. The marker is not blended. Titles use contrasting ink rather than relying on the registered color for readability.

The data path resolves recurrence exception COLOR before master COLOR, then falls back to the calendar color in the native calendar builder. `event-color.ts` normalizes CSS color names, three-digit hex, and six/eight-digit hex to six-digit RGB. Eight-digit input drops its alpha suffix; exactness here describes resolved RGB. Invalid own colors fall back to the calendar color, and an invalid rendered color falls back to lavender. Weekend and today colors remain separate calendar navigation cues.

## Typography

The native widget uses Android TextViews and font metrics, including Korean fallback measurement and system font scaling. Event titles default to 11sp, configurable from 8–16sp; dates default to 12sp, configurable from 10–20sp. The month heading is 14sp below 280dp widget width and 17sp otherwise.

**One line rule.** Event titles are single-line, end-ellipsized native text, with no font padding. Each has 2dp horizontal and 0.5dp vertical padding and a 1dp bottom gap. Long titles truncate visibly instead of wrapping into the next event. The full rendered title is supplied in the parent event's accessibility description.

## Layout

The compact full-screen month composition is retained: narrow month controls, seven weekday columns, four to six equal week rows, and a small synchronization footer. Real measured text and date heights determine schedule capacity. Additional height reveals more schedules without changing the month structure. Overflow reserves a `+N` line where space permits; at the smallest capacity it moves into the date label. The reviewed tablet capture displays all ten schedules on the busy sample date where phone captures show five and `+5`.

## Elevation & Depth

The widget remains flat. Grid rules, tinted event fills, the faint today-cell background, and the outer container outline provide organization without adding shadows. The new marker adds color identity without introducing elevation.

## Shapes

The outer widget keeps its existing configurable round, soft, or square silhouette. Event lines remain rectangular and narrow, with the exact-color strip flush to their leading edge. No new decorative shape vocabulary is introduced.

## Components

**Event line.** A schedule carries its local record key and recurrence identifier from the durable snapshot to `WidgetCalendar.Entry`. Its native PendingIntent includes widget ID, date, key, and recurrence ID in a distinct URI, and carries the event identity to `CalendarWidgetsPlugin`. The app resolves that occurrence from the local database and opens the existing event editor. If the event changed, disappeared, or cannot resolve, the selected calendar date remains available and the app presents an explanatory notice.

**Day and overflow.** The containing date retains its configured day/new action, and the overflow line opens the day. Compact event targets are the user-requested widget behavior; full date-cell access remains available for day browsing. This does not redefine the app-wide 44px touch-target goal.

**Month controls and status.** Existing previous, next, today, settings, and synchronization actions remain part of the same native composition. Event identity changes do not require opening the app merely to navigate months.

## Do's and Don'ts

- Do preserve the distinction between exact RGB marker and intentionally tinted background.
- Do keep recurring occurrence identity through the snapshot, intent, bridge, and local resolver.
- Do retain single-line truncation, height-derived capacity, and accessible day browsing.
- Don't treat debug sample events or the harness heading as production content.
- Don't generalize the compact widget's native font or target sizes into a replacement global design system.

## Evidence and provenance

Source examined: `WidgetRenderer.java`, `WidgetCalendar.java`, `CalendarWidgetsPlugin.java`, `res/layout/widget_event.xml`, `src/lib/widget-data.ts`, `src/lib/widget-action.ts`, `src/lib/event-color.ts`, the color extraction in `src/lib/ical.ts`, and the widget action effect in `src/App.tsx`. Product/system references examined: `PRODUCT.md`, `DESIGN.md`, and `.impeccable/surfaces/android-widget.md`.

The following are original Android 16 emulator captures produced during this implementation turn, as supplied by the implementing agent and visually inspected in this pass:

| Capture | Original dimensions | Evidence |
| --- | --- | --- |
| `widget-tap-phone-dark.png` | 1080 × 2400 | Dark phone composition, thin color markers, truncated titles, busy-date overflow |
| `widget-tap-phone-light.png` | 1080 × 2400 | Light phone composition and legible title ink with the same marker treatment |
| `widget-tap-tablet.png` | 1600 × 2400 | Wider titles and increased schedule capacity in the same month structure |

All capture paths are relative to `.impeccable/review/`. They show synthetic debug `WidgetHarnessActivity` content, including the explicit example-schedule heading. They are review evidence, not shipping raster assets, actual user calendar data, or generated images. No generated or newly sourced raster assets are introduced by this extension. Static captures establish visible composition; event routing is grounded in source inspection here and is not claimed as a tap test performed by this documentation pass.

Not canonized or repaired: the existing root design record lacks the current canonical token/frontmatter structure and sidecar, and describes web Pretendard/44px goals while this native widget uses Android text and explicitly requested compact schedule targets. Those pre-existing documentation and surface differences remain outside this bounded extension; no broad design migration or accessibility guarantee is inferred from them.
