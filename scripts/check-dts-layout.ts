// Managed by j4k-align: https://code.j4k.dev/j4k/align/src/branch/main/templates/repo/check-dts/check-dts-layout.ts
import { existsSync, realpathSync } from "node:fs";
import path from "node:path";

import {
  GuardFailureError,
  isWithinDirectory,
  readJsonRecord,
  repositoryRoot,
} from "./check-dts-core.ts";

function realDirectory(modulesFile: string, directory: string): string {
  try {
    return realpathSync(directory);
  } catch (error) {
    throw new GuardFailureError(
      `${directory}, named by ${modulesFile}, does not exist: ${String(error)}`,
      { cause: error },
    );
  }
}

// TypeScript resolves a dependency's imports by walking up from the file's real
// path, so a node_modules directory above the global virtual store hides every
// missing declaration.
function assertNoMaskingAncestor(virtualStoreDirectory: string): void {
  let directory = virtualStoreDirectory;
  for (;;) {
    if (existsSync(path.join(directory, "node_modules"))) {
      throw new GuardFailureError(
        `the global virtual store ${virtualStoreDirectory} sits below ${directory}, which has a node_modules directory, so TypeScript resolves undeclared imports of dependency typings through it. Set pnpm_config_store_dir (storeDir) to a path outside every node_modules tree and outside the repository, then reinstall.`,
      );
    }
    const parent = path.dirname(directory);
    if (parent === directory) {
      return;
    }
    directory = parent;
  }
}

// .modules.yaml records no virtual store type, only where the store and the virtual
// store ended up. The guard classifies the install from those locations and stops
// on any it cannot classify (an override under node_modules, a directory elsewhere),
// because it then cannot know whether TypeScript sees undeclared imports.
export function assertSupportedInstallLayout(): void {
  const modulesDirectory = path.join(repositoryRoot, "node_modules");
  const modulesFile = path.join(modulesDirectory, ".modules.yaml");
  if (!existsSync(modulesFile)) {
    throw new GuardFailureError(`${modulesFile} is missing; run pnpm install first`);
  }
  // pnpm 12 writes .modules.yaml as JSON; any other format throws here and the guard exits 2.
  const { nodeLinker, storeDir, virtualStoreDir } = readJsonRecord(modulesFile);
  if (typeof storeDir !== "string" || typeof virtualStoreDir !== "string") {
    throw new GuardFailureError(`${modulesFile} lacks storeDir or virtualStoreDir`);
  }
  if (nodeLinker !== "isolated") {
    throw new GuardFailureError(
      `${modulesFile} records nodeLinker ${JSON.stringify(nodeLinker)}; the guard understands only the isolated linker`,
    );
  }
  const virtualStore = realDirectory(modulesFile, path.resolve(modulesDirectory, virtualStoreDir));
  if (virtualStore === path.join(realDirectory(modulesFile, modulesDirectory), ".pnpm")) {
    return;
  }
  const store = realDirectory(modulesFile, path.resolve(modulesDirectory, storeDir));
  if (virtualStore !== store && isWithinDirectory(store, virtualStore)) {
    assertNoMaskingAncestor(virtualStore);
    return;
  }
  throw new GuardFailureError(
    `${modulesFile} records virtualStoreDir ${virtualStore}, which is neither node_modules/.pnpm (classic layout) nor below the store ${store} (global virtual store), so the guard cannot tell what TypeScript resolves there. Remove the virtualStoreDir override and reinstall.`,
  );
}
