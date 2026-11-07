# Renda Digital API — Multi-LLM

API serverless para Vercel com integrações independentes para Google Gemini, Groq, OpenRouter e Cloudflare Workers AI.

## Rotas

- `POST /api/gemini` — Google Gemini.
- `POST /api/pautas` — alias legado de `/api/gemini` (compatibilidade).
- `POST /api/groq` — Groq.
- `POST /api/openrouter` — OpenRouter.
- `POST /api/cloudflare` — Cloudflare Workers AI.
- `GET /api/health` — diagnóstico das variáveis (exige `Authorization: Bearer CLIENT_TOKEN`).

As quatro rotas de geração aceitam `niche`, `audience` e `quantity` (inteiro de 1 a 5) em JSON e exigem o cabeçalho `Authorization: Bearer <CLIENT_TOKEN>`.

## Variáveis de ambiente na Vercel

Obrigatórias para autenticação:

- `CLIENT_TOKEN`: segredo compartilhado pelo cliente autorizado e pela API.

Configure somente os provedores que pretende utilizar:

- `GEMINI_API_KEY` e opcionalmente `GEMINI_MODEL` (padrão `gemini-2.5-flash`).
- `GROQ_API_KEY` e opcionalmente `GROQ_MODEL` (padrão `openai/gpt-oss-20b`).
- `OPENROUTER_API_KEY` e opcionalmente `OPENROUTER_MODEL` (padrão `openrouter/free`).
- `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` e `CLOUDFLARE_MODEL` (o modelo deve ser um identificador Workers AI válido e habilitado para sua conta, por exemplo `@cf/meta/llama-3.3-70b-instruct-fp8-fast`).

O modelo de cada provedor é isolado. A variável antiga `AI_MODEL` não é mais utilizada.

Opcional:

- `ALLOWED_ORIGINS`: lista opcional separada por vírgulas ou ponto e vírgula, por exemplo `https://renda-digital-api.vercel.app,https://www.seudominio.com`. URLs com barra final também são normalizadas. O próprio domínio que recebe a requisição é autorizado automaticamente (same-origin), mesmo que a variável contenha uma lista antiga. Para uma interface hospedada em outro domínio, inclua a origem exata nessa variável. Se ficar vazia, a API aceita a origem recebida e a autenticação por `CLIENT_TOKEN` continua obrigatória. CORS não substitui autenticação.
- `OPENROUTER_SITE_URL`: URL usada como `HTTP-Referer` no OpenRouter.
- `OPENROUTER_APP_NAME`: nome enviado como `X-Title`.

## Implantação

1. Envie todos os arquivos para o repositório Git conectado à Vercel.
2. Em Vercel → Project → Settings → Environment Variables, configure os nomes acima nos ambientes desejados (Production, Preview e/ou Development).
3. Faça um novo Deploy depois de alterar variáveis de ambiente.
4. Abra a URL do projeto, informe o `CLIENT_TOKEN` e use **Verificar variáveis configuradas**.
5. Em seguida, clique em **Testar** ao lado de cada provedor. Esse teste faz uma geração real de uma pauta e pode consumir créditos/cota.

## Diagnóstico

`GET /api/health` informa apenas se as variáveis necessárias estão presentes e qual modelo será utilizado; não revela chaves. O botão **Testar** na interface realiza uma chamada real à API do provedor e valida a resposta gerada. Respostas de erro informam o HTTP do endpoint e, quando disponível, o HTTP retornado pelo provedor.

## Observações

- Não coloque chaves de provedores no HTML ou no navegador. Elas permanecem no backend Vercel.
- Nunca publique `CLIENT_TOKEN` em páginas públicas ou repositórios. O token deve ser fornecido apenas a clientes confiáveis.
- A rota antiga `/api/pautas` agora encaminha para Gemini porque era assim que a interface original a identificava. Clientes que usavam essa rota esperando Groq devem migrar para `/api/groq`.


### Cloudflare Workers AI — configuração recomendada

Use um modelo atualmente disponível e compatível com JSON Mode, por exemplo:

```env
CLOUDFLARE_MODEL=@cf/meta/llama-3.3-70b-instruct-fp8-fast
```

A integração envia `response_format` no modo `json_schema`, com os campos, tipos, público e quantidade esperados. A Cloudflare pode devolver o objeto em `result.response`; o backend também aceita respostas textuais JSON. A validação informa quais campos falharam. Depois de alterar arquivos ou variáveis na Vercel, faça um novo deployment.
