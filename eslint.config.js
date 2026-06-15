"use strict";

module.exports = [
  {
    ignores: ["dist/**", "node_modules/**"]
  },
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "commonjs",
      globals: {
        __dirname: "readonly",
        BdApi: "readonly",
        clearInterval: "readonly",
        clearTimeout: "readonly",
        console: "readonly",
        document: "readonly",
        globalThis: "readonly",
        module: "readonly",
        MutationObserver: "readonly",
        process: "readonly",
        require: "readonly",
        setInterval: "readonly",
        setTimeout: "readonly"
      }
    },
    rules: {
      "curly": ["error", "all"],
      "eqeqeq": ["error", "always"],
      "no-console": ["error", { "allow": ["warn", "error"] }],
      "no-constant-condition": "error",
      "no-unused-vars": ["error", { "argsIgnorePattern": "^_" }],
      "prefer-const": "error",
      "quotes": ["error", "double", { "avoidEscape": true }],
      "semi": ["error", "always"]
    }
  }
];
