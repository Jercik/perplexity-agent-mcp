import path from "node:path";
import { axpoint } from "eslint-config-axpoint";

const gitignorePath = path.join(import.meta.dirname, ".gitignore");

export default [
  ...axpoint({ gitignorePath }),
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          args: "all",
          argsIgnorePattern: "^_",
          caughtErrors: "all",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
    },
  },
];
