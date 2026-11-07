
export function buildPrompt({ niche, audience, quantity }) {
  return `
Você é um editor-chefe de conteúdo digital.

Produza exatamente ${quantity} pautas originais.

Nicho: ${niche}
Público: ${audience}
Idioma: português brasileiro.

Crie assuntos úteis, interessantes e compartilháveis.
Diversifique entre tutoriais, curiosidades, listas e explicações.
Não invente notícias, estatísticas ou fatos.
Evite pautas repetidas.

Responda exclusivamente com JSON válido, sem markdown,
neste formato:

{
  "schema_version": "1.0",
  "niche": ${JSON.stringify(niche)},
  "ideas": [
    {
      "content_id": "ID-001",
      "topic": "Assunto",
      "angle": "Ângulo editorial",
      "hook": "Frase inicial",
      "audience": ${JSON.stringify(audience)},
      "formats": ["video", "carousel", "article"],
      "evergreen": true,
      "research_required": false
    }
  ]
}

O array ideas deve conter exatamente ${quantity} itens.
Não inclua comentários ou texto fora do JSON.
`;
}

export function validateResult(result, params) {
  if (!result || typeof result !== "object") {
    throw new Error("Resultado inválido");
  }

  if (
    !Array.isArray(result.ideas) ||
    result.ideas.length !== params.quantity
  ) {
    throw new Error("Quantidade de pautas incorreta");
  }

  if (
    typeof result.niche !== "string" ||
    !result.ideas.every(item =>
      item &&
      typeof item.topic === "string" &&
      typeof item.angle === "string" &&
      typeof item.hook === "string" &&
      Array.isArray(item.formats)
    )
  ) {
    throw new Error("Estrutura das pautas inválida");
  }

  result.schema_version = "1.0";

  return result;
}

export function extractJSON(text) {
  if (typeof text !== "string" || !text.trim()) {
    throw new Error("Resposta vazia da IA");
  }

  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");

  return JSON.parse(cleaned);
}

export function createHandler({
  provider,
  getModel,
  generate
}) {
  return async function handler(req, res) {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Vary", "Origin");

    const origin = req.headers.origin;

    // Restrinja às origens autorizadas em produção.
    const allowedOrigins = (
      process.env.ALLOWED_ORIGINS || ""
    ).split(",").map(v => v.trim()).filter(Boolean);

    if (
      origin &&
      allowedOrigins.length &&
      !allowedOrigins.includes(origin)
    ) {
      return res.status(403).json({
        ok: false,
        error: "Origem nao autorizada"
      });
    }

    if (origin && (
      !allowedOrigins.length ||
      allowedOrigins.includes(origin)
    )) {
      res.setHeader("Access-Control-Allow-Origin", origin);
    }

    res.setHeader(
      "Access-Control-Allow-Methods",
      "POST, OPTIONS"
    );

    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization"
    );

    if (req.method === "OPTIONS") {
      res.setHeader("Access-Control-Max-Age", "86400");
      return res.status(204).end();
    }

    if (req.method !== "POST") {
      return res.status(405).json({
        ok: false,
        error: "Metodo nao permitido"
      });
    }

    const token = process.env.CLIENT_TOKEN;
    const authorization = req.headers.authorization;

    if (
      !token ||
      authorization !== `Bearer ${token}`
    ) {
      return res.status(401).json({
        ok: false,
        error: "Acesso nao autorizado"
      });
    }

    const { niche, audience, quantity } = req.body || {};

    if (
      typeof niche !== "string" ||
      typeof audience !== "string" ||
      !niche.trim() ||
      !audience.trim() ||
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity > 5 ||
      niche.length > 100 ||
      audience.length > 200
    ) {
      return res.status(400).json({
        ok: false,
        error: "Parametros invalidos"
      });
    }

    const params = {
      niche: niche.trim(),
      audience: audience.trim(),
      quantity
    };

    try {
      const model = getModel();

      const content = await generate({
        params,
        model,
        prompt: buildPrompt(params)
      });

      const result = validateResult(
        extractJSON(content),
        params
      );

      return res.status(200).json({
        ok: true,
        provider,
        model,
        result
      });

    } catch (err) {
      console.error(`[${provider}]`, err);

      const message = err.message || "";

      const status = message === "Quantidade de pautas incorreta" ||
        message === "Estrutura das pautas inválida" ||
        message === "Resposta inválida"
          ? 502
          : 502;

      return res.status(status).json({
        ok: false,
        provider,
        error: "Falha na geracao de pautas"
      });
    }
  };
}
