# 달력 운영과 복구

배포 위치 `/srv/caldav`, Compose 프로젝트 `caldav`. note·연락처 서비스, Caddy의 기존 라우트, 다른 Tailscale Serve 포트는 유지한다. 달력은 8791/8792 및 Tailscale 8445를 사용한다.

## 배포 갱신

로컬에서 테스트·타입 검사·웹과 서버 빌드를 완료한다. Android를 갱신하면 `package.json`, `android/app/build.gradle`, `src/App.tsx`의 다운로드 버전을 같이 갱신하고 원래 서명 키를 사용한다. `dist/`, `dist-api/`, `server/`, Dockerfile, compose.yaml, scripts, releases를 서버에 전달한다. `.env`와 state를 덮어쓰지 않는다.

```sh
cd /srv/caldav
docker tag calendar:0.1.0 calendar:previous
docker compose build
docker compose up -d
curl -f http://127.0.0.1:8791/api/health
```

컨테이너 구성이 변경되지 않은 배포를 되돌릴 때는 `calendar:previous`를 현재 이미지 태그로 복사하고 `docker compose up -d --no-build --force-recreate api web`을 실행한다. state는 그대로 둔다. Compose나 Radicale 버전을 바꿀 때는 해당 버전의 소스와 설정도 함께 보관한다.

## 백업 확인

`calendar-backup.timer`가 한국 시간 04:00, 최대 60초 지연으로 실행된다. 마지막 결과는 `state/status/backup.json`, 상세 오류는 `journalctl -u calendar-backup.service`에 있다. NAS 비밀번호는 `/etc/caldav/nas.credentials`, NAS 저장소 식별자는 `/etc/caldav/storage-id`, NAS 표식은 `.calendar-backup-storage`이다. 모두 root 전용으로 관리한다.

수동 백업은 `sudo systemctl start calendar-backup.service`. 일관된 스냅샷 생성 중에만 Radicale이 잠시 멈춘다. 실패·프로세스 종료 시에도 systemd의 ExecStopPost가 Radicale을 다시 시작한다. API는 그동안 실패를 반환하고 앱은 저장 내용을 기기에 유지한다. NAS 복사에 실패한 `.partial`은 성공 백업으로 취급하지 않는다.

```sh
sudo python3 /srv/caldav/scripts/verify-backup.py
```

이 검사는 최신 NAS 백업의 SHA-256를 비교하고 임시 디렉터리에 풀어 네트워크가 없는 별도 컨테이너에서 `radicale --verify-storage`를 실행한다. 운영 저장소는 변경하지 않는다.

## 실제 복원

1. 복원할 백업과 함께 있는 `.sha256`를 확인한다. 기기에서 아직 동기화되지 않은 변경이 있다면 먼저 전체 내보내기로 보관한다.
2. `docker compose stop api radicale`로 쓰기를 멈춘다. 현재 `state/radicale`을 삭제하지 말고 시각을 붙인 별도 이름으로 옮겨 보관한다.
3. 신뢰한 백업을 임시 디렉터리에 풀고 `verify-backup.py`와 같은 저장소 검사를 통과시킨다. 검사된 `radicale` 디렉터리를 `state/radicale`로 복사하고 UID/GID 1001, 디렉터리 0700·파일 0600 권한을 적용한다.
4. `docker compose up -d radicale api`를 실행하고 health, CalDAV 목록, 일정 몇 개를 확인한다. 앱에서 동기화한다. 복원 시점 이후 기기 수정은 ETag 충돌 사본으로 남을 수 있으므로 양쪽 내용을 확인한다.

`.env`의 허용 계정, NAS 로그인, Android 서명 키는 일정 백업에 포함하지 않는다. 서버 재설정 시 `scripts/provision-host.py`는 기존 note 운영 설정을 참고하므로 note가 없는 새 서버에서는 허용 계정·NAS 자격 증명을 먼저 별도로 설정해야 한다. 기존 NAS 저장소 식별자를 검사 없이 새 값으로 바꾸지 않는다.

## 웹 업데이트

새 웹 버전은 화면에 업데이트 안내가 표시된다. 작성 중인 일정을 저장하고 업데이트한다. IndexedDB 일정과 Tailscale 키는 보존한다. Service Worker는 앱 파일만 캐시하며 API/DAV 응답·APK 다운로드는 캐시하지 않는다.


## 자동 갱신 복구 (2026-09-15)

Android는 저장된 활성화 상태를 기준으로 WorkManager의 15분 주기 작업을 유지합니다. 재부팅과 APK 교체 시 수신기가 주기 작업과 단발 작업을 다시 예약하며 중복 예약을 막습니다. 로그아웃 또는 자동 갱신 해제 상태는 복구 과정에서 다시 활성화하지 않습니다. 네트워크 제약과 실패 시 지수 백오프를 유지합니다.

자동 연결은 인증 창을 열지 않습니다. 연결 대기가 45초를 넘으면 대기·구독을 취소하고 멈춘 통신 엔진을 정리하여 다음 시도에서 새 연결을 만듭니다. 재인증이 필요한 경우 작업 결과를 auth로 남기며 성공으로 기록하지 않습니다. 화면 복귀, 네트워크 복구, pageshow와 기존 주기 갱신도 자동 연결 복구를 사용합니다. Android의 숨겨진 화면은 별도 백그라운드 작업과 중복 동기화하지 않습니다.

최근 앱 목록에서 닫거나 프로세스가 종료되어도 Android가 예약 작업을 실행할 수 있지만, 절전 정책에 따라 15분보다 늦어질 수 있습니다. 설정의 강제 종료는 다시 앱을 열 때까지 실행을 막습니다. 웹은 탭·브라우저 종료 후 기기 동기화를 보장하지 않으며 다시 열거나 연결이 복구되면 갱신합니다.

검증: 웹 빌드 및 자동 연결 복구·headless runner 회귀 테스트 통과. Android debug 앱과 instrumentation APK 빌드 통과. Android 16 임시 에뮬레이터에서 Activity 없이 번들 작업 실행, 미설정 계정 건너뛰기, 중복 없는 예약 및 boot/update 복구 경로를 검증했습니다. 실제 재부팅 주기, 제조사별 절전 상태와 실계정 장시간 전송은 이번 테스트 범위에 포함하지 않았습니다. 배포용 APK와 운영 웹은 별도 배포가 필요합니다.


## 2026-09-15 릴리스 0.2.4

최신 UI 및 자동 백그라운드 복구 변경을 웹과 기존 키로 서명한 Android APK에 반영합니다. package 버전·versionCode·다운로드 링크를 함께 갱신했습니다. 공개 API 차단과 기기·NAS 데이터 보존 구성을 유지합니다.

검증: 네 앱의 웹/서버 빌드와 280개 회귀 테스트 통과. APK 서명이 이전 릴리스와 일치하며 APK 내 웹 파일이 새 production 빌드와 일치합니다. 배포 아티팩트와 이전 이미지는 서버의 .deploy/release-0.2.4-20260915에 보관합니다.

배포 완료: 공개 웹 아티팩트와 다운로드 APK의 SHA-256 일치를 확인했고, 공개 API는 404로 차단됩니다. 기존 서명과 증가한 Android 버전 번호를 검증했습니다.
