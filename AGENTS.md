# Rule: Read the Startup Files First

Before taking any action, read @README.md.

# Rule: Execute Commands from Arrays, Not Strings

## Store commands in arrays, not strings

When Bash expands a string variable, quotes inside become literal characters and whitespace triggers word splitting:

```bash
# BAD
CMD="echo \"hello world\""
$CMD  # outputs: "hello world" (with literal quotes)

# GOOD: array preserves argument boundaries
CMD=(echo "hello world")
"${CMD[@]}"  # outputs: hello world
```

## Never interpolate variables into shell strings

Variables interpolated into shell strings — `sh -c`, `bash -c`, `eval`, `ssh host` — are reparsed by the shell. Characters like `$(...)`, backticks, or `;` in the value execute as code — an injection vector:

```bash
# BAD: if VAR contains $(malicious), it executes
sh -c "$VAR --write"

# GOOD: direct execution, no shell interpretation
"${CMD[@]}" --write

# GOOD: with xargs, execute the array directly
find . -name '*.js' -print0 | xargs -0 "${CMD[@]}" --write --
```

When you need shell features (pipes, redirects), use the `exec "$@"` pattern to pass arguments as positional parameters instead of interpolating them:

```bash
# GOOD: arguments passed as $@, not interpolated into the string; the redirect is why sh -c is needed
find . -name '*.js' -print0 | xargs -0 sh -c 'exec "$@" >> format.log 2>&1' _ "${CMD[@]}" --write --
```

The `_` occupies `$0` (the script name), leaving `$@` for the command and arguments.

# Rule: Avoid Leaky Abstractions

Design interfaces around what callers need, not how the system works internally. An abstraction is leaky when using it correctly requires knowledge of underlying storage, infrastructure, or error behavior — a connection string in a method signature, a transaction handle in a return type, an error that only makes sense one layer down, or two similar-looking methods where one reads memory and the other crosses the network. Keep signatures consistent, return domain types instead of backend artifacts, and inject infrastructure dependencies through constructors rather than method parameters.

```ts
// Leaky: exposes database concerns, inconsistent signatures
interface ReservationRepository {
  create(restaurantId: number, reservation: Reservation): number; // returns DB ID
  findById(id: string): Reservation | null; // why no restaurantId?
  update(reservation: Reservation): void;
  connect(connectionString: string): void;
}
```

```ts
// Better: consistent interface, infrastructure hidden, injected via constructor
interface ReservationRepository {
  create(restaurantId: number, draft: NewReservation): Promise<Reservation>;
  findById(restaurantId: number, id: string): Promise<Reservation | null>;
  update(restaurantId: number, reservation: Reservation): Promise<void>;
}
```

# Rule: Build for Requirements That Exist Today

Implement what the current requirement needs, nothing more. Speculative surface must be maintained, tested, and reasoned about until someone deletes it — and because the code that carries it references it, no unused-code tool will ever flag it; only authoring discipline stops it.

- No defensive handling for states the types already exclude: the null-check on a non-nullable value, the `catch` around code that cannot throw. Exhaustiveness guards (`assertNever`, `satisfies never`) are the opposite shape — they make an impossible state fail loudly instead of flowing on — and they stay.
- No parameter or option no caller passes — including one a default keeps compiling, like a `{ retries = 3 }` read in the body that every call site leaves at 3. A published CLI or library's callers are external: its documented public interface is a current requirement, never speculative surface.
- No abstraction justified only by a hypothetical second use: an interface with one implementation that hides nothing, a registry with one entry, indirection added "for flexibility". Extracting a single-use pure function into the functional core is not this — the extraction pays now, in testability, and the functional-core and file-naming rules ask for it.
- No generality justified only by a future requirement — when the requirement arrives, designing for the real case beats having guessed. The one inversion is a format that locks at its first real reader (a wire format, a stored blob, a published API shape): a locked, versionless format is the one guess that cannot be cheaply corrected, so design its evolution path — a `version` field — up front.

# Rule: Comments Explain Why, Not What

Default to writing no comments. Add one only to capture what the code cannot show — a hidden constraint, a subtle invariant, why a decision was made, which alternatives were rejected, what external factor forced a workaround — the context that stops the next person from "cleaning up" something load-bearing.

