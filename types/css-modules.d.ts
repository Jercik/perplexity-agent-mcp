// Under tsgo build mode the strict base type-checks CSS side-effect imports
// (`import "./styles.css"`), which fail with TS2882 unless an ambient `*.css`
// module is in scope. This shim supplies them for every solution-root repo —
// Next.js apps, but also Vite/React and Tailwind repos that side-effect-import
// CSS. Next.js also ships its own copies (next/types/global.d.ts) via a generated
// `next-env.d.ts`; the overlap is harmless (`skipLibCheck` is on and both
// declarations are type-compatible) and this shim keeps the gate green even
// before `next typegen` runs.
//
// The typed `*.module.css` must come first: tsgo ranks pattern modules by prefix
// length only, both prefixes are empty, so the first-declared wins the tie. A
// leading bare `*.css` would shadow `*.module.css` and collapse every module-CSS
// import to `any` (verified against tsgo 7.0.2).
declare module "*.module.css" {
  const classes: Readonly<Record<string, string>>;
  export default classes;
}
declare module "*.css";
