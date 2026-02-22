# Rule: Mandatory Startup Reads

Before taking any action—answering questions, editing files, or running commands—read these files in order:

- **@README.md** — Project overview and context

If a file does not exist, skip it silently and continue.

# Rule: `askpplx` CLI Usage

**At session start:** Run `npx -y askpplx --help` to confirm the tool works and learn available options.

Use `askpplx` to query Perplexity for real-time web search. Use it to verify external facts before acting—documentation, API behavior, library versions, best practices. A lookup is far cheaper than debugging hallucinated code or explaining why an approach failed. Verification is fast and cheap—prefer looking up information over making assumptions. When in doubt, verify.

# Rule: Avoid Leaky Abstractions

Design abstractions around consumer needs, not implementation details. A leaky abstraction forces callers to understand the underlying system to use it correctly—defeating its purpose. While all non-trivial abstractions leak somewhat (Joel Spolsky's Law of Leaky Abstractions), minimize leakage by ensuring your interface doesn't expose internal constraints, infrastructure artifacts, or inconsistent behavior.

## Warning signs

- **Inconsistent signatures**: Some methods require parameters others don't, revealing backend differences
- **Infrastructure artifacts**: Connection strings, database IDs, or ORM-specific constructs in the API
- **Performance surprises**: Logically equivalent operations with vastly different performance
- **Implementation-dependent error handling**: Callers must catch specific exceptions from underlying layers
- **Required internal knowledge**: Using the abstraction safely requires understanding what's beneath it

## Example

```ts
// Leaky: exposes database concerns, inconsistent signatures
interface ReservationRepository {
  create(restaurantId: number, reservation: Reservation): number; // returns DB ID
  findById(id: string): Reservation | null; // why no restaurantId here?
  update(reservation: Reservation): void;
  connect(connectionString: string): void;
  disconnect(): void;
}

// Better: consistent interface, infrastructure hidden
interface ReservationRepository {
  create(restaurantId: number, reservation: Reservation): Promise<void>;
  findById(restaurantId: number, id: string): Promise<Reservation | null>;
  update(restaurantId: number, reservation: Reservation): Promise<void>;
}

// Connection management injected, not exposed
class PostgresReservationRepository implements ReservationRepository {
  constructor(private readonly pool: Pool) {}
  // ...
}
```

## Practical guidance

- Design interfaces for what callers need to do, not how you implement it
- Keep signatures consistent—if one method needs context, similar methods should too
- Return domain types, not infrastructure artifacts (avoid raw database IDs)
- Inject infrastructure dependencies through constructors, not method parameters
- Normalize error handling so callers don't catch implementation-specific exceptions

# Rule: Early Returns

Handle edge cases and invalid states at the top of a function with guard clauses that return early. This flattens nested conditionals and keeps the happy path obvious.

```ts
function getDiscount(user: User | null) {
  if (!user) return 0;
  if (!user.isActive) return 0;
  if (user.membership === "premium") return 0.2;
  return 0.1;
}
```

Invert conditions and exit immediately—null checks, permission checks, validation, empty collections. Main logic stays at the top level with minimal indentation.

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
  return users.filter(
    (user) => user.subscriptionEndDate <= cutoff && !user.isFreeTrial,
  );
}

function generateExpiryEmails(users: User[]): Array<[string, string]> {
  return users.map((user) => [
    user.email,
    `Your account has expired ${user.name}.`,
  ]);
}

// Imperative shell (orchestrates side effects)
email.bulkSend(
  generateExpiryEmails(getExpiredUsers(db.getUsers(), new Date())),
);
```

Core functions can now be tested with sample data and reused without modification.

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

Extract when a name clarifies complex intent, you need consistent behavior across many call sites, the function encapsulates a coherent standalone concept, or testing it in isolation provides value. Don't extract for single callers, because "we might need this elsewhere," or when the name describes implementation rather than purpose.

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

Test utilities are acceptable for setup and data preparation—fixtures, builders, factories, mock configuration—but not for computing expected values. Keep assertion logic in the test body with literal expectations.

# Rule: Normalize User Input

Accept flexible input formats and normalize programmatically. Don't reject input because of formatting characters users naturally include—spaces in credit card numbers, parentheses in phone numbers, hyphens in IDs. Computers are good at removing that.

```ts
import * as z from "zod";

// BAD - forces users to format input a specific way
const phoneSchema = z.string().regex(/^\d{10}$/, "Only digits allowed");

// GOOD - accept flexible input, normalize it
const phoneSchema = z
  .string()
  .transform((s) => s.replace(/[\s().-]/g, ""))
  .pipe(z.string().regex(/^\d{10}$/, "Must be 10 digits"));
