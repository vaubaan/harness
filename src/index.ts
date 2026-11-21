export { VERSION } from "./version.js";

export {
  initCommand,
  planInit,
  writeFilesToTarget,
  type InitArgs,
  type InitResult,
} from "./cli/init.js";

export { updateCommand, planUpdate, type UpdateArgs, type UpdateResult } from "./cli/update.js";

export { addCommand, type AddArgs, type AddResult } from "./cli/add.js";
export {
  ADDABLE_PILLARS,
  PILLARS,
  PILLAR_IDS,
  activePillars,
  type Pillar,
  type PillarId,
} from "./pillars.js";