Never explain what the code does. Names convey purpose, types convey shape, the code itself conveys behavior. Never reference the current task, fix, or callers ("used by X", "added for the Y flow", "handles the case from issue #123") — those belong in the PR description and rot as the codebase evolves.

Keep the comments you write — docstrings included — to one short line; an example snippet already living in a docstring is documentation to keep type-checking, not a comment to trim.

```ts
// BAD: references caller context that will rot
// Used by the checkout flow after the Stripe webhook fires
function markOrderPaid(orderId: string): void {
  /* ... */
}

// GOOD: records a non-obvious external constraint
// Stripe caps statement descriptors at 22 chars
const statementDescriptor = raw.slice(0, 22);
```

# Rule: Prefer Deep Modules

A module earns its place by what it hides behind an interface smaller than the implementation it covers: a decision, a side effect, a detail callers no longer carry. Judge every extraction and every layer by that ratio of interface to implementation. The deletion test settles close calls: if removing the module would scatter the same knowledge across its callers, it is earning its keep; if the complexity would simply vanish, it is a pass-through.

- Never split a function or file because it is long; split for what the split hides or separates — a decision the caller need not know, a side effect kept out of the functional core.
- If understanding a caller requires repeatedly reading a callee's body, that boundary hides nothing: inline it or redesign the interface.
- A wrapper that only forwards calls adds surface without hiding anything; use the wrapped thing directly. An interface that hides infrastructure behind domain-shaped methods is the opposite case — that is depth.
- In production code, one general operation serving all current callers beats several near-duplicate special-case ones.

# Rule: Design Contracts Twice

The shape that ships first is usually just the first one that worked, and some shapes are expensive to revisit once anything depends on them: a CLI surface, a stored or wire format, JSON output that automation parses, a package's public API. Before committing to such a contract, sketch a second, meaningfully different shape and compare the two on what each asks of callers: what they must know to use it correctly, and what they can get wrong silently. Prefer the shape that keeps required knowledge small while misuse stays loud — still failing a compile, a parse, or a run. Record the winner and the loser in a sentence or two where rejected alternatives already belong — the pull request description, or a one-line comment when the code alone would not explain the choice.

Skip the sketch when the shape is dictated rather than chosen — a schema mirroring a format some other producer defines, or a surface an existing convention already fixes.

# Rule: File Naming Matches Contents

Name files for what the module does: kebab-case, verb-noun or domain-role names, matching the primary export — `calculateUsageRate` goes in `calculate-usage-rate.ts`.

## Checklist

- One responsibility per file; if the name needs two verbs, split it.
- Align with functional core/imperative shell conventions:
  - Functional core: `calculate-…`, `validate-…`, `parse-…`, `format-…`, `aggregate-…`
  - Imperative shell: `…-route.ts`, `…-handler.ts`, `…-job.ts`, `…-cli.ts`, `…-script.ts`
- Prefer specific domain nouns; avoid generic bucket file names like `utils`, `helpers`, `core`, `data`, `math`.
- Use role suffixes (`-service`, `-repository`) only when they clarify architecture.

Example: A file named `usage.core.ts` containing both fetching and aggregation logic should be split into `fetch-service-usage.ts` and `aggregate-usage.ts`.

# Rule: Separate the Functional Core from the Imperative Shell

Separate business logic from side effects by organizing code into a functional core and an imperative shell. The functional core contains pure functions that operate only on provided data, free of I/O, database calls, or state mutations. The imperative shell handles all side effects and orchestrates the core.

The payoff: the shell can change — a different database, queue, or framework — without touching business rules, and core functions work in any context. When unsure where a function belongs, ask what its test would need: a mock, a database, or a clock means shell; plain values mean core.

**Functional core:** filtering, mapping, calculations, validation, parsing, formatting, business rule evaluation.

**Imperative shell:** HTTP handlers, database queries, file I/O, API calls, message queue operations, CLI entry points.

