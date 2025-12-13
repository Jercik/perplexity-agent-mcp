# Rule: `askpplx` CLI Usage

**MANDATORY:** Run `npx -y askpplx --help` at the start of every agent session to learn available options and confirm the tool is working.

Use `askpplx` to query Perplexity, an AI search engine combining real-time web search with advanced language models.

## Why This Matters

- **Ground your knowledge:** Your training data has a cutoff date. Real-time search ensures you work with current information—correct API signatures, latest versions, up-to-date best practices.
- **Save time and resources:** A quick lookup is far cheaper than debugging hallucinated code or explaining why an approach failed. When in doubt, verify first.
- **Reduce false confidence:** Even when you feel certain, external verification catches subtle errors before they compound into larger problems.
- **Stay current:** Libraries change, APIs deprecate, patterns evolve. What was correct six months ago may be wrong today.

## Usage Guidelines

Use concise prompts for quick facts and focused questions for deeper topics. If results are unexpected, refine your query and ask again. Verification is fast and cheap—prefer looking up information over making assumptions.


---

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


---

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
- Ensuring files stay within a sandbox directory
- Any path containment check that must work on Windows


---

# Rule: Import Metadata from package.json

Import name, version, and description directly from package.json to maintain a single source of truth for your package metadata. In Node.js 20.10+ use `with { type: "json" }` syntax (the older `assert` keyword is deprecated); ensure TypeScript's `resolveJsonModule` is enabled in tsconfig.json. This approach eliminates manual version synchronization and reduces maintenance errors when updating package information. Always import from the nearest package.json using relative paths to ensure correct metadata for monorepo packages.

```ts
import packageJson from "./package.json" with { type: "json" };

const program = new Command()
  .name(packageJson.name)
  .description(packageJson.description)
  .version(packageJson.version);
```


---

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


---

# Rule: Run TypeScript Natively

Run TypeScript files directly with `node`. Do not use `tsx`, `ts-node`, or other external runners.

```bash
node script.ts           # ✅ Correct
tsx script.ts            # ❌ Unnecessary
pnpm exec tsx script.ts  # ❌ Unnecessary
```

Node.js 22.18+ and 24+ run `.ts` files natively without flags. External TypeScript runners add unnecessary dependencies and complexity.


---

# Rule: Any in Generics

When building generic functions, you may need to use any inside the function body.

This is because TypeScript often cannot match your runtime logic to the logic done inside your types.

One example:

```ts
const youSayGoodbyeISayHello = <TInput extends "hello" | "goodbye">(
  input: TInput,
): TInput extends "hello" ? "goodbye" : "hello" => {
  if (input === "goodbye") {
    return "hello"; // Error!
  } else {
    return "goodbye"; // Error!
  }
};
```

On the type level (and the runtime), this function returns `goodbye` when the input is `hello`.

There is no way to make this work concisely in TypeScript.

So using `any` is the most concise solution:

```ts
const youSayGoodbyeISayHello = <TInput extends "hello" | "goodbye">(
  input: TInput,
): TInput extends "hello" ? "goodbye" : "hello" => {
  if (input === "goodbye") {
    return "hello" as any;
  } else {
    return "goodbye" as any;
  }
};
```

Outside of generic functions, use `any` extremely sparingly.


---

# Rule: Default Exports

Unless explicitly required by the framework, do not use default exports.

```ts
// BAD
export default function myFunction() {
  return <div>Hello</div>;
}
```

```ts
// GOOD
export function myFunction() {
  return <div>Hello</div>;
}
```

Default exports create confusion from the importing file.

```ts
// BAD
import myFunction from "./myFunction";
```

```ts
// GOOD
import { myFunction } from "./myFunction";
```

There are certain situations where a framework may require a default export. For instance, Next.js requires a default export for pages.

```tsx
// This is fine, if required by the framework
export default function MyPage() {
  return <div>Hello</div>;
}
```


---

# Rule: Discriminated Unions

Proactively use discriminated unions to model data that can be in one of a few different shapes. For example, when sending events between environments:

```ts
type UserCreatedEvent = {
  type: "user.created";
  data: { id: string; email: string };
};

type UserDeletedEvent = {
  type: "user.deleted";
  data: { id: string };
};

type Event = UserCreatedEvent | UserDeletedEvent;
```

Use switch statements to handle discriminated unions:

