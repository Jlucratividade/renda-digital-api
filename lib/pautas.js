const PROVIDER_ENV = {
  gemini: { key: "GEMINI_API_KEY", model: "GEMINI_MODEL" },
  groq: { key: "GROQ_API_KEY", model: "GROQ_MODEL" },
  openrouter: { key: "OPENROUTER_API_KEY", model: "OPENROUTER_MODEL" },
  cloudflare: { key: "CLOUDFLARE_API_TOKEN", model: "CLOUDFLARE_MODEL" }
};

export function buildPrompt({ niche, audience, quantity }) {
  return `Você é um editor-chefe de conteúdo digital. Gere exatamente ${quantity} pautas originais.\n\nNicho: ${niche}\nPúblico: ${audience}\nIdioma: português brasileiro.\n\nCrie assuntos úteis, interessantes e compartilháveis. Diversifique entre tutoriais, curiosidades, listas e explicações. Não invente notícias, estatísticas ou fatos. Evite pautas repetidas.\n\nResponda exclusivamente com um objeto JSON válido, sem Markdown, com esta estrutura:\n${JSON.stringify({schema_version:"1.0",niche,ideas:[{content_id:"ID-001",topic:"Assunto",angle:"Ângulo editorial",hook:"Frase inicial",audience,formats:["video","carousel","article"],evergreen:true,research_required:false}]},null,2)}\n\nO array ideas deve conter exatamente ${quantity} itens. Cada item deve conter todos os campos do exemplo. Use IDs únicos.`;
}

export function extractJSON(content) {
  if (typeof content !== "string" || !content.trim()) throw new Error("O provedor retornou uma resposta vazia.");
  const cleaned = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try { return JSON.parse(cleaned); } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try { return JSON.parse(cleaned.slice(start, end + 1)); } catch {}
    }
    throw new Error("O provedor não retornou JSON válido.");
  }
}

export function validateResult(result, params) {
  if (!result || typeof result !== "object" || Array.isArray(result) || result.schema_version !== "1.0" || result.niche !== params.niche || !Array.isArray(result.ideas) || result.ideas.length !== params.quantity) {
    throw new Error("A resposta não corresponde ao formato ou à quantidade solicitada.");
  }
  const formats = ["video", "carousel", "article"];
  const valid = result.ideas.every(item => item && typeof item === "object" && typeof item.content_id === "string" && item.content_id.trim() && typeof item.topic === "string" && item.topic.trim() && typeof item.angle === "string" && item.angle.trim() && typeof item.hook === "string" && item.hook.trim() && item.audience === params.audience && Array.isArray(item.formats) && item.formats.length && item.formats.every(x => formats.includes(x)) && typeof item.evergreen === "boolean" && typeof item.research_required === "boolean");
  if (!valid) throw new Error("Um ou mais itens gerados não passaram na validação.");
  const ids = result.ideas.map(x => x.content_id);
  if (new Set(ids).size !== ids.length) throw new Error("O provedor retornou IDs de pauta duplicados.");
  return result;
}

export function getProviderConfig(provider) {
  const env = PROVIDER_ENV[provider];
  if (!env) throw new Error("Provedor desconhecido.");
  const apiKey = process.env[env.key];
  const model = process.env[env.model] || ({gemini:"gemini-2.5-flash",groq:"openai/gpt-oss-20b",openrouter:"openrouter/free"}[provider] || "");
  const configurationError = message => { const error = new Error(message); error.status = 500; error.code = "CONFIGURATION_ERROR"; return error; };
  if (!apiKey) throw configurationError(`Variável ${env.key} não configurada na Vercel.`);
  if (provider === "cloudflare" && !process.env.CLOUDFLARE_ACCOUNT_ID) throw configurationError("Variável CLOUDFLARE_ACCOUNT_ID não configurada na Vercel.");
  if (provider === "cloudflare" && !process.env.CLOUDFLARE_MODEL) throw configurationError("Variável CLOUDFLARE_MODEL não configurada na Vercel.");
  return { apiKey, model };
}

