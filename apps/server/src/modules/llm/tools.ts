// Agent tool definitions → the tools Claude sees. The JSON schema is generated from the tool's zod input
// (CLAUDE.md rule 2); the description comes from build-package/tools/catalog.json, since ToolDef has none.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { AnyToolDef } from '../../agent/tools/types.js';
import type { LlmTool } from './types.js';

const CATALOG_PATH = fileURLToPath(new URL('../../../../../build-package/tools/catalog.json', import.meta.url));

type CatalogTool = { name: string; description?: string };

let cachedDescriptions: Map<string, string> | undefined;

/** Tool name → description, read once from the catalog (the same file agent/registry.ts checks names against). */
export function catalogDescriptions(): Map<string, string> {
  if (!cachedDescriptions) {
    const catalog = JSON.parse(readFileSync(CATALOG_PATH, 'utf8')) as { tools: CatalogTool[] };
    cachedDescriptions = new Map(catalog.tools.map((t) => [t.name, t.description ?? '']));
  }
  return cachedDescriptions;
}

/** The JSON schema sent as `input_schema`. Recursive inputs (filters, object sets) keep root-relative `$ref`s. */
export function toInputSchema(def: Pick<AnyToolDef, 'name' | 'input'>): Record<string, unknown> {
  const schema = zodToJsonSchema(def.input, { $refStrategy: 'root' }) as Record<string, unknown>;
  delete schema.$schema;
  if (schema.type !== 'object') throw new Error(`Tool ${def.name}: its input must be a zod object.`);
  return schema;
}

export function toLlmTool(def: AnyToolDef, descriptions: Map<string, string> = catalogDescriptions()): LlmTool {
  const description = descriptions.get(def.name);
  if (!description) throw new Error(`Tool ${def.name} has no description in build-package/tools/catalog.json.`);
  return { name: def.name, description, inputSchema: toInputSchema(def), schema: def.input };
}

/**
 * In the given order, which must be the same in every mode and every turn: tools sit in the cached prefix,
 * so the loop builds this list once (e.g. from the registry) and reuses it.
 */
export function toLlmTools(defs: Iterable<AnyToolDef>, descriptions: Map<string, string> = catalogDescriptions()): LlmTool[] {
  return [...defs].map((def) => toLlmTool(def, descriptions));
}
