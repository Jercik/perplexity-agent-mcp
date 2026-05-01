# Rule: Mandatory Startup Reads

Before taking any action, read @README.md for project overview and context. If it does not exist, skip silently and continue.

# Rule: `askpplx` CLI Usage

Use `askpplx` for real-time web search via Perplexity. Verify external facts—documentation, API behavior, library versions, best practices—before acting on them. A lookup costs far less than debugging hallucinated code. Run `npx -y askpplx --help` if unsure of the available options.

# Rule: Avoid Leaky Abstractions

Design interfaces around what callers need, not how the system works internally. An abstraction is leaky when using it correctly requires knowledge of underlying storage, infrastructure, or error behavior. Keep signatures consistent, return domain types instead of backend artifacts, and inject infrastructure dependencies through constructors rather than method parameters.

## Warning signs

- Inconsistent method signatures that reflect backend differences
- Infrastructure details (connection strings, transaction handles) exposed in the interface
- Large performance differences between similar operations
- Errors that force callers to understand underlying layers

## Example

```ts
// Leaky: exposes database concerns, inconsistent signatures
interface ReservationRepository {
  create(restaurantId: number, reservation: Reservation): number; // returns DB ID
  findById(id: string): Reservation | null; // why no restaurantId?
  update(reservation: Reservation): void;
  connect(connectionString: string): void;
}

// Better: consistent interface, infrastructure hidden, injected via constructor
interface ReservationRepository {
  create(restaurantId: number, draft: NewReservation): Promise<Reservation>;
  findById(restaurantId: number, id: string): Promise<Reservation | null>;
  update(restaurantId: number, reservation: Reservation): Promise<void>;
}
```

# Rule: Comments Explain Why, Not What

Default to writing no comments. Only add one when the WHY is non-obvious — a hidden constraint, a subtle invariant, a workaround for a specific bug, behavior that would surprise a reader. If removing the comment wouldn't confuse a future reader, don't write it.

When a comment is warranted, capture intent, constraints, and reasoning the code cannot show: why a decision was made, which alternatives were rejected, what external factor forced a workaround. That's what future readers cannot recover from the code alone, and it stops the next person from "cleaning up" something load-bearing.

Never explain WHAT the code does. Names convey purpose, types convey shape, the code itself conveys behavior. Never reference the current task, fix, or callers ("used by X", "added for the Y flow", "handles the case from issue #123") — those belong in the PR description and rot as the codebase evolves. Don't add comments, docstrings, or type annotations to code you didn't change.

Keep comments to one short line. Never write multi-paragraph docstrings or multi-line comment blocks.

```ts
// BAD: restates what the code says
// Increment counter by 1
counter += 1;

// BAD: references caller context that will rot
// Used by the checkout flow after the Stripe webhook fires
function markOrderPaid(orderId: string) {
  /* ... */
}

// GOOD: records a non-obvious external constraint
// Stripe rejects descriptions over 500 chars; truncate defensively
const description = raw.slice(0, 500);
```

# Rule: Early Returns

Handle edge cases and invalid states at the top of a function with guard clauses that return early. Invert conditions and exit immediately—null checks, permission checks, validation, empty collections. Main logic stays at the top level with minimal indentation.

# Rule: File Naming Matches Contents

Name files for what the module actually does. Use kebab-case and prefer verb-noun or domain-role names. Match the primary export; if you cannot name it crisply, split the file.

## Checklist

- Match the main export: `calculateUsageRate` goes in `calculate-usage-rate.ts`.
- One responsibility per file; if you need two verbs, split it.
- Align with functional core/imperative shell conventions:
  - Functional core: `calculate-…`, `validate-…`, `parse-…`, `format-…`, `aggregate-…`
  - Imperative shell: `…-route.ts`, `…-handler.ts`, `…-job.ts`, `…-cli.ts`, `…-script.ts`
- Prefer specific domain nouns; avoid generic buckets like `utils`, `helpers`, `core`, `data`, `math`.
- Use role suffixes (`-service`, `-repository`) only when they clarify architecture.

Example: A file named `usage.core.ts` containing both fetching and aggregation logic should be split into `fetch-service-usage.ts` and `aggregate-usage.ts`.

# Rule: Functional Core, Imperative Shell

Separate business logic from side effects by organizing code into a functional core and an imperative shell. The functional core contains pure functions that operate only on provided data, free of I/O, database calls, or state mutations. The imperative shell handles all side effects and orchestrates the core to perform work.

