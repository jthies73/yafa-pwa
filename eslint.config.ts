import js from "@eslint/js";
import pluginVue from "eslint-plugin-vue";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  { ignores: ["dist/**", "node_modules/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...pluginVue.configs["flat/recommended"],
  {
    files: ["**/*.vue"],
    languageOptions: {
      parserOptions: { parser: tseslint.parser },
    },
  },
  {
    rules: {
      // Single-word component names (Dashboard, App, etc.) are fine in this project
      "vue/multi-word-component-names": "off",
      // Existing codebase uses `any` in several places; treat as warning not error
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
  // Must be last — disables ESLint formatting rules that conflict with Prettier
  prettier,
);
