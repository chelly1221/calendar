# Android background sync and device calendars

Mode: Operate. Target: `src/BackgroundSyncSettings.tsx`, `src/DeviceCalendarSettings.tsx`, and their rules in `src/styles.css`. Documented from calendar 0.2.3 on 2026-09-11.

## Direction contract

**THESIS:** Make closed-app sync understandable and let the owner resolve only restrictions actually present on this Android device.

**OWN-WORLD:** Inherit the note-series neutral dark settings, local Pretendard, restrained borders, and existing dialog. This is an extension of the incumbent system.

**STORY:** Read scheduling and recent outcome; resolve an unmet setting; return to a refreshed status. Separately select which device calendars to connect and how changes flow.

**FIRST VIEWPORT:** Within the existing scrolling settings dialog, the background section leads with a 15px heading and 13px explanation, then outcome and relevant explanation/action pairs. Device-calendar rows show name, account, color and mode; save and refresh follow the list and deletion explanation.

**FORM:** Code-led refinement of existing settings; no new form selection or seed key applies. Buttons and selects have 48px minimum height; device rows stack below 380px.

**FINISH:** unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Behavior to preserve

- The Android-only surface reports native battery, background execution, data saver and unused-app restrictions. Show actions only for unmet settings; unknown unused-app status stays unknown. Recheck on returning from system settings. Errors use an alert; successful device connection uses a status message.
- Background sync uses authenticated local storage and the embedded Tailscale engine without sync notifications or a foreground service. Android schedules roughly every 15 minutes and after leaving the app; power restrictions can delay execution. Force stop requires reopening. Recent outcome and successful time are separate from permission readiness. See `README.md` for the runtime contract.
- Device calendars start disconnected. Request read access to list Android Calendar Provider sources; request write access only when a selected two-way source needs it. Read-only sources offer import only. A denied permission exposes the app-permissions action.
- Import reflects source additions, edits and deletions into the app/server copy. Two-way also reflects this calendar's app additions, edits and deletions to the source. Disconnect retains imported copies. Concurrent deletion/edit preserves the edit as a conflict copy. Attendees and invitations remain managed in the original calendar app; private calendars outside the provider cannot be listed.
- Keep empty, denied, loading, busy, error and success states explicit. Account identity accompanies calendar names; color supplements text. Saving selection initiates sync and makes device events available without waiting for the server.

## Finish evidence

Finish review disposition: ship, no material fixes, as handed off by the finish reviewer. Native phone/tablet captures: `../review/background/calendar-phone.png`, `calendar-tablet.png`, `calendar-device-phone.png`, `calendar-device-tablet.png`. Captures are review evidence, not shipping imagery. Documentation compared components, styles, README and incumbent PRODUCT/DESIGN; preserve existing system files. Remaining platform/testing limits belong in `docs/VERIFICATION.md`, not visual rules.
