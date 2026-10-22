import { describe, expect, it } from 'vitest';
import { buildToolRegistry } from '../src/agent/registry.js';
import { toInputSchema } from '../src/modules/llm/tools.js';

// The Claude API rejects a tool whose input_schema isn't JSON Schema 2020-12. zod-to-json-schema writes
// z.tuple as `items: [a, b]` (draft 7), which 2020-12 forbids: one such tool fails every model call.
function arrayItems(node: unknown, path: string, out: string[]): string[] {
  if (Array.isArray(node)) node.forEach((v, i) => arrayItems(v, `${path}/${i}`, out));
  else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      if (k === 'items' && Array.isArray(v)) out.push(path);
      arrayItems(v, `${path}/${k}`, out);
    }
  }
  return out;
}

describe('tool input schemas', () => {
  it('have no draft-7 tuples (items as an array), for every registered tool', () => {
    const bad = [...buildToolRegistry().values()].flatMap((d) => arrayItems(toInputSchema(d), d.name, []));
    expect(bad).toEqual([]);
  });
});
