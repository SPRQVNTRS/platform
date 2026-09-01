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

2. **On push to `main`**, the `Release` GitHub Action (`.github/workflows/release.yml`) automatically:
   - Detects pending changesets
   - Runs `pnpm version-packages` to bump versions and update changelogs
   - Commits the version bumps with `[skip ci]` and pushes
   - Publishes updated packages to GitHub Packages (`npm.pkg.github.com`)
   - All in a single workflow run — no intermediate PR

3. **Do NOT manually bump versions** in `package.json` — changesets handles this automatically

4. **Manual fallback**: If a publish fails or you need to re-trigger, run:
   ```sh
   gh workflow run release.yml
   ```

5. **`/release` command**: Use this to analyze changes, create changeset files, push, and monitor the workflow

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

### Testing

**Unit tests** use [Vitest](https://vitest.dev/). New packages should use vitest for unit tests.

```sh
pnpm --filter @sprqvntrs/bot-verify test        # run unit tests for a package
pnpm --filter @sprqvntrs/bot-verify test:watch  # run in watch mode
```

**E2E / integration tests** (`@sprqvntrs/llm`) are script-style files run with `tsx` that test against live upstream providers. These require API keys in `packages/<pkg>/.env`.

```sh
pnpm --filter @sprqvntrs/llm test            # run all e2e tests
pnpm exec tsx tests/some-test.ts             # run a specific test file
```

### Pricing Data (`@sprqvntrs/llm`)

Model pricing is auto-generated from OpenRouter's API. The generated file is `packages/llm/src/pricing-data.json`.

To update pricing data:
```sh
pnpm --filter @sprqvntrs/llm sync-pricing
```

Re-run this when:
- Adding new models to the package
- Providers update their pricing
- Periodically (quarterly) to catch price changes

The script fetches from OpenRouter's `/api/v1/models` endpoint. Models not on OpenRouter (e.g., `text-embedding-3-large`) have manual overrides in `scripts/sync-pricing.ts`.

## Commit Conventions

Follow conventional commits: `type(scope): description`

- `feat(llm):` — new feature
- `fix(llm):` — bug fix
- `chore:` — maintenance, version bumps
- `refactor(llm):` — code restructuring

## Tracker

This project uses `.tracker/` for implementation tracking. See [`.tracker/00-INDEX.md`](.tracker/00-INDEX.md) for the progress dashboard.

### Workflow

- `/tracker:status` — view progress dashboard
- `/tracker:work` — pick up the next task
- `/tracker:add` — add milestones or specs
- `/tracker:commit` — stage and commit with tracker context
- `/tracker:worklog` — inter-agent communication log for persistent context
