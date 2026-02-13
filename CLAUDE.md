# Platform Monorepo

pnpm workspace monorepo containing shared packages published to GitHub Packages.

## Structure

- `packages/` — publishable npm packages (`@sprqvntrs/llm`, `@sprqvntrs/logger`, etc.)
- `images/` — Docker images (e.g., `images/postgres/`)
- Apps that consume these packages live in separate repos

## Versioning & Releases

This repo uses [Changesets](https://github.com/changesets/changesets) for versioning and publishing.

### How it works

1. **When you make a change to a package**, create a changeset file alongside your commit:
   - Create `.changeset/<descriptive-name>.md` with frontmatter specifying the package and bump type
   - Example:
     ```md
     ---
     "@sprqvntrs/llm": patch
     ---

     fix(llm): description of the change
     ```
   - Bump types: `patch` (bug fixes), `minor` (new features), `major` (breaking changes)

2. **On push to `main`**, the `Release` GitHub Action (`.github/workflows/release.yml`) runs `changesets/action`:
   - If pending changesets exist, it opens (or updates) a **"chore: version packages"** PR that bumps `package.json` versions and updates changelogs
   - When that PR is merged, the action **publishes** the updated packages to GitHub Packages (`npm.pkg.github.com`)

3. **Do NOT manually bump versions** in `package.json` — changesets handles this automatically

### Commands

| Command | What it does |
|---------|-------------|
| `pnpm changeset` | Interactive changeset creation (alternative to manual file creation) |
| `pnpm version-packages` | Apply pending changesets to bump versions (CI does this) |
| `pnpm release` | Publish all packages with new versions (CI does this) |

### Key config

- `.changeset/config.json` — access: `restricted` (GitHub Packages), base branch: `main`
- Packages are published to `https://npm.pkg.github.com` (see `publishConfig` in each package.json)

## Development

- Node >= 22
- pnpm 10.18.1
- TypeScript strict mode (`tsconfig.base.json`)

### Package tests

Tests are script-style files run with `tsx` (no test framework). Each package has its own test scripts:

```sh
pnpm --filter @sprqvntrs/llm test           # run all tests for a package
pnpm exec tsx tests/some-test.ts             # run a specific test file
```

Integration tests (e.g., `tests/openrouter-client.test.ts`) require API keys in `packages/<pkg>/.env`. Unit tests (e.g., `tests/resolve-refs.test.ts`) have no external dependencies.

## Commit Conventions

Follow conventional commits: `type(scope): description`

- `feat(llm):` — new feature
- `fix(llm):` — bug fix
- `chore:` — maintenance, version bumps
- `refactor(llm):` — code restructuring
