# 검증 기록

2026-09-11, 달력 0.1.0.

## 자동 검증

- TypeScript strict 검사, 웹 프로덕션 빌드, 서버 번들 빌드 통과.
- 단위·통합 테스트 24개 통과: Unicode/ICS 왕복, 종일 DTEND, 반복·단일 회차 삭제, 표시 기간 밖에서 이동한 예외, 가져온 사용자 속성·DST 시간대 보존, 충돌 사본 UID, 서로 다른 캘린더의 동일 UID ZIP 내보내기, API 재시작 시 기존 캘린더 확인 및 재사용.
- IndexedDB 오프라인 생성·수정·삭제, 두 기기의 동시 수정, 전송 중 추가 편집, PUT 응답 유실 후 중복 방지, 삭제/수정 충돌, 목록 실패 시 로컬 보존, 중복 UID 가져오기 통과.
- API 허용 계정 검사, 공개 origin 차단, 무조건 DAV 쓰기 및 다른 principal 접근 차단, 잘못된 ICS 거부 통과.

## 운영 환경

- Docker `calendar-api`, `calendar-web`, `calendar-radicale` 실행 및 health 확인.
- HTTPS 웹, favicon/PWA/Android 아이콘·다운로드, 공개 `/api/events`의 404 확인.
- 실제 OS Tailscale 연결로 서버 사용자 인증, CalDAV PROPFIND/GET, 두 개의 독립 IndexedDB 클라이언트에서 생성·읽기·수정·충돌 보존·삭제 검증 (`npx tsx scripts/verify-live.ts`). 테스트가 만든 UUID만 정리한다.
- NAS SMB 3.1.1 암호화 마운트, 매일 백업 타이머, 성공 백업의 SHA-256와 archive 읽기, 임시 디렉터리 복원 후 네트워크가 없는 Radicale 컨테이너의 `--verify-storage` 확인. `--backup` 통합 검사에서 검증용 일정 UID가 실제 복원 파일에 들어 있는지도 비교했다. 운영의 검증용 일정은 이후 삭제했다.

## 화면과 Android

- note의 현재 웹·스타일을 기준으로 데스크톱 1280px와 모바일 390px에서 확인. 개발 전용 별도 저장소의 예시 일정으로 월간 화면과 반복 일정 작성·저장을 확인했다.
- 모바일 날짜 입력이 잘리던 문제를 한 열 배치로 수정했다. 디자인 검사 도구의 자동 탐지 결과는 빈 배열이었다.
- Android release APK 서명·빌드 완료. 앱 패키지, 이름, 기본·적응형 아이콘, 시작 화면이 달력 전용이다. 실행 파일에 Go/WASM과 로컬 폰트를 포함한다.
- 프로덕션 WASM이 시작해 공식 Tailscale 인증 URL을 발급하는 단계와 브라우저 오류 없음까지 확인했다. 실제 새 브라우저/Android 기기의 Tailscale 승인 완료 후 내장 연결 전체 경로와 실물 Android 조작은 사용자 첫 실행에서 확인해야 한다. OS Tailscale을 통한 서버 테스트는 내장 WASM의 인증 완료 검증과 구분한다.
