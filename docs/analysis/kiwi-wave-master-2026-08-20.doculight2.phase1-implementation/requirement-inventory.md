# phase-1 요구사항 인벤토리

원본: `speckiwi list --target phase-1 --json`. 이 표는 편향 없는 입력이며 판단이 들어 있지 않다.

| # | ID | scope | type | status | stability | title |
|---:|---|---|---|---|---|---|
| 1 | CON-ACL-001 | ACL | constraint | planned | stable | 유효 권한을 비정규화하지 않고 요청마다 계산한다 |
| 2 | CON-ACL-002 | ACL | constraint | planned | stable | 거부 규칙을 두지 않고 허용 목록의 합집합만으로 판정한다 |
| 3 | CON-ACL-003 | ACL | constraint | planned | stable | 부여에 적용 범위 선택지를 두지 않는다 |
| 4 | CON-ACL-004 | ACL | constraint | planned | stable | pass-through 여부를 저장하지 않고 매 요청 계산한다 |
| 5 | DR-ACL-001 | ACL | data | planned | stable | 노드마다 지정할 수 있는 부여는 네 종류다 |
| 6 | FR-ACL-001 | ACL | functional | planned | stable | 복사본의 ACL 과 첨부와 링크 처리 규칙 |
| 7 | FR-ACL-002 | ACL | functional | planned | stable | 복사 프리뷰의 접근자 수치는 목적지 기준으로 판정한다 |
| 8 | FR-ACL-003 | ACL | functional | planned | stable | 주체 단위 ACL 일괄 회수를 제공한다 |
| 9 | FR-ACL-004 | ACL | functional | planned | stable | 특정 사용자 관점의 유효 권한 시뮬레이션 화면을 제공한다 |
| 10 | FR-ACL-005 | ACL | functional | planned | stable | 상속 끊김 노드 감사 목록과 상속으로 되돌리기를 제공한다 |
| 11 | FR-ACL-006 | ACL | functional | planned | stable | 이동 전에 접근 가능 인원의 변화를 프리뷰로 보여준다 |
| 12 | IR-ACL-001 | ACL | interface | planned | stable | 접근자 지표를 접근 가능과 ACL 접근자 둘로 분리한다 |
| 13 | IR-ACL-002 | ACL | interface | planned | stable | 공유 모달에 상속 항목을 출처 경로와 함께 읽기 전용으로 표시한다 |
| 14 | IR-ACL-003 | ACL | interface | planned | stable | 권한 지정은 사용자와 그룹을 각각 검색해 추가하는 방식이다 |
| 15 | OBS-ACL-001 | ACL | observability | planned | stable | 관리 권한에 의한 열람을 감사 로그에 남긴다 |
| 16 | SEC-ACL-001 | ACL | security | planned | stable | ACL 대상은 문서와 디렉토리 둘 다이다 |
| 17 | SEC-ACL-002 | ACL | security | planned | stable | 편집 권한은 보기 권한을 포함한다 |
| 18 | SEC-ACL-003 | ACL | security | planned | stable | 권한은 상속과 가산으로만 넓히고 좁히기는 상속 끊기뿐이다 |
| 19 | SEC-ACL-004 | ACL | security | planned | stable | 권한이 없는 문서와 디렉토리는 트리에서 완전히 숨긴다 |
| 20 | SEC-ACL-005 | ACL | security | planned | stable | 접근 가능한 자손을 가진 조상 디렉토리는 이름만 표시한다 |
| 21 | SEC-ACL-006 | ACL | security | planned | stable | 권한 없는 노드의 응답을 존재하지 않는 노드와 구별 불가능하게 한다 |
| 22 | SEC-ACL-007 | ACL | security | planned | stable | 보이지 않는 동명 노드와의 충돌은 자동 리네임으로 처리한다 |
| 23 | SEC-ACL-008 | ACL | security | planned | stable | 슈퍼유저와 워크스페이스 관리 레벨은 ACL 판정을 우회한다 |
| 24 | SEC-ACL-009 | ACL | security | planned | stable | 넓히기와 좁히기의 필요 레벨을 다르게 둔다 |
| 25 | SEC-ACL-010 | ACL | security | planned | evolving | 편집자가 부여한 편집 권한은 다시 부여될 수 있다 |
| 26 | SEC-ACL-011 | ACL | security | planned | stable | 노드 생성자에게 자동으로 편집 권한을 부여한다 |
| 27 | SEC-ACL-012 | ACL | security | planned | stable | 파일 조작별 필요 권한을 조작 단위로 확정한다 |
| 28 | SEC-ACL-013 | ACL | security | planned | stable | 숨은 하위가 있는 디렉토리의 이동과 삭제는 관리 레벨을 요구한다 |
| 29 | SEC-ACL-014 | ACL | security | planned | stable | 워크스페이스 경계를 넘는 이동은 차단하고 복사만 허용한다 |
| 30 | SEC-ACL-015 | ACL | security | planned | stable | 접근자 명단은 관리 전용이고 수치는 편집까지 허용한다 |
| 31 | SEC-ACL-016 | ACL | security | planned | stable | 존재가 구별되지 않는 표면에는 권한 요청 버튼을 두지 않는다 |
| 32 | CON-ARCH-001 | ARCH | constraint | planned | stable | 사내 단일 인스턴스 수백~수천 명 규모를 전제한다 |
| 33 | CON-ARCH-002 | ARCH | constraint | planned | stable | 새 리포에서 백엔드와 프론트엔드를 신규 작성하고 1.0 에서는 기능을 물려받는다 |
| 34 | CON-ARCH-003 | ARCH | constraint | planned | stable | 프론트엔드는 Vite 와 React 와 TypeScript 기반 SPA 로 만든다 |
| 35 | CON-ARCH-004 | ARCH | constraint | planned | evolving | UI 부품을 역할별 지정 패키지로 채택한다 |
| 36 | CON-ARCH-005 | ARCH | constraint | planned | stable | 에디터와 머지와 마크다운 파이프라인은 프레임워크 중립 패키지를 쓴다 |
| 37 | CON-ARCH-006 | ARCH | constraint | planned | stable | 문서 본문의 정본은 CodeMirror 이고 React state 로 올리지 않는다 |
| 38 | CON-ARCH-007 | ARCH | constraint | planned | stable | docs/spec 을 SpecKiwi SRS 구조로 정식화한다 |
| 39 | CON-ARCH-008 | ARCH | constraint | planned | stable | 한 사실은 한 곳에만 적고 개정 시 인용처 전량을 함께 갱신한다 |
| 40 | CON-ARCH-009 | ARCH | constraint | planned | evolving | Phase 라벨은 명시가 없으면 Phase 1 로 판정한다 |
| 41 | FR-ARCH-001 | ARCH | functional | planned | stable | 1.0 의 AI·MCP 기능을 도구 계약과 동작으로 물려받아 신규 작성한다 |
| 42 | OPS-ARCH-001 | ARCH | operational | planned | stable | 빌드 산출물을 2.0 의 Express 서버가 서빙하고 Node 프로세스를 1개로 유지한다 |
| 43 | SEC-ARCH-001 | ARCH | security | planned | stable | MCP 호출에 사용자 인증을 필수화한다 |
| 44 | SEC-ARCH-002 | ARCH | security | planned | stable | MCP 읽기 도구와 벡터검색 결과를 호출자의 ACL 로 필터링한다 |
| 45 | SEC-ARCH-003 | ARCH | security | planned | stable | MCP 쓰기 도구는 대상 노드의 편집 유효 권한이 없으면 거부한다 |
| 46 | CON-ATTACH-001 | ATTACH | constraint | planned | stable | 업로드 파일 형식 무제한 |
| 47 | DR-ATTACH-001 | ATTACH | data | planned | stable | 첨부 저장 레이아웃 — 워크스페이스 루트 .res 디렉토리와 해시 파일명 |
| 48 | DR-ATTACH-002 | ATTACH | data | planned | stable | 첨부 소유 문서 메타데이터 — attachment 테이블 |
| 49 | DR-ATTACH-003 | ATTACH | data | planned | stable | 본문 첨부 링크는 워크스페이스 기준 절대경로로 기록 |
| 50 | FR-ATTACH-001 | ATTACH | functional | planned | stable | 트리 드래그앤드롭 파일 업로드 |
| 51 | FR-ATTACH-002 | ATTACH | functional | planned | stable | 비-md 파일도 트리 목록에 표시 |
| 52 | FR-ATTACH-003 | ATTACH | functional | planned | stable | 비-md 파일 열기 — 이미지는 미리보기, 그 외는 다운로드 링크만 |
| 53 | FR-ATTACH-004 | ATTACH | functional | planned | stable | 문서 편집기 붙여넣기·드래그 첨부 업로드 |
| 54 | FR-ATTACH-005 | ATTACH | functional | planned | stable | 소유 문서 영구 삭제 시 첨부 동반 삭제 |
| 55 | FR-ATTACH-006 | ATTACH | functional | planned | stable | 업로드 파일 크기 제한을 설정에서 지정 |
| 56 | REL-ATTACH-001 | ATTACH | reliability | planned | stable | .res/index.json 재구성 사이드카 |
| 57 | SEC-ATTACH-001 | ATTACH | security | planned | stable | 업로드 대상 디렉토리는 편집 권한을 가진 디렉토리로 한정 |
| 58 | SEC-ATTACH-002 | ATTACH | security | planned | stable | 첨부 접근 권한은 소유 문서의 보기 권한으로 판정 |
| 59 | SEC-ATTACH-003 | ATTACH | security | planned | stable | 첨부 다운로드는 매 요청 권한을 검사 |
| 60 | CON-AUDIT-001 | AUDIT | constraint | planned | stable | 한정어 없는 감사 목록을 지시어로 쓰지 않는다 |
| 61 | DR-AUDIT-001 | AUDIT | data | planned | stable | 사람이 아닌 주체의 행위자는 하위체계별 예약 주체 행이다 |
| 62 | DR-AUDIT-002 | AUDIT | data | planned | stable | 감사 행의 스키마 정본과 2-노드 조작용 두 칸 |
| 63 | DR-AUDIT-003 | AUDIT | data | planned | stable | 2-노드 조작은 복사뿐이며 판정 기준을 명시한다 |
| 64 | IR-AUDIT-001 | AUDIT | interface | planned | stable | 감사 로그 뷰어의 조작 필터는 실제 기록 값에서 파생한다 |
| 65 | IR-AUDIT-002 | AUDIT | interface | planned | stable | 재조정 대기열 화면의 소재와 미해소 건수 배지 |
| 66 | IR-AUDIT-003 | AUDIT | interface | planned | stable | 감사 행 저장은 낱행이고 표시는 묶음 접기다 |
| 67 | OBS-AUDIT-001 | AUDIT | observability | planned | stable | 감사 로그 저장소와 기록 대상 열거의 지위 |
| 68 | OBS-AUDIT-002 | AUDIT | observability | planned | stable | 감사 로그의 행은 기록된 뒤 수정·삭제할 수 없다 |
| 69 | OBS-AUDIT-003 | AUDIT | observability | planned | evolving | 감사 로그의 기록 대상은 열거가 아니라 기준으로 정한다 |
| 70 | OBS-AUDIT-004 | AUDIT | observability | planned | evolving | 다른 화면이 행위자와 시각을 영구히 재현하면 기록하지 않는다 |
| 71 | OBS-AUDIT-005 | AUDIT | observability | planned | stable | 기준으로 재도출된 누락 조작을 기록 대상에 추가한다 |
| 72 | OBS-AUDIT-006 | AUDIT | observability | planned | stable | 인스턴스 설정 변경을 감사 로그에 기록한다 |
| 73 | OBS-AUDIT-007 | AUDIT | observability | planned | stable | 복사의 감사 행 수는 내부 1행 경계 2행이다 |
| 74 | OBS-AUDIT-008 | AUDIT | observability | planned | stable | 다건 조작의 감사는 실제로 바꾼 것마다 1행이다 |
| 75 | OBS-AUDIT-009 | AUDIT | observability | planned | stable | 동반 삭제되는 첨부는 감사 행을 만들지 않는다 |
| 76 | OBS-AUDIT-010 | AUDIT | observability | planned | evolving | 디렉토리 삭제와 복사의 서브트리는 하위 노드마다 1행이다 |
| 77 | OBS-AUDIT-011 | AUDIT | observability | blocked | evolving | 감사 로그 보존 기간은 인스턴스 설정에서 지정한다 |
| 78 | REL-AUDIT-001 | AUDIT | reliability | planned | stable | 재조정 대기열은 감사 로그와 별개 저장소다 |
| 79 | REL-AUDIT-002 | AUDIT | reliability | planned | stable | 대기열 항목의 해소는 새 감사 행 추가로만 수행한다 |
| 80 | SEC-AUDIT-001 | AUDIT | security | planned | stable | 경계를 넘는 복사의 유출 감사와 행위자 기록 |
| 81 | SEC-AUDIT-002 | AUDIT | security | planned | stable | 감사 행의 노드 참조는 노드 ID 로 저장하고 조건부로 해석한다 |
| 82 | SEC-AUDIT-003 | AUDIT | security | planned | stable | 외부 노드 고정 문구는 상대 워크스페이스에 따라 달라지지 않는다 |
| 83 | SEC-AUDIT-004 | AUDIT | security | planned | stable | 외부로 나간 건수의 집계와 필터와 배지를 만들지 않는다 |
| 84 | SEC-AUDIT-005 | AUDIT | security | planned | stable | 복사의 조작 값은 경계 여부와 무관하게 언제나 복사 하나다 |
| 85 | SEC-AUDIT-006 | AUDIT | security | planned | stable | 반출 목적지의 식별은 슈퍼유저 경유 조사가 유일한 경로다 |
| 86 | SEC-AUDIT-007 | AUDIT | security | planned | stable | 재조정 대기열 항목의 스코프는 참조 감사 행에서 파생한다 |
| 87 | SEC-AUDIT-008 | AUDIT | security | planned | stable | 상대 노드 칸의 마스킹을 화면과 API 와 내보내기에 적용한다 |
| 88 | SEC-AUDIT-009 | AUDIT | security | planned | stable | 대상 역할을 조작 값에 넣지 않고 두 칸을 집계 축에서 뺀다 |
| 89 | SEC-AUDIT-010 | AUDIT | security | planned | stable | 감사 행의 스코프는 대상의 귀속 워크스페이스에서 파생한다 |
| 90 | SEC-AUDIT-011 | AUDIT | security | planned | stable | 묶음 건수는 열람자 스코프의 행만 센다 |
| 91 | FR-AUTH-001 | AUTH | functional | planned | stable | 상태별 로그인 안내 문구 |
| 92 | FR-AUTH-002 | AUTH | functional | planned | stable | 거절 계정을 pending 으로 되돌려 재심사한다 |
| 93 | FR-AUTH-003 | AUTH | functional | blocked | evolving | 슈퍼유저 직접 등록은 사용자 관리 화면 안의 조작이다 |
| 94 | FR-AUTH-004 | AUTH | functional | planned | stable | 가입 모드 3종과 슈퍼유저 전용 인스턴스 설정 |
| 95 | FR-AUTH-005 | AUTH | functional | planned | stable | 접근 가능한 노드가 0개인 사용자에게 빈 상태 안내 화면을 보여준다 |
| 96 | IR-AUTH-001 | AUTH | interface | planned | stable | 인증 전 화면은 모달이 아니라 전체 화면이다 |
| 97 | IR-AUTH-002 | AUTH | interface | planned | stable | MCP 는 Authorization Bearer PAT 로 사용자를 식별한다 |
| 98 | MIG-AUTH-001 | AUTH | migration | planned | stable | 1.0 에서 2.0 으로의 읽기 전용 컷오버 — 1.0 동결과 콘텐츠·인덱스 이행 |
| 99 | MIG-AUTH-002 | AUTH | migration | planned | stable | 1.0 계정과 자격증명의 2.0 이행 |
| 100 | SEC-AUTH-001 | AUTH | security | planned | stable | 1.0 과 같은 기술 선택으로 로그인을 신규 작성한다 — bcrypt · HttpOnly 세션 쿠키 · 소스 IP 단위 rate limit |
| 101 | SEC-AUTH-002 | AUTH | security | planned | evolving | 세션·토큰에 권한 스냅샷을 담지 않고 매 요청 principal 을 조회한다 |
| 102 | SEC-AUTH-003 | AUTH | security | planned | stable | 계정 상태 게이트 — active 외 상태는 로그인·토큰 인증 단계에서 차단한다 |
| 103 | SEC-AUTH-004 | AUTH | security | planned | stable | 가입 사용자의 default 그룹 자동 소속은 active 전환 시점에 이뤄진다 |
| 104 | SEC-AUTH-005 | AUTH | security | planned | stable | 전역 API Key 폐기와 사용자별 개인 액세스 토큰(PAT) 도입 |
| 105 | SEC-AUTH-006 | AUTH | security | planned | stable | PAT 는 해시로 저장하고 평문은 발급 시 1회만 노출한다 |
| 106 | SEC-AUTH-007 | AUTH | security | planned | stable | PAT 발급·폐기는 본인만 할 수 있다 |
| 107 | SEC-AUTH-008 | AUTH | security | planned | stable | PAT 스코프는 상한만 낮추며 실제 권한은 스코프와 실시간 유효 권한의 교집합이다 |
| 108 | SEC-AUTH-009 | AUTH | security | planned | evolving | 계정이 active 가 아니게 되면 그 계정의 모든 PAT 가 즉시 무효가 된다 |
| 109 | SEC-AUTH-010 | AUTH | security | planned | stable | 슈퍼유저 0명이면 설치 화면을 강제하고 그 화면에서 최초 슈퍼유저를 만든다 |
| 110 | SEC-AUTH-011 | AUTH | security | planned | stable | 설치 완료 전에는 허용목록 4경로 외의 모든 경로를 차단한다 |
| 111 | SEC-AUTH-012 | AUTH | security | planned | stable | 설치 마법사는 콘솔에 출력된 설치 토큰을 요구하고 토큰은 설치 완료 시 소진된다 |
| 112 | SEC-AUTH-013 | AUTH | security | planned | evolving | 설치 토큰의 수명은 30분이며 만료 시각을 절대시각으로 함께 출력한다 |
| 113 | SEC-AUTH-014 | AUTH | security | planned | stable | 서버 재기동이 설치 토큰을 무효화하고 새 값을 내며 그것이 유일한 복구 경로다 |
| 114 | SEC-AUTH-015 | AUTH | security | planned | stable | 설치 마법사의 모든 서버 요청은 토큰 검증으로 발급된 설치 세션을 요구한다 |
| 115 | SEC-AUTH-016 | AUTH | security | planned | stable | 슈퍼유저 그룹의 active 멤버 수를 0 으로 만드는 모든 조작을 거부한다 |
| 116 | SEC-AUTH-017 | AUTH | security | planned | stable | 기본 워크스페이스에 대한 default 그룹 초기 권한을 설치 마법사에서 고른다 |
| 117 | SEC-AUTH-018 | AUTH | security | blocked | evolving | 본인이 자기 비밀번호를 변경한다 |
| 118 | SEC-AUTH-019 | AUTH | security | blocked | evolving | 사용자가 자기 세션을 종료한다 |
| 119 | CON-CONFIRM-001 | CONFIRM | constraint | planned | stable | 휴지통 일괄 영구 삭제는 Phase 1 에 도입하지 않는다 |
| 120 | DR-CONFIRM-001 | CONFIRM | data | planned | stable | 가져온 권한 항목의 부여자는 실행자로 기록한다 |
| 121 | FR-CONFIRM-001 | CONFIRM | functional | planned | stable | 확인 등급 체계를 L1·L2·L3 세 단계로 통일한다 |
| 122 | FR-CONFIRM-002 | CONFIRM | functional | planned | stable | 확인 등급 배정 기준 — 가역성과 효과의 즉시성 |
| 123 | FR-CONFIRM-003 | CONFIRM | functional | planned | stable | 요구사항의 직접 등급 지정이 배정 기준보다 우선한다 |
| 124 | FR-CONFIRM-004 | CONFIRM | functional | planned | stable | 확인 다이얼로그의 수치는 열 때 재조회하고 다르면 실행을 잠근다 |
| 125 | FR-CONFIRM-005 | CONFIRM | functional | planned | stable | 조작 입력 폼은 확인 관문이 아니다 |
| 126 | FR-CONFIRM-006 | CONFIRM | functional | planned | stable | 확인 등급 배정표 — 휴지통·계정·그룹·토큰·권한 항목 |
| 127 | FR-CONFIRM-007 | CONFIRM | functional | planned | stable | 보존 기간 축소의 등급은 실제 영향 건수로 정한다 |
| 128 | FR-CONFIRM-008 | CONFIRM | functional | planned | stable | 지연 효과 조작은 효과가 나중에 발생함을 문구로 알린다 |
| 129 | FR-CONFIRM-009 | CONFIRM | functional | planned | stable | 오프보딩 그룹 멤버십 제거는 L2 이고 그룹 이름을 모두 나열한다 |
| 130 | FR-CONFIRM-010 | CONFIRM | functional | planned | stable | 새 버전 올리기의 등급은 대상 파일 형식으로 갈린다 |
| 131 | FR-CONFIRM-011 | CONFIRM | functional | planned | stable | 넓히기의 등급은 주체 명시성과 대상 노드 범위로 정한다 |
| 132 | FR-CONFIRM-012 | CONFIRM | functional | planned | stable | 컨테이너 부여 확인에 적용 하위 노드 수를 표시한다 |
| 133 | FR-CONFIRM-013 | CONFIRM | functional | planned | stable | 컨테이너 부여의 상속 고지를 단일 템플릿으로 공통화한다 |
| 134 | FR-CONFIRM-014 | CONFIRM | functional | planned | stable | 넓히기 L1 의 토스트는 실행취소가 아니라 회수로 표기한다 |
| 135 | FR-CONFIRM-015 | CONFIRM | functional | planned | stable | 상속 끊기의 확인 등급은 대상 노드 유형으로 갈린다 |
| 136 | FR-CONFIRM-016 | CONFIRM | functional | planned | stable | 이동의 확인 등급은 접근 가능 수치의 변화로 정한다 |
| 137 | FR-CONFIRM-017 | CONFIRM | functional | planned | stable | 복사의 확인 등급은 대상 유형과 무관하게 언제나 L2 다 |
| 138 | FR-CONFIRM-018 | CONFIRM | functional | planned | stable | 컨테이너 노드의 권한 항목 회수는 L2 다 |
| 139 | FR-CONFIRM-019 | CONFIRM | functional | planned | stable | 워크스페이스 생성과 설치 시점의 부여도 확인 1개를 받는다 |
| 140 | FR-CONFIRM-020 | CONFIRM | functional | planned | evolving | 주체 다건 일괄 회수를 허용한다 |
| 141 | FR-CONFIRM-021 | CONFIRM | functional | planned | stable | 일괄 조작의 확인은 묶음 1회로 받는다 |
| 142 | FR-CONFIRM-022 | CONFIRM | functional | planned | stable | 일괄 회수 L3 의 토큰은 영향 건수이고 0건은 실행을 막는다 |
| 143 | FR-CONFIRM-023 | CONFIRM | functional | planned | stable | 오프보딩 앞 세 단계는 다건화하지 않는다 |
| 144 | IR-CONFIRM-001 | CONFIRM | interface | planned | stable | 접근자 인원 수에 시점을 표기하지 않는다 |
| 145 | SEC-CONFIRM-001 | CONFIRM | security | planned | stable | 확인 흐름을 보이지 않는 대상의 존재 판정에 쓰지 않는다 |
| 146 | SEC-CONFIRM-002 | CONFIRM | security | planned | stable | 넓히기는 가역성 축에서 비가역으로 취급한다 |
| 147 | SEC-CONFIRM-003 | CONFIRM | security | planned | stable | 부여 확인에 분모와 미도달 건수를 표시하지 않는다 |
| 148 | SEC-CONFIRM-004 | CONFIRM | security | planned | stable | 상속 끊김 고지는 끊긴 노드 유무와 무관하게 항상 표시한다 |
| 149 | SEC-CONFIRM-005 | CONFIRM | security | planned | stable | 도달하지 못하는 하위가 있어도 부여를 거부하거나 열거하지 않는다 |
| 150 | SEC-CONFIRM-006 | CONFIRM | security | planned | stable | 컨테이너 회수의 첨부 영향은 개수 대신 고정 문구로 알린다 |
| 151 | SEC-CONFIRM-007 | CONFIRM | security | planned | evolving | 부모 권한 가져오기는 관리 레벨 전용이며 등급은 L2 다 |
| 152 | CON-EDITOR-001 | EDITOR | constraint | planned | stable | 플러그인 시스템을 범위에서 제외한다 |
| 153 | CON-EDITOR-002 | EDITOR | constraint | planned | evolving | Phase 1 범위는 편집·렌더링 경험과 링크 계열이다 |
| 154 | CON-EDITOR-004 | EDITOR | constraint | planned | stable | Phase 1 은 데스크탑 전용이다 |
| 155 | FR-EDITOR-001 | EDITOR | functional | planned | stable | 옵시디언과 동일한 편집·렌더링 경험 |
| 156 | FR-EDITOR-002 | EDITOR | functional | planned | stable | 단일 화면과 상단 보기·편집 모드 토글 |
| 157 | FR-EDITOR-003 | EDITOR | functional | planned | stable | 편집 모드의 라이브 프리뷰와 소스 하위 토글 |
| 158 | FR-EDITOR-004 | EDITOR | functional | planned | stable | 보기 권한만 있으면 편집 토글을 비활성으로 노출한다 |
| 159 | FR-EDITOR-005 | EDITOR | functional | planned | stable | 저장이 거부되면 본문을 보존하고 로컬 내보내기를 제공한다 |
| 160 | FR-EDITOR-006 | EDITOR | functional | planned | stable | 비-md 파일에서는 모드 토글을 숨긴다 |
| 161 | FR-EDITOR-007 | EDITOR | functional | blocked | evolving | 라이브 프리뷰 대상 요소 아홉 가지 (정본 목록) |
| 162 | FR-EDITOR-008 | EDITOR | functional | planned | stable | 낙관적 저장의 충돌 병합 화면 |
| 163 | CON-PRINCIPAL-001 | PRINCIPAL | constraint | planned | stable | 권한 계층은 슈퍼유저와 일반 유저 2단계뿐이다 |
| 164 | CON-PRINCIPAL-002 | PRINCIPAL | constraint | planned | stable | 시스템 그룹(슈퍼유저·default)은 삭제·개명할 수 없다 |
| 165 | CON-PRINCIPAL-003 | PRINCIPAL | constraint | planned | stable | 계정은 삭제하지 않고 suspended 로만 관리한다 |
| 166 | CON-PRINCIPAL-004 | PRINCIPAL | constraint | planned | stable | 오프보딩 카드는 단일 컴포넌트이며 진행 상태를 저장하지 않는다 |
| 167 | CON-PRINCIPAL-005 | PRINCIPAL | constraint | planned | stable | ACL 항목에 만료일을 두지 않는다 |
| 168 | CON-PRINCIPAL-006 | PRINCIPAL | constraint | planned | stable | 주체를 고르는 모든 화면은 단일 공용 컴포넌트 PrincipalPicker 로 구현한다 |
| 169 | CON-PRINCIPAL-007 | PRINCIPAL | constraint | planned | stable | 관리자를 단독으로 쓰지 않고 항상 범위를 명시한다 |
| 170 | DR-PRINCIPAL-001 | PRINCIPAL | data | planned | stable | 슈퍼유저 여부는 슈퍼유저 그룹 소속 하나로만 판정한다 |
| 171 | DR-PRINCIPAL-002 | PRINCIPAL | data | planned | stable | 그룹은 사용자만을 멤버로 가지며 중첩되지 않는다 |
| 172 | FR-PRINCIPAL-001 | PRINCIPAL | functional | planned | evolving | 사용자 관리와 사용자 그룹 관리를 제공한다 |
| 173 | FR-PRINCIPAL-002 | PRINCIPAL | functional | planned | stable | 그룹 삭제는 그 그룹 앞으로 부여된 ACL 항목 제거를 같은 트랜잭션에 포함한다 |
| 174 | FR-PRINCIPAL-003 | PRINCIPAL | functional | planned | evolving | 오프보딩을 네 단계의 안내된 흐름으로 제공한다 |
| 175 | FR-PRINCIPAL-004 | PRINCIPAL | functional | planned | stable | 일괄 회수 화면의 적용 범위 문구는 요청자 레벨에 따라 달라진다 |
| 176 | FR-PRINCIPAL-005 | PRINCIPAL | functional | planned | stable | 워크스페이스의 마지막 관리 권한자 제거는 차단하지 않고 경고한다 |
| 177 | FR-PRINCIPAL-006 | PRINCIPAL | functional | planned | evolving | 관리 권한자가 없는 워크스페이스에 관리자 없음 배지를 상시 노출한다 |
| 178 | FR-PRINCIPAL-007 | PRINCIPAL | functional | planned | stable | 새 워크스페이스 생성 폼에서 default 그룹 초기 권한을 고르며 기본값은 없음이다 |
| 179 | FR-PRINCIPAL-008 | PRINCIPAL | functional | planned | stable | 비활성 계정에 권한을 부여할 때 확인 1단계를 거친다 |
| 180 | FR-PRINCIPAL-009 | PRINCIPAL | functional | planned | stable | 슈퍼유저 전용 사용자 관리 화면은 계정 4상태를 그대로 표시한다 |
| 181 | FR-PRINCIPAL-010 | PRINCIPAL | functional | planned | stable | 시스템 그룹도 주체 단위 일괄 회수의 대상이다 |
| 182 | FR-PRINCIPAL-011 | PRINCIPAL | functional | planned | stable | 시스템 그룹 일괄 회수의 확인 등급과 슈퍼유저 그룹 무효 안내 |
| 183 | SEC-PRINCIPAL-001 | PRINCIPAL | security | planned | stable | 슈퍼유저 그룹 멤버는 전 워크스페이스 관리 권한과 워크스페이스 수명주기 권한을 가진다 |
| 184 | SEC-PRINCIPAL-002 | PRINCIPAL | security | planned | evolving | 주체 검색 결과의 계정 노출 범위와 상태 배지 |
| 185 | SEC-PRINCIPAL-003 | PRINCIPAL | security | planned | stable | 주체 검색은 최소 질의 길이 2자와 결과 상한 20건을 둔다 |
| 186 | CON-SHELL-001 | SHELL | constraint | planned | stable | 관리 기능의 진입점은 설정 모달 하나다 |
| 187 | CON-SHELL-002 | SHELL | constraint | planned | stable | AI 검색은 MCP 로만 제공하고 좌측 검색 탭은 텍스트 검색이다 |
| 188 | DR-SHELL-001 | SHELL | data | planned | stable | 런타임 변경 가능한 설정의 단일 저장소는 DB 다 |
| 189 | FR-SHELL-001 | SHELL | functional | planned | stable | 좌측 사이드바 뷰 전환 탭 세 가지 |
| 190 | FR-SHELL-002 | SHELL | functional | planned | stable | 문서 단위 기능은 설정 모달이 아니라 문서 헤더 메뉴에 둔다 |
| 191 | FR-SHELL-003 | SHELL | functional | planned | stable | 트리 컨텍스트 메뉴와 트리 상단 새 노트 버튼 |
| 192 | FR-SHELL-004 | SHELL | functional | planned | evolving | 우측 사이드바 신설과 세 탭 |
| 193 | FR-SHELL-005 | SHELL | functional | planned | stable | 상단 문서 탭 |
| 194 | FR-SHELL-006 | SHELL | functional | planned | stable | 노드 ID 기반 문서 딥링크 |
| 195 | FR-SHELL-007 | SHELL | functional | planned | stable | 휴지통 카테고리의 표시 조건과 전 워크스페이스 통합 목록 |
| 196 | FR-SHELL-008 | SHELL | functional | planned | stable | 덮어쓰기의 유일한 경로는 파일 노드 전용 새 버전 올리기다 |
| 197 | FR-SHELL-009 | SHELL | functional | planned | evolving | 태그 탭은 전 워크스페이스 태그를 출현 문서 수로 집계한다 |
| 198 | FR-SHELL-010 | SHELL | functional | planned | evolving | 태그 클릭은 좌측 검색 탭을 활성하고 질의를 채운다 |
| 199 | FR-SHELL-011 | SHELL | functional | planned | draft | 태그 목록의 정렬은 빈도순 기본에 이름순 선택이다 |
| 200 | FR-SHELL-012 | SHELL | functional | planned | stable | 트리 클릭은 활성 탭을 교체하고 Ctrl+클릭은 새 탭이다 |
| 201 | FR-SHELL-013 | SHELL | functional | blocked | evolving | 전역 검색의 대상 넷과 소재, 필터 팝오버, 결과 표시 형식 |
| 202 | FR-SHELL-014 | SHELL | functional | blocked | evolving | 검색 질의 문법은 공백이 AND 이고 파이프가 OR 이며 최소 질의 길이는 2자다 |
| 203 | IR-SHELL-001 | SHELL | interface | planned | stable | 설정 화면은 별도 페이지가 아니라 모달 팝업이다 |
| 204 | IR-SHELL-002 | SHELL | interface | blocked | evolving | 설정 모달 카테고리 전량 목록과 카테고리별 표시 권한 |
| 205 | IR-SHELL-003 | SHELL | interface | planned | stable | 문서 탭 스트립과 문서 헤더는 2단으로 분리한다 |
| 206 | SEC-SHELL-001 | SHELL | security | planned | stable | 휴지통 영구 삭제 버튼은 권한이 없으면 표시하지 않는다 |
| 207 | SEC-SHELL-002 | SHELL | security | planned | stable | 이름 충돌 처리는 가시 여부와 무관하게 하나로 통일한다 |
| 208 | SEC-SHELL-003 | SHELL | security | planned | stable | 디렉토리 복사는 요청자에게 보이는 노드만 복사한다 |
| 209 | DR-STORAGE-001 | STORAGE | data | planned | stable | 문서 본문의 SSOT 는 서버 로컬 파일시스템이다 |
| 210 | DR-STORAGE-002 | STORAGE | data | planned | stable | 사용자·그룹·ACL 메타데이터는 SQLite 단일 저장소에 둔다 |
| 211 | DR-STORAGE-003 | STORAGE | data | planned | stable | 모든 노드에 경로 독립적인 안정 ID 를 부여한다 |
| 212 | DR-STORAGE-004 | STORAGE | data | planned | stable | 휴지통 항목마다 사이드카 메타 파일을 함께 기록한다 |
| 213 | DR-STORAGE-005 | STORAGE | data | blocked | evolving | 버전 항목마다 사이드카 메타 파일을 함께 기록한다 |
| 214 | DR-STORAGE-006 | STORAGE | data | planned | stable | 휴지통은 워크스페이스마다 두고 아카이브는 루트 한 곳에 둔다 |
| 215 | FR-STORAGE-001 | STORAGE | functional | planned | stable | 저장은 버튼 없는 자동 저장이다 |
| 216 | FR-STORAGE-002 | STORAGE | functional | planned | stable | 저장 충돌의 판정 근거는 읽은 시점의 내용 해시다 |
| 217 | FR-STORAGE-003 | STORAGE | functional | planned | stable | 버전 스냅샷은 편집 세션당 1회 생성한다 |
| 218 | FR-STORAGE-004 | STORAGE | functional | planned | stable | 보관 버전 개수를 초과하면 오래된 버전부터 폐기한다 |
| 219 | FR-STORAGE-005 | STORAGE | functional | planned | stable | 삭제는 휴지통 이동이며 노드 ID 로 물리 격리한다 |
| 220 | FR-STORAGE-006 | STORAGE | functional | planned | stable | 휴지통 복구는 원본 편집 권한을 요구하고 부모 체인 소실 시 닫힌다 |
| 221 | FR-STORAGE-007 | STORAGE | functional | planned | stable | 휴지통 보존 기간은 기본 30일이고 경과분은 자동 영구 삭제한다 |
| 222 | FR-STORAGE-008 | STORAGE | functional | planned | stable | 문서를 이동해도 첨부는 움직이지 않고 본문도 재작성하지 않는다 |
| 223 | FR-STORAGE-009 | STORAGE | functional | planned | stable | 문서 간 링크는 이름 기반 위키링크로 해석하고 상대경로를 삽입하지 않는다 |
| 224 | IR-STORAGE-001 | STORAGE | interface | planned | evolving | 버전 비교·복원 UI 는 충돌 병합과 같은 컴포넌트를 재사용한다 |
| 225 | OPS-STORAGE-001 | STORAGE | operational | planned | stable | 백업은 docsRoot 와 DB 를 같은 시점으로 묶는다 |
| 226 | REL-STORAGE-001 | STORAGE | reliability | planned | stable | 기동 시와 주기적으로 파일시스템과 DB 를 전체 재조정한다 |
| 227 | REL-STORAGE-002 | STORAGE | reliability | planned | stable | 서버에서 직접 옮긴 파일의 노드 상관 판정은 fail-closed 다 |
| 228 | SEC-STORAGE-001 | STORAGE | security | planned | stable | 노드 ID 는 추측 불가한 랜덤 값이어야 한다 |
| 229 | SEC-STORAGE-002 | STORAGE | security | planned | stable | 휴지통 열람 범위는 본인 삭제분이고 관리자는 전체다 |
| 230 | SEC-STORAGE-003 | STORAGE | security | planned | stable | 휴지통 영구 삭제는 워크스페이스 관리 권한을 요구한다 |
| 231 | SEC-STORAGE-004 | STORAGE | security | planned | stable | 점으로 시작하는 항목은 숨기고 직접 접근을 거부한다 |
| 232 | SEC-STORAGE-005 | STORAGE | security | planned | stable | 점으로 시작하는 이름의 생성·업로드·개명을 거부한다 |
| 233 | SEC-STORAGE-006 | STORAGE | security | planned | stable | DB 레코드가 없는 파일시스템 경로 요청은 거부한다 |
| 234 | SEC-STORAGE-007 | STORAGE | security | planned | stable | 벡터 인덱스는 동기 갱신하고 없는 노드의 엔트리를 제외한다 |
| 235 | CON-WORKSPACE-001 | WORKSPACE | constraint | planned | stable | 노드 계층을 4단계 밖으로 늘리지 않는다 |
| 236 | DR-WORKSPACE-001 | WORKSPACE | data | planned | stable | 워크스페이스 물리 저장 레이아웃 |
| 237 | DR-WORKSPACE-002 | WORKSPACE | data | planned | stable | 워크스페이스 사이드카 파일과 식별 권위 |
| 238 | FR-WORKSPACE-001 | WORKSPACE | functional | planned | stable | 노드 계층에 워크스페이스를 둔다 |
| 239 | FR-WORKSPACE-002 | WORKSPACE | functional | planned | stable | 링크·검색 인덱스는 워크스페이스 경계를 넘는다 |
| 240 | FR-WORKSPACE-003 | WORKSPACE | functional | planned | evolving | 좌측 트리에 접근 가능한 워크스페이스를 나란히 표시한다 |
| 241 | FR-WORKSPACE-004 | WORKSPACE | functional | planned | evolving | 노드 이름 검증 규칙 |
| 242 | FR-WORKSPACE-005 | WORKSPACE | functional | planned | stable | 대소문자만 다른 동명은 이름 충돌로 처리한다 |
| 243 | FR-WORKSPACE-006 | WORKSPACE | functional | planned | stable | 최초 기동 시 기본 워크스페이스를 생성한다 |
| 244 | FR-WORKSPACE-009 | WORKSPACE | functional | planned | stable | 권한 없는 문서명의 수동 위키링크 작성은 막지 않는다 |
| 245 | SEC-WORKSPACE-001 | WORKSPACE | security | planned | stable | 워크스페이스는 상속 체인의 루트다 |
| 246 | SEC-WORKSPACE-002 | WORKSPACE | security | planned | stable | 관리 레벨은 워크스페이스에만 부여한다 |
| 247 | SEC-WORKSPACE-003 | WORKSPACE | security | planned | stable | 워크스페이스 관리자는 그 워크스페이스 전체의 ACL 을 관장한다 |
| 248 | SEC-WORKSPACE-004 | WORKSPACE | security | planned | evolving | 링크·검색 결과 표면은 표시 직전 요청자 권한으로 필터링한다 |
| 249 | SEC-WORKSPACE-005 | WORKSPACE | security | planned | stable | 아웃고잉 링크 패널은 권한 필터의 예외다 |
| 250 | SEC-WORKSPACE-006 | WORKSPACE | security | planned | stable | 권한 없는 문서를 가리키는 위키링크는 깨진 링크로 표시한다 |
