# TypeScript Rules

## TypeScript Compilation and Type Checking

### CRITICAL: Type Checking Commands

- **NEVER** run `tsc` without the `--noEmit` flag for type checking
- **ALWAYS** use `pnpm run typecheck` for type checking (this includes --noEmit)
- **NEVER** compile TypeScript to JavaScript unless explicitly building the project

### Correct Type Checking:

```bash
# ✅ CORRECT - Use the project's typecheck script
pnpm run typecheck

# ✅ CORRECT - If using tsc directly, always include --noEmit
tsc --noEmit

# ❌ WRONG - Never run tsc without --noEmit for checking
tsc                           # This creates .js files!
tsc some/file.ts             # This creates .js files!
```

### Why This Matters:

- Running `tsc` without `--noEmit` will compile TypeScript files to JavaScript
- This pollutes the source directories with unwanted `.js` files
- The project uses a build system - direct compilation breaks the build process
- Always use the provided npm/pnpm scripts for type checking

## TypeScript Path Resolution in Monorepo

### Module Resolution Strategy

This monorepo uses `moduleResolution: "Bundler"` for applications that use modern bundlers (Vite, React Router 7). This resolution mode doesn't properly inherit `paths` from extended tsconfig files due to TypeScript limitations.

### Path Mapping Requirements

**IMPORTANT**: Each application must define its own path mappings for workspace packages in its local `tsconfig.json` file. Path mappings cannot be inherited from `tsconfig.base.json` when using `moduleResolution: "Bundler"`.

### Configuration Pattern

Each app's `tsconfig.json` should include:

```json
{
  "compilerOptions": {
    "moduleResolution": "Bundler",
    "baseUrl": ".",
    "paths": {
      // App-specific paths
      "#app/*": ["./app/*"],

      // Workspace package paths (relative from app directory)
      "@org/logger": ["../../packages/logger/src/index.ts"],
      "@org/logger/http": ["../../packages/logger/src/http-middleware.ts"],
      "@org/llm": ["../../packages/llm/index.ts"],
      "@org/llm/*": ["../../packages/llm/src/*"]
    }
  }
}
```

### Package.json Exports Configuration

Workspace packages should have simplified `exports` fields pointing directly to TypeScript source files:

```json
{
  "exports": {
    ".": "./src/index.ts",
    "./http": "./src/http-middleware.ts"
  }
}
```

### Why This Approach?

- `moduleResolution: "Bundler"` is required for React Router 7 and modern bundler compatibility
- Path inheritance doesn't work with Bundler resolution - paths are resolved relative to the config file they're defined in
- This ensures proper IDE navigation (Ctrl+Click) to source files instead of node_modules
- Each app explicitly declares which workspace packages it uses, improving clarity

## Zod Schemas for LLM Structured Responses

### CRITICAL: Optional Fields Must Be Nullable

When defining Zod schemas for LLM structured responses (used with `llm.createStructuredResponse()`), **optional fields MUST include `.nullable()`** before `.optional()`.

**Why:** LLMs may return `null` for optional fields instead of omitting them entirely. Without `.nullable()`, the schema will reject valid LLM responses.

**Correct pattern:**

```typescript
// ✅ CORRECT - nullable() before optional()
const llmResponseSchema = z.object({
  required: z.string(),
  optional: z.string().nullable().optional(),
  optionalArray: z.array(z.string()).nullable().optional(),
  optionalObject: z
    .object({
      field: z.string(),
    })
    .nullable()
    .optional(),
});
```

**Wrong patterns:**

```typescript
// ❌ WRONG - Missing nullable()
z.string().optional(); // LLM may return null, causing validation error

// ❌ WRONG - Wrong order (optional before nullable)
z.string().optional().nullable(); // Type inference breaks

// ❌ WRONG - Only nullable (field becomes required)
z.string().nullable(); // Field must be present (even if null)
```

**When this applies:**

- All Zod schemas passed to `llm.createStructuredResponse({ schema })`
- Schemas used with OpenAI structured outputs
- Schemas used with Anthropic structured responses
- Any schema where an LLM generates the data

**When this does NOT apply:**

- User input validation schemas (forms, API requests)
- Database schemas
- Configuration schemas
- Internal type definitions

**Example from codebase:**

