import names from "color-name";

/** Normalize RFC 7986 CSS names and common imported RGB/RGBA hex colors. */
export function eventColor(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const color = value.trim().toLowerCase();
  if (/^#[0-9a-f]{3}$/.test(color)) return "#" + [...color.slice(1)].map(c => c + c).join("");
  if (/^#[0-9a-f]{6}([0-9a-f]{2})?$/.test(color)) return color.slice(0, 7);
  const rgb = Object.hasOwn(names, color) ? names[color] : undefined;
  return rgb ? "#" + rgb.map(n => n.toString(16).padStart(2, "0")).join("") : undefined;
}
