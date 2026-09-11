import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  build: { rollupOptions: { input: { main: "index.html", background: "background.html" } } },
  server: { host: "127.0.0.1", port: 5175, strictPort: true },
});
