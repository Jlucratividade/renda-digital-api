export default async function handler(req, res) {
  // Configuração de CORS e Validação de Origem
  const origin = req.headers.origin;

  const allowedOrigins = (
    process.env.ALLOWED_ORIGINS || ""
  )
    .split(",")
    .map(v => v.trim().replace(/\/+$/, ""))
    .filter(Boolean);

  if (origin) {
    const normalizedOrigin = origin.replace(/\/+$/, "");

    if (!allowedOrigins.includes(normalizedOrigin)) {
      return res.status(403).json({
        ok: false,
        error: "Origem nao autorizada",
        received_origin: origin
      });
    }

    res.setHeader(
      "Access-Control-Allow-Origin",
      origin
    );

    res.setHeader("Vary", "Origin");
  }

  res.setHeader(
    "Access-Control-Allow-Methods",
    "POST, OPTIONS"
  );

  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization"
  );

  res.setHeader("Cache-Control", "no-store");

  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Max-Age", "86400");
    return res.status(204).end();
  }

  // Validação de Método HTTP permitindo apenas POST
  if (req.method !== 'POST') {
    return res.status(405).json({ 
      ok: false, 
      error: 'Método não permitido' 
    });
  }

  try {
    // Sua lógica de manipulação de pautas continua aqui
    const body = req.body || {};

    // Exemplo de resposta padrão para testes da rota
    return res.status(200).json({
      ok: true,
      message: "Requisição processada com sucesso no lib/pautas.js",
      data: body
    });

  } catch (error) {
    console.error("Erro em /lib/pautas.js:", error);
    return res.status(500).json({
      ok: false,
      error: error.message || "Erro interno no servidor"
    });
  }
}