```typescript
// Verify operation response schema
const checkResponseSchema = z.object({
  checkPassed: z.boolean(),
  reason: z.string().nullable().optional(), // ✅ Correct
  errors: z
    .array(
      z.object({
        message: z.string(),
        severity: z.enum(['critical', 'major', 'minor']),
        location: z.string().nullable().optional(), // ✅ Correct
      }),
    )
    .nullable()
    .optional(), // ✅ Correct
});
```

## Imports

### CRITICAL: Import Rules

- **ALL imports MUST be at the very top of a file** - This is non-negotiable
- **NEVER EVER use dynamic imports** (`await import()`) inside functions
- **NEVER EVER use inline imports or require()** - This is absolutely forbidden
- **NEVER use `require()` statements** - Only ES6 `import` statements are allowed
- Imported types should always be at the very top of a file
- Group imports logically: external packages, then internal modules

### ❌ ABSOLUTELY FORBIDDEN - Inline Imports/Requires

```typescript
// ❌ WRONG - NEVER do this
const someModule = require('some-module');

// ❌ WRONG - NEVER do this
const { someFunction } = (() => {
  const module = require('#app/some-module');
  return module;
})();

// ❌ WRONG - NEVER do this
if (condition) {
  const module = require('some-module');
}

// ❌ WRONG - NEVER do this
const getData = () => {
  const { getWebsiteBookmakers } = require('#app/services/bookmaker.server');
  return getWebsiteBookmakers(id);
};
```

### ✅ CORRECT - Top-Level Imports Only

```typescript
// ✅ CORRECT - All imports at the top
import { someFunction } from 'some-module';
import { getWebsiteBookmakers } from '#app/services/bookmaker.server';

// Then use them in your code
const getData = () => {
  return getWebsiteBookmakers(id);
};
```

### Why This Matters

- **Client/Server boundary**: Inline requires try to load server-side code in the browser, causing runtime errors
- **Build optimization**: Bundlers need static imports to properly tree-shake and bundle code
- **Type safety**: Dynamic imports bypass TypeScript's type checking
- **Code clarity**: Static imports make dependencies explicit and easy to track
- **Performance**: Dynamic imports prevent proper code splitting and optimization

## Basic Principles

- Use English for all code and documentation
- Always declare the type of each variable and function (parameters and return value)
- Never use `any` unless explicitly told to do so
- Create necessary types only when explicitly told to
- Use JSDoc to document public classes and methods
- Don't leave blank lines within a function
- One export per file

## Nomenclature

- Use PascalCase for classes
- Use camelCase for variables, functions, and methods
- Use kebab-case for file and directory names
- Use UPPERCASE for environment variables
- Avoid magic numbers and define constants
- Start each function with a verb
- Use verbs for boolean variables: `isLoading`, `hasError`, `canDelete`
- Use complete words instead of abbreviations and correct spelling
- Standard abbreviations allowed: API, URL, etc.
- Well-known abbreviations allowed: `i`, `j` for loops; `err` for errors; `ctx` for contexts; `req`, `res`, `next` for middleware
- Prefix internal helper functions with underscore `_` (not for class methods)

## Functions

- Write short functions with single purpose (less than 20 instructions)
- Name functions with verb + something else
- Boolean returns: use `isX`, `hasX`, `canX`
- Non-returns: use `executeX`, `saveX`
- Avoid nesting blocks with early checks and returns
- Use higher-order functions (map, filter, reduce) to avoid nesting
- Use arrow functions for simple functions (less than 3 instructions)
- Use named functions for non-simple functions
- Use default parameter values instead of checking null/undefined
- Reduce function parameters using RO-RO (Receive Object, Return Object)
- Use single level of abstraction

## Control Flow

### CRITICAL: Early Returns and Reduced Nesting

**ALWAYS prefer early returns over nested if/else blocks.** This is the most important control flow pattern.

#### Core Principle

Structure functions so that:

1. **Guard clauses and error cases at the top** - return/throw early for invalid conditions
2. **Happy path at the bottom** - main logic flows naturally without nesting
3. **Minimize indentation** - each level of nesting adds cognitive load

#### Early Returns Pattern

**Good examples:**

