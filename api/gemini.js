import { createHandler } from "../lib/pautas.js";
import { generateGemini } from "../lib/providers.js";

export default createHandler({ provider: "gemini", generate: generateGemini });
