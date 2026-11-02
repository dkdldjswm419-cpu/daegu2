// 상품 관리 공통 로직 — 로컬 서버(server.js)와 Vercel 함수(api/)가 함께 쓴다
// - Supabase REST(PostgREST)로 products와 하위 테이블을 조회·추가·삭제한다
// - 조회는 anon 키(RLS 읽기 허용), 추가·삭제는 service_role 키
// - 실습용이라 로그인 없이 누구나 조회·추가·삭제할 수 있다
// - 키는 서버에서만 쓰고 브라우저로 보내지 않는다
const fs = require("node:fs");
const path = require("node:path");

// 로컬에서는 .env.local을 읽는다. Vercel에서는 대시보드 환경변수를 쓴다
const ENV_PATH = path.join(__dirname, "..", ".env.local");
if (fs.existsSync(ENV_PATH)) process.loadEnvFile(ENV_PATH);

const env = (k) => (process.env[k] || "").trim();
const SUPABASE_URL = env("SUPABASE_URL").replace(/\/+$/, "");
const ANON_KEY = env("SUPABASE_ANON_KEY");
const SERVICE_KEY = env("SUPABASE_SERVICE_ROLE_KEY");

const CHILD_TABLES = {
  origins: "product_origins",
  allergens: "product_allergens",
  storage: "product_storage",
  guides: "product_guides",
};
const LIST_SELECT =
  "*,product_origins(*),product_allergens(*),product_storage(*),product_guides(*)";

const httpError = (status, message) => Object.assign(new Error(message), { status });

// 설정 오류 목록. 비어 있으면 정상
function configErrors() {
  const errors = [];
  const missing = [
    ["SUPABASE_URL", SUPABASE_URL],
    ["SUPABASE_ANON_KEY", ANON_KEY],
    ["SUPABASE_SERVICE_ROLE_KEY", SERVICE_KEY],
  ].filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) errors.push(`환경변수 값이 없습니다: ${missing.join(", ")}`);
  // session pooler 주소(postgres://...)를 넣은 경우
  if (SUPABASE_URL && !/^https:\/\/|^http:\/\/(127\.0\.0\.1|localhost)/.test(SUPABASE_URL)) {
    errors.push("SUPABASE_URL에는 프로젝트 URL(https://xxxx.supabase.co)을 넣어 주세요. postgres:// 연결 문자열은 쓰지 않습니다");
  }
  if (ANON_KEY && ANON_KEY === SERVICE_KEY) {
    errors.push("SUPABASE_ANON_KEY와 SUPABASE_SERVICE_ROLE_KEY가 같습니다. 서로 다른 키를 넣어 주세요");
  }
  return errors;
}

function assertConfig() {
  const errors = configErrors();
  if (errors.length) throw httpError(500, `서버 설정 오류 — ${errors.join(" / ")}`);
}

// Postgres 오류 코드를 한국어 안내로 바꾼다
function friendlyError(data) {
  if (!data) return "Supabase 요청이 실패했습니다";
  if (data.message === "Invalid API key") return "API 키가 올바르지 않습니다 (환경변수 확인)";
  if (data.code === "23505") return "이미 있는 값입니다 (상품코드 또는 순번 중복)";
  if (data.code === "23514") return `허용되지 않는 값입니다: ${data.message}`;
  if (data.code === "23502") return `필수 값이 비어 있습니다: ${data.message}`;
  return data.message || "Supabase 요청이 실패했습니다";
}

// Supabase REST 호출. 조회는 anon, 그 외는 service_role 키
async function rest(method, pathAndQuery, body, prefer) {
  const key = method === "GET" ? ANON_KEY : SERVICE_KEY;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${pathAndQuery}`, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(prefer ? { Prefer: prefer } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // JSON이 아닌 응답(잘못된 URL 등)
    data = { message: `Supabase 응답을 읽을 수 없습니다 (HTTP ${res.status}). SUPABASE_URL을 확인하세요` };
  }
  if (!res.ok) throw httpError(res.status, friendlyError(data));
  return data;
}

// 상품 목록 (하위 테이블 포함)
async function listProducts() {
  return rest("GET", `products?select=${encodeURIComponent(LIST_SELECT)}&order=product_id`);
}

// 상품 추가: products 먼저 넣고 하위 행을 넣는다. 하위 행이 실패하면 상품을 지워 되돌린다
async function createProduct(input) {
  const product = (input && input.product) || {};
  const id = product.product_id;
  if (!id) throw httpError(400, "상품코드가 필요합니다");

  await rest("POST", "products", product, "return=minimal");
  try {
    for (const [key, table] of Object.entries(CHILD_TABLES)) {
      const rows = (input[key] || []).map((row) => ({ ...row, product_id: id }));
      if (rows.length) await rest("POST", table, rows, "return=minimal");
    }
  } catch (err) {
    await rest("DELETE", `products?product_id=eq.${encodeURIComponent(id)}`).catch(() => {});
    err.message = `하위 정보 저장 실패로 상품 추가를 취소했습니다 — ${err.message}`;
    throw err;
  }
  const [created] = await rest(
    "GET",
    `products?select=${encodeURIComponent(LIST_SELECT)}&product_id=eq.${encodeURIComponent(id)}`
  );
  return created;
}

// 상품 삭제: 하위 행은 FK on delete cascade로 함께 지워진다
async function deleteProduct(id) {
  const deleted = await rest(
    "DELETE",
    `products?product_id=eq.${encodeURIComponent(id)}`,
    undefined,
    "return=representation"
  );
  if (!deleted.length) throw httpError(404, "없는 상품입니다");
}

// ── 요청 처리 도우미 (Node http · Vercel 함수 공통) ──

// 요청 본문 JSON. Vercel이 이미 파싱했으면 그대로 쓴다
function readJson(req) {
  if (req.body !== undefined && req.body !== null && typeof req.body === "object") {
    return Promise.resolve(req.body);
  }
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1e6) reject(httpError(413, "요청이 너무 큽니다"));
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(httpError(400, "JSON 형식이 아닙니다"));
      }
    });
    req.on("error", reject);
  });
}

function send(res, status, data) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(data));
}

// 핸들러를 감싸 오류를 JSON 응답으로 바꾼다
function wrap(handler) {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (err) {
      if (!err.status || err.status >= 500) console.error(err.message);
      send(res, err.status && err.status < 600 ? err.status : 500, { error: err.message });
    }
  };
}

// GET /api/products, POST /api/products
const productsHandler = wrap(async (req, res) => {
  assertConfig();
  if (req.method === "GET") return send(res, 200, await listProducts());
  if (req.method === "POST") return send(res, 201, await createProduct(await readJson(req)));
  res.setHeader("Allow", "GET, POST");
  send(res, 405, { error: "허용되지 않는 메서드입니다" });
});

// DELETE /api/products/:id
const productByIdHandler = wrap(async (req, res) => {
  assertConfig();
  if (req.method !== "DELETE") {
    res.setHeader("Allow", "DELETE");
    return send(res, 405, { error: "허용되지 않는 메서드입니다" });
  }
  const id = req.query && req.query.id;
  if (!id) throw httpError(400, "상품코드가 필요합니다");
  await deleteProduct(String(id));
  send(res, 200, { ok: true });
});

module.exports = { configErrors, productsHandler, productByIdHandler, send };