```ts
// BAD: Logic and side effects mixed
function sendUserExpiryEmail(): void {
  for (const user of db.getUsers()) {
    if (user.subscriptionEndDate > new Date()) continue;
    if (user.isFreeTrial) continue;
    email.send(user.email, `Your account has expired, ${user.name}.`);
  }
}

// GOOD: Functional core (pure, testable)
function getExpiredUsers(users: User[], cutoff: Date): User[] {
  return users.filter((user) => user.subscriptionEndDate <= cutoff && !user.isFreeTrial);
}

function generateExpiryEmails(users: User[]): Array<[string, string]> {
  return users.map((user) => [user.email, `Your account has expired, ${user.name}.`]);
}

// Imperative shell (orchestrates side effects)
email.bulkSend(generateExpiryEmails(getExpiredUsers(db.getUsers(), new Date())));
```

Test the functional core, not the shell. Core tests are fast, deterministic, and need no mocks; the shell becomes thin orchestration where bugs are easy to spot through review. If shell tests are requested, prefer integration tests over unit tests with mocks.

# Rule: No Logic in Tests

Write test assertions as concrete input/output examples, not computed values — unlike production code that handles varied inputs, tests verify specific cases. Avoid operators, string concatenation, loops, and conditionals in test bodies — these obscure bugs.

```ts
const baseUrl = "http://example.com/";

// BAD: computed expectation hides bugs when test and production share the same error
expect(getPhotosUrl()).toBe(baseUrl + "/photos"); // passes despite double-slash bug

// GOOD: literal expected value catches the bug immediately
expect(getPhotosUrl()).toBe("http://example.com/photos"); // fails, reveals the issue
```

Use test utilities for setup and data preparation — fixtures, builders, factories, mock configuration — but never for computing expected values.

# Rule: Parse, Don't Validate

When checking input data, return a refined type that preserves the knowledge gained — don't just validate and discard. Validation functions that return `void` or a bare `boolean` force callers to re-check conditions or handle "impossible" cases the compiler could rule out — and a check whose result nothing consumes is easy to forget entirely.

Zod embodies this principle: every schema is a parser from `unknown` input to a typed output. Use it at system boundaries to convert external input — JSON, environment variables, API responses — into domain types early.

```ts
import * as z from "zod";

// Schema defines both validation rules AND the resulting type
const User = z.object({
  id: z.string(),
  email: z.email(),
  roles: z.array(z.string()).min(1),
});

type User = z.infer<typeof User>;

// Parse at the boundary — downstream code receives typed data
function handleRequest(body: unknown): User {
  return User.parse(body); // throws ZodError if invalid
}
```

- **Strengthen argument types.** Instead of accepting `T | undefined`, require callers to provide already-parsed data.
- **Let schemas encode constraints.** If a function needs a non-empty array, positive number, or valid email, define a schema that guarantees it.

# Rule: Test What Matters

Write tests where failure is expensive and the test can stay stable: business rules, public contracts, data transformations, bug regressions, and a thin set of end-to-end flows. Write fewer for pass-through forwarding, private helpers already covered through a public caller, call-count and call-order choreography, wholesale snapshots, and any test whose assertions mirror the implementation instead of the promised behavior.

```ts
// BAD: asserts internal choreography, not the promised behavior
it("saves the order via the repository", async () => {
  const repo = { save: vi.fn() };
  await createOrder({ repo }, { sku: "A1", qty: 2 });
  expect(repo.save).toHaveBeenCalledTimes(1);
});

// GOOD: asserts the business rule — what the caller was promised
it("applies the bulk discount at qty 10", () => {
  expect(totalFor([{ sku: "A1", qty: 10 }])).toBe(85);
});
```

A good test survives a behavior-preserving refactor; one that must change with it is pinned to the wrong thing.

# Rule: Pick the Concurrency Mechanism by What Bounds the Work

When parallelizing work, pick the mechanism by what bounds the work — and never hand-roll either arm.

**I/O-bound fan-out** (HTTP calls, DB queries, file reads over a collection): use `p-limit` or `p-map` with an explicit concurrency. Unbounded `Promise.all(items.map(…))` over a large input exhausts sockets and file descriptors or trips rate limits, and the common hand-rolled fix — chunking the input and awaiting `Promise.all` per chunk — convoys on each chunk's slowest member, where a limiter keeps N tasks in flight continuously. Reach for `p-queue` only when you additionally need priorities or rate limiting. A small fixed fan-out known at authoring time — a handful of awaited calls — stays plain `Promise.all`; the limiter is for collections whose size is input-driven or unbounded.

