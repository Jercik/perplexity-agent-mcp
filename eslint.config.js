import { defineConfig } from "eslint/config";
import { includeIgnoreFile } from "@eslint/compat";
import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import unicorn from "eslint-plugin-unicorn";
import eslintConfigPrettier from "eslint-config-prettier/flat";
import { join } from "node:path";

const gitignorePath = join(import.meta.dirname, ".gitignore");

export default defineConfig(
  // Respect .gitignore patterns first
  includeIgnoreFile(gitignorePath, "Copy patterns from .gitignore"),

  {
    name: "Additional ignore patterns",
    ignores: [
      "coverage/**",
      "references/catalyst-ui-kit/**",
      "*.config.{js,mjs,mts}",
    ],
  },

  {
    name: "Base JS/TS",
    files: ["**/*.{js,jsx,ts,tsx}"],
    extends: [
      js.configs.recommended,
      tseslint.configs.strictTypeChecked,
      unicorn.configs.recommended,
    ],
    languageOptions: {
      globals: { ...globals.node },
      parserOptions: {
        projectService: true,
      },
    },
    rules: {
      // Security
      "no-eval": "error",
      "no-new-func": "error",
      "no-script-url": "error",

      // Correctness
      "no-return-assign": ["error", "always"],
      radix: ["error", "as-needed"],
      "guard-for-in": "error",
      "prefer-object-has-own": "error",

      // Clarity
      "prefer-regex-literals": ["error", { disallowRedundantWrapping: true }],
      "require-unicode-regexp": "error",
      "no-extend-native": "error",
      "no-new-wrappers": "error",
      "no-implicit-coercion": ["error", { allow: ["!!"] }],

      // TypeScript-specific
      "@typescript-eslint/restrict-template-expressions": [
        "error",
        { allowNumber: true },
      ],
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
  // Keep Prettier last to disable stylistic rules that conflict with Prettier
  eslintConfigPrettier,
);
