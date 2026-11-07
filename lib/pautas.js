
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
  if (
    !result ||
    typeof result !== "object" ||
    Array.isArray(result)
  ) {
    throw new Error("Resultado inválido");
  }

  if (
    result.schema_version !== "1.0" ||
    result.niche !== params.niche ||
    !Array.isArray(result.ideas) ||
    result.ideas.length !== params.quantity
  ) {
    throw new Error("Quantidade ou estrutura de pautas incorreta");
  }

  const allowedFormats = [
    "video",
    "carousel",
    "article"
  ];

  const valid = result.ideas.every((item) => {
    return (
      item &&
      typeof item === "object" &&
      typeof item.content_id === "string" &&
      item.content_id.trim().length > 0 &&
      typeof item.topic === "string" &&
      item.topic.trim().length > 0 &&
      typeof item.angle === "string" &&
      item.angle.trim().length > 0 &&
      typeof item.hook === "string" &&
      item.hook.trim().length > 0 &&
      item.audience === params.audience &&
      Array.isArray(item.formats) &&
      item.formats.length > 0 &&
      item.formats.every(format =>
        allowedFormats.includes(format)
      ) &&
      typeof item.evergreen === "boolean" &&
      typeof item.research_required === "boolean"
    );
  });

  if (!valid) {
    throw new Error("Estrutura das pautas inválida");
  }

  const ids = result.ideas.map(item => item.content_id);

  if (new Set(ids).size !== ids.length) {
    throw new Error("IDs de pautas duplicados");
  }

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

  try {
    return JSON.parse(cleaned);
  } catch {
    throw new Error("Resposta inválida");
  }
}

export function createHandler({
  provider,
  getModel,
  generate
}) {
  if (
    typeof getModel !== "function" ||
    typeof generate !== "function"
  ) {
    throw new Error("Configuração do provider inválida");
  }

  return async function handler(req, res) {
    res.setHeader("Cache-Control", "no-store");

    const origin = req.headers.origin;

    const allowedOrigins = (
      process.env.ALLOWED_ORIGINS || ""
    )
      .split(",")
      .map(value => value.trim().replace(/\/+$/, ""))
      .filter(Boolean);

    // CORS
    if (origin) {
      const normalizedOrigin = origin.replace(/\/+$/, "");

      if (
        !allowedOrigins.length ||
        !allowedOrigins.includes(normalizedOrigin)
      ) {
        return res.status(403).json({
          ok: false,
          error: "Origem não autorizada"
        });
      }

      res.setHeader(
        "Access-Control-Allow-Origin",
        normalizedOrigin
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

    if (req.method === "OPTIONS") {
      res.setHeader("Access-Control-Max-Age", "86400");
      return res.status(204).end();
    }

    // Método HTTP
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST, OPTIONS");

      return res.status(405).json({
        ok: false,
        error: "Método não permitido"
      });
    }

    // Autenticação
    const token = process.env.CLIENT_TOKEN;
    const authorization = req.headers.authorization;

    if (
      !token ||
      typeof authorization !== "string" ||
      authorization !== `Bearer ${token}`
    ) {
      return res.status(401).json({
        ok: false,
        error: "Acesso não autorizado"
      });
    }

    // Validação dos parâmetros
    const { niche, audience, quantity } = req.body || {};

    if (
      typeof niche !== "string" ||
      typeof audience !== "string" ||
      !niche.trim() ||
      !audience.trim() ||
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity > 5 ||
      niche.trim().length > 100 ||
      audience.trim().length > 200
    ) {
      return res.status(400).json({
        ok: false,
        error: "Parâmetros inválidos"
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

      const parsedResult = extractJSON(content);

      const result = validateResult(
        parsedResult,
        params
      );

      return res.status(200).json({
        ok: true,
        provider,
        model,
        result
      });

    } catch (err) {
      console.error(`[${provider}] Erro:`, err);

      return res.status(502).json({
        ok: false,
        provider,
        error: "Falha na geração de pautas"
      });
    }
  };
}
