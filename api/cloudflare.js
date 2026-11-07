
import { createHandler } from "../lib/pautas.js";

export default createHandler({
  provider: "cloudflare",

  getModel: () => {
    const model = process.env.CLOUDFLARE_MODEL;

    if (!model) {
      throw new Error("Modelo Cloudflare nao configurado");
    }

    return model;
  },

  generate: async ({ prompt, model }) => {
    const apiKey = process.env.CLOUDFLARE_API_TOKEN;
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;

    if (!apiKey || !accountId) {
      throw new Error("Cloudflare nao configurado");
    }

    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          messages: [
            {
              role: "system",
              content: "Responda exclusivamente com JSON válido."
            },
            {
              role: "user",
              content: prompt
            }
          ]
        })
      }
    );

    const data = await response.json();

    if (!response.ok || data.success === false) {
      throw new Error(
        "Erro no Cloudflare: " + response.status
      );
    }

    return (
      data.result?.response ||
      data.result?.output ||
      ""
    );
  }
});
