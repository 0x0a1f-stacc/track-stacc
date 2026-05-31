import js from "@eslint/js";
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
      "import-x/order": [
        "warn",
        { "newlines-between": "always", alphabetize: { order: "asc" } },
      ],
    },
  },
);