```typescript
// ✅ EXCELLENT - Early returns, minimal nesting, clear flow
async function processVerification(workflow: Workflow): Promise<boolean> {
  // Guard clause: check prerequisites
  if (!workflow.creationId) {
    throw new Error('Workflow has no creationId');
  }

  const evaluation = await evaluateChecks(workflow.creationId);

  // Early return: no checks to process
  if (!evaluation.integrityChecks || evaluation.integrityChecks.length === 0) {
    Logger.info('No checks found, verification complete');
    return true;
  }

  // Early return: all checks passed
  if (evaluation.failedChecks.length === 0) {
    Logger.info('All checks passed');
    await updateStatus(workflow.creationId, 'Success');
    return true;
  }

  // Early return: exceeded max attempts
  if (attempts >= maxAttempts) {
    Logger.error('Max attempts exceeded');
    await updateStatus(workflow.creationId, 'Failed');
    return false;
  }

  // Early return: no fixable checks
  const fixableChecks = evaluation.failedChecks.filter((c) => c.canFix);
  if (fixableChecks.length === 0) {
    Logger.error('No fixable checks remaining');
    await updateStatus(workflow.creationId, 'Failed');
    return false;
  }

  // Happy path - only executes if all guards pass
  await applyFixes(fixableChecks);
  return true;
}

// ✅ EXCELLENT - Check error condition first, throw immediately, then happy path
async function translateBettingTips(tips: BettingTip[], targetLang: string): Promise<void> {
  const translationCount = await createTranslations(tips, targetLang);

  // Error case first - throw immediately
  if (translationCount === 0) {
    throw new Error(
      `Failed to create translations for ${targetLang}. ` +
        `Expected translations for ${tips.length} betting tips but got 0.`,
    );
  }

  // Happy path - log success and continue
  Logger.info(`Successfully translated ${translationCount} betting tips to ${targetLang}`);
}

// ✅ EXCELLENT - Loop with early continue, minimal nesting
for (const [checkKey, checkResult] of Object.entries(integrityChecks)) {
  // Skip invalid results
  if (!checkResult || typeof checkResult !== 'object') {
    continue;
  }

  // Handle passed checks
  if (checkResult.passed) {
    passedChecks.push(checkKey);
    Logger.info(`Check PASSED: ${checkKey}`);
    continue;
  }

  // Handle failed checks - only reached if not passed
  const config = findConfig(checkKey);
  if (!config) {
    Logger.warn(`Check FAILED: ${checkKey} (no config)`);
    continue;
  }

  // Build failure details
  failedCheckDetails.push(buildDetail(checkKey, config));
}
```

**Bad examples:**

```typescript
// ❌ BAD - Deep nesting, hard to follow
async function processVerification(workflow: Workflow): Promise<boolean> {
  if (workflow.creationId) {
    const evaluation = await evaluateChecks(workflow.creationId);

    if (evaluation.integrityChecks && evaluation.integrityChecks.length > 0) {
      if (evaluation.failedChecks.length === 0) {
        Logger.info('All checks passed');
        await updateStatus(workflow.creationId, 'Success');
        return true;
      } else {
        if (attempts < maxAttempts) {
          const fixableChecks = evaluation.failedChecks.filter((c) => c.canFix);
          if (fixableChecks.length > 0) {
            await applyFixes(fixableChecks);
            return true;
          } else {
            Logger.error('No fixable checks');
            return false;
          }
        } else {
          Logger.error('Max attempts exceeded');
          return false;
        }
      }
    } else {
      Logger.info('No checks found');
      return true;
    }
  } else {
    throw new Error('No creationId');
  }
}

// ❌ BAD - if/else where else throws error (creates unnecessary nesting)
async function translateBettingTips(tips: BettingTip[], targetLang: string): Promise<void> {
  const translationCount = await createTranslations(tips, targetLang);

  if (translationCount > 0) {
    // Happy path nested inside if block
    Logger.info(`Successfully translated ${translationCount} betting tips to ${targetLang}`);
  } else {
    // Error case in else block
    throw new Error(
      `Failed to create translations for ${targetLang}. ` +
        `Expected translations for ${tips.length} betting tips but got 0.`,
    );
  }
}

// ❌ BAD - Nested if/else in loop
for (const [checkKey, checkResult] of Object.entries(integrityChecks)) {
  if (checkResult && typeof checkResult === 'object') {
    if (checkResult.passed) {
      passedChecks.push(checkKey);
    } else {
      const config = findConfig(checkKey);
      if (config) {
        failedCheckDetails.push(buildDetail(checkKey, config));
      } else {
        Logger.warn(`No config for ${checkKey}`);
      }
    }
  }
}
```

