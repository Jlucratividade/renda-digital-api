
import { createHandler } from "../lib/pautas.js";

export default createHandler({
  provider: "openrouter",

  getModel: () =>
    process.env.OPENROUTER_MODEL || "openrouter/free",

  generate: async ({ prompt, model }) => {
    const apiKey = process.env.OPENROUTER_API_KEY;

    if (!apiKey) {
      throw new Error("API key nao configurada");
    }

    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
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
              role: "user",
              content: prompt
            }
          ],
          temperature: 0.7,
          response_format: {
            type: "json_object"
          }
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        "Erro no OpenRouter: " + response.status
      );
    }

    return data.choices?.[0]?.message?.content || "";
  }
});