**CPU-bound work** (parsing, hashing, compression, image processing): offload to worker threads through `piscina` instead of a hand-rolled `node:worker_threads` pool. Piscina owns the parts a bespoke pool gets wrong — thread reuse, task queueing, backpressure, and shutdown.

When the data is already a stream, don't add a separate I/O limiter — use the `node:stream` helpers' own concurrency (`readable.map(fn, { concurrency })`, Stability 1 – Experimental). CPU-bound work still goes through `piscina`, invoked from inside the helper.

# Rule: Default to `execFile` for Child Processes

Default to `execFile` from `node:child_process`: the args array passes user input literally, so shell metacharacters cannot inject commands. Reach for a shell (`exec`, or `shell: true`) only for pipes, globs, or env expansion — never with unsanitized input, which the shell executes. Switch to `spawn` for live stdin/stdout/stderr or output that may exceed the 1 MB `maxBuffer` default, where `exec`/`execFile` fail with `ERR_CHILD_PROCESS_STDIO_MAXBUFFER`. The sync variants (`execFileSync`, `execSync`, `spawnSync`) block the event loop; use them only in short-lived CLI/setup scripts.

| Function       | Type  | Default shell?      | Output style                        | Best for                                                      |
| :------------- | :---- | :------------------ | :---------------------------------- | :------------------------------------------------------------ |
| `spawn`        | Async | No (`shell: false`) | Streams                             | Long-running processes, real-time I/O, large output.          |
| `exec`         | Async | Yes                 | Buffered (`maxBuffer` 1 MB default) | Simple commands needing shell features (pipes, globs).        |
| `execFile`     | Async | No                  | Buffered (`maxBuffer` 1 MB default) | Direct binary execution with arg array; safer for user input. |
| `spawnSync`    | Sync  | No                  | Buffers + detailed result object    | Blocking scripts needing status/signal without exceptions.    |
| `execSync`     | Sync  | Yes                 | Buffered                            | Blocking shell commands returning stdout.                     |
| `execFileSync` | Sync  | No                  | Buffered                            | Blocking direct binary execution.                             |

Error reporting differs by function: the async `exec`/`execFile` callbacks receive an `error` on non-zero exit, and `execSync`/`execFileSync` throw one. `spawn` emits `'error'` when the process fails to start; a non-zero exit fires no `'error'` event — the code arrives via `'close'`/`'exit'`. `spawnSync` never throws on a failed command: read `status`, `signal`, `stdout`, and `stderr` from its result, where `error` is never set on a non-zero exit — only on a failed spawn, a `timeout`, or a `maxBuffer` overrun.

# Rule: Check Path Containment with `path.relative`, Not `startsWith`

