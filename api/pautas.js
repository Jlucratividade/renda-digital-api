
export default async function handler(req, res) {
  // Aceitar somente POST
  if (req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      error: "Metodo nao permitido"
    });
  }

  // Autenticação do MacroDroid
  const token = process.env.CLIENT_TOKEN;
  const authorization = req.headers.authorization;

  if (!token || authorization !== `Bearer ${token}`) {
    return res.status(401).json({
      ok: false,
      error: "Acesso nao autorizado"
    });
  }

  // Parâmetros
  const { niche, audience, quantity } = req.body || {};

  if (
    typeof niche !== "string" ||
    typeof audience !== "string" ||
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

  // Credenciais e modelo
  const apiKey = process.env.GROQ_API_KEY;
  const model =
    process.env.AI_MODEL || "openai/gpt-oss-20b";

  if (!apiKey) {
    return res.status(500).json({
      ok: false,
      error: "IA nao configurada"
    });
  }

  const prompt = `
Você é um editor-chefe de conteúdo digital.

Produza exatamente ${quantity} pautas originais.

Nicho: ${niche}
Público: ${audience}
Idioma: português brasileiro.

Crie assuntos úteis, interessantes e compartilháveis.
Diversifique entre tutoriais, curiosidades, listas e explicações.
Não invente notícias, estatísticas ou fatos.
Evite pautas repetidas.

Responda exclusivamente com JSON válido neste formato:

{
  "schema_version": "1.0",
  "niche": "${niche}",
  "ideas": [
    {
      "content_id": "ID-001",
      "topic": "Assunto",
      "angle": "Ângulo editorial",
      "hook": "Frase inicial",
      "audience": "Público",
      "formats": ["video", "carousel", "article"],
      "evergreen": true,
      "research_required": false
    }
  ]
}

O array ideas deve conter exatamente ${quantity} itens.
`;

  try {
    const response = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: "system",
              content: "Responda somente com JSON válido."
            },
            {
              role: "user",
              content: prompt
            }
          ],
          temperature: 0.7,
          max_tokens: 2500
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(502).json({
        ok: false,
        error: "Falha no provedor de IA",
        provider_status: response.status
      });
    }

    const content =
      data.choices?.[0]?.message?.content;

    if (!content) {
      return res.status(502).json({
        ok: false,
        error: "Resposta vazia da IA"
      });
    }

    let result;

    try {
      result = JSON.parse(content);
    } catch {
      return res.status(502).json({
        ok: false,
        error: "IA retornou JSON invalido"
      });
    }

    if (
      !Array.isArray(result.ideas) ||
      result.ideas.length !== quantity ||
      result.ideas.some(
        item =>
          !item.content_id ||
          !item.topic ||
          !item.angle ||
          !item.hook
      )
    ) {
      return res.status(502).json({
        ok: false,
        error: "JSON nao passou na validacao"
      });
    }

    res.setHeader("Cache-Control", "no-store");

    return res.status(200).json({
      ok: true,
      provider: "groq",
      model,
      result
    });

  } catch {
    return res.status(500).json({
      ok: false,
      error: "Erro interno na comunicacao com a IA"
    });
  }
}
