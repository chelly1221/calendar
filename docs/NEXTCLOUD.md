# Nextcloud에서 가져오기

Nextcloud 원본은 읽기만 하며, 달력 서버에 한 번 복사한다. 이후 달력 웹·Android는 달력 서버와 동기화한다. Nextcloud와 지속적으로 양방향 동기화하는 기능은 아니다.

## 원본 추출

`scripts/export-nextcloud.php`는 Nextcloud 32의 CalDAV backend를 사용한다. 사용자 캘린더 이름·색상·설명·시간대와 각 원본 ICS, SHA-256, sync token을 JSON으로 보관한다. 추출 전후 sync token이 달라지면 실패하여 다시 추출하도록 한다. 휴지통의 삭제된 일정은 가져오지 않는다. 구독 URL은 별도이며 `occ dav:list-subscriptions 3chan`으로 먼저 확인한다.

서버에서 스크립트를 Nextcloud 컨테이너에 복사한 뒤 `www-data`로 실행한다. 파일 이름은 추출마다 새 시각을 사용한다.

```sh
cd /srv/caldav
umask 077
mkdir -p private
docker cp scripts/export-nextcloud.php nextcloud_app:/tmp/calendar-export.php
docker exec -u www-data nextcloud_app php /tmp/calendar-export.php 3chan > private/nextcloud-YYYYMMDDTHHMMSS.json
```

명령 성공을 확인한 파일만 로컬의 `.local/nextcloud-import/source.json`으로 가져온다. 원본·검사 보고서는 개인정보를 포함하므로 Git과 공개 웹에 넣지 않는다.

## 검사와 적용

OS Tailscale에 연결하고 허용 계정으로 접근 가능한 개발 PC에서 실행한다.

```sh
npx tsx scripts/import-nextcloud.ts .local/nextcloud-import/source.json --check
npx tsx scripts/import-nextcloud.ts .local/nextcloud-import/source.json --apply
```

전체 파일의 SHA-256, VEVENT 유효성, 캘린더별 중복 UID를 먼저 검사한다. 지원하지 않는 항목이 있으면 쓰기 전에 실패한다. 원본 캘린더마다 고정 ID를 생성하고 이름과 RGB 색상을 유지한다. 같은 원본으로 다시 실행하면 일치하는 일정은 건너뛰며, 대상이 수정되어 있으면 중단한다. 새 일정 쓰기는 `If-None-Match: *`를 사용한다. 기존 달력이나 일정을 지우지 않는다.

완료 후 모든 일정의 원본·서버 내용을 재비교한다. 비교 대상에는 VTIMEZONE, 반복 예외, 알림, 사용자 정의 속성이 포함된다. 속성 순서·줄 접기·vobject의 floating-time 내부 표식만 표기 차이로 취급한다. 검사 결과는 원본 옆 `.import-report.json`에 기록한다. 쓰기 없이 재검사하려면 `--verify`를 사용한다.

캘린더 단위의 기본 시간대·설명은 서버에서 다음 단계로 적용한다. 대상의 이름·색상을 확인하고 없는 속성만 추가하며, 기존 속성이 다르면 중단한다.

```sh
python3 scripts/import-nextcloud-properties.py private/nextcloud-YYYYMMDDTHHMMSS.json
```

## 위치 좌표 보존

vobject 0.9.9의 기본 text parser는 `X-APPLE-STRUCTURED-LOCATION`의 `geo:위도,경도`를 쉼표에서 잘라 경도를 잃는다. `server/sitecustomize.py`가 VEVENT에 이 URI 속성을 등록하여 원문을 보존한다. Radicale Docker 이미지의 `PYTHONPATH`로 서버 실행과 복원 검사 모두에 적용한다. `tests/radicale_extensions_test.py`는 VALUE=URI 유무 및 연속 저장 시 두 좌표 보존을 검사한다. 이 모듈을 빼고 Radicale을 실행하면 해당 속성이 손상될 수 있다.

## NAS 검증

가져오기 완료 후 보고서를 서버의 `private/`에 보관하고 실행한다.

```sh
cd /srv/caldav
sudo systemctl start calendar-backup.service
sudo python3 scripts/verify-backup.py --import-report private/nextcloud-import-report.json --source-export private/nextcloud-YYYYMMDDTHHMMSS.json
```

NAS 스냅샷을 임시 디렉터리에 복원하여 가져온 전체 리소스의 SHA-256를 서버에서 읽은 내용과 비교하고, 별도 Radicale 컨테이너로 저장소를 검사한다. 이후 사용자가 일정을 수정했다면 당시 가져오기 보고서와 최신 스냅샷이 달라질 수 있으므로 해당 시점의 스냅샷을 사용한다. 추출 원본과 보고서도 NAS `imports/`에 별도로 보관한다.
