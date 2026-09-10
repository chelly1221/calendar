# 달력

note·연락처와 같은 시리즈의 개인용 CalDAV 앱입니다. Pretendard 글꼴과 검정·진회색 테마, 보라·분홍·주황 캘린더 아이콘을 사용합니다.

- 웹: https://calendar.3chan.kr
- Android: `kr.threechan.calendar`, [달력 0.1.0 설치](https://calendar.3chan.kr/downloads/calendar-0.1.0.apk)
- 서버: `3chan@100.89.61.28`, `/srv/caldav`, Docker Compose
- 내장 연결: `https://audax-vm.tail62313c.ts.net:8445`
- 표준 CalDAV: `https://audax-vm.tail62313c.ts.net:8445/dav/calendar/default/`
- NAS 백업: `100.75.89.101`, `/volume2/Caldav/backups` (`Caldav` SMB 공유)

## 사용

**Tailscale로 로그인 → Tailscale 계정 인증하기**에서 note와 같은 계정으로 기기를 인증하면 달력이 열립니다. 웹과 Android에 Tailscale 엔진이 들어 있으며 별도 VPN 앱이나 공용 연결 키는 필요하지 않습니다. 기기·브라우저·도메인마다 처음 한 번 본인 인증이 필요합니다. 승인 계정은 서버 허용 목록과 일치해야 합니다.

월간·주간·일정 목록에서 날짜를 선택하고 **새 일정**을 누릅니다. 제목·시간·종일·장소·메모와 매일/매주/매월/매년 반복을 지원합니다. 시간은 현재 기기 시간대로 표시합니다. 새 시간 일정은 UTC로 저장하고, 종일 일정의 종료일은 화면에서 마지막 날까지 포함합니다. CalDAV의 DTEND는 표준에 맞게 그 다음 날로 기록합니다.

반복 일정 편집은 전체 시리즈에 적용합니다. 삭제에서는 이번 일정만 또는 전체를 선택할 수 있습니다. 가져온 RRULE·RDATE·EXDATE·반복 예외·VTIMEZONE은 원본 ICS에 보관합니다. 제목과 메모만 바꿀 때 원래 시간대·초 단위 값은 유지합니다. 반복 방식을 바꾸면 기존 예외를 초기화합니다. 이 버전은 미래 시리즈 분할이나 개별 발생 일정의 시간 변경 UI, 초대 이메일 발송, 알림 예약, 휴대폰 기본 캘린더 연동을 제공하지 않습니다.

**설정 → 캘린더 추가**에서 이름과 색상을 지정합니다. 새 캘린더 생성에는 서버 연결이 필요합니다. 캘린더 이름 옆 체크를 끄면 이 기기에서 숨깁니다. 검색은 현재 표시 기간의 제목·장소·메모를 찾습니다. 데스크톱에서 `N`은 새 일정, `T`는 오늘입니다.

저장하면 먼저 기기에 기록하고 연결되면 전송합니다. 앱 사용 중 30초마다, 저장할 때, 화면에 복귀할 때 동기화합니다. Android가 앱을 정지하거나 강제 종료한 동안에는 동기화하지 않으며 다음 실행 때 이어집니다. 이전에 인증한 기기는 연결이 없어도 **기기에 저장된 달력 열기**로 일정을 편집할 수 있습니다. 동시 수정은 로컬 내용을 새 UID의 **충돌 사본**으로 보존하고 서버의 변경도 유지합니다. 삭제와 수정이 충돌하면 수정된 서버 일정을 보존합니다.

## 가져오기와 내보내기

ICS 가져오기는 파일 20MB·일정 10,000개까지입니다. 리소스 하나는 2MB까지이며 VEVENT와 관련 VTIMEZONE을 지원합니다. 같은 대상 캘린더의 같은 UID는 건너뛰어 기존 일정을 덮어쓰지 않습니다. 해석할 수 없는 반복 일정은 오류로 표시하고 원본을 보관합니다.

**전체 내보내기**는 캘린더별 ICS, 이름·색상을 담은 `calendars.json`, 안내문을 ZIP으로 저장합니다. 복원할 때 ZIP을 풀고 대상 캘린더를 만든 뒤 ICS를 각각 가져옵니다. 서로 다른 캘린더에 같은 UID가 있어도 별도 파일로 보존합니다. Tailscale 개인 키·NAS 비밀번호는 내보내기에 포함하지 않습니다.

## 개발과 Android 빌드

Node.js 22.23.2 이상, Android SDK 36, JDK 21 이상을 사용합니다.

```sh
npm ci
npm test
npm run typecheck
npm run build
npm run build:server
npm run dev
```

개발 주소는 `http://127.0.0.1:5175`입니다. `?preview=1`은 로컬 개발에서만 동작하며 별도의 `calendar-preview-data` 저장소에 예시 일정을 만듭니다. 프로덕션에서는 이 경로와 예시 데이터를 빌드에서 제거합니다.

내장 Tailscale WASM 생성 방법은 [네트워크 빌드 안내](networking/tailscale/README.md)를 참고하세요. 처음 웹 빌드 전 WASM을 만들어야 합니다. 웹 폰트와 아이콘도 로컬 제공하며 CDN에 의존하지 않습니다.

```powershell
$env:JAVA_HOME='C:\Program Files\Android\Android Studio\jbr'
$env:ANDROID_HOME='C:\Users\chell\AppData\Local\Android\Sdk'
npm run build
npm run android:sync
npm run android:release
```

서명 파일 `.local/calendar-release.jks`와 `.local/android-signing.json`은 후속 업데이트에 반드시 필요합니다. Git·웹·APK에는 포함하지 않습니다. `scripts/build-icons.mjs`는 favicon PNG/ICO, Apple/PWA, Android 기본 아이콘을 생성하고 `scripts/build-android-vector.mjs`는 적응형 아이콘·시작 화면 도안을 생성합니다.

## 운영

Radicale, API, 정적 웹을 서로 분리합니다. API는 호스트의 `127.0.0.1:8791`에만 노출하고 Tailscale Serve 8445가 인증된 사용자 헤더를 전달합니다. 실제 원본은 `/srv/caldav/state/radicale`이며 공개 `calendar-web` 컨테이너에는 일정·NAS·비밀 키가 없습니다. Caddy가 `calendar.3chan.kr`을 `calendar-web:8792`로 연결하고 HTTPS를 관리합니다. `/.well-known/caldav` 및 `/dav/`는 비공개 Tailscale 주소에서만 제공합니다. 표준 클라이언트는 해당 기기의 Tailscale 연결이 필요합니다.

NAS는 SMB 3.1.1 암호화 연결로 `/mnt/caldav`에 마운트됩니다. 백업은 매일 한국 시간 오전 4시 전후에 실행하고 성공한 최근 30개를 보관합니다. Radicale을 잠시 멈춰 로컬 스냅샷을 만든 뒤 즉시 다시 시작합니다. 그 후 NAS에 복사하고 SHA-256와 압축 파일 읽기를 검증합니다. NAS 연결이 끊겨도 서버의 일정 편집은 계속됩니다. 백업 마운트와 저장소 식별자가 맞지 않으면 잘못된 로컬 경로에 백업하지 않습니다.

```sh
cd /srv/caldav
docker compose ps
sudo systemctl status calendar-backup.timer
sudo systemctl start calendar-backup.service
sudo python3 scripts/verify-backup.py
curl -f http://127.0.0.1:8791/api/health
```

[운영·복구 절차](docs/OPERATIONS.md), [검증 기록](docs/VERIFICATION.md).

기술 참고: [Radicale](https://radicale.org/v3.html), [Tailscale Serve](https://tailscale.com/docs/features/tailscale-serve), [ical.js](https://kewisch.github.io/ical.js/api/ICAL.Event.html). 원본과 수정한 Go 브리지의 BSD 라이선스 및 의존 라이선스는 내장 엔진과 함께 배포합니다.
