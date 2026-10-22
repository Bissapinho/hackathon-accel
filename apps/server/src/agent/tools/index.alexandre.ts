import { aggregateObjects } from './aggregate_objects.js';
import { disableAutomationTool } from './disable_automation.js';
import { diffDraft } from './diff_draft.js';
import { discardDraft } from './discard_draft.js';
import { editDraft } from './edit_draft.js';
import { enableAutomationTool } from './enable_automation.js';
import { getActionLogTool } from './get_action_log.js';
import { getAutomationEventsTool } from './get_automation_events.js';
import { getDataset } from './get_dataset.js';
import { getObject } from './get_object.js';
import { getWorkspace } from './get_workspace.js';
import { listDatasets } from './list_datasets.js';
import { previewDataset } from './preview_dataset.js';
import { previewPipelineTool } from './preview_pipeline.js';
import { profileColumns } from './profile_columns.js';
import { publishDraftTool } from './publish_draft.js';
import { queryObjects } from './query_objects.js';
import { runActionTool } from './run_action.js';
import { searchOntologyTool } from './search_ontology.js';
import { testActionTool } from './test_action.js';
import { testLogicTool } from './test_logic.js';
import type { AnyToolDef } from './types.js';
import { validateDraft } from './validate_draft.js';

// Part A agent tools (owner: Alexandre, 09 §5). One file per tool in this folder, listed here.
export const alexandreTools: AnyToolDef[] = [
  listDatasets,
  getDataset,
  previewDataset,
  profileColumns,
  previewPipelineTool,
  testLogicTool,
  testActionTool,
  runActionTool,
  queryObjects,
  aggregateObjects,
  getObject,
  getActionLogTool,
  getWorkspace,
  searchOntologyTool,
  editDraft,
  validateDraft,
  diffDraft,
  discardDraft,
  publishDraftTool,
  enableAutomationTool,
  disableAutomationTool,
  getAutomationEventsTool,
];
