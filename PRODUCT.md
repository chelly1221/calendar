# 달력

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

note 시리즈의 React·TypeScript·Capacitor를 계승한다. 웹은 Vite, Android는 동일한 화면을 감싼 앱이다. Docker에서 Radicale과 비공개 API, 정적 웹을 분리한다.

## Users and purpose

사용자가 자기 서버에 일정을 보관하고 웹과 Android에서 동기화하는 개인용 CalDAV 앱. 앱 이름은 달력이다.

## Capabilities and constraints

확정: 내장 Tailscale, 서버 100.89.61.28, NAS 100.75.89.101의 /volume2/Caldav 백업, calendar.3chan.kr, chelly1221/calendar Git 저장소.

이번 구현의 가정: 월·주·일정 목록, 반복 일정, 여러 캘린더, ICS 가져오기·내보내기, 오프라인 편집을 기본 범위로 한다. 교대근무와 다른 서비스에서의 가져오기는 별도 요청 전에는 포함하지 않는다.

## Brand commitments

note의 검정·진회색 화면, Pretendard와 보라·분홍·주황 아이콘을 그대로 이어간다. 사용자 문구 중 연락처 favicon은 시리즈 스타일의 달력 아이콘을 의미한다고 가정한다.

## Product principles

일정은 먼저 기기에 보관한다. 충돌한 수정은 별도 사본으로 남긴다. 비공개 일정은 내장 Tailscale로만 전송한다. NAS 장애가 서버의 일정 편집을 막지 않는다. 빈 달력에는 가짜 일정을 넣지 않는다.
