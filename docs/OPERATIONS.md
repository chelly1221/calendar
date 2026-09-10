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
