# Android widget extension documentation handoff

Date: 2026-09-11. Scope: the native month AppWidget, its configuration activity and layouts, `WidgetSettingsTheme`, and the app's `src/WidgetSettings.tsx` entry point. This records an ordinary extension of the user-pinned note-series theme. The existing visual system remains authoritative.

## Contract and implementation comparison

| Confirmed direction | Implemented extension |
| --- | --- |
| Dense, full-screen month form; default 4×5 cells | `calendar_widget_info.xml` declares 4×5 target cells and horizontal/vertical resizing. Seven aligned columns use equal week rows, with 4–6 weeks or an optional fixed six. Actual placement remains launcher-dependent. |
| Readable schedule titles, one line each | `widget_event.xml` uses native `TextView` with `singleLine`, `maxLines=1`, and end ellipsis. Measured native line heights determine capacity. Overflow uses a `+N` line, or a count beside the date when only one event line fits. |
| More titles when the widget grows | `WidgetCalendar.capacity` permits up to 16 slots in automatic mode; explicit limits remain 1–8. An overflow line occupies one slot. The tablet evidence displays all ten events on September 10. |
| Existing note-series identity | The widget defaults to a dark neutral surface; configuration keeps the dark background, pale text, and restrained lavender controls. Calendar colors supply event tints. Light/system themes and background customization are local widget variants. |
| Native detailed settings with a useful preview | Native switches, sliders, choices, calendar selection, and save/cancel controls configure individual instances. The preview uses the launcher's `WidgetRenderer`, measuring date and event text to grow its height at larger font settings. Short screens scroll the preview with the settings. |
| Existing app integration | `WidgetSettings.tsx` reuses the app's setting rows, secondary button, icon button, and hint styles to add or configure widgets. Native TextViews use Android font handling and `sp`; the existing app's Pretendard system remains unchanged. |

The scoped adaptations are the dense native grid, lavender today treatment, platform controls and font measurement, and launcher-dependent sizing. They do not establish replacement global tokens or a new design world.

## Evidence inspected

All seven supplied current emulator images were opened and visually inspected, with the relevant renderer, configuration, layout, and theme code read alongside them:

| Capture | Observed result |
| --- | --- |
| [phone-dark.png](phone-dark.png) | Tall dark month grid, single-line ellipsized titles, and a separate `+5` overflow line on the busy date. |
| [phone-light-small.png](phone-light-small.png) | Compact light grid retains a title line and moves hidden-event counts beside dates. |
| [phone-font130.png](phone-font130.png) | Enlarged text remains single-line; the busy date reduces visible titles and shows `+6`. |
| [tablet-light.png](tablet-light.png) | The larger grid shows ten separate titles on September 10, including longer title fragments within each cell. |
| [settings-phone.png](settings-phone.png) | Native settings show the same dark renderer, a visible event-title preview, and persistent save action. |
| [settings-font130.png](settings-font130.png) | At 1.3× font scale the taller preview still shows event titles beneath date numbers. |
| [settings-tablet.png](settings-tablet.png) | Light preview within the dark native settings shell; event/date sliders, automatic capacity, and other native controls are visible. |

The finish reviewer supplied a **ship** disposition after its two material fixes: automatic capacity and enlarged-font preview height. This documentation pass corroborates those fixes through the source and captures; it does not repeat the finish review or claim new device tests.

Functional behavior and test scope remain documented in [docs/WIDGETS.md](../../docs/WIDGETS.md): local snapshot updates, app-mediated server sync, separate instance preferences, save/cancel behavior, recurrence support, and the 49-month snapshot window. The evidence is from an Android emulator AppWidgetHost with development-only sample schedules. Physical devices, individual home launchers, and battery behavior remain outside that evidence.

## Preservation and discrepancies

- `DESIGN.md`, `PRODUCT.md`, the surface brief, and `docs/WIDGETS.md` were preserved. No `.impeccable/design.json` existed at this handoff, and none was created.
- `PRODUCT.md` still declares platform `web` despite its Android stack and this native extension. This pre-existing declaration drift is reported only; it was not repaired.
- This pass writes only `.impeccable/review/documentation.md`. It makes no UI, code, external-service, or device changes.
- Widget geometry, shapes, and icons use native layouts and XML drawables/vectors. No new shipping raster was introduced. The linked PNGs are local emulator review evidence, not product imagery.
