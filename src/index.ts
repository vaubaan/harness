export { VERSION } from "./version.js";

export {
  initCommand,
  planInit,
  writeFilesToTarget,
  type InitArgs,
  type InitResult,
} from "./cli/init.js";

export { updateCommand, planUpdate, type UpdateArgs, type UpdateResult } from "./cli/update.js";
