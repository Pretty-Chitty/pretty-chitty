import { readFileSync } from "fs";
import { defineConfig } from "rollup";
import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import typescript from "@rollup/plugin-typescript";
import url from "@rollup/plugin-url";
import svgr from "@svgr/rollup";
import external from "rollup-plugin-peer-deps-external";
import postcss from "rollup-plugin-postcss";
import dts from "rollup-plugin-dts";
import terser from "@rollup/plugin-terser";
import typescriptEngine from "typescript";

const packageJson = JSON.parse(readFileSync("./package.json"));

export default defineConfig([
  {
    input: "./src/library/index.ts",
    output: [
      {
        file: packageJson.main,
        format: "cjs",
        sourcemap: false,
        exports: "named",
        name: packageJson.name,
      },
      {
        file: packageJson.module,
        format: "es",
        exports: "named",
        sourcemap: false,
      },
    ],
    onwarn(warning, warn) {
      if (warning.code === "MODULE_LEVEL_DIRECTIVE") {
        return;
      }
      warn(warning);
    },
    plugins: [
      postcss({
        plugins: [],
        minimize: true,
      }),
      external({ includeDependencies: true }),
      resolve(),
      commonjs(),
      typescript({
        tsconfig: "./tsconfig.json",
        typescript: typescriptEngine,
        sourceMap: true,
        exclude: [
          "**/*inline.png",
          "**/*inline.jpg",
          "**/*.svg",
          "coverage",
          ".storybook",
          "storybook-static",
          "config",
          "dist",
          "node_modules/**",
          "*.cjs",
          "*.mjs",
          "**/__snapshots__/*",
          "**/__tests__",
          "**/*.test.js+(|x)",
          "**/*.test.ts+(|x)",
          "**/*.mdx",
          "**/*.story.ts+(|x)",
          "**/*.story.js+(|x)",
          "**/*.stories.ts+(|x)",
          "**/*.stories.js+(|x)",
          "setupTests.ts",
          "vitest.config.ts",
        ],
      }),
      url({
        include: ["**/*inline.png", "**/*inline.jpg", "**/*.svg"],
        limit: 0, // Always inline
      }),
      svgr(),
      terser(),
    ],
  },
  {
    input: "src/library/index.ts",
    output: [{ file: "dist/index.d.ts", format: "esm" }],
    external: [/\.(sc|sa|c)ss$/],
    plugins: [dts()],
  },
]);
