// Managed by j4k-align: https://code.j4k.dev/j4k/align/src/branch/main/templates/repo/check-dts/check-dts.ts
import { constants } from "node:os";

import { stopRunningTypeScript } from "./check-dts-process.ts";
import { main } from "./check-dts-run.ts";
import { removePendingOverlays } from "./check-dts-tsc.ts";

// An interrupted run would leave its overlay configs next to the real ones.
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    stopRunningTypeScript(signal);
    removePendingOverlays();
    process.exit(128 + constants.signals[signal]);
  });
}

void main();
