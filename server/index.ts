import { createApp } from "./app";
const app = createApp({
  allowedLogins: (process.env.TAILSCALE_ALLOWED_LOGINS ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean),
  davOrigin: process.env.DAV_ORIGIN ?? "http://radicale:5232",
  backupStatusPath: process.env.BACKUP_STATUS_PATH,
});
await app.listen({ port: Number(process.env.PORT ?? 8791), host: process.env.HOST ?? "127.0.0.1" });
for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => void app.close());
