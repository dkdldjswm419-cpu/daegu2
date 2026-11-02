-- =============================================================
-- 알레르기 유발물질이 있는 상품 조회
-- 01_schema.sql, 02_seed.sql 실행 후 사용. 조회만 하므로 데이터는 바뀌지 않음
-- =============================================================

-- 1) 상품별 요약: 상품 1개 = 1행, 함유·교차오염을 나눠서 표시
select
  p.product_id,
  p.product_name,
  string_agg(a.allergen, ', ' order by a.allergen)
    filter (where a.exposure_type = '함유')     as contains,         -- 원재료에 포함
  string_agg(a.allergen, ', ' order by a.allergen)
    filter (where a.exposure_type = '교차오염') as cross_contact,    -- 생산 라인 공유
  count(*)                                       as allergen_count
from public.products p
join public.product_allergens a using (product_id)
group by p.product_id, p.product_name
order by p.product_id;

-- 2) 상세: 유발물질 1개 = 1행
select
  p.product_id,
  p.product_name,
  a.allergen,
  a.exposure_type,
  a.note
from public.products p
join public.product_allergens a using (product_id)
order by p.product_id, a.exposure_type, a.allergen;