### Switch Statements vs If/Else Chains

- **Use `switch` statements** for multiple conditions on the **same discriminant value**
- Use `switch` for dispatching, routing, or handling multiple cases of a single variable
- **Exception**: If you need early returns within cases, use if/else with early returns instead

**Good examples:**

```typescript
// ✅ GOOD - Switch for same discriminant
switch (operation.type) {
  case 'write.paragraphs':
    await this.handleWrite(operation);
    break;
  case 'optimize.paragraphs':
    await this.handleOptimize(operation);
    break;
  case 'fix.integrity.issues':
    await this.handleFix(operation);
    break;
  default:
    throw new Error(`Unknown operation type: ${operation.type}`);
}

// ✅ ALSO GOOD - If/else with early returns when you need complex logic per case
if (operation.type === 'write.paragraphs') {
  if (!operation.content) return;
  await this.handleWrite(operation);
  return;
}
if (operation.type === 'optimize.paragraphs') {
  const optimized = await optimize(operation);
  if (!optimized) return;
  await this.handleOptimize(optimized);
  return;
}
throw new Error(`Unknown operation type: ${operation.type}`);
```

### Ternary Operators

- **Only use for simple value assignment**
- **Never nest ternary operators**
- Use if/else with early returns for anything complex

```typescript
// ✅ GOOD - Simple ternary for value assignment
const message = totalAttempts > 0 ? `✅ All checks passed after ${totalAttempts} attempts` : `✅ All checks passed`;

// ❌ BAD - Nested ternary
const status =
  isLoading ? 'Loading...'
  : hasError ? 'Error'
  : data ? 'Success'
  : 'Empty';

// ✅ GOOD - Use if/else with early returns instead
let status: string;
if (isLoading) {
  status = 'Loading...';
} else if (hasError) {
  status = 'Error';
} else if (data) {
  status = 'Success';
} else {
  status = 'Empty';
}
```

### Summary

1. **Always use early returns** - guard clauses first, happy path last
2. **Never use if/else where else throws** - check error condition first, throw immediately, then continue with happy path
3. **Minimize nesting** - flatten with early returns and continue statements
4. **Use switch for same discriminant** - but prefer early returns if cases need complex logic
5. **No nested ternaries** - use simple ternaries only for value assignment

## Error Handling

### CRITICAL: Fail Fast and Loud

**Always throw errors for configuration issues and invalid states.** Never silently continue or log warnings for problems that indicate bugs or misconfiguration.

#### When to Throw vs Warn

**❌ NEVER do this - Silent failures hide bugs:**

```typescript
// BAD - Logs warning and continues with invalid data
if (!config) {
  Logger.warn(`No config found for ${key}`);
  continue; // Silently skips - bug hidden!
}

// BAD - Skips invalid data without error
if (!item || typeof item !== 'object') {
  continue; // Invalid data ignored - corruption hidden!
}
```

**✅ ALWAYS do this - Fail fast with clear errors:**

```typescript
// GOOD - Throws immediately for missing config
if (!config) {
  throw new Error(`No configuration found for ${key}. Must be registered in CONFIG_REGISTRY.`);
}

// GOOD - Throws for invalid data
if (!item || typeof item !== 'object' || !('required' in item)) {
  throw new Error(`Invalid item for ${key}: missing required property 'required'`);
}
```

#### Configuration Errors Must Throw

Any missing configuration, registration, or setup issue should throw:

- Missing registry entries
- Invalid type definitions
- Required fields not present
- Mismatched schema

#### Data Errors Must Throw

Any invalid or corrupted data should throw:

- Missing required properties
- Type mismatches
- Invalid structure
- Constraint violations

#### Only Warn for Expected Conditions

Only use warnings for conditions that are expected and handled:

- Business rule violations (user input validation)
- Degraded functionality (optional features unavailable)
- Performance concerns (slow operations)

### Boolean Returns vs Exceptions

**Use exceptions for error conditions, not boolean returns.** Booleans create indirection and inconsistent error handling.

**❌ BAD - Boolean return pattern (creates indirection):**

