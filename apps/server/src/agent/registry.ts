import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { alexandreTools } from './tools/index.alexandre.js';
import { alfredTools } from './tools/index.alfred.js';
import type { AnyToolDef } from './tools/types.js';

// Owner: Alfred (09 §3). Phase 0 wiring only: both parts' tools in one list, checked against the catalog.

const CATALOG_PATH = fileURLToPath(new URL('../../../../build-package/tools/catalog.json', import.meta.url));

export function catalogNames(): Set<string> {
  const catalog = JSON.parse(readFileSync(CATALOG_PATH, 'utf8')) as { tools: { name: string }[] };
  return new Set(catalog.tools.map((t) => t.name));
}

// Fails at startup on a duplicate name or a name missing from tools/catalog.json (09 §4.4).
export function buildToolRegistry(tools: AnyToolDef[] = [...alexandreTools, ...alfredTools]): Map<string, AnyToolDef> {
  const known = catalogNames();
  const registry = new Map<string, AnyToolDef>();
  for (const tool of tools) {
    if (registry.has(tool.name)) throw new Error(`Tool ${tool.name} is registered twice.`);
    if (!known.has(tool.name)) throw new Error(`Tool ${tool.name} is not in build-package/tools/catalog.json.`);
    registry.set(tool.name, tool);
  }
  return registry;
}
