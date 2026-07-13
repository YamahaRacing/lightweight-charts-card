import typescript from "@rollup/plugin-typescript";
import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import terser from "@rollup/plugin-terser";

const dev = process.env.ROLLUP_WATCH === "true";

export default {
  input: "src/card.ts",
  output: {
    // Single self-contained file. lightweight-charts + lit are bundled in,
    // so users only ever add ONE resource URL in Home Assistant.
    file: "dist/lightweight-charts-card.js",
    format: "es",
    sourcemap: dev,
    inlineDynamicImports: true,
  },
  plugins: [
    resolve({ browser: true }),
    commonjs(),
    typescript({ tsconfig: "./tsconfig.json", sourceMap: dev, inlineSources: dev }),
    !dev && terser({ format: { comments: false } }),
  ].filter(Boolean),
};
