/**
 * A git hook (the husky pre-commit runs `npm run ci`) exports the variables
 * that locate the repository, such as GIT_DIR and GIT_INDEX_FILE. Inherited by
 * the git commands of a test, they make `git init`, `git config` and
 * `git commit` write into the repository being committed instead of the
 * test's temporary one. Clear them before any test runs.
 */
export const GIT_LOCAL_ENV_VARS = [
  "GIT_ALTERNATE_OBJECT_DIRECTORIES",
  "GIT_CONFIG",
  "GIT_CONFIG_PARAMETERS",
  "GIT_CONFIG_COUNT",
  "GIT_OBJECT_DIRECTORY",
  "GIT_DIR",
  "GIT_WORK_TREE",
  "GIT_IMPLICIT_WORK_TREE",
  "GIT_GRAFT_FILE",
  "GIT_INDEX_FILE",
  "GIT_NO_REPLACE_OBJECTS",
  "GIT_REPLACE_REF_BASE",
  "GIT_PREFIX",
  "GIT_SHALLOW_FILE",
  "GIT_COMMON_DIR",
] as const;

for (const name of GIT_LOCAL_ENV_VARS) delete process.env[name];
