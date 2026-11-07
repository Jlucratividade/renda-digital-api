import { createHandler } from "../lib/pautas.js";
import { generateOpenRouter } from "../lib/providers.js";

export default createHandler({ provider: "openrouter", generate: generateOpenRouter });
