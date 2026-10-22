import { aggregateObjects } from './aggregate_objects.js';
import { getObject } from './get_object.js';
import { queryObjects } from './query_objects.js';
import type { AnyToolDef } from './types.js';

// Part A agent tools (owner: Alexandre, 09 §5). One file per tool in this folder, listed here.
export const alexandreTools: AnyToolDef[] = [queryObjects, aggregateObjects, getObject];
