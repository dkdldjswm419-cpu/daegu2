// Vercel 함수: GET /api/products (조회), POST /api/products (추가, 비밀번호 필요)
module.exports = require("../../lib/products").productsHandler;
