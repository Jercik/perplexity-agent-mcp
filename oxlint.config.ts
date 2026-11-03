import { compose, node, nodeTest, vitest } from "@j4k/oxlint-config";

const config = {
  ...compose(node, vitest, nodeTest),
  ignorePatterns: [".claude/", ".clawpatch/", ".codex/"],
};

export default config;
