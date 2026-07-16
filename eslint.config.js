import js from "@eslint/js";
import globals from "globals";

export default [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      // Mogelijke bugs
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "no-undef": "error",
      "no-console": "off",

      // Code stijl (licht — geen Prettier conflict)
      "eqeqeq": ["error", "always"],
      "curly": ["warn", "multi-line"],
      "no-var": "error",
      "prefer-const": "warn",
    },
  },
  {
    // Test-bestanden mogen Vitest globals gebruiken
    files: ["tests/**/*.test.js"],
    languageOptions: {
      globals: {
        ...globals.node,
        describe: "readonly",
        it: "readonly",
        expect: "readonly",
        beforeEach: "readonly",
        afterEach: "readonly",
        vi: "readonly",
      },
    },
  },
];
