import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import importX from "eslint-plugin-import-x";
import tseslint from "typescript-eslint";

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    plugins: { "import-x": importX },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "no-console": "warn",
      "@typescript-eslint/require-await": "off",
      "import-x/order": [
        "warn",
        { "newlines-between": "always", alphabetize: { order: "asc" } },
      ],
    },
  },
  {
    plugins: {
      "react-hooks": reactHooks,
    },
    rules: reactHooks.configs.recommended.rules,
  },
);
