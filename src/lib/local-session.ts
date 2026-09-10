import { db, initializeDatabase, type CalendarDB } from "./database";

export async function restoreLocalProfile(database: CalendarDB = db): Promise<{ login: string; name: string } | null> {
  if (database === db) await initializeDatabase();
  const row = await database.meta.get("profile");
  if (!row) return null;
  try {
    const profile = JSON.parse(row.value);
    return typeof profile.login === "string" && profile.login.length > 0
      ? { login: profile.login, name: typeof profile.name === "string" ? profile.name : "내 계정" }
      : null;
  } catch { return null; }
}
