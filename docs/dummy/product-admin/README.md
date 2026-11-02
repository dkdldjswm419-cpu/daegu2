# 상품 관리 페이지 (실습용)

Supabase의 가상 상품 DB(`docs/dummy/supabase/`)를 조회 · 검색 · 추가 · 삭제하는 웹페이지.
로컬(`node server.js`)과 Vercel 배포를 같은 코드로 지원한다. 외부 패키지 없음(Node 20.12 이상).

## 구조
```
product-admin/
├── public/index.html        # 화면
├── lib/products.js          # Supabase 호출 · 비밀번호 확인 공통 로직
├── api/products/index.js    # GET 조회 · POST 추가   (Vercel 함수)
├── api/products/[id].js     # DELETE 삭제            (Vercel 함수)
├── api/auth.js              # POST 비밀번호 확인     (Vercel 함수)
├── server.js                # 로컬 실행용 서버 (위 함수를 그대로 사용)
└── vercel.json              # Vercel 설정 (정적 파일: public)
```

## 환경변수
| 이름 | 용도 |
|---|---|
| `SUPABASE_URL` | 프로젝트 URL (`https://xxxx.supabase.co`). session pooler · `postgres://` 주소는 쓰지 않음 |
| `SUPABASE_ANON_KEY` | anon(public) 키. 조회에 사용 |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role 키. 추가 · 삭제에 사용 |
| `ADMIN_PASSWORD` | 페이지에서 추가 · 삭제할 때 입력하는 비밀번호. 비우면 추가 · 삭제가 막힘 |

Supabase 값은 대시보드 → Project Settings → API에서 확인.

## 로컬 실행
1. Supabase SQL Editor에서 `../supabase/01_schema.sql` → `02_seed.sql` 실행
2. `.env.local.example`을 `.env.local`로 복사하고 값 채우기
3. `node server.js` → http://127.0.0.1:3030

## Vercel 배포
| 설정 | 값 |
|---|---|
| Root Directory | `docs/dummy/product-admin` |
| Framework Preset | Other |
| Build / Output / Install | 비워 둠 (`vercel.json`이 지정) |
| Environment Variables | 위 표의 4개 |

환경변수를 바꾼 뒤에는 Redeploy해야 반영된다.

## 기능
- 조회 · 검색은 누구나 가능
- 추가 · 삭제는 🔒 관리자 로그인(비밀번호) 후 가능. 비밀번호는 브라우저 탭(sessionStorage)에만 보관
- 추가 시 하위 행 저장이 실패하면 상품 추가도 취소
- 삭제하면 원산지 · 알레르기 · 보관 · 안내도 함께 삭제(되돌릴 수 없음)

## 주의
- 배포 URL은 공개된다. `ADMIN_PASSWORD`는 길고 추측하기 어렵게 정한다(로그인 시도 횟수 제한 없음)
- `service_role` 키는 RLS를 우회하는 관리자 키. `.env.local`은 공유 · 커밋하지 않는다
- 선택 목록(분류 · 보관방식 등)은 `public/index.html`의 `OPTIONS`와 `01_schema.sql`의 CHECK 제약을 함께 고친다
