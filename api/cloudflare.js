import { createHandler } from "../lib/pautas.js";
import { generateCloudflare } from "../lib/providers.js";

export default createHandler({ provider: "cloudflare", generate: generateCloudflare });
