#!/usr/bin/env node

import { main } from "./sync-submodules-git-lib.mjs";
import { error } from "./misc-cli-utils.mjs";

try {
  const code = main();
  process.exit(code ?? 0);
} catch (err) {
  error(err.message);
  process.exit(1);
}