function applyCors(req, res) {
  const origin = req.headers.origin;
  const configured = (process.env.ALLOWED_ORIGINS || "").split(",").map(x => x.trim().replace(/\/$/, "")).filter(Boolean);
  if (origin) {
    const normalized = origin.replace(/\/$/, "");
    // CORS é uma restrição de navegador, não substitui o CLIENT_TOKEN.
    if (configured.length && !configured.includes("*") && !configured.includes(normalized)) {
      return false;
    }
    res.setHeader("Access-Control-Allow-Origin", configured.includes("*") ? "*" : normalized);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Max-Age", "86400");
  return true;
}

export function createHandler({ provider, generate }) {
  return async function handler(req, res) {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    if (!applyCors(req, res)) return res.status(403).json({ok:false,error:"Origem não autorizada. Confira ALLOWED_ORIGINS."});
    if (req.method === "OPTIONS") return res.status(204).end();
    res.setHeader("Allow", "POST, OPTIONS");
    if (req.method !== "POST") return res.status(405).json({ok:false,error:"Método não permitido. Utilize POST."});

    const expectedToken = process.env.CLIENT_TOKEN;
    const authorization = req.headers.authorization;
    if (!expectedToken || authorization !== `Bearer ${expectedToken}`) {
      return res.status(401).json({ok:false,error: expectedToken ? "Acesso não autorizado. Verifique CLIENT_TOKEN." : "CLIENT_TOKEN não configurado na Vercel."});
    }

    const body = req.body || {};
    const niche = typeof body.niche === "string" ? body.niche.trim() : "";
    const audience = typeof body.audience === "string" ? body.audience.trim() : "";
    const quantity = body.quantity;
    if (!niche || !audience || niche.length > 100 || audience.length > 200 || !Number.isInteger(quantity) || quantity < 1 || quantity > 5) {
      return res.status(400).json({ok:false,error:"Parâmetros inválidos. Nicho (até 100 caracteres), público (até 200) e quantidade inteira entre 1 e 5 são obrigatórios."});
    }

    const params = {niche,audience,quantity};
    let model = "";
    try {
      const config = getProviderConfig(provider);
      model = config.model;
      const content = await generate({params,model,apiKey:config.apiKey,prompt:buildPrompt(params)});
      const result = validateResult(extractJSON(content), params);
      return res.status(200).json({ok:true,provider,model,result});
    } catch (error) {
      const status = Number.isInteger(error.status) ? error.status : 502;
      console.error(`[${provider}]`, {message:error.message,status,model});
      return res.status(status >= 400 && status <= 599 ? status : 502).json({
        ok:false, provider, model: model || undefined,
        error:error.publicMessage || error.message || "Falha na integração com o provedor.",
        provider_status:error.providerStatus || undefined,
        code:error.code || undefined
      });
    }
  };
}

export function createHealthHandler() {
  return async function handler(req,res) {
    res.setHeader("Cache-Control","no-store");
    if (!applyCors(req,res)) return res.status(403).json({ok:false,error:"Origem não autorizada."});
    if (req.method === "OPTIONS") return res.status(204).end();
    if (req.method !== "GET") return res.status(405).json({ok:false,error:"Utilize GET."});
    if (!process.env.CLIENT_TOKEN || req.headers.authorization !== `Bearer ${process.env.CLIENT_TOKEN}`) return res.status(401).json({ok:false,error:"Acesso não autorizado."});
    const status = {};
    for (const [id,env] of Object.entries(PROVIDER_ENV)) {
      const missing = [env.key, ...(id === "cloudflare" ? ["CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_MODEL"] : [])].filter(key => !process.env[key]);
      const model = process.env[env.model] || ({gemini:"gemini-2.5-flash",groq:"openai/gpt-oss-20b",openrouter:"openrouter/free"}[id] || null);
      status[id] = {configured:missing.length === 0,missing,model};
    }
    return res.status(200).json({ok:true,service:"renda-digital-api",timestamp:new Date().toISOString(),providers:status});
  };
}
