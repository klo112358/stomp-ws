import typescript from "@rollup/plugin-typescript"
import babel from "@rollup/plugin-babel"
import { terser } from "rollup-plugin-terser"

export default [
  {
    input: "src/server/index.ts",
    output: {
      dir: "dist/server",
      format: "cjs",
      sourcemap: true,
      exports: "default",
    },
    plugins: [
      typescript({
        outDir: "dist/server",
        noEmit: true,
      }),
      babel({
        babelHelpers: "bundled",
        extensions: [".js", ".ts"],
        presets: [
          [
            "@babel/preset-env",
            {
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
      typescript(),
      babel({
        babelHelpers: "bundled",
        extensions: [".js", ".ts"],
        presets: [
          [
            "@babel/preset-env",
            {
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
      typescript(),
      babel({
        babelHelpers: "bundled",
        extensions: [".js", ".ts"],
        presets: [
          [
            "@babel/preset-env",
            {
              useBuiltIns: false,
            },
          ],
        ],
      }),
      terser(),
    ],
  },
]
