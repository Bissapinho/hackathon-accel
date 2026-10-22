import type { DiffEntry, EntityKind, ObjectTypeDef, WorkspaceDoc } from '@mini/shared';

// What publishing `draft` over `base` would add, change and remove (04-api §1 diff; approval cards).
// Properties of types present on both sides are listed one by one; a new or removed type is one entry.

export type WorkspaceDiff = {
  added: DiffEntry[];
  changed: DiffEntry[];
  removed: DiffEntry[];
  semanticVersion?: { from: string; to: string }; // set when the draft is built on another meaning version
};

type Keyed = { key: string; label: string; value: unknown; summary: string };

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

function entities(doc: WorkspaceDoc): Map<EntityKind, Keyed[]> {
  return new Map<EntityKind, Keyed[]>([
    [
      'pipeline',
      doc.pipelines.map((p) => ({
        key: p.apiName,
        label: p.apiName,
        value: p,
        summary: `pipeline ${p.apiName} (${plural(p.nodes.length, 'step')}, ${plural(p.outputs.length, 'output')})`,
      })),
    ],
    [
      'objectType',
      doc.objectTypes.map((t) => ({
        key: t.apiName,
        label: t.apiName,
        // Properties are compared separately for types on both sides.
        value: { ...t, properties: undefined },
        summary: `object type ${t.displayName} (${plural(t.properties.length, 'property', 'properties')})`,
      })),
    ],
    [
      'linkType',
      doc.linkTypes.map((l) => ({
        key: `${l.from}.${l.apiName}`,
        label: `${l.from}.${l.apiName}`,
        value: l,
        summary: `link ${l.displayName} from ${l.from} to ${l.to}`,
      })),
    ],
    [
      'logic',
      doc.logic.map((l) => ({
        key: `${l.objectType}.${l.apiName}`,
        label: `${l.objectType}.${l.apiName}`,
        value: l,
        summary: `${l.kind === 'rule' ? 'rule' : 'calculated property'} ${l.displayName} on ${l.objectType}`,
      })),
    ],
    [
      'actionType',
      doc.actionTypes.map((a) => ({ key: a.apiName, label: a.apiName, value: a, summary: `action ${a.displayName}` })),
    ],
    ['app', doc.apps.map((a) => ({ key: a.id, label: a.id, value: a, summary: `app ${a.name}` }))],
    [
      'automation',
      doc.automations.map((a) => ({ key: a.id, label: a.id, value: a, summary: `automation ${a.name}` })),
    ],
  ]);
}

export function diffDocs(base: WorkspaceDoc, draft: WorkspaceDoc): WorkspaceDiff {
  const out: WorkspaceDiff = { added: [], changed: [], removed: [] };
  const before = entities(base);
  const after = entities(draft);

  for (const [kind, list] of after) {
    const old = new Map((before.get(kind) ?? []).map((e) => [e.key, e]));
    for (const e of list) {
      const prev = old.get(e.key);
      if (!prev) out.added.push({ kind, apiName: e.label, summary: `New ${e.summary}` });
      else if (!same(prev.value, e.value)) out.changed.push({ kind, apiName: e.label, summary: `Changed ${e.summary}` });
    }
    const now = new Set(list.map((e) => e.key));
    for (const e of before.get(kind) ?? []) {
      if (!now.has(e.key)) out.removed.push({ kind, apiName: e.label, summary: `Removed ${e.summary}` });
    }
  }

  // Property-level entries for object types on both sides.
  const baseTypes = new Map(base.objectTypes.map((t) => [t.apiName, t]));
  for (const t of draft.objectTypes) {
    const prev = baseTypes.get(t.apiName);
    if (prev) diffProperties(prev, t, out);
  }

  if (base.semanticVersion !== draft.semanticVersion) {
    out.semanticVersion = { from: base.semanticVersion, to: draft.semanticVersion };
  }
  return out;
}

function diffProperties(prev: ObjectTypeDef, next: ObjectTypeDef, out: WorkspaceDiff): void {
  const old = new Map(prev.properties.map((p) => [p.apiName, p]));
  for (const p of next.properties) {
    const o = old.get(p.apiName);
    const label = `${next.apiName}.${p.apiName}`;
    if (!o) out.added.push({ kind: 'property', apiName: label, summary: `New property ${p.displayName} on ${next.displayName}` });
    else if (!same(o, p)) out.changed.push({ kind: 'property', apiName: label, summary: `Changed property ${p.displayName} on ${next.displayName}` });
  }
  const now = new Set(next.properties.map((p) => p.apiName));
  for (const p of prev.properties) {
    if (!now.has(p.apiName)) {
      out.removed.push({ kind: 'property', apiName: `${next.apiName}.${p.apiName}`, summary: `Removed property ${p.displayName} from ${next.displayName}` });
    }
  }
}

export function isEmptyDiff(d: WorkspaceDiff): boolean {
  return d.added.length + d.changed.length + d.removed.length === 0 && !d.semanticVersion;
}
