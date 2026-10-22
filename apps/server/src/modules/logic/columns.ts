import type { BaseType } from '@mini/shared';
import { logicOf, type LogicDoc } from './model.js';
import { sqlName } from './sqltext.js';

// For the objects module (T-15): which extra columns logic.<type> has on top of ont.<type>.
// Derived properties are read like properties; a rule is a boolean column, so a Filter
// { kind: 'rule', rule } on an object set compiles to `<alias>."<ruleColumn>"` (always true/false, never null).

export type LogicColumn = { apiName: string; sqlName: string; kind: 'derived' | 'rule'; type: BaseType };

export function logicColumns(doc: LogicDoc, objectType: string): LogicColumn[] {
  return logicOf(doc, objectType).map((l) => ({
    apiName: l.apiName,
    sqlName: sqlName(l.apiName),
    kind: l.kind,
    type: l.kind === 'derived' ? l.type : 'boolean',
  }));
}

// SQL column of a rule in logic.<type>, or undefined if `rule` is not a rule-kind logic of that type.
export function ruleColumn(doc: LogicDoc, objectType: string, rule: string): string | undefined {
  const l = logicOf(doc, objectType).find((x) => x.apiName === rule);
  return l?.kind === 'rule' ? sqlName(l.apiName) : undefined;
}

export function isRule(doc: LogicDoc, objectType: string, name: string): boolean {
  return ruleColumn(doc, objectType, name) !== undefined;
}
