export default async function handler(req, res) {
  // Aceitar somente POST
  if (req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      error: "Metodo nao permitido"
    });
  }

  // Autenticação do MacroDroid (usa o mesmo CLIENT_TOKEN)
  const token = process.env.CLIENT_TOKEN;
  const authorization = req.headers.authorization;

  if (!token || authorization !== `Bearer ${token}`) {
    return res.status(401).json({
      ok: false,
      error: "Acesso nao autorizado"
    });
  }

  // Parâmetros recebidos do MacroDroid
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

  // Credenciais da Gemini
  const apiKey = process.env.GEMINI_API_KEY;
  // Usando o modelo padrão atual, por exemplo, gemini-2.5-flash
  const model = process.env.AI_MODEL || "gemini-2.5-flash";

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

Responda exclusivamente com JSON válido neste formato exato, sem blocos de código markdown ou texto adicional:

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
    // Endpoint oficial da API do Google Gemini
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: prompt
                }
              ]
            }
          ],
          generationConfig: {
            temperature: 0.7,
            responseMimeType: "application/json" // Força a Gemini a responder estritamente em JSON
          }
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(502).json({
        ok: false,
        error: "Falha no provedor de IA",
        provider_status: response.status,
        details: data
      });
    }

    const content = data.candidates?.[0]?.content?.parts?.[0]?.text;

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

    res.setHeader("Cache-Control", "no-store");

    return res.status(200).json({
      ok: true,
      provider: "gemini",
      model,
      result
    });

  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: "Erro interno na comunicacao com a IA"
    });
  }
}