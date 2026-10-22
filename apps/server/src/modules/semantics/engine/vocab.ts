// Closed vocabularies of the semantic model (EvoOntology ontology-schema.md, feature book ch. 8 §3).
// Ported from EvoOntology (https://github.com/ruc-datalab/EvoOntology), MIT, Copyright (c) 2026 Meiduo Chong.

import type { ConstraintType, RelationType, SemKind, SemLifecycle, SemTerm } from '@mini/shared';

export const SEM_KINDS: readonly SemKind[] = ['term', 'mapping', 'relation', 'constraint', 'evidence'];
export const LIFECYCLES: readonly SemLifecycle[] = ['active', 'superseded', 'proposed'];
export const TERM_TYPES: readonly SemTerm['type'][] = ['concept', 'metric', 'entity', 'dimension', 'category'];
export const TERM_STATUSES: readonly SemTerm['status'][] = ['card', 'enriched'];

/** In EvoOntology's decision order: is-a → part-of → equivalence → derivation → association. */
export const RELATION_TYPES: readonly RelationType[] = ['hierarchy', 'composition', 'equivalence', 'derivation', 'association'];
export const CONSTRAINT_TYPES: readonly ConstraintType[] = ['enum_semantics', 'data_quality', 'business_rule', 'unit', 'scope'];
export const SEVERITIES = ['block', 'warning', 'info'] as const;

/** Record id prefixes (CLAUDE.md conventions). */
export const ID_PREFIX: Record<SemKind, string> = { term: 'T_', mapping: 'M_', relation: 'R_', constraint: 'C_', evidence: 'E_' };

/** Definition of a minimal card that has not been enriched yet (03-data-model §6). */
export const TO_BE_DEFINED = 'to be defined';

export const MAX_BROWSE_ITEMS = 6;
export const MAX_RESOLVE_MENTIONS = 5;
/** Evidence results and trajectory tool results are kept to about 2 KB. */
export const RESULT_MAX_CHARS = 2000;
export const RESULT_MAX_LINES = 20;
