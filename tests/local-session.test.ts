import "fake-indexeddb/auto";
import { expect, it } from "vitest";
import { CalendarDB } from "../src/lib/database";
import { restoreLocalProfile } from "../src/lib/local-session";

it("restores local access without server authentication and respects logout", async () => {
  const database = new CalendarDB("startup-" + crypto.randomUUID());
  try {
    expect(await restoreLocalProfile(database)).toBeNull();
    await database.meta.put({ key: "profile", value: JSON.stringify({ login: "offline-test", name: "로컬" }) });
    expect(await restoreLocalProfile(database)).toEqual({ login: "offline-test", name: "로컬" });
    await database.meta.delete("profile");
    expect(await restoreLocalProfile(database)).toBeNull();
    await database.meta.put({ key: "profile", value: "broken-json" });
    expect(await restoreLocalProfile(database)).toBeNull();
  } finally { await database.delete(); }
});
