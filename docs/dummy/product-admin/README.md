# 상품 관리 페이지 (실습용 · 로컬 전용)

Supabase의 가상 상품 DB(`docs/dummy/supabase/`)를 조회 · 검색 · 추가 · 삭제하는 로컬 웹페이지.
외부 패키지 없이 Node.js(20.12 이상)만 있으면 된다.

## 준비
1. Supabase SQL Editor에서 `../supabase/01_schema.sql` → `02_seed.sql` 실행
2. 이 폴더의 `.env.local.example`을 `.env.local`로 복사하고 값 채우기 (대시보드 → Project Settings → API)
   - `SUPABASE_URL` — 프로젝트 URL (`https://xxxx.supabase.co`). session pooler · `postgres://` 주소는 쓰지 않음
   - `SUPABASE_ANON_KEY` — anon(public) 키. 조회에 사용
   - `SUPABASE_SERVICE_ROLE_KEY` — service_role 키. 추가 · 삭제에 사용

## 실행
```bash
node server.js
```
브라우저에서 http://127.0.0.1:3030 접속. 종료는 터미널에서 Ctrl+C.

## 기능
- 조회: 목록 → 행 클릭 시 원산지 · 알레르기 · 보관 · 안내 상세
- 검색: 상품코드 · 상품명 · 설명 · 원재료 / 분류 · 기본 보관방식 / "이 유발물질 없는 상품만"
- 추가: 기본정보 + 원산지 · 알레르기 · 보관 · 안내 행. 하위 행 저장이 실패하면 상품 추가도 취소
- 삭제: 확인 후 삭제. 하위 정보도 함께 삭제(되돌릴 수 없음)

## 주의
- `service_role` 키는 RLS를 우회하는 관리자 키. `.env.local`은 공유 · 커밋하지 않는다
- 키는 서버에서만 쓰고 브라우저로 보내지 않는다
- 서버는 `127.0.0.1`에만 열려 같은 PC에서만 접속된다
- 선택 목록(분류 · 보관방식 등)은 `public/index.html`의 `OPTIONS`와 `01_schema.sql`의 CHECK 제약을 함께 고친다
