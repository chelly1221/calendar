import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
export default function WebUpdate() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  useEffect(() => {
    if (!import.meta.env.PROD || Capacitor.isNativePlatform() || !("serviceWorker" in navigator))
      return;
    let registration: ServiceWorkerRegistration | undefined,
      active = true;
    const check = () => {
      if (document.visibilityState === "visible") void registration?.update().catch(() => {});
    };
    void navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => {
        registration = reg;
        if (active && reg.waiting) setWaiting(reg.waiting);
        reg.addEventListener("updatefound", () => {
          const installing = reg.installing;
          installing?.addEventListener("statechange", () => {
            if (active && installing.state === "installed" && navigator.serviceWorker.controller)
              setWaiting(reg.waiting);
          });
        });
      })
      .catch(() => {});
    document.addEventListener("visibilitychange", check);
    return () => {
      active = false;
      document.removeEventListener("visibilitychange", check);
    };
  }, []);
  if (!waiting) return null;
  return (
    <div className="web-update" role="status">
      <strong>새 버전의 달력이 준비됐어요.</strong>
      <p>작성 중인 일정을 저장한 뒤 업데이트해 주세요.</p>
      <button
        className="primary"
        onClick={() => {
          navigator.serviceWorker.addEventListener("controllerchange", () => location.reload(), {
            once: true,
          });
          waiting.postMessage("ACTIVATE_UPDATE");
        }}
      >
        업데이트
      </button>
      <button className="text-button" onClick={() => setWaiting(null)}>
        나중에
      </button>
    </div>
  );
}
