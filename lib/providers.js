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

export async function generateCloudflare({prompt,model,apiKey,params}) {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!accountId) throw new Error("Variável CLOUDFLARE_ACCOUNT_ID não configurada.");
  const url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/run/${model}`;

  // JSON Schema explícito: apenas pedir "json_object" não garante que o
  // modelo produza os campos e tipos exigidos pelo contrato da aplicação.
  const ideaSchema = {
    type: "object",
    properties: {
      content_id: {type:"string"},
      topic: {type:"string"},
      angle: {type:"string"},
      hook: {type:"string"},
      audience: {type:"string", enum:[params.audience]},
      formats: {type:"array", items:{type:"string", enum:["video","carousel","article"]}, minItems:1},
      evergreen: {type:"boolean"},
      research_required: {type:"boolean"}
    },
    required:["content_id","topic","angle","hook","audience","formats","evergreen","research_required"],
    additionalProperties:false
  };
  const outputSchema = {
    type:"object",
    properties:{
      schema_version:{type:"string", enum:["1.0"]},
      niche:{type:"string", enum:[params.niche]},
      ideas:{type:"array", items:ideaSchema, minItems:params.quantity, maxItems:params.quantity}
    },
    required:["schema_version","niche","ideas"],
    additionalProperties:false
  };

  const response = await fetch(url,{
    method:"POST",
    headers:{"Content-Type":"application/json","Authorization":`Bearer ${apiKey}`},
    body:JSON.stringify({
      messages:[
        {role:"system",content:"Você é um gerador editorial. Produza pautas originais em português brasileiro. Preencha todos os campos solicitados. Não inclua explicações, Markdown ou texto fora do objeto estruturado."},
        {role:"user",content:prompt}
      ],
      response_format:{type:"json_schema",json_schema:outputSchema},
      temperature:0.1,
      max_tokens:3000
    })
  });
  const data = await readResponse(response,"Cloudflare Workers AI");
  const result = data?.result;
  if (result && typeof result === "object" && !Array.isArray(result)) {
    const candidate = result.response ?? result.output ?? result.text;
    if (candidate && typeof candidate === "object") return candidate;
    if (typeof candidate === "string" && candidate.trim()) return candidate;
    if (result.schema_version || Array.isArray(result.ideas)) return result;
  }
  if (typeof result === "string" && result.trim()) return result;
  throw new Error(`Cloudflare Workers AI retornou uma estrutura inesperada. Chaves recebidas: ${result && typeof result === "object" ? Object.keys(result).join(", ") : typeof result}.`);
}