When checking that a file path stays inside an expected directory (path traversal prevention), compare with `path.relative`, not `startsWith`. Windows paths are case-insensitive while string comparison is not — `resolve()` can return `C:\Users\…` for the base and `c:\users\…` for the target, so a `startsWith` check rejects a target that is inside the base. `path.relative()` compares case-insensitively on Windows (`path.win32.relative('C:/Foo', 'c:/foo/bar')` returns `'bar'`).

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
  // sep keeps valid names like "..foo/bar.txt" from being blocked; only ".." and "../…" escape
  if (rel === ".." || rel.startsWith(`..${sep}`)) return false;
  return true;
}
```

`path.relative(from, to)` computes the relative path from `from` to `to`:

| Scenario        | `relative(base, target)` | Meaning        |
| --------------- | ------------------------ | -------------- |
| Same path       | `""`                     | Equal paths    |
| Inside base     | `"subdir/file.txt"`      | Valid child    |
| Parent of base  | `"../file.txt"`          | Escapes upward |
| Sibling         | `"../other/file.txt"`    | Escapes upward |
| Different drive | `"D:\\other"` (absolute) | Different root |

`resolve()` and `relative()` operate lexically and do not follow symlinks. If an attacker could plant symlinks inside the base directory, resolve symlinks first with `fs.realpath()` or `fs.realpathSync()`.

# Rule: Explicit Env Vars, Not NODE_ENV Branches

Never branch first-party application behavior on `NODE_ENV`. One variable ends up conflating unrelated concerns — logging verbosity, feature toggles, security hardening, caching — so flipping it for one concern silently flips the rest. And its honored values are a fixed set — `development`, `production`, `test` — none of which names a deployment environment, so a fourth (staging, a preview deploy) either trips framework warnings or lands on whichever arm its deployment sets and silently inherits another environment's decisions. Declare a per-concern variable instead (`LOG_LEVEL`, `RATE_LIMIT_ENABLED`, `HTTPS_ONLY`) and parse it at the boundary like any other input.

`NODE_ENV` itself stays: libraries read it and deployments set it — leave that contract to them. Framework-canonical gates in React/Next.js code (dead-code elimination, dev-tools components) are the framework's contract, not an application branch.

# Rule: Import Metadata from package.json

Import `name`, `version`, and `description` from `package.json` rather than duplicating them in code.

Use the `with { type: "json" }` import attribute — `assert { type: "json" }` is a parse-time `SyntaxError`. Always import via a relative path to the nearest `package.json` so each package in a monorepo picks up its own metadata.

```ts
import { Command } from "commander";

import packageJson from "./package.json" with { type: "json" };

const program = new Command()
  .name(packageJson.name)
  .description(packageJson.description)
  .version(packageJson.version);
```

# Rule: Use `package.json` `imports` for Internal Module Paths

Use the `imports` field in `package.json` with `#` prefixes to create stable internal module paths, replacing brittle relative imports like `../../../utils`. These subpath imports are private — external consumers of the package cannot resolve them.

The field accepts exact paths and wildcards:

```json
{
  "imports": {
    "#config": "./src/config.ts",
    "#utils/*": "./src/utils/*.ts"
  }
}
```

Map targets to `.ts` — Node runs the source natively, and `tsc` accepts the targets with no extra flag (`allowImportingTsExtensions` governs `.ts` written in import specifiers, not map targets).

# Rule: Use Native TypeScript Execution

Run `.ts` files directly with `node script.ts` — Node 24+ strips types at runtime. No `tsx`, no `ts-node`, no build step. Default new scripts to `.ts`, not `.mjs`.

# Rule: Use `repoq` for Repository Queries

Use `repoq` for reading repository state instead of piping `git` or the forge CLI through `awk`/`jq`/`grep`. Each command handles edge cases (detached HEAD, unborn branches, missing auth) and, under `--json`, returns validated JSON. It also carries one write verb: `pr create` opens a pull request on the detected forge, taking the body from a file or stdin rather than an argument the shell would expand. Use raw `git` for commit/push/merge, and the repo's forge CLI for the other forge-side mutations (issues, releases, PR edits) — `gh` for GitHub or `fgj` for Forgejo, per the detected provider. Run `npx -y repoq@latest --help` if unsure of the available subcommands; the explicit tag prevents `npx` from reusing a stale cached release.

# Rule: Discriminated Unions, Not Bags of Optionals

Use discriminated unions to model data that can be in one of several distinct shapes. Prefer them over a "bag of optionals" — optional properties allow impossible states that the type system should prevent.

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

Boolean mode flags are the same smell: two or more interdependent booleans model more states than exist. Collapse the interdependent flags — and only those — into one discriminant.

```ts
// BAD - creating and editing cannot both hold, and documentId means nothing outside editing
type EditorState = { isCreating: boolean; isEditing: boolean; documentId?: string };

// GOOD - three valid states, each carrying only its own data
type EditorState =
  | { mode: "closed" }
  | { mode: "creating" }
  | { mode: "editing"; documentId: string };
```

Two shapes look like this smell but are not: booleans recording independent observations of external systems (a tag probed in git, a version probed in a registry) stay separate, because the "impossible" combination there is drift the code must represent to detect it; and fields kept deliberately across states — stale items or a prior error shown while a refresh runs — are concurrent facts, not one mode.

With Zod, use `z.discriminatedUnion()` instead of `z.union()` — it selects the variant by a discriminator lookup instead of trying each in turn.