```typescript
async function processVerification(): Promise<boolean> {
  try {
    await verify();
  } catch (error) {
    Logger.error('Verification failed', error);
    await updateStatus('failed');
    return false; // Converts error to boolean
  }

  if (maxAttemptsExceeded) {
    Logger.error('Max attempts exceeded');
    await updateStatus('failed');
    return false; // Another error as boolean
  }

  return true; // Success as boolean
}

// Caller must convert boolean back to error
const success = await processVerification();
if (!success) {
  throw new Error('Verification failed'); // Boolean → Error conversion
}
```

**✅ GOOD - Exception pattern (direct and consistent):**

```typescript
async function processVerification(): Promise<void> {
  await verify(); // Throws on error - let it propagate

  if (maxAttemptsExceeded) {
    Logger.error('Max attempts exceeded');
    await updateStatus('failed');
    throw new Error('Max verification attempts exceeded'); // Direct error
  }

  // Success - just return (void)
}

// Caller handles exceptions naturally
await processVerification(); // Throws on error, returns on success
```

**When to use booleans:**

- Query functions: `isValid()`, `hasPermission()`, `canProcess()`
- Feature flags: `isFeatureEnabled()`
- State checks: `isProcessing()`, `isDone()`

**When to throw exceptions:**

- Operation failures
- Validation errors
- Configuration errors
- Resource errors
- Any condition that prevents normal operation

### Hierarchical Error Boundaries

Use error boundaries at appropriate orchestration levels:

- **Operation Boundary**: Catches operation errors, updates operation status, enriches with context
- **Stage Boundary**: Catches stage errors, updates workflow/creation status, enriches with context
- **Workflow Boundary**: Top-level terminal handler, marks workflow as failed
- **Cleanup Boundary**: Special boundary that logs but never throws (cleanup failures are non-critical)

```typescript
// Operation level
await OperationErrorBoundary.execute(operation, async () => {
  // Operation logic - throws on error
});

// Workflow level (terminal handler)
await WorkflowErrorBoundary.execute(workflow, async () => {
  // All workflow logic - errors caught and logged
});
```

## Loops and Iteration

### CRITICAL: Avoid while(true)

**Never use `while(true)` with unreachable code.** Always use explicit loop conditions based on counters or state.

**❌ BAD - Infinite loop with unreachable code:**

```typescript
let attempt = 0;
// eslint-disable-next-line no-constant-condition
while (true) {
  attempt++;

  if (success) return;
  if (failed) throw new Error(...);

  // Continue loop
}

// Unreachable - dead code!
throw new Error('Unexpected exit');
```

**✅ GOOD - Explicit loop bounds:**

```typescript
let attempt = 1;
const maxAttempts = 10;

while (attempt <= maxAttempts) {
  if (success) return;
  if (failed) throw new Error(...);

  attempt++; // Explicit increment
}

// Reachable safety net
throw new Error(`Failed after ${maxAttempts} attempts`);
```

### Loop Counter Best Practices

1. **Start at 1 for user-facing counts** - "Attempt 1 of 10" is clearer than "Attempt 0 of 9"
2. **Define max bounds as constants** - `const MAX_ATTEMPTS = 10`
3. **Explicit increment** - Place `counter++` at end of loop body, not in condition
4. **Log with context** - Show `X/Y` format: `attempt ${i}/${max}`
5. **Safety net after loop** - Always have error/return after loop exits

### Early Continue vs Skip

Use `continue` for early exits in loops, but throw for invalid data:

```typescript
// ✅ GOOD - Early continue for valid skip conditions
for (const item of items) {
  if (item.processed) {
    continue; // Expected condition - skip already processed
  }

  // Process item
}

// ✅ BETTER - Throw for invalid data that shouldn't exist
for (const item of items) {
  if (!item || !item.id) {
    throw new Error(`Invalid item in collection: missing required field 'id'`);
  }

  if (item.processed) {
    continue; // Valid skip
  }

  // Process item
}
```

## Types

- Require permission to create new types unless explicitly told
- Always use existing types when available
- Never use `any` type unless explicitly told

## Comments

- Use JSDoc-style comments (`@param`, `@returns`, `@throws`) for **all** functions
- Use blocks of forward slashes (`////////////////////////////////`) to delineate logical sections
