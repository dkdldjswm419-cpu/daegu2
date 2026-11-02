-- =============================================================
-- 실습용 가상 상품 DB 스키마 (Supabase / PostgreSQL)
-- 원본: docs/dummy/products/*.md — 상품명·가격·정책 모두 가상
-- 실행 순서: 01_schema.sql → 02_seed.sql
-- 구조: products(1) — product_origins / product_allergens /
--       product_storage / product_guides (N), product_id로 연결
-- =============================================================

-- updated_at 자동 갱신 함수
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- -------------------------------------------------------------
-- 상품 기본정보 (상품 1개 = 1행)
-- -------------------------------------------------------------
create table if not exists public.products (
  product_id        text primary key
                    check (product_id ~ '^P-[0-9]{4}$'),
  product_name      text not null,
  category          text check (category in ('과일', '채소', '가공식품', '냉동식품')),
  description       text,
  price             integer not null check (price >= 0),
  net_amount        numeric(10, 2) check (net_amount > 0),
  unit              text check (unit in ('g', 'kg', 'ml')),
  pack_note         text,
  sale_start_month  smallint check (sale_start_month between 1 and 12),
  sale_end_month    smallint check (sale_end_month between 1 and 12),
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  -- 판매기간은 둘 다 비우거나(상시) 둘 다 채운다
  constraint products_sale_period_pair
    check ((sale_start_month is null) = (sale_end_month is null))
);

comment on table  public.products is '상품 기본정보 (실습용 가상 데이터)';
comment on column public.products.category is '분류 — 원문에 없어 임시값';
comment on column public.products.net_amount is '용량. 여러 포 구성은 총량';
comment on column public.products.sale_start_month is '판매 시작월. null이면 상시 판매';

-- -------------------------------------------------------------
-- 원재료·원산지 (원재료 1개 = 1행)
-- -------------------------------------------------------------
create table if not exists public.product_origins (
  id               bigint generated always as identity primary key,
  product_id       text not null references public.products (product_id)
                   on update cascade on delete cascade,
  seq              smallint not null check (seq >= 1),
  ingredient       text not null,
  content_pct      numeric(5, 2) check (content_pct > 0 and content_pct <= 100),
  origin_country   text check (origin_country in ('국내산', '수입산')),
  origin_province  text,
  origin_area      text,
  note             text,
  unique (product_id, seq)
);

comment on table  public.product_origins is '원재료·원산지';
comment on column public.product_origins.content_pct is '함량(%). 원문에 표기된 경우만';

-- -------------------------------------------------------------
-- 알레르기 (유발물질 1개 = 1행, 행이 없는 상품은 원문상 '없음')
-- -------------------------------------------------------------
create table if not exists public.product_allergens (
  id             bigint generated always as identity primary key,
  product_id     text not null references public.products (product_id)
                 on update cascade on delete cascade,
  allergen       text not null,
  exposure_type  text not null check (exposure_type in ('함유', '교차오염')),
  note           text,
  unique (product_id, allergen)
);

comment on table  public.product_allergens is '알레르기 유발물질. 행이 없으면 유발물질 없음';
comment on column public.product_allergens.exposure_type is '함유 = 원재료에 포함 / 교차오염 = 생산 라인 공유';

-- -------------------------------------------------------------
-- 보관 조건 (상태 × 보관방식 1개 = 1행)
-- -------------------------------------------------------------
create table if not exists public.product_storage (
  id             bigint generated always as identity primary key,
  product_id     text not null references public.products (product_id)
                 on update cascade on delete cascade,
  state          text not null check (state in ('개봉 전', '개봉 후', '수령 후')),
  method         text not null check (method in ('상온', '냉장', '냉동')),
  duration       integer check (duration >= 0),
  duration_unit  text check (duration_unit in ('일', '주', '개월')),
  is_primary     boolean not null default false,
  note           text,
  unique (product_id, state, method),
  -- 기간과 단위는 함께 채운다
  constraint product_storage_duration_pair
    check ((duration is null) = (duration_unit is null))
);

comment on table  public.product_storage is '보관 조건';
comment on column public.product_storage.state is '수령 후 = 포장 개념이 없는 신선품';
comment on column public.product_storage.duration is '보관기간. 0 = 당일';
comment on column public.product_storage.is_primary is '권장 보관방식이면 true';

-- -------------------------------------------------------------
-- 보관·조리·섭취 안내 (안내 1개 = 1행)
-- -------------------------------------------------------------
create table if not exists public.product_guides (
  id          bigint generated always as identity primary key,
  product_id  text not null references public.products (product_id)
              on update cascade on delete cascade,
  seq         smallint not null check (seq >= 1),
  guide_type  text not null check (guide_type in (
                '보관 금지', '보관 방법', '조리·사용 금지', '조리·사용 방법',
                '섭취 안내', '섭취 주의', '품질 안내')),
  content     text not null,
  reason      text,
  unique (product_id, seq)
);

comment on table  public.product_guides is '보관·조리·섭취 안내';
comment on column public.product_guides.reason is '원문에 이유가 있으면 기록';

-- -------------------------------------------------------------
-- 배송정책 (정책 1개 = 1행)
-- -------------------------------------------------------------
create table if not exists public.shipping_policies (
  policy_id        text primary key,
  same_day_areas   text[] not null default '{}',
  same_day_cutoff  time,
  free_ship_min    integer check (free_ship_min >= 0),
  ship_fee         integer check (ship_fee >= 0),
  fresh_ship_days  text[] check (fresh_ship_days <@ array['월', '화', '수', '목', '금', '토', '일']),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table  public.shipping_policies is '배송정책';
comment on column public.shipping_policies.same_day_areas is '당일배송 지역. 그 외 지역은 익일 배송';
comment on column public.shipping_policies.same_day_cutoff is '이 시각 이전 주문만 당일 배송';
comment on column public.shipping_policies.fresh_ship_days is '신선식품 발송요일. 금요일 주문은 다음 주 월요일 발송';

-- -------------------------------------------------------------
-- 트리거: updated_at 자동 갱신
-- -------------------------------------------------------------
drop trigger if exists products_set_updated_at on public.products;
create trigger products_set_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();

drop trigger if exists shipping_policies_set_updated_at on public.shipping_policies;
create trigger shipping_policies_set_updated_at
  before update on public.shipping_policies
  for each row execute function public.set_updated_at();

-- -------------------------------------------------------------
-- RLS: 누구나 읽기만 가능. 쓰기는 대시보드·service_role로만
-- -------------------------------------------------------------
alter table public.products          enable row level security;
alter table public.product_origins   enable row level security;
alter table public.product_allergens enable row level security;
alter table public.product_storage   enable row level security;
alter table public.product_guides    enable row level security;
alter table public.shipping_policies enable row level security;

drop policy if exists "products 읽기 허용" on public.products;
create policy "products 읽기 허용" on public.products
  for select to anon, authenticated using (true);

drop policy if exists "product_origins 읽기 허용" on public.product_origins;
create policy "product_origins 읽기 허용" on public.product_origins
  for select to anon, authenticated using (true);

drop policy if exists "product_allergens 읽기 허용" on public.product_allergens;
create policy "product_allergens 읽기 허용" on public.product_allergens
  for select to anon, authenticated using (true);

drop policy if exists "product_storage 읽기 허용" on public.product_storage;
create policy "product_storage 읽기 허용" on public.product_storage
  for select to anon, authenticated using (true);

drop policy if exists "product_guides 읽기 허용" on public.product_guides;
create policy "product_guides 읽기 허용" on public.product_guides
  for select to anon, authenticated using (true);

drop policy if exists "shipping_policies 읽기 허용" on public.shipping_policies;
create policy "shipping_policies 읽기 허용" on public.shipping_policies
  for select to anon, authenticated using (true);
