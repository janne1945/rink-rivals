import { readFileSync } from "node:fs";

import type { ContentCatalog } from "../../src/domain/cards";

const catalogUrl = new URL("../../src/data/generated/gameCatalog.json", import.meta.url);

/** Node-side catalog view for Playwright; the source JSON is validated by the app catalog schema. */
export const gameCatalog = JSON.parse(readFileSync(catalogUrl, "utf8")) as ContentCatalog;
