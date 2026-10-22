import { semanticsTools } from './index.semantics.js';
import type { AnyToolDef } from './types.js';

// Part B agent tools (owner: Alfred, 09 §5). One file per tool in this folder, listed here.
// The loop-bound meta tools (change_mode, ask_user, set_plan) are listed by registry.ts from index.meta.ts.
export const alfredTools: AnyToolDef[] = [...semanticsTools];
