# 내장 Tailscale

note 시리즈와 동일한 Go/WASM WireGuard·userspace TCP/IP 엔진입니다. 브라우저·Android WebView의 Worker에서 동작하며 DERP WebSocket 릴레이를 사용합니다. 실제 데이터는 `tsdial.Dialer.UserDial`을 통해 서버의 Tailscale Serve로 전송하고, 연결 내부에서도 HTTPS 인증서를 검증합니다. 공개 API 프록시나 직접 fetch 대체 경로는 없습니다.

- upstream: https://github.com/tailscale/tailscale
- 고정 커밋: `3d3261b66ee1dd57e390abce4c2828f8b542d5a2`
- 사용한 Go: `go1.27.1` (note에서 검증한 동일 도구)
- 출력: `public/tailscale/0.1.0/`
- 실제 해시·바이너리 크기: `build.json`

```sh
git clone https://github.com/tailscale/tailscale.git .local/tailscale
git -C .local/tailscale checkout 3d3261b66ee1dd57e390abce4c2828f8b542d5a2
# Go 1.27.1을 .local/go에 설치하거나 CALENDAR_GO에 go 실행 파일 경로를 설정합니다.
npm run build:tailscale
```

빌드 스크립트는 upstream 파일을 고정 커밋에서 읽고 달력 전용 브리지를 적용합니다. `calendar_js.go`는 고정 origin `https://audax-vm.tail62313c.ts.net:8445`의 `/api/`와 GET/POST/PUT만 허용합니다. 요청과 응답은 16MiB로 제한하고 취소·45초 제한을 적용합니다. TLS 루트는 ISRG Root X1/X2이며 인증서 검증은 해제하지 않습니다. SSH·임의 URL fetch는 JS 내보내기에서 제거합니다. 외부 진단 로그 전송도 끕니다.

각 origin의 `calendar-tailscale` IndexedDB에 노드 개인 키를 저장합니다. note·연락처의 키 저장소와 공유하지 않습니다. 개인 키는 Git, 서버 일정, NAS 백업, 전체 내보내기에 포함하지 않습니다. Tailscale 로그인 URL은 공식 도메인으로 한정하며 Android는 Custom Tab으로 인증하고 앱으로 돌아옵니다.

SharedWorker 지원 시 여러 탭이 하나의 엔진을 공유하고, Web Locks로 같은 키를 동시에 사용하지 못하게 합니다. 다른 창에서 연결을 점유하고 있다는 메시지가 표시되면 그 달력 창을 닫고 다시 엽니다. Android에는 `.wasm`을 직접 포함하며 HTTP 전송용 `.br`·`.gz` 사본은 APK에서 제거합니다.
