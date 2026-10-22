import { getActionLogTool } from './get_action_log.js';
import { runActionTool } from './run_action.js';
import { testActionTool } from './test_action.js';
import type { AnyToolDef } from './types.js';

// Part A agent tools (owner: Alexandre, 09 §5). One file per tool in this folder, listed here.
export const alexandreTools: AnyToolDef[] = [testActionTool, runActionTool, getActionLogTool];
