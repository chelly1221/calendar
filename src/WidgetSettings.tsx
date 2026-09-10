import { useEffect, useState } from "react";
import { CalendarDays, Plus, Settings2 } from "lucide-react";
import { configureWidget, listWidgets } from "./lib/widgets";

export default function WidgetSettings() {
  const [widgets, setWidgets] = useState<{ id: number; name: string }[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    const refresh = () => void listWidgets().then(r => setWidgets(r.widgets)).catch(() => {});
    refresh(); window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, []);
  const open = (id?: number) => void configureWidget(id).catch(() => setError("위젯 설정을 열지 못했어요. 앱을 다시 실행해 주세요."));
  return <section>
    <h3>홈 화면 위젯</h3>
    <div className="setting-row">
      <span><strong>일정이 보이는 월간 달력</strong><small>크기에 맞춰 일정 제목을 한 줄씩 표시해요.</small></span>
      <button className="secondary" onClick={() => open()}><Plus size={16} />위젯 추가</button>
    </div>
    {widgets.map(w => <div className="setting-row" key={w.id}>
      <span><strong><CalendarDays size={15} /> {w.name}</strong><small>위젯 #{w.id} · 개별 설정</small></span>
      <button className="icon-button" aria-label={`${w.name} 위젯 설정`} onClick={() => open(w.id)}><Settings2 size={18} /></button>
    </div>)}
    <p className="field-hint">캘린더 선택·글자 크기·표시 개수·주 시작일·색상·투명도를 조절할 수 있어요. 서버의 새 일정은 앱에서 동기화하면 반영돼요.</p>
    {error && <p role="alert" className="field-hint">{error}</p>}
  </section>;
}
