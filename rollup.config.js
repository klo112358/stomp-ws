import typescript from "@rollup/plugin-typescript"
import babel from "@rollup/plugin-babel"
import { terser } from "rollup-plugin-terser"

const targets = [
  "last 2 chrome versions",
  "last 2 firefox versions",
  "last 2 safari versions",
]

export default [
  {
    input: "src/server/index.ts",
    output: {
      dir: "dist/server",
      format: "cjs",
      sourcemap: true,
      exports: "default",
    },
    external: ["ws"],
    plugins: [
      typescript({
        outDir: "dist/server",
        noEmit: true,
        exclude: ["test/**"],
      }),
      babel({
        babelHelpers: "bundled",
        extensions: [".js", ".ts"],
        presets: [
          [
            "@babel/preset-env",
            {
              targets: { node: "14" },
              useBuiltIns: false,
            },
          ],
        ],
      }),
    ],
  },
  {
    input: "src/client/index.ts",
    output: {
      dir: "dist/client",
      format: "cjs",
      sourcemap: true,
      exports: "default",
    },
    plugins: [
      typescript({
        outDir: "dist/client",
        noEmit: true,
        exclude: ["test/**"],
      }),
      babel({
        babelHelpers: "bundled",
        extensions: [".js", ".ts"],
        presets: [
          [
            "@babel/preset-env",
            {
              targets: { node: "14" },
              useBuiltIns: false,
            },
          ],
        ],
      }),
    ],
  },
  {
    input: "src/client/index.ts",
    output: {
      file: "umd/stomp-ws.js",
      name: "StompWs",
      format: "umd",
      exports: "default",
      sourcemap: true,
    },
    plugins: [
      typescript({
        outDir: "dist/client",
        noEmit: true,
        exclude: ["test/**"],
      }),
      babel({
        babelHelpers: "bundled",
        extensions: [".js", ".ts"],
        presets: [
          [
            "@babel/preset-env",
            {
              targets,
              useBuiltIns: false,
            },
          ],
        ],
      }),
    ],
  },
  {
    input: "src/client/index.ts",
    output: {
      file: "umd/stomp-ws.min.js",
      name: "StompWs",
      format: "umd",
      exports: "default",
      sourcemap: true,
    },
    plugins: [
      typescript({
        exclude: ["test/**"],
      }),
      babel({
        babelHelpers: "bundled",
        extensions: [".js", ".ts"],
        presets: [
          [
            "@babel/preset-env",
            {
              targets,
              useBuiltIns: false,
            },
          ],
        ],
      }),
      terser(),
    ],
  },
]
