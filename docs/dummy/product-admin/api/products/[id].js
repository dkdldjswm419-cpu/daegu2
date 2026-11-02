// Vercel 함수: DELETE /api/products/:id (삭제, 비밀번호 필요)
module.exports = require("../../lib/products").productByIdHandler;