This separation improves testability (core logic tests need no mocks), maintainability (shell can change without touching business rules), and reusability (core functions work in any context).

**Functional core:** filtering, mapping, calculations, validation, parsing, formatting, business rule evaluation.

**Imperative shell:** HTTP handlers, database queries, file I/O, API calls, message queue operations, CLI entry points.

```ts
// Bad: Logic and side effects mixed
function sendUserExpiryEmail(): void {
  for (const user of db.getUsers()) {
    if (user.subscriptionEndDate > new Date()) continue;
    if (user.isFreeTrial) continue;
    email.send(user.email, `Your account has expired ${user.name}.`);
  }
}

// Good: Functional core (pure, testable)
function getExpiredUsers(users: User[], cutoff: Date): User[] {
  return users.filter((user) => user.subscriptionEndDate <= cutoff && !user.isFreeTrial);
}

function generateExpiryEmails(users: User[]): Array<[string, string]> {
  return users.map((user) => [user.email, `Your account has expired ${user.name}.`]);
}

// Imperative shell (orchestrates side effects)
email.bulkSend(generateExpiryEmails(getExpiredUsers(db.getUsers(), new Date())));
```

Test the functional core, not the shell. Core tests are fast, deterministic, and need no mocks; the shell becomes thin orchestration where bugs are easy to spot through review. If shell tests are explicitly requested, prefer integration tests over unit tests with mocks.

# Rule: Inline Obvious Code

Keep simple, self-explanatory code inline rather than extracting it into functions. Every abstraction carries cognitive cost—readers must jump to another location, parse a signature, and track context. For obvious logic, this overhead exceeds any benefit.

Extracting code into a function is not inherently virtuous. A function should exist because it encapsulates meaningful complexity, not because code appears twice.

```ts
// GOOD: Inline obvious logic
if (removedFrom.length === 0) {
  return { ok: true, message: "No credentials found" };
}
return { ok: true, message: `Removed from ${removedFrom.join(" and ")}` };

// BAD: Extraction hides obvious logic behind indirection
return formatRemovalResult(removedFrom);
```

## When to extract

Extract when duplication causes real maintenance risk, not merely because code appears twice:

- A name clarifies complex intent
- Multiple call sites must stay in lockstep and silent divergence would be a bug
- The function encapsulates a coherent standalone concept
- Testing it in isolation provides value

Don't extract for hypothetical reuse:

- For a single caller
- Because "we might need this elsewhere"
- When the name describes implementation rather than purpose

## The wrong abstraction

Abstractions decay when requirements diverge: programmer A extracts duplication into a shared function, programmer B adds a parameter for different behavior, and this repeats until the "abstraction" is a mess of conditionals. When an abstraction proves wrong, re-introduce duplication and let the code show you what's actually shared. Duplication is far cheaper than the wrong abstraction.

# Rule: No Logic in Tests

Write test assertions as concrete input/output examples, not computed values. Avoid operators, string concatenation, loops, and conditionals in test bodies—these obscure bugs and make tests harder to verify at a glance.

```ts
const baseUrl = "http://example.com/";

// Bad: computed expectation hides bugs when test and production share the same error
expect(getPhotosUrl()).toBe(baseUrl + "/photos"); // passes despite double-slash bug

// Good: literal expected value catches the bug immediately
expect(getPhotosUrl()).toBe("http://example.com/photos"); // fails, reveals the issue
```

Unlike production code that handles varied inputs, tests verify specific cases. State expectations directly rather than computing them. When a test fails, the expected value should be immediately readable without mental evaluation.

Use test utilities for setup and data preparation—fixtures, builders, factories, mock configuration—but never for computing expected values. Keep assertion logic in the test body with literal expectations.

# Rule: Parse, Don't Validate

When checking input data, return a refined type that preserves the knowledge gained—don't just validate and discard. Validation functions that return `void` or throw errors force callers to re-check conditions or handle "impossible" cases. Parsing functions that return more precise types eliminate redundant checks and let the compiler catch inconsistencies.

Zod embodies this principle: every schema is a parser that transforms `unknown` input into a typed output. Use Zod at system boundaries to parse external data into domain types.

```ts
import * as z from "zod";

// Schema defines both validation rules AND the resulting type
const User = z.object({
  id: z.string(),
  email: z.email(),
  roles: z.array(z.string()).min(1),
});

type User = z.infer<typeof User>;

// Parse at the boundary - downstream code receives typed data
function handleRequest(body: unknown): User {
  return User.parse(body); // throws ZodError if invalid
}
```