```ts
const handleEvent = (event: Event) => {
  switch (event.type) {
    case "user.created":
      console.log(event.data.email);
      break;
    case "user.deleted":
      console.log(event.data.id);
      break;
  }
};
```

Use discriminated unions to prevent the 'bag of optionals' problem.

For example, when describing a fetching state:

```ts
// BAD - allows impossible states
type FetchingState<TData> = {
  status: "idle" | "loading" | "success" | "error";
  data?: TData;
  error?: Error;
};

// GOOD - prevents impossible states
type FetchingState<TData> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; data: TData }
  | { status: "error"; error: Error };
```

In React props (e.g., polymorphic buttons), use for variants:

```ts
type ButtonProps =
  | { variant: 'solid'; color: string }
  | { variant: 'outline'; borderWidth: number };

function Button(props: ButtonProps) {
  switch (props.variant) {
    case 'solid':
      return <button style={{ background: props.color }} />;
    case 'outline':
      return <button style={{ borderWidth: props.borderWidth }} />;
  }
}
```


---

# Rule: Enums Alternatives

Do not introduce new enums into the codebase. Retain existing enums.

If you require enum-like behaviour, use an `as const` object:

```ts
const backendToFrontendEnum = {
  xs: "EXTRA_SMALL",
  sm: "SMALL",
  md: "MEDIUM",
} as const;

type LowerCaseEnum = keyof typeof backendToFrontendEnum; // "xs" | "sm" | "md"

type UpperCaseEnum = (typeof backendToFrontendEnum)[LowerCaseEnum]; // "EXTRA_SMALL" | "SMALL" | "MEDIUM"
```

Remember that numeric enums behave differently to string enums. Numeric enums produce a reverse mapping:

```ts
enum Direction {
  Up,
  Down,
  Left,
  Right,
}

const direction = Direction.Up; // 0
const directionName = Direction[0]; // "Up"
```

This means that the enum `Direction` above will have eight keys instead of four.

```ts
enum Direction {
  Up,
  Down,
  Left,
  Right,
}

Object.keys(Direction).length; // 8
```


---

# Rule: Error Result Types

Think carefully before implementing code that throws errors.

If a thrown error produces a desirable outcome in the system, go for it. For instance, throwing a custom error inside a backend framework's request handler.

However, for code that you would need a manual try catch for, consider using a result type instead:

```ts
type Result<T, E extends Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };
```

For example, when parsing JSON:

```ts
const parseJson = (input: string): Result<unknown, Error> => {
  try {
    return { ok: true, value: JSON.parse(input) };
  } catch (error) {
    return { ok: false, error: error as Error };
  }
};
```

This way you can handle the error in the caller:

```ts
const result = parseJson('{"name": "John"}');

if (result.ok) {
  console.log(result.value);
} else {
  console.error(result.error);
}
```


---

# Rule: ESLint Print Config

Use `eslint --print-config` to check if a rule is enabled in the resolved configuration. This queries ESLint's actual computed config rather than searching config files for text strings.

```bash
# Simple example
pnpm exec eslint --print-config src/index.ts | jq -e '.rules["no-console"][0]'
```

```bash
# Complex example (namespaced rule)
pnpm exec eslint --print-config src/index.ts | jq -e '.rules["@typescript-eslint/no-unnecessary-type-parameters"][0]'
# Returns: 2 (error), 1 (warn), 0 (off)
# Exit code 1 if rule not found
```

The `-e` flag makes jq exit with code 1 when the result is null, useful for scripting.


---

# Rule: Import Type

Use import type whenever you are importing a type.

Prefer top-level `import type` over inline `import { type ... }`.

```ts
// BAD
import { type User } from "./user";
```

```ts
// GOOD
import type { User } from "./user";
```

The reason for this is that in certain environments, the first version's import will not be erased. So you'll be left with:

```ts
// Before transpilation
import { type User } from "./user";

// After transpilation
import "./user";
```


---

# Rule: Interface Extends

ALWAYS prefer interfaces when modelling inheritance.

The `&` operator has terrible performance in TypeScript. Only use it where `interface extends` is not possible.

```ts
// BAD

type A = {
  a: string;
};

type B = {
  b: string;
};

type C = A & B;
```

```ts
// GOOD

interface A {
  a: string;
}

interface B {
  b: string;
}

interface C extends A, B {
  // Additional properties can be added here
}
```


---

# Rule: JSDoc Comments

Use JSDoc comments to annotate functions and types.

