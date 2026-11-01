import { defineConfig } from "vitest/config";

// Match the webpack/babel build: legacy decorators + loose (assignment) class fields.
// Without this, @ChildOutlet's defineProperty collides with esbuild's define-semantics fields.
export default defineConfig({
  assetsInclude: ["**/*.glb", "**/*.png", "**/*.jpg", "**/*.svg", "**/*.mp3"],
  esbuild: {
    tsconfigRaw: {
      compilerOptions: {
        experimentalDecorators: true,
        useDefineForClassFields: false,
      },
    },
  },
  test: {
    environment: "node",
  },
});