## Practical guidance

- **Parse at system boundaries.** Convert external input (JSON, environment variables, API responses) to precise domain types early. Use `.parse()` or `.safeParse()`.
- **Strengthen argument types.** Instead of accepting `T | undefined`, require callers to provide already-parsed data.
- **Let schemas encode constraints.** If a function needs a non-empty array, positive number, or valid email, define a schema that encodes that guarantee.
- **Treat `void`-returning checks with suspicion.** A function that validates but returns nothing is easy to forget.
- **Use `.refine()` for custom constraints.** When built-in validators aren't enough, add refinements that preserve type information.

```ts
// Custom constraint with .refine()
const PositiveInt = z
  .number()
  .int()
  .refine((n) => n > 0, "must be positive");
type PositiveInt = z.infer<typeof PositiveInt>;
```

# Rule: Child Process Selection

Choose the appropriate `node:child_process` function based on synchronicity, shell requirements, output size, and error handling.

| Function       | Type  | Default shell?      | Output style                        | Best for                                                           |
| :------------- | :---- | :------------------ | :---------------------------------- | :----------------------------------------------------------------- |
| `spawn`        | Async | No (`shell: false`) | Streams                             | Long-running processes, real-time I/O, large output.               |
| `exec`         | Async | Yes                 | Buffered (`maxBuffer` 1 MB default) | Simple commands needing shell features (pipes, globs).             |
| `execFile`     | Async | No                  | Buffered (`maxBuffer` 1 MB default) | Direct binary execution with arg array; safer for user input.      |
| `spawnSync`    | Sync  | No                  | Buffers + detailed result object    | Blocking scripts needing status/signal without exceptions.         |
| `execSync`     | Sync  | Yes                 | Buffered                            | Blocking shell commands returning stdout; throws on non-zero exit. |
| `execFileSync` | Sync  | No                  | Buffered                            | Blocking direct binary execution; throws on non-zero exit.         |

## Decision checklist

- **Async vs sync:** Prefer async (`spawn`, `exec`, `execFile`) to keep the event loop free. Use sync only in short-lived CLI/setup scripts where blocking is acceptable.
- **Streaming vs buffered:** If you need live stdin/stdout/stderr or expect output near/over `maxBuffer` (1 MB), use `spawn` (or `spawnSync` if you must block). `exec`/`execFile` buffer output and error if the buffer fills.
- **Shell needs:** Use `exec`/`execSync` when you need shell features (pipes, globs, env expansion). Prefer `execFile`/`execFileSync` for direct binaries; set `shell: true` only when required.
- **Security:** Never pass unsanitized user input when a shell is involved (`exec`, `execSync`, or any `{ shell: true }`). Prefer `execFile*` with an args array to avoid injection.
- **Error handling:** `exec*` callbacks get an `error` on non-zero exit; sync `exec*` throw. `spawn` emits `'error'` only if the process fails to start; exit codes arrive via `'close'`/`'exit'`. `spawnSync` returns `{ status, signal, stdout, stderr, error }` without throwing on non-zero exit.

## Shell injection: `exec` vs `execFile`

Passing user input into a shell-mediated call (`exec`, `execSync`, or any `{ shell: true }`) lets metacharacters execute. Prefer `execFile*` with an args array, which passes arguments literally.

```ts
import { exec, execFile } from "node:child_process";

const userInput = "hello; echo pwned";

// UNSAFE: shell interprets `;`, so `echo pwned` runs
exec(`grep ${userInput} data.txt`, (error, stdout) => {
  if (error) return console.error(error);
  console.log(stdout);
});

// Safe: args are passed literally, so `;` is just a search character
execFile("grep", [userInput, "data.txt"], (error, stdout) => {
  if (error) return console.error(error);
  console.log(stdout);
});
```

# Rule: Cross-Platform Path Validation

When validating that a file path stays within an expected directory (path traversal prevention), use `path.relative` instead of `startsWith` checks. This handles Windows case-insensitivity correctly.

## The Problem

On Windows, file paths are **case-insensitive** (`C:\Users` and `c:\users` are the same), but string comparison with `startsWith` is case-sensitive. This causes false negatives:

```ts
// Windows: resolve() might return different cases
const base = "C:\\Users\\alice\\project";
const target = "c:\\users\\alice\\project\\file.txt"; // Same location, different case

// FAILS even though target is within base
target.startsWith(base); // false - case mismatch
```

## Incorrect Implementation

