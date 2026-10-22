import { getDataset } from './get_dataset.js';
import { listDatasets } from './list_datasets.js';
import { previewDataset } from './preview_dataset.js';
import { profileColumns } from './profile_columns.js';
import type { AnyToolDef } from './types.js';

// Part A agent tools (owner: Alexandre, 09 §5). One file per tool in this folder, listed here.
export const alexandreTools: AnyToolDef[] = [listDatasets, getDataset, previewDataset, profileColumns];