# Rule: Use Top-Level `import type`

Use `import type` for type-only imports, and prefer top-level `import type` over inline `import { type ... }` — under `verbatimModuleSyntax`, the inline form emits an empty `import {}`, a side-effect import that still executes the module at runtime.

```ts
// BAD - emits an empty side-effect import
import { type User } from "./user";

// GOOD - erased entirely
import type { User } from "./user";
```

# Rule: Named Exports, No Barrel Files

Don't use default exports. Don't use barrel files (`index.ts` that re-exports siblings). Both add indirection that breaks the link between an import and its source: default exports let importers pick arbitrary names, barrels route imports through an intermediary.

Don't `export` symbols from internal modules unless they're consumed outside that module or are part of the package's public API. An `export` claims outside consumers exist — an unused one disguises dead code as API surface and makes the symbol look risky to change or delete when nothing would break.

**Exception:** A single `index.ts` entry point for an npm library's public API is acceptable: this is the package boundary, not an internal convenience barrel.

```ts
// BAD
import calc from "#components";

// GOOD
import { calculateTotal } from "#utils/calculate-total";
```

# Rule: No New Enums

Never write an `enum` — the declaration compiles into a runtime JavaScript object instead of erasing with the other type syntax, so a file that carries one can't run under native type stripping (`node script.ts` refuses it). An `as const` object expresses the same thing in plain JavaScript:

```ts
const Size = {
  xs: "EXTRA_SMALL",
  sm: "SMALL",
  md: "MEDIUM",
} as const;

type SizeKey = keyof typeof Size; // "xs" | "sm" | "md"
type SizeValue = (typeof Size)[SizeKey]; // "EXTRA_SMALL" | "SMALL" | "MEDIUM"
```

Numeric enums are an extra trap: they produce reverse mappings that double the number of keys, so `Object.keys()` on a 4-member numeric enum returns 8 entries.

# Rule: No Tests for Type Guarantees

Don't write tests for what the type system already guarantees.

```ts
// BAD: the return type is literally { status: "inactive" } — this can never fail
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

An indexed read can always miss — `arr[0]` on an empty array, `obj.key` on an absent key — so under `noUncheckedIndexedAccess` it is typed `T | undefined` rather than `T`. Handle the `undefined` instead of assuming the index exists.

```ts
const arr: string[] = ["a", "b"];
const obj: Record<string, string> = { foo: "bar" };

// Both reads are typed `string | undefined`:
const first = arr[0];
const value = obj.key;

// BAD: non-null assertion silences the check instead of handling the miss
first!.toUpperCase();

// GOOD: narrow before use
if (first !== undefined) {
  first.toUpperCase();
}

// GOOD: optional chaining
arr[0]?.toUpperCase();
```

# Rule: Prefer `T | undefined` Over Optional Properties

Prefer `T | undefined` over optional properties (`?`) when callers must always explicitly provide a value. Optional properties allow omission at call sites, which can mask bugs when a property is required but forgotten.

```ts
// BAD: forgetting userId silently compiles
type AuthOptions = { userId?: string };

// GOOD: forces explicit decision at call site
type AuthOptions = { userId: string | undefined };
```

**Exception:** Optional properties are acceptable in React props when paired with a default — the default guarantees a value, so omission at the call site is intentional rather than a forgotten field.

```tsx
type ButtonProps = { variant?: "solid" | "outline" };