```

When accepting user input:

- **Strip formatting characters** (spaces, hyphens, parentheses, dots) before validation
- **Trim whitespace** from text fields
- **Normalize case** when case doesn't matter (emails, usernames)
- **Accept common variations** (with/without country code for phones, with/without protocol for URLs)

**Never normalize passwords.** Users should be able to use any characters exactly as entered—normalizing passwords reduces entropy and can break legitimate credentials. The only acceptable transformation is Unicode normalization (NFC/NFKC) for cross-platform compatibility before hashing.

The validation error should describe what's actually wrong with the data, not complain about formatting the computer could have handled.

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
- **Strengthen argument types.** Instead of returning `T | undefined`, require callers to provide already-parsed data.
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

# Rule: Test Functional Core

Focus testing efforts on the functional core—pure functions with no side effects that operate only on provided data. These tests are fast, deterministic, and provide high value per line of test code. Do not write tests for the imperative shell (I/O, database calls, external services) unless the user explicitly requests them.

Imperative shell tests require mocks, stubs, or integration infrastructure, making them slower to write, brittle to maintain, and harder to debug. The return on investment diminishes rapidly compared to functional core tests. When the functional core is well-tested, the imperative shell becomes thin orchestration code where bugs are easier to spot through review or manual testing.

## What to test by default

- Pure transformation functions (filtering, mapping, calculations)
- Validation and parsing logic
- Business rule implementations
- Data formatting and serialization helpers

## What to skip unless explicitly requested

- HTTP handlers and route definitions
- Database queries and repository methods
- External API clients
- File system operations
- Message queue consumers/producers

If testing imperative shell code is explicitly requested, prefer integration tests over unit tests with mocks—they catch real issues and are less likely to break when implementation details change.

# Rule: Child Process Selection

Choose the appropriate `node:child_process` function based on synchronicity, shell requirements, output size, and error handling. (Defaults from Node.js 25.x docs.)

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

## Shell behavior summary

| Function                   | Default `shell` | Notes                                                            |
| :------------------------- | :-------------- | :--------------------------------------------------------------- |
| `spawn`, `spawnSync`       | `false`         | Set `shell: true` to run through a shell.                        |
| `exec`, `execSync`         | `true`          | Always uses a shell.                                             |
| `execFile`, `execFileSync` | `false`         | Direct execution; `shell: true` opt-in removes injection safety. |

## Examples

```ts
import { spawn, exec, execFile, spawnSync, execSync } from "node:child_process";

// Stream large or long-running output (no buffer cap)
const child = spawn("find", ["/", "-name", "*.log"]);
child.stdout.pipe(process.stdout);
child.stderr.pipe(process.stderr);

// Shell features (pipes/globs); avoid unsanitized input
exec("ls *.js | head -5", (error, stdout, stderr) => {
  if (error) return console.error(error);
  console.log(stdout);
  console.error(stderr);
});

// Safe direct execution with args array (no shell by default)
execFile("node", ["--version"], (error, stdout) => {
  if (error) return console.error(error);
  console.log(stdout);
});

// Shell injection protection: compare exec vs execFile
const userInput = "hello; echo pwned";

// UNSAFE: exec runs through a shell, so metacharacters execute
exec(`grep ${userInput} data.txt`, (error, stdout) => {
  if (error) return console.error(error);
  console.log(stdout);
});

// Safe: execFile passes args literally, so metacharacters are not executed
execFile("grep", [userInput, "data.txt"], (error, stdout) => {
  if (error) return console.error(error);
  console.log(stdout);
});

// Blocking shell command (use sparingly in scripts)
try {
  const summary = execSync("git status --short").toString();
  console.log(summary);
} catch (error) {
  console.error(error);
}

// Blocking with programmatic exit-code handling (no throw on non-zero)
const result = spawnSync("ls", ["-la"]);
if (result.error) console.error(result.error);
if (result.status !== 0) console.error(`Exit code: ${result.status}`);
console.log(result.stdout.toString());
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
  return (
    resolvedTarget.startsWith(resolvedBase + sep) ||
    resolvedTarget === resolvedBase
  );
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

## Key Points

1. **Use `relative()` not `startsWith()`** - avoids manual separator handling and different-drive detection
2. **Check for absolute result** - indicates different drive/root on Windows
3. **Check for `..` prefix with `sep`** - use `rel === ".." || rel.startsWith(`..${sep}`)` to detect upward traversal without blocking names like `..foo/bar.txt`
4. **Empty string is valid** - means the paths are equal
5. **Symlinks are not resolved** - `resolve()` and `relative()` operate lexically; use `fs.realpathSync()` if symlink traversal is a concern

## When to Apply

Use this pattern when:

- Validating user-provided file paths
- Preventing path traversal attacks (e.g., `../../../etc/passwd`)
- Ensuring files stay within a designated base directory
- Any path containment check that must work on Windows

