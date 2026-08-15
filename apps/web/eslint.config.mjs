import js from "@eslint/js";

export default [
  {
    ignores: ["src/generated/**", ".next/**", "node_modules/**", "e2e/**", "playwright.config.ts"],
  },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        console: "readonly",
        process: "readonly",
        React: "readonly",
      },
    },
    rules: {
      "no-unused-vars": "off",
      "no-undef": "off",
    },
  },
];
