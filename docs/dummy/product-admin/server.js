// 실습용 가상 상품 관리 로컬 서버 (외부 패키지 없음, Node 20.12 이상)
// - 127.0.0.1에서만 열린다. 설정은 .env.local
// - API는 Vercel 함수와 같은 핸들러(lib/products.js)를 쓴다
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { configErrors, productsHandler, productByIdHandler, authHandler, send } = require("./lib/products");

const PORT = Number(process.env.PORT) || 3030;
const HOST = "127.0.0.1";

const errors = configErrors();
if (errors.length) {
  console.error(`.env.local 설정 오류 — ${errors.join(" / ")} (.env.local.example 참고)`);
  process.exit(1);
}
if (!process.env.ADMIN_PASSWORD) {
  console.warn("ADMIN_PASSWORD가 없어 추가·삭제가 막힙니다. .env.local에 추가하세요");
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname === "/" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    return fs.createReadStream(path.join(__dirname, "public", "index.html")).pipe(res);
  }
  if (url.pathname === "/api/products") return productsHandler(req, res);
  if (url.pathname === "/api/auth") return authHandler(req, res);
  const match = url.pathname.match(/^\/api\/products\/([^/]+)$/);
  if (match) {
    // Vercel의 [id].js와 같은 형태로 넘긴다
    req.query = { id: decodeURIComponent(match[1]) };
    return productByIdHandler(req, res);
  }
  send(res, 404, { error: "없는 경로입니다" });
});

server.listen(PORT, HOST, () => {
  console.log(`상품 관리 페이지: http://${HOST}:${PORT}`);
});