// Default supplies the value when callers omit `variant`
function Button({ variant = "solid" }: ButtonProps) {
  return <button data-variant={variant} />;
}
```

Optional props without a default — `userId?: string` on a hook's options — fall under the main rule.

# Rule: Return Result Types Where Callers Must Handle Failure

Throw errors when framework infrastructure handles them (e.g., a backend request handler converting the throw into an HTTP 500). For operations where callers must handle failure explicitly, return a result type instead of using `try`/`catch` at the call site — the caller can't reach `value` without checking `ok`:

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

# Rule: Annotate Return Types on Top-Level Functions

Annotate return types on top-level module functions. Explicit return types document intent and catch incomplete implementations at the definition site.

**Exceptions:**

- React components need no annotation — they may return `ReactNode`, `null`, or async server-rendered results depending on the framework.
- React hooks returning objects should still annotate: `(): { state: string; }`.

# Rule: Test Local Packages with `file:`, Not `pnpm link`

When developing a TypeScript package and testing it in a consuming project before release, install it as a `file:` dependency rather than via `pnpm link`. Ask the user where the package is checked out rather than assuming a path.

`file:` installs the package the way a published tarball would: pnpm applies the same file selection `pnpm pack` would, so only what `package.json` would publish lands in the consumer's virtual store. A subpath export, a CSS file, or an asset left out of `files` fails in the consumer the same way it would fail after release, while `pnpm link` (or a `link:` dependency) symlinks your whole working tree and hides the omission; a missing `dist/` is not one of these cases — it fails identically either way.

The store entries are hardlinks to your source files, not copies — a rebuild that rewrites a file in place already reaches the consumer, and a tool that rewrites files under the consumer's `node_modules` edits the package source. Nothing else propagates: a clean build, an added file, or a deleted one leaves the consumer on stale bytes. Don't reason about which case you are in; rebuild, then run `pnpm install` in the consumer — it re-imports the package and drops the files the build removed.

## Workflow

Initial wire-up:

```bash
cd <package-path> && pnpm build
cd <consumer-path> && pnpm add @scope/package@file:<package-path>
```

After every package source change:

```bash
cd <package-path> && pnpm build
cd <consumer-path> && pnpm install
```

Restart the consumer dev server.

When done, replace the `file:` path with a published range — the range `package.json` carried before the swap, or the newly released version (`pnpm add @scope/package@^1.2.4`). Don't commit a `file:` dependency.

# Rule: Use Explicit `include`/`exclude` in tsconfig Files

Use explicit `include`/`exclude` patterns in environment-specific configs. Exclude test files from production; include them in test configs. A solution-style root `tsconfig.json` (`files: []` plus project references) lists no inputs of its own — the patterns belong in the leaf configs.

```json
// tsconfig.app.json (production)
{ "include": ["src/**/*.ts"], "exclude": ["**/*.test.*", "**/*.spec.*"] }

// tsconfig.test.json
{ "include": ["**/*.test.*", "**/*.spec.*"], "exclude": ["node_modules", "dist"] }
```

## Glob support

TypeScript globs are limited and differ from bash/zsh globs. Only three wildcards exist: `*` (any characters except a path separator), `?` (exactly one character except a path separator), and `**/` (any directory depth). Brace groups (`{a,b}`), extended patterns (`?(x)`, `!(x)`), and character classes (`[jt]`) are not supported — braces and brackets match as literal characters, so `src/**/*.{test,spec}.ts` matches only a file literally named with those braces. The mistake is loud only as the sole `include`, where it raises TS18003; as an `exclude` entry — or beside a pattern that does match — it silently covers nothing. Use `**/*.test.*` instead of `**/*.{test,spec}.?(c|m)[jt]s?(x)`.

## Resolution priority

`exclude` filters only what `include` picks up: a file matching both is excluded. Two things enter the program regardless of `exclude`: an explicit `files` entry, and any file imported by an included file.

# Rule: Default to Zod `.nullish()` for Backend Fields That May Be Absent

Default to `.nullish()` for Zod response-schema fields whose producer you don't fully control — it's the only modifier that accepts both `null` and a missing key: `.nullable()` rejects `undefined`, `.optional()` rejects `null`.

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

A single missing key throws a `ZodError` from `.parse()`, which often runs inside an auth callback or request handler that turns the throw into a logout, redirect, or 500 — symptoms far removed from the schema mismatch.

# Rule: Name Zod Schemas and Their Inferred Types Identically

Use identical names for Zod schemas and their inferred types. Name both with PascalCase. TypeScript allows this because types and values exist in separate namespaces.

```ts
import * as z from "zod";

// GOOD
const User = z.object({
  id: z.string(),
  name: z.string(),
  email: z.email(),
});

type User = z.infer<typeof User>;
```

```ts
// BAD: redundant suffix
const UserSchema = z.object({ name: z.string() });
type User = z.infer<typeof UserSchema>;
```

Export the schema and the type together — one concept, one name.
