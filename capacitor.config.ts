import type { CapacitorConfig } from "@capacitor/cli";
const config: CapacitorConfig = {
  appId: "kr.threechan.calendar",
  appName: "달력",
  webDir: "dist",
  server: { androidScheme: "https", hostname: "localhost" },
  android: {
    backgroundColor: "#111111",
    allowMixedContent: false,
    webContentsDebuggingEnabled: false,
  },
  plugins: { SystemBars: { style: "DARK" }, SplashScreen: { launchShowDuration: 0 } },
};
export default config;
