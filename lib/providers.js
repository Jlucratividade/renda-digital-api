function providerError(name, response, data) {
  const message = data?.error?.message || data?.message || data?.errors?.[0]?.message || `O provedor ${name} respondeu HTTP ${response.status}.`;
  const error = new Error(String(message).slice(0,700));
  error.status = 502;
  error.providerStatus = response.status;
  error.code = data?.error?.code || data?.errors?.[0]?.code || undefined;
  error.publicMessage = `${name}: ${error.message}`;
  return error;
}

async function readResponse(response, name) {
  let data;
  try { data = await response.json(); } catch { throw new Error(`${name}: resposta HTTP não contém JSON válido (HTTP ${response.status}).`); }
  if (!response.ok || data?.success === false) throw providerError(name,response,data);
  return data;
}

export async function generateGemini({prompt,model,apiKey}) {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method:"POST", headers:{"Content-Type":"application/json"},
    body:JSON.stringify({contents:[{role:"user",parts:[{text:prompt}]}],generationConfig:{temperature:0.7,responseMimeType:"application/json"}})
  });
  const data = await readResponse(response,"Gemini");
  const text = data.candidates?.[0]?.content?.parts?.map(p=>p.text || "").join("");
  if (!text) throw new Error("Gemini não retornou conteúdo. Verifique bloqueios, limite ou disponibilidade do modelo.");
  return text;
}

async function generateOpenAICompatible({name,url,model,apiKey,prompt,extraHeaders={}}) {
  const response = await fetch(url,{method:"POST",headers:{"Content-Type":"application/json","Authorization":`Bearer ${apiKey}`,...extraHeaders},body:JSON.stringify({model,messages:[{role:"system",content:"Você gera conteúdo editorial e deve responder exclusivamente com JSON válido, sem Markdown."},{role:"user",content:prompt}],temperature:0.7})});
  const data = await readResponse(response,name);
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) throw new Error(`${name} retornou uma resposta vazia ou em formato inesperado.`);
  return content;
}

export function generateGroq(args) {
  return generateOpenAICompatible({...args,name:"Groq",url:"https://api.groq.com/openai/v1/chat/completions"});
}

export function generateOpenRouter(args) {
  return generateOpenAICompatible({...args,name:"OpenRouter",url:"https://openrouter.ai/api/v1/chat/completions",extraHeaders:{"HTTP-Referer":process.env.OPENROUTER_SITE_URL || "https://renda-digital-api.vercel.app","X-Title":process.env.OPENROUTER_APP_NAME || "Gerador de Pautas Multi-LLM"}});
}

export async function generateCloudflare({prompt,model,apiKey}) {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/run/${model}`;
  const response = await fetch(url,{
    method:"POST",
    headers:{"Content-Type":"application/json","Authorization":`Bearer ${apiKey}`},
    body:JSON.stringify({
      messages:[
        {role:"system",content:"Você é um gerador de pautas editoriais. Responda com um único objeto JSON válido, sem Markdown, comentários ou texto antes/depois do JSON. O objeto deve conter schema_version, niche e ideas. Cada item de ideas deve conter content_id, topic, angle, hook, audience, formats, evergreen e research_required."},
        {role:"user",content:prompt}
      ],
      response_format:{type:"json_object"},
      temperature:0.2,
      max_tokens:3000
    })
  });
  const data = await readResponse(response,"Cloudflare Workers AI");
  const result = data?.result;

  // A resposta documentada do JSON Mode pode ser um objeto em
  // result.response. Não converta esse objeto em texto para depois
  // tentar interpretá-lo novamente com JSON.parse.
  if (result && typeof result === "object" && !Array.isArray(result)) {
    const candidate = result.response ?? result.output ?? result.text;
    if (candidate && typeof candidate === "object") return candidate;
    if (typeof candidate === "string" && candidate.trim()) return candidate;

    // Algumas respostas podem trazer diretamente o objeto solicitado
    // dentro de result, sem a propriedade response.
    if (result.schema_version || Array.isArray(result.ideas)) return result;
  }
  if (typeof result === "string" && result.trim()) return result;
  throw new Error(`Cloudflare Workers AI retornou uma estrutura inesperada. Chaves recebidas: ${result && typeof result === "object" ? Object.keys(result).join(", ") : typeof result}.`);
}