```ts
import { resolve, sep } from "node:path";

function isWithinDirectory(base: string, target: string): boolean {
  const resolvedBase = resolve(base);
  const resolvedTarget = resolve(target);
  // BAD: Case-sensitive comparison fails on Windows
  return resolvedTarget.startsWith(resolvedBase + sep) || resolvedTarget === resolvedBase;
}
```

## Correct Implementation

```ts
import { resolve, relative, isAbsolute, sep } from "node:path";

function isWithinDirectory(base: string, target: string): boolean {
  const resolvedBase = resolve(base);
  const resolvedTarget = resolve(target);
  const rel = relative(resolvedBase, resolvedTarget);
  // Empty string means they're equal
  if (rel === "") return true;
  // Absolute means different drive (Windows)
  if (isAbsolute(rel)) return false;
  // If rel is ".." or starts with ".." + separator, the target escapes the base directory (path traversal).
  // Using sep ensures we don't block valid filenames like "..foo/bar.txt" that do not traverse upward.
  if (rel === ".." || rel.startsWith(`..${sep}`)) return false;
  return true;
}
```

## Why `path.relative` Works

`path.relative(from, to)` computes the relative path from `from` to `to`:

| Scenario        | `relative(base, target)` | Meaning        |
| --------------- | ------------------------ | -------------- |
| Same path       | `""`                     | Equal paths    |
| Inside base     | `"subdir/file.txt"`      | Valid child    |
| Parent of base  | `"../file.txt"`          | Escapes upward |
| Sibling         | `"../other/file.txt"`    | Escapes upward |
| Different drive | `"D:\\other"` (absolute) | Different root |

**Note:** On Windows, `path.relative()` performs case-insensitive comparison (e.g., `path.win32.relative('C:/Foo', 'c:/foo/bar')` returns `'bar'`). This makes it suitable for path containment checks without manual case normalization.

## Caveats

`resolve()` and `relative()` operate lexically and do not follow symlinks. If an attacker could plant symlinks inside the base directory, resolve symlinks first with `fs.realpath()` or `fs.realpathSync()`.

# Rule: Import Metadata from package.json

Import `name`, `version`, and `description` from `package.json` rather than duplicating them in code, so metadata stays in sync.

Use the `with { type: "json" }` import attribute (Node.js 20.10+; the older `assert` keyword is deprecated) and enable `resolveJsonModule` in `tsconfig.json`. Always import via a relative path to the nearest `package.json` so each package in a monorepo picks up its own metadata.

```ts
import packageJson from "./package.json" with { type: "json" };

const program = new Command()
  .name(packageJson.name)
  .description(packageJson.description)
  .version(packageJson.version);
```

# Rule: Package.json Imports

Use the `imports` field in `package.json` with `#` prefixes to create stable internal module paths, replacing brittle relative imports like `../../../utils`. These subpath imports are private—external consumers of the package cannot resolve them.

The field accepts exact paths and wildcards:

```json
{
  "imports": {
    "#config": "./src/config/index.js",
    "#utils/*": "./src/utils/*.js"
  }
}
```

Map targets to `.js` extensions since Node.js expects JavaScript at runtime. When running through a native TypeScript runtime (tsx, Bun, or Node.js with type stripping), map to `.ts` instead and set `allowImportingTsExtensions: true` in `tsconfig.json`.

# Rule: Native TypeScript Execution

Node.js 22.18+ and 24+ run `.ts` files natively without flags or external tools like `tsx` or `ts-node`.

```bash
node script.ts
```

For Node.js 22.6–22.17, use `--experimental-strip-types`. Older versions require a TypeScript runner.

# Rule: Use `repoq` for Repository Queries

Use `repoq` for reading repository state instead of piping `git`/`gh` through `awk`/`jq`/`grep`. Each command handles edge cases (detached HEAD, unborn branches, missing auth) and returns validated JSON. Use raw `git`/`gh` for mutations (commit, push, merge). Run `npx -y repoq --help` if unsure of the available subcommands.

# Rule: Discriminated Unions

Use discriminated unions to model data that can be in one of several distinct shapes. Each variant shares a literal discriminant property (commonly `type`, `kind`, or `status`) that TypeScript uses to narrow the union. Prefer discriminated unions over a "bag of optionals" — optional properties allow impossible states that the type system should prevent.

```ts
// BAD - allows impossible states like { status: "idle", data: someData }
type FetchingState<TData> = {
  status: "idle" | "loading" | "success" | "error";
  data?: TData;
  error?: Error;
};

// GOOD - each state carries only its valid properties
type FetchingState<TData> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; data: TData }
  | { status: "error"; error: Error };
```

