import { compose, node, vitest } from "@j4k/oxlint-config";

const config = {
  ...compose(node, vitest),
  ignorePatterns: [".claude/", ".clawpatch/", ".codex/"],
};

export default config;
