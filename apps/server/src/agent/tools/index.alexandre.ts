import { diffDraft } from './diff_draft.js';
import { discardDraft } from './discard_draft.js';
import { editDraft } from './edit_draft.js';
import { getWorkspace } from './get_workspace.js';
import { searchOntologyTool } from './search_ontology.js';
import type { AnyToolDef } from './types.js';
import { validateDraft } from './validate_draft.js';

// Part A agent tools (owner: Alexandre, 09 §5). One file per tool in this folder, listed here.
export const alexandreTools: AnyToolDef[] = [getWorkspace, searchOntologyTool, editDraft, validateDraft, diffDraft, discardDraft];