With Zod, use `z.discriminatedUnion()` instead of `z.union()` — it uses the discriminator key for O(1) parsing instead of trying each variant in order.

# Rule: Enums Alternatives

Do not introduce new enums into the codebase. Retain existing enums.

For enum-like behavior, use an `as const` object:

```ts
const Size = {
  xs: "EXTRA_SMALL",
  sm: "SMALL",
  md: "MEDIUM",
} as const;

type SizeKey = keyof typeof Size; // "xs" | "sm" | "md"
type SizeValue = (typeof Size)[SizeKey]; // "EXTRA_SMALL" | "SMALL" | "MEDIUM"
```

Numeric enums are especially problematic—they produce reverse mappings that double the number of keys, so `Object.keys()` on a 4-member numeric enum returns 8 entries. String enums do not have this behavior.

# Rule: Error Result Types

Throw errors when framework infrastructure handles them (e.g., a backend request handler converting the throw into an HTTP 500). For operations where callers must handle failure explicitly, return a result type instead of using `try`/`catch` at the call site:

```ts
type Result<T, E extends Error> = { ok: true; value: T } | { ok: false; error: E };

const parseJson = (input: string): Result<unknown, Error> => {
  try {
    return { ok: true, value: JSON.parse(input) };
  } catch (error) {
    return { ok: false, error: error as Error };
  }
};

const result = parseJson('{"name": "John"}');
if (result.ok) {
  console.log(result.value);
} else {
  console.error(result.error);
}
```

Result types make error handling explicit at call sites and let the compiler enforce that failures are addressed.

# Rule: Import Type

Use `import type` for type-only imports. Prefer top-level `import type` over inline `import { type ... }`.

```ts
// BAD - may leave behind an empty import after transpilation
import { type User } from "./user";

// GOOD - entirely erased at compile time
import type { User } from "./user";
```

Inline type qualifiers can leave empty `import {}` statements in the emitted JavaScript, causing unnecessary side-effect imports. Top-level `import type` guarantees complete erasure.

# Rule: Local pnpm Package Development

When developing a TypeScript package and testing it in a consuming project before release, install it as a `file:` dependency rather than via `pnpm link`.

`file:` makes pnpm copy the package into the consumer's virtual store, which catches missing build output, broken `exports`, unresolved internal aliases (`#/...`), and missing CSS or assets that a live symlink would hide. `file:` dependencies are not live links — every package change requires rebuild + reinstall.

## Workflow

Initial wire-up:

```bash
cd <package-path> && pnpm build
cd <consumer-path> && pnpm add @scope/package@file:<package-path>
# Example: pnpm add @j4k/ui@file:../../j4k-ui
```

After every package source change:

```bash
cd <package-path> && pnpm build
cd <consumer-path> && pnpm install
```

Restart the consumer dev server. If the consumer still shows old behavior, check that `dist/` changed, `pnpm install` ran in the consumer, and the dev server restarted.

After release, replace the local path with the published version: `pnpm add @scope/package@^1.2.4`. Don't commit a `file:` dependency.

# Rule: Module Exports

Don't use default exports. Don't use barrel files (`index.ts` that re-exports siblings). Both add indirection that breaks the link between an import and its source—default exports let importers pick arbitrary names, barrels route imports through an intermediary. This harms refactoring, IDE navigation, and build performance.

Don't `export` symbols from internal modules unless they're consumed outside that module or are part of the package's public API. knip treats unused exports as failures and will block the commit.

**Exception:** A single `index.ts` entry point for an npm library's public API is acceptable—this is the package boundary, not an internal convenience barrel.

```ts
// Avoid
import calc from "#components";

// Prefer
import { calculateTotal } from "#utils/calculate-total";
```

# Rule: No Tests for Type Guarantees

Don't write tests for what the type system already guarantees. If TypeScript enforces a constraint at compile time, a runtime test for that same constraint adds maintenance cost without catching new bugs.

```ts
// BAD: return type is literally { status: "inactive" }, this can never fail
it("should return inactive status", () => {
  const result = deactivate({ id: "u-123", status: "active" });
  expect(result.status).toBe("inactive");
});

// GOOD: the type says `id: string`, but not WHICH id — returning the wrong one compiles
it("preserves the user id", () => {
  const result = deactivate({ id: "u-123", status: "active" });
  expect(result.id).toBe("u-123");
});
```

