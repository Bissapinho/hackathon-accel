import { askUserTool } from './ask_user.js';
import { changeModeTool } from './change_mode.js';
import { setPlanTool } from './set_plan.js';
import type { AnyToolDef } from './types.js';

// The three loop-bound meta tools (owner: Alfred, 09 §5). The loop gives them special handling:
// change_mode updates the session mode, ask_user pauses for an answer, set_plan feeds the plan card.
export const metaTools: AnyToolDef[] = [changeModeTool, askUserTool, setPlanTool];