# Rule: Import Metadata from package.json

Import name, version, and description directly from package.json to maintain a single source of truth for your package metadata. In Node.js 20.10+ use `with { type: "json" }` syntax (the older `assert` keyword is deprecated); ensure TypeScript's `resolveJsonModule` is enabled in tsconfig.json. This approach eliminates manual version synchronization and reduces maintenance errors when updating package information. Always import from the nearest package.json using relative paths to ensure correct metadata for monorepo packages.

```ts
import packageJson from "./package.json" with { type: "json" };

const program = new Command()
  .name(packageJson.name)
  .description(packageJson.description)
  .version(packageJson.version);
```

# Rule: Package.json Imports

Use `package.json` "imports" field with `#` prefixes to create stable internal module paths that replace brittle relative imports like `../../../utils`. The imports field accepts exact paths (`"#db": "./src/db.js"`) and wildcards (`"#utils/*": "./src/utils/*.js"`), and these private subpath imports are only accessible within your package, not from external consumers. Modern Node.js versions support this natively, while recent TypeScript versions provide full editor support including auto-imports and IntelliSense. For TypeScript projects, map to `.js` extensions in package.json since Node.js expects JavaScript at runtime, or use `.ts` with `allowImportingTsExtensions: true` for native TypeScript execution tools like tsx, Bun or latest Node.

```json
{
  "imports": {
    "#config": "./src/config/index.js",
    "#utils/*": "./src/utils/*.js"
  }
}
```

# Rule: Native TypeScript Execution

Node.js 22.18+ and 24+ run `.ts` files natively without flags or external tools like `tsx` or `ts-node`.

```bash
node script.ts
```

For Node.js 22.6–22.17, use `--experimental-strip-types`. Older versions require a TypeScript runner.

# Rule: Use `repoq` for Repository Queries

Run `npx -y repoq --help` to learn available options.

Use `repoq` instead of piping `git`/`gh` commands through `awk`/`jq`/`grep`.
Each command handles edge cases (detached HEAD, unborn branches, missing auth)
and returns validated JSON. Prefer `repoq` for reading state; use raw `git`/`gh`
for mutations (commit, push, merge).

# Rule: Discriminated Unions

Use discriminated unions to model data that can be in one of several distinct shapes. Each variant shares a literal discriminant property (commonly `type`, `kind`, or `status`) that TypeScript uses to narrow the union.

```ts
type UserCreatedEvent = {
  type: "user.created";
  data: { id: string; email: string };
};
type UserDeletedEvent = { type: "user.deleted"; data: { id: string } };
type Event = UserCreatedEvent | UserDeletedEvent;

const handleEvent = (event: Event) => {
  switch (event.type) {
    case "user.created":
      console.log(event.data.email); // TypeScript knows `email` exists
      break;
    case "user.deleted":
      console.log(event.data.id);
      break;
  }
};
```

## Preventing the "bag of optionals" problem

Discriminated unions eliminate impossible states that optional properties allow:

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

## React props with variant-specific properties

Use discriminated unions for polymorphic components where different variants require different props:

```ts
type ButtonProps =
  | { variant: "solid"; color: string }
  | { variant: "outline"; borderWidth: number };

function Button(props: ButtonProps) {
  switch (props.variant) {
    case "solid":
      return <button style={{ background: props.color }} />;
    case "outline":
      return <button style={{ borderWidth: props.borderWidth }} />;
  }
}
```

## Representing discriminated unions with Zod

Use `z.discriminatedUnion()` instead of `z.union()` for discriminated unions. Regular unions check each option in order until one passes, which is slow for large unions. Discriminated unions use the discriminator key for efficient parsing. They can also be nested—Zod determines the optimal parsing strategy using discriminators at each level:

```ts
const BaseError = { status: z.literal("failed"), message: z.string() };
const MyErrors = z.discriminatedUnion("code", [
  z.object({ ...BaseError, code: z.literal(400) }),
  z.object({ ...BaseError, code: z.literal(401) }),
  z.object({ ...BaseError, code: z.literal(500) }),
]);

const MyResult = z.discriminatedUnion("status", [
  z.object({ status: z.literal("success"), data: z.string() }),
  MyErrors,
]);
```

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

## Numeric Enum Pitfall

Numeric enums produce a reverse mapping, doubling the number of keys:

```ts
enum Direction {
  Up,
  Down,
  Left,
  Right,
}

Direction.Up; // 0
Direction[0]; // "Up"
Object.keys(Direction).length; // 8 (not 4)
```

String enums do not have this behavior.

# Rule: Error Result Types

Throwing errors is fine when framework infrastructure handles them (e.g., a backend request handler returning HTTP 500). For operations where callers must handle failure explicitly, use a result type instead of `try`/`catch`:

```ts
type Result<T, E extends Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };

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

# Rule: ESLint Print Config

Use `eslint --print-config` to check if a rule is enabled in the resolved configuration. This queries ESLint's actual computed config rather than searching config files for text strings.

```bash
# Check a simple rule
pnpm exec eslint --print-config src/index.ts | jq -e '.rules["no-console"][0]'

# Check a namespaced rule
pnpm exec eslint --print-config src/index.ts | jq -e '.rules["@typescript-eslint/no-unnecessary-type-parameters"][0]'
```

Returns `2` (error), `1` (warn), or `0` (off). The `-e` flag makes jq exit with code 1 when the result is null, useful for scripting.

# Rule: Import Type

Use `import type` for type-only imports. Prefer top-level `import type` over inline `import { type ... }`.

```ts
// BAD - may leave behind an empty import after transpilation
import { type User } from "./user";

// GOOD - entirely erased at compile time
import type { User } from "./user";
```

Inline type qualifiers can leave empty `import {}` statements in the emitted JavaScript, causing unnecessary side-effect imports. Top-level `import type` guarantees complete erasure.

# Rule: JSDoc Comments

Add JSDoc comments only when a function's behavior is not self-evident from its name and signature. Keep comments concise—describe intent or non-obvious behavior, not implementation details.

Use `{@link SymbolName}` to create clickable references to other functions, types, or classes. This works across files and updates automatically when symbols are renamed.

```ts
/** Rounds toward zero, unlike `Math.round` which rounds half-up. */
const truncateToInt = (n: number): number => Math.trunc(n);

/** Inverse of {@link encodePathSegment}—decodes a single URI path segment. */
const decodePathSegment = (segment: string): string =>
  decodeURIComponent(segment);
```

# Rule: Module Exports

Don't use default exports. Don't use barrel files (`index.ts` that re-exports siblings). Both add indirection that breaks the link between an import and its source—default exports let importers pick arbitrary names, barrels route imports through an intermediary. This harms refactoring, IDE navigation, and build performance.

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
  const result = deactivate({ status: "active" });
  expect(result.status).toBe("inactive");
});
```

If removing a test and introducing a bug would cause a compile error, the test is redundant. If the bug would compile cleanly and only surface at runtime, the test has value.

# Rule: No Unchecked Indexed Access

When `noUncheckedIndexedAccess` is enabled in `tsconfig.json`, indexing into arrays and objects returns `T | undefined` rather than `T`. Handle the potential `undefined` value instead of assuming the index exists.

```ts
const arr: string[] = ["a", "b"];
const obj: Record<string, string> = { foo: "bar" };

// With noUncheckedIndexedAccess enabled:
const first = arr[0]; // string | undefined
const value = obj.key; // string | undefined

// Without it:
const first = arr[0]; // string
const value = obj.key; // string
```

# Rule: Optional Properties

Prefer `T | undefined` over optional properties (`?`) when callers must always explicitly provide a value. Optional properties allow omission at call sites, which can mask bugs when a property is required but forgotten.

```ts
// BAD: forgetting userId silently compiles
type AuthOptions = { userId?: string };

// GOOD: forces explicit decision at call site
type AuthOptions = { userId: string | undefined };
```

## Exception: React Props with Defaults

Optional properties are acceptable in React props when combined with default parameters:

```ts
type ButtonProps = {
  variant?: 'solid' | 'outline';
  size?: 'sm' | 'md' | 'lg';
};

function Button({ variant = 'solid', size = 'md' }: ButtonProps) {
  return <button className={`${variant} ${size}`} />;
}
```

This is safe because the default parameter guarantees a value inside the component, and omitting the prop at the call site (`<Button />`) is intentional. Avoid this pattern for props without sensible defaults or where omission would cause bugs.

# Rule: Package Manager Execution

How different package manager commands resolve binaries:

| Command           | Behavior                                                                |
| ----------------- | ----------------------------------------------------------------------- |
| `pnpm exec foo`   | Runs from `./node_modules/.bin`; falls back to system PATH              |
| `pnpx foo`        | Always fetches from registry (uses dlx cache); ignores local installs   |
| `npx foo`         | Checks local `node_modules/.bin` → global → downloads from registry     |
| `npx foo@version` | Resolves version, uses local if exact match exists, otherwise downloads |

`pnpx` is an alias for `pnpm dlx`.

# Rule: Return Types

Annotate return types on top-level module functions. Explicit return types document intent, catch incomplete implementations at the definition site, and help AI assistants understand function purpose.

```ts
const myFunc = (): string => {
  return "hello";
};
```

**Exceptions:**

- React components returning JSX need no annotation—the return type is always `JSX.Element` or similar.
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