If removing a test and introducing a bug would cause a compile error, the test is redundant. If the bug would compile cleanly and only surface at runtime, the test has value.

# Rule: No Unchecked Indexed Access

When `noUncheckedIndexedAccess` is enabled in `tsconfig.json`, indexing into arrays and objects returns `T | undefined` rather than `T`. Handle the potential `undefined` value instead of assuming the index exists.

```ts
const arr: string[] = ["a", "b"];
const obj: Record<string, string> = { foo: "bar" };

// Both reads are typed `string | undefined`:
const first = arr[0];
const value = obj.key;

// BAD: assumes the index exists
first.toUpperCase(); // Error: 'first' is possibly 'undefined'

// GOOD: narrow before use
if (first !== undefined) {
  first.toUpperCase();
}

// GOOD: optional chaining
arr[0]?.toUpperCase();
```

# Rule: Optional Properties

Prefer `T | undefined` over optional properties (`?`) when callers must always explicitly provide a value. Optional properties allow omission at call sites, which can mask bugs when a property is required but forgotten.

```ts
// BAD: forgetting userId silently compiles
type AuthOptions = { userId?: string };

// GOOD: forces explicit decision at call site
type AuthOptions = { userId: string | undefined };
```

**Exception:** Optional properties are acceptable in React props when paired with a default parameter — the default guarantees a value, so omission at the call site is intentional rather than a forgotten field.

```tsx
type ButtonProps = { variant?: "solid" | "outline" };

// Default supplies the value when callers omit `variant`
function Button({ variant = "solid" }: ButtonProps) {
  return <button data-variant={variant} />;
}
```

The carve-out applies only to props with a default. Optional props without one — `userId?: string` on a hook's options — fall under the main rule.

# Rule: Return Types

Annotate return types on top-level module functions. Explicit return types document intent and catch incomplete implementations at the definition site.

```ts
const myFunc = (): string => {
  return "hello";
};
```

**Exceptions:**

- React components usually need no annotation. Let TypeScript infer the return type; components may return `ReactNode`, `null`, or async server-rendered results depending on the framework.
- React hooks returning objects should still annotate: `(): { state: string; }`.

# Rule: TypeScript Config File Patterns

Use explicit `include`/`exclude` patterns in environment-specific configs. Exclude test files from production; include them in test configs.

```json
// tsconfig.json (production)
{ "include": ["src/**/*.ts"], "exclude": ["**/*.test.*", "**/*.spec.*"] }

// tsconfig.test.json
{ "include": ["**/*.test.*", "**/*.spec.*"], "exclude": ["node_modules", "dist"] }
```

## Glob Support

TypeScript globs are intentionally limited and differ from bash/zsh globs: `*`, `**`, `{a,b}` work; extended patterns (`?(x)`, `!(x)`) do not. Use `**/*.test.*` instead of `**/*.{test,spec}.?(c|m)[jt]s?(x)`.

## Resolution Priority

`files` > `include` > `exclude`. If a file matches both `include` and `exclude`, it is excluded. Exception: imported files bypass `exclude`.

# Rule: Zod `.nullish()` for Backend Fields That May Be Absent

Default to `.nullish()` for Zod response-schema fields whose producer you don't fully control — it's the only modifier that accepts both `null` and a missing key. `.nullable()` rejects `undefined`; `.optional()` rejects `null`; `.nullish()` accepts both.

```ts
import * as z from "zod";

// BAD — fails parse if the API omits `credits` from the response
const Customer = z.object({
  credits: z.array(Credit).nullable(),
});

// GOOD — accepts `[]`, `null`, and missing key
const Customer = z.object({
  credits: z
    .array(Credit)
    .nullish()
    .transform((v) => v ?? []),
});
```

The failure mode is silent and severe: a single missing key throws a `ZodError` from `.parse()`, which often runs inside an auth callback or request handler that turns the throw into a logout, redirect, or 500 — symptoms far removed from the schema mismatch.

# Rule: Zod Schema Naming

Use identical names for Zod schemas and their inferred types. Name both with PascalCase. TypeScript allows this because types and values exist in separate namespaces.

```ts
import * as z from "zod";

// CORRECT
const User = z.object({
  id: z.string(),
  name: z.string(),
  email: z.email(),
});

type User = z.infer<typeof User>;
```

```ts
// AVOID - Redundant suffix
const UserSchema = z.object({ name: z.string() });
type User = z.infer<typeof UserSchema>;
```

Export both the schema and type with the same name. This reduces cognitive load (one concept, one name) and creates unmistakable association between schema and type.
