-- =============================================================
-- 교차오염(생산 라인 공유) 알레르기 조회
-- 01_schema.sql, 02_seed.sql 실행 후 사용. 조회만 하므로 데이터는 바뀌지 않음
-- 원재료에 직접 들어 있는 '함유'는 제외하고 '교차오염'만 본다
-- =============================================================

-- 1) 상품별: 교차오염 1건 = 1행, 근거와 함께 표시
select
  p.product_id,
  p.product_name,
  a.allergen,
  a.note as reason   -- 교차오염 근거(공유 라인 등)
from public.products p
join public.product_allergens a using (product_id)
where a.exposure_type = '교차오염'
order by p.product_id, a.allergen;

-- 2) 유발물질별: 같은 유발물질로 교차오염 주의가 필요한 상품 묶음
select
  a.allergen,
  count(*)                                              as product_count,
  string_agg(p.product_name, ', ' order by p.product_id) as products
from public.product_allergens a
join public.products p using (product_id)
where a.exposure_type = '교차오염'
group by a.allergen
order by product_count desc, a.allergen;
