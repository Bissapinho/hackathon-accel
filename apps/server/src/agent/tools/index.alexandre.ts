import { aggregateObjects } from './aggregate_objects.js';
import { getActionLogTool } from './get_action_log.js';
import { getObject } from './get_object.js';
import { previewPipelineTool } from './preview_pipeline.js';
import { queryObjects } from './query_objects.js';
import { runActionTool } from './run_action.js';
import { testActionTool } from './test_action.js';
import { testLogicTool } from './test_logic.js';
import type { AnyToolDef } from './types.js';

// Part A agent tools (owner: Alexandre, 09 §5). One file per tool in this folder, listed here.
export const alexandreTools: AnyToolDef[] = [
  previewPipelineTool,
  testLogicTool,
  testActionTool,
  runActionTool,
  queryObjects,
  aggregateObjects,
  getObject,
  getActionLogTool,
];
