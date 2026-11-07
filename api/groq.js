
import { createHandler } from "../lib/pautas.js";

export default createHandler({
  provider: "groq",

  getModel: () =>
    process.env.GROQ_MODEL || "openai/gpt-oss-20b",

  generate: async ({ prompt, model }) => {
    const apiKey = process.env.GROQ_API_KEY;

    if (!apiKey) {
      throw new Error("API key nao configurada");
    }

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
      throw new Error("Erro no Groq: " + response.status);
    }

    return data.choices?.[0]?.message?.content || "";
  }
});

