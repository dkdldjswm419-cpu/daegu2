// 실습용 가상 상품 관리 로컬 서버 (외부 패키지 없음, Node 20.12 이상)
// - 127.0.0.1에서만 열린다. 키는 서버에만 두고 브라우저로 보내지 않는다
// - Supabase REST(PostgREST) API로 products와 하위 테이블을 조회·추가·삭제한다
// - 조회는 anon 키(RLS 읽기 허용), 추가·삭제는 service_role 키를 쓴다
// - DB 직접 연결(session pooler)은 쓰지 않고 프로젝트 URL로 REST만 호출한다
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const ENV_PATH = path.join(__dirname, ".env.local");
if (fs.existsSync(ENV_PATH)) process.loadEnvFile(ENV_PATH);

const SUPABASE_URL = (process.env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
const ANON_KEY = (process.env.SUPABASE_ANON_KEY || "").trim();
const SERVICE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
const PORT = Number(process.env.PORT) || 3030;
const HOST = "127.0.0.1";

const missing = [
  ["SUPABASE_URL", SUPABASE_URL],
  ["SUPABASE_ANON_KEY", ANON_KEY],
  ["SUPABASE_SERVICE_ROLE_KEY", SERVICE_KEY],
].filter(([, v]) => !v).map(([k]) => k);
if (missing.length) {
  console.error(`.env.local에 값이 없습니다: ${missing.join(", ")} (.env.local.example 참고)`);
  process.exit(1);
}
// session pooler 주소(postgres://...)를 넣은 경우 바로 알려 준다
if (!/^https:\/\/|^http:\/\/(127\.0\.0\.1|localhost)/.test(SUPABASE_URL)) {
  console.error("SUPABASE_URL에는 프로젝트 URL(https://xxxx.supabase.co)을 넣어 주세요. postgres:// 연결 문자열은 쓰지 않습니다");
  process.exit(1);
}
if (ANON_KEY === SERVICE_KEY) {
  console.error("SUPABASE_ANON_KEY와 SUPABASE_SERVICE_ROLE_KEY가 같습니다. 서로 다른 키를 넣어 주세요");
  process.exit(1);
}

const CHILD_TABLES = {
  origins: "product_origins",
  allergens: "product_allergens",
  storage: "product_storage",
  guides: "product_guides",
};
const LIST_SELECT =
  "*,product_origins(*),product_allergens(*),product_storage(*),product_guides(*)";

// Supabase REST 호출. 조회는 anon, 그 외는 service_role 키
// 실패하면 사람이 읽을 수 있는 메시지로 예외를 던진다
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
  if (!res.ok) {
    const err = new Error(friendlyError(data));
    err.status = res.status;
    throw err;
  }
  return data;
}

// Postgres 오류 코드를 한국어 안내로 바꾼다
function friendlyError(data) {
  if (!data) return "Supabase 요청이 실패했습니다";
  if (data.message === "Invalid API key") return "API 키가 올바르지 않습니다 (.env.local 확인)";
  if (data.code === "23505") return "이미 있는 값입니다 (상품코드 또는 순번 중복)";
  if (data.code === "23514") return `허용되지 않는 값입니다: ${data.message}`;
  if (data.code === "23502") return `필수 값이 비어 있습니다: ${data.message}`;
  return data.message || "Supabase 요청이 실패했습니다";
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1e6) reject(Object.assign(new Error("요청이 너무 큽니다"), { status: 413 }));
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(Object.assign(new Error("JSON 형식이 아닙니다"), { status: 400 }));
      }
    });
    req.on("error", reject);
  });
}

function send(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

// 상품 목록 (하위 테이블 포함)
async function listProducts() {
  return rest("GET", `products?select=${encodeURIComponent(LIST_SELECT)}&order=product_id`);
}

// 상품 추가: products 먼저 넣고 하위 행을 넣는다. 하위 행이 실패하면 상품을 지워 되돌린다
async function createProduct(input) {
  const product = input.product || {};
  const id = product.product_id;
  if (!id) throw Object.assign(new Error("상품코드가 필요합니다"), { status: 400 });

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
  if (!deleted.length) throw Object.assign(new Error("없는 상품입니다"), { status: 404 });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (url.pathname === "/" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      return fs.createReadStream(path.join(__dirname, "public", "index.html")).pipe(res);
    }
    if (url.pathname === "/api/products" && req.method === "GET") {
      return send(res, 200, await listProducts());
    }
    if (url.pathname === "/api/products" && req.method === "POST") {
      return send(res, 201, await createProduct(await readJson(req)));
    }
    const match = url.pathname.match(/^\/api\/products\/([^/]+)$/);
    if (match && req.method === "DELETE") {
      await deleteProduct(decodeURIComponent(match[1]));
      return send(res, 200, { ok: true });
    }
    send(res, 404, { error: "없는 경로입니다" });
  } catch (err) {
    console.error(err.message);
    send(res, err.status && err.status < 600 ? err.status : 500, { error: err.message });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`상품 관리 페이지: http://${HOST}:${PORT}`);
});
