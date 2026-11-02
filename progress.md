# 진행 기록

## 2026-11-02

### 완료
- 폴더 구조 확인
  - 실제로 있는 폴더: `docs/dummy/products/`(가상 상품 10건), `research/`(`qa_dummy_questions.md`)
  - CLAUDE.md에는 있지만 아직 없는 것: `modeling/`, `modeling/metrics.md`, `.claude/skills/`, `.claude/agents/`
- QA 3번 "수성구는 당일 배송이 되나요?" 답 확인 (파일에는 기록 안 함)
  - 답: 오후 2시 이전 주문이면 당일 배송 (상품 문서 10건 `## 배송` 항목 공통)
- 상품 관리용 엑셀 DB 생성: `docs/dummy/products_db.xlsx`
  - 시트: `products`(10개 상품, 19개 필드) · `shipping_policy`(공통 배송정책 1행) · `필드설명`(범례)
  - 생성 도구: Node.js + exceljs (PC에 Python 없음)
- 엑셀 DB 구조 개편 (`products_db.xlsx` 재생성)
  - `is_fresh`(신선식품 여부) 삭제 — 사용 안 함
  - 상품 1 : N 구조로 분리, `product_id`로 연결
    - `products`(10행): 기본정보 · 판매 시작/종료월
    - `origins`(15행): 원재료별 국가 · 시도 · 세부지역 · 함량
    - `allergens`(5행): 유발물질 · 노출 유형(함유/교차오염)
    - `storage`(15행): 상태(개봉 전/개봉 후/수령 후) × 보관방식 · 기간 숫자 + 단위
    - `guides`(24행): 보관 금지 · 보관 방법 · 조리·사용 금지/방법 · 섭취 안내/주의 · 품질 안내
  - 하위 시트 `product_name`은 INDEX/MATCH 수식으로 자동 표시
  - `shipping_policy.fresh_ship_days`는 원문 정책이라 유지하기로 결정 (적용 상품 지정 필드는 없음)

- Supabase용 SQL 작성 (실행은 사용자가 직접)
  - `docs/dummy/supabase/01_schema.sql`: 테이블 6개 · CHECK 제약 · FK(on delete cascade) · updated_at 트리거 · RLS(anon/authenticated 읽기만)
  - `docs/dummy/supabase/02_seed.sql`: 엑셀과 같은 데이터, `on conflict do nothing`으로 재실행 안전
  - 로컬 PGlite(Postgres)로 두 파일을 2회씩 실행해 검증 — 오류 없음, 행 수 10/15/5/15/24/1

- 조회 SQL: `03_query_allergen_products.sql`(알레르기 상품), `04_query_cross_contact.sql`(교차오염만)
- 로컬 상품 관리 웹페이지: `docs/dummy/product-admin/`
  - `server.js`(127.0.0.1:3030, 외부 패키지 없음) → Supabase REST
  - 설정은 `.env.local`: 프로젝트 URL · anon 키(조회) · service_role 키(추가·삭제). session pooler 미사용
    - 시작 시 값 누락 · `postgres://` 주소 · 두 키 동일 여부를 검사해 안내
  - `public/index.html`: 조회 · 상세 · 검색/필터 · 추가(하위 행 포함) · 삭제
  - 가짜 Supabase(PGlite)로 브라우저 검증: 검색 · 필터 · 상세 · 추가 · 입력 오류 · 하위 행 실패 시 롤백 · 삭제 모두 정상
  - 실제 Supabase 연결 확인 — 조회 10건 정상 (추가·삭제는 실제 DB에서 아직 안 해 봄). 수정(편집) 기능은 없음
  - 키가 `.env.local.example`에 저장돼 있어 `.env.local`로 옮기고 예시 파일은 빈 템플릿으로 복구

### 남은 일
- 실제 DB에서 추가 · 삭제 동작 확인 (사용자)
- `products.category`(노란 칸)는 원문에 없어 임시값 — 확인 필요
- 원문에 없는 값: 납작만두 원재료 원산지, 대추칩 개봉 전 보관기간
- `research/qa_dummy_questions.md` 답 칸 채우기 (3번 포함)
