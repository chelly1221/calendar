# 달력

note·연락처와 같은 시리즈의 개인용 CalDAV 앱입니다. Pretendard 글꼴과 검정·진회색 테마, 보라·분홍·주황 캘린더 아이콘을 사용합니다.

- 웹: https://calendar.3chan.kr
- Android: `kr.threechan.calendar`, [달력 0.2.3 설치](https://calendar.3chan.kr/downloads/calendar-0.2.3.apk)
- 서버: `3chan@100.89.61.28`, `/srv/caldav`, Docker Compose
- 내장 연결: `https://audax-vm.tail62313c.ts.net:8445`
- 표준 CalDAV: `https://audax-vm.tail62313c.ts.net:8445/dav/calendar/default/`
- NAS 백업: `100.75.89.101`, `/volume2/Caldav/backups` (`Caldav` SMB 공유)

## 사용

**Tailscale로 로그인 → Tailscale 계정 인증하기**에서 note와 같은 계정으로 기기를 인증하면 달력이 열립니다. 웹과 Android에 Tailscale 엔진이 들어 있으며 별도 VPN 앱이나 공용 연결 키는 필요하지 않습니다. 기기·브라우저·도메인마다 처음 한 번 본인 인증이 필요합니다. 승인 계정은 서버 허용 목록과 일치해야 합니다.

월간·주간·일정 목록에서 날짜를 선택하고 **새 일정**을 누릅니다. 제목·시간·종일·장소·메모와 매일/매주/매월/매년 반복을 지원합니다. 시간은 현재 기기 시간대로 표시합니다. 새 시간 일정은 UTC로 저장하고, 종일 일정의 종료일은 화면에서 마지막 날까지 포함합니다. CalDAV의 DTEND는 표준에 맞게 그 다음 날로 기록합니다.

반복 일정 편집은 전체 시리즈에 적용합니다. 삭제에서는 이번 일정만 또는 전체를 선택할 수 있습니다. 가져온 RRULE·RDATE·EXDATE·반복 예외·VTIMEZONE은 원본 ICS에 보관합니다. 제목과 메모만 바꿀 때 원래 시간대·초 단위 값은 유지합니다. 반복 방식을 바꾸면 기존 예외를 초기화합니다. 이 버전은 미래 시리즈 분할이나 개별 발생 일정의 시간 변경 UI, 초대 이메일 발송과 알림 예약을 제공하지 않습니다. 휴대폰 캘린더 연동은 아래 기기 캘린더 설정을 이용합니다.

**설정 → 캘린더 추가**에서 이름과 색상을 지정합니다. 새 캘린더 생성에는 서버 연결이 필요합니다. 캘린더 이름 옆 체크를 끄면 이 기기에서 숨깁니다. 검색은 현재 표시 기간의 제목·장소·메모를 찾습니다. 데스크톱에서 `N`은 새 일정, `T`는 오늘입니다.

저장하면 먼저 기기에 기록하고 연결되면 전송합니다. 이전에 인증한 기기는 앱을 다시 열 때 저장된 달력을 바로 표시하며, 연결 확인과 동기화는 뒤에서 진행합니다. 인터넷이 없어도 기존 일정을 보고 편집할 수 있습니다. 재인증이 필요하면 설정에서 진행하며, 직접 로그아웃한 경우에는 다시 로그인해야 합니다. 앱 사용 중 30초마다, 저장할 때, 화면에 복귀할 때 동기화합니다. Android에서는 앱이 닫힌 동안에도 예약 작업으로 동기화합니다. 절전 상태에서는 늦어질 수 있으며, 강제 종료한 뒤에는 앱을 다시 열어야 합니다. 동시 수정은 로컬 내용을 새 UID의 **충돌 사본**으로 보존하고 서버의 변경도 유지합니다. 삭제와 수정이 충돌하면 수정된 서버 일정을 보존합니다.

## 홈 화면 위젯

Android에서 **설정 → 홈 화면 위젯 → 위젯 추가**를 누르거나 홈 화면의 빈 곳을 길게 눌러 **위젯 → 달력 → 일정 달력**을 추가합니다. 기본은 화면을 넓게 쓰는 4×5 월간형이며, 가장자리를 늘리면 날짜마다 더 많은 일정이 보입니다. 제목은 한 줄로 표시하고 남는 일정은 `+N`으로 안내합니다.

위젯 오른쪽 위 설정에서 표시할 캘린더, 글자 크기, 일정 개수, 주 시작일, 4~6주 배치, 시간 표시, 테마·색상·투명도와 날짜 터치 동작을 위젯별로 조절할 수 있습니다. 앱에서 저장·동기화하면 위젯에 반영됩니다. 앱이 닫힌 동안에도 저장된 일정을 보여 주며, 백그라운드 동기화가 끝나면 서버·기기 캘린더의 변경을 반영합니다. 서버 연결을 기다리는 동안에도 읽어 온 기기 일정은 위젯에 먼저 반영합니다. [위젯 설정과 검증 안내](docs/WIDGETS.md).

일정 제목을 누르면 앱에서 해당 일정이 바로 열립니다. 반복 일정은 선택한 회차를 구분하며, `+N`을 누르면 그날 일정을 봅니다. 일정 자체에 색상이 지정되어 있으면 우선 적용하고, 없으면 소속 캘린더 색상을 사용합니다. 모든 표시 방식에서 원래 색상의 가는 표시선을 유지합니다. 업데이트 후 앱을 한 번 열면 기존 위젯에도 반영됩니다.

## 가져오기와 내보내기

Nextcloud에서 서버의 기존 캘린더를 옮기는 방법은 [Nextcloud 가져오기 절차](docs/NEXTCLOUD.md)를 참고하세요.

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

## 기기 캘린더 연결

Android의 **설정 → 이 기기의 다른 캘린더**에서 읽기 권한을 허용하고 기기에 등록된 Google·삼성·기기 저장소·DAV 동기화 계정의 캘린더를 각각 선택합니다. Android Calendar Provider에 공개되지 않은 앱 내부 캘린더는 조회할 수 없습니다. 목록에는 계정, 이름, 색상, 쓰기 가능 여부가 표시됩니다. 쓰기가 허용된 캘린더만 양방향을 선택할 수 있으며 필요한 경우에만 쓰기 권한을 요청합니다.

- **가져오기:** 원본의 추가·수정·삭제를 앱과 서버의 해당 캘린더에 반영합니다. 앱에서 수정하거나 삭제한 내용을 원본에 쓰지는 않습니다.
- **양방향 동기화:** 해당 캘린더의 추가·수정·삭제를 서로 반영합니다. 새 일정의 대상 캘린더를 선택해 기기 계정으로 보낼 수 있습니다.
- **연결 안 함:** 이후 기기 읽기·쓰기를 중지합니다. 이미 가져온 앱·서버 사본은 유지합니다.

원본의 각 캘린더는 설치 기기별로 구분되는 CalDAV 캘린더로 저장합니다. 반복 규칙, RDATE·EXDATE, 반복 예외, 종일 일정과 개별 색상을 보존합니다. 기기 시간대 정의는 Android 시간대 데이터의 1900~2100년 전환을 포함합니다. 참석자·초대 응답·원본 알림은 기기의 원래 캘린더 앱에서 관리하며, 기존 항목의 참석자나 알림을 덮어쓰지 않습니다. 반복 예외 자체를 제거하는 변경은 원래 캘린더 앱에서 처리해야 합니다.

삭제는 접근 권한이 있고 선택한 캘린더의 목록을 정상적으로 끝까지 읽었을 때만 판단합니다. 계정이 사라지거나 캘린더 식별 정보가 달라지면 새 계정을 자동으로 선택하지 않습니다. 쓰기·삭제 직전에 시리즈 전체 버전과 행 개수를 원자적으로 검사하여 도중에 추가된 예외나 수정된 일정을 덮어쓰지 않습니다. 앱의 삭제와 기기의 수정이 겹치면 원본을 삭제하지 않고 앱에 충돌 사본으로 복원합니다. 기기 삭제와 앱 수정이 겹치면 앱 수정은 기본 캘린더의 충돌 사본으로 보존합니다. 새 일정 쓰기 응답이 유실돼도 같은 기기 일정을 다시 생성하지 않습니다.

## 알림 없는 백그라운드 동기화

Android 앱은 로그인한 뒤 약 15분 간격의 WorkManager 작업과 앱을 닫은 뒤의 단일 예약 작업을 등록합니다. 화면을 열지 않아도 기존 기기 저장소와 내장 Tailscale 연결로 동기화하며, 연결 실패는 지수 지연으로 재시도합니다. 동기화 알림이나 포그라운드 서비스는 사용하지 않습니다. 재부팅·프로세스 종료 뒤에도 Android가 작업을 관리합니다. 강제 종료한 앱은 다시 열어야 하며, 절전·제조사 제한에서는 실행이 늦어질 수 있습니다.

앱이 배터리 최적화 예외, 백그라운드 실행 제한, 데이터 절약 제한, 미사용 앱 활동·권한 자동 중지 상태를 직접 확인합니다. 이미 허용한 항목에는 설정 버튼이나 권한 요청이 나오지 않습니다. 필요한 항목만 이유와 함께 요청하고, 시스템 설정에서 돌아오면 다시 확인합니다. ‘나중에’를 선택하면 하루 동안 자동 요청을 미루며 설정 화면에서는 언제든 처리할 수 있습니다. 확인할 수 없는 상태는 허용됐다고 표시하지 않습니다. 최신 APK 설치 뒤 앱을 한 번 열면 예약과 상태 확인이 시작됩니다.

백그라운드 WebView는 앱과 같은 https://localhost 저장소를 사용합니다. 로그인되지 않은 경우 동작하지 않으며, 백그라운드에서 새 인증 창을 열지 않습니다. 앱에 복귀하면 실행 중인 백그라운드 WebView를 종료하고 전경 연결이 이어받아 같은 Tailscale 기기를 중복 실행하지 않습니다. 작업은 최대 3분으로 제한하며, 로그아웃하면 예약을 취소합니다. 설정 화면에서 최근 실행 결과와 성공 시각을 확인할 수 있습니다.

근거: [Android WorkManager](https://developer.android.com/develop/background-work/background-tasks/persistent/getting-started/define-work), [배터리 절전 제한](https://developer.android.com/training/monitoring-device-state/doze-standby), [미사용 앱 중지 상태 확인](https://developer.android.com/topic/performance/app-hibernation).
