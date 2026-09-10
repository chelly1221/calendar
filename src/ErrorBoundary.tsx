import { Component, type ReactNode } from "react";
export default class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed)
      return (
        <main className="access-page">
          <div className="access-content">
            <h1>달력을 다시 열어 주세요.</h1>
            <p className="access-description">
              화면을 불러오지 못했어요. 저장된 일정은 기기에 보관되어 있어요.
            </p>
            <button className="primary" onClick={() => location.reload()}>
              다시 열기
            </button>
          </div>
        </main>
      );
    return this.props.children;
  }
}
