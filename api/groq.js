import { createHandler } from "../lib/pautas.js";
import { generateGroq } from "../lib/providers.js";

export default createHandler({ provider: "groq", generate: generateGroq });
