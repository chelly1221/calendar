# Calendar workspace chrome

Operate mode. Follow the Photo / Note series: local Pretendard, neutral dark
surfaces, restrained icons, and compact headers. Preserve month navigation,
event colors, local editing and synchronization feedback.

Use one persistent 44px menu button at x=10px, y=4px plus the safe area. Its
22px three-line glyph morphs into an X and back over 280ms without replacement.
Mobile navigation fills the screen, with inert background, focus containment,
Escape dismissal and reduced-motion support. Settings and download are 21px
icons at the top of navigation, without hover or pressed backgrounds.

Title: 17px / 24px, weight 600, tracking -0.02em, mobile start x=58px. The first
header row is 48px including its top padding. Only the monthly calendar remains;
search, view selection, today, toolbar sync and floating add controls are removed.
Settings uses the same title and close coordinates.
Desktop retains the navigation pane and a 56px toolbar.

Verify with synthetic localhost events at 319px and desktop widths. This change
does not publish the website or build a replacement Android release.

Web auto-sync continues in hidden tabs while browser timers run; Android inactive sync uses the existing native worker. Browser suspension and OS scheduling still apply.

Monthly calendar (2026-09-15): render only whole weeks intersecting the month (4/5/6). Fill remaining viewport height, including on mobile. A day cell is one accessible button; its event-title pills are noninteractive previews. Adapt visible pill count to row height, show +N for overflow, and expose all items through the full-screen day dialog. Keep the close control at the shared x=10px coordinate, allow Escape, preserve the month and return focus. Event editing opens above the day dialog. Retain native dialog focus containment and reduced motion.

Event editing uses the same full-screen shell and 48px mobile / 56px desktop header. Close stays at the shared left coordinate; Save remains in the header and submits the form. Use a flat, centered form with thin separators, borderless inputs and a restrained all-day switch. Preserve validation, recurrence warnings, deletion confirmation and unsaved-change protection; confirmations scroll into view and receive focus. No card container, shadows or boxed form groups.

Settings follows the full-screen editor shell with a flat 680px content column, shared close coordinates and compact section spacing. Account, connection/backup, calendar creation and transfers use borderless actions; backup and import explanations are native expandable details. Android-only settings remain available and inherit the same flat controls. The navigation owns APK download; settings contains no release/download promotional footer. Calendar event previews use 8px text, 16px pills and hard clipping rather than ellipsis, with stronger calendar-color saturation.

Settings is a panel owned by Navigation: one persistent X/menu trigger, background inert, focus containment, Escape, and no separate dialog close button.