Be concise in JSDoc comments, and only provide JSDoc comments if the function's behaviour is not self-evident.

Use the JSDoc inline `@link` tag to link to other functions and types within the same file.

```ts
/**
 * Subtracts two numbers
 */
const subtract = (a: number, b: number) => a - b;

/**
 * Does the opposite to {@link subtract}
 */
const add = (a: number, b: number) => a + b;
```


---

# Rule: No Barrel Files

Avoid barrel files (index.ts/index.js that re-export siblings) in application code. Import modules directly or via private subpath imports defined in package.json so dependencies stay explicit and you don’t inflate the module graph or create import cycles. Use a barrel only for a library entrypoint referenced by package.json, keep it pure re-exports (no side effects or constants), avoid `export *`, and never import that barrel from within the same package.

Example:

```ts
// Avoid (barrel)
// src/tab/index.ts
export { TabList } from "./tab-list";

// Prefer direct import
import { TabList } from "#components/tab/tab-list";
```


---

# Rule: No Unchecked Indexed Access

If the user has this rule enabled in their `tsconfig.json`, indexing into objects and arrays will behave differently from how you expect.

```ts
const obj: Record<string, string> = {};

// With noUncheckedIndexedAccess, value will
// be `string | undefined`
// Without it, value will be `string`
const value = obj.key;
```

```ts
const arr: string[] = [];

// With noUncheckedIndexedAccess, value will
// be `string | undefined`
// Without it, value will be `string`
const value = arr[0];
```


---

# Rule: Optional Properties

Use optional properties extremely sparingly. Only use them when the property is truly optional, and consider whether bugs may be caused by a failure to pass the property.

In the example below we always want to pass user ID to `AuthOptions`. This is because if we forget to pass it somewhere in the code base, it will cause our function to be not authenticated.

```ts
// BAD
type AuthOptions = {
  userId?: string;
};

const func = (options: AuthOptions) => {
  const userId = options.userId;
};
```

```ts
// GOOD
type AuthOptions = {
  userId: string | undefined;
};

const func = (options: AuthOptions) => {
  const userId = options.userId;
};
```

## Exception: React Props with Defaults

Optional properties ARE acceptable in React props when combined with default parameters in the function signature:

```ts
// Type with optional property
type ButtonProps = {
  variant?: 'solid' | 'outline';
  size?: 'sm' | 'md' | 'lg';
};

// Function parameter provides the default
function Button({ variant = 'solid', size = 'md' }: ButtonProps) {
  // variant and size are guaranteed to have values here
  return <button className={`${variant} ${size}`} />;
}
```

This pattern is safe because:

- The default parameter ensures the value is never undefined inside the component
- Omitting the prop at the call site is intentional and clear: `<Button />`
- The default value is documented in one place (the function signature)

Avoid this pattern for:

- Non-React function parameters where callers might forget required config
- Props without sensible defaults that should force explicit decisions
- Situations where forgetting to pass the prop would cause bugs


---

# Rule: Package Manager Execution

In pnpm projects, use `pnpm exec` to run locally installed binaries. Do not use `pnpx`, which is an alias for `pnpm dlx` that downloads packages from the registry and ignores local installations. Use `pnpx` only for one-off commands where you want to run a package without installing it locally.

```bash
pnpm exec tsc --noEmit    # ✅ Uses local package
npx tsc --noEmit          # ✅ Uses local package
pnpx tsc --noEmit         # ❌ Downloads from registry, ignores local
```


---

# Rule: Return Types

When declaring functions on the top-level of a module,
declare their return types. This will help future AI
assistants understand the function's purpose.

```ts
const myFunc = (): string => {
  return "hello";
};
```

One exception to this is components which return JSX.
No need to declare the return type of a component,
as it is always JSX.

```tsx
const MyComponent = () => {
  return <div>Hello</div>;
};
```

For React hooks returning objects, annotate: `(): { state: string; }`.


---

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


---

# Rule: Zod Schema Naming

Use identical names for Zod schemas and their inferred types. Name both with PascalCase. TypeScript allows this because types and values exist in separate namespaces.

```ts
// CORRECT
const User = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
});

type User = z.infer<typeof User>;
```

```ts
// AVOID - Redundant suffix
const UserSchema = z.object({ name: z.string() });
type User = z.infer<typeof UserSchema>;
```

Export both the schema and type with the same name. This reduces cognitive load (one concept, one name) and creates unmistakable association between schema and type.
