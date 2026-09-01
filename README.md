# SPRQVNTRS Platform

Open-source monorepo for the `@sprqvntrs` scoped packages and container images.
Everything here is MIT licensed. The packages are published to **npmjs.com** (primary,
no token needed to install) and mirrored to **GitHub Packages** for the existing
internal consumers.

GitHub Packages requires a token even for public packages, which is why npmjs is the
primary registry.

## Packages

| Package                                                        | Description                                                        | README                                               |
| -------------------------------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------- |
| [@sprqvntrs/llm](https://www.npmjs.com/package/@sprqvntrs/llm)   | Unified LLM client for OpenAI, Anthropic and OpenRouter             | [packages/llm](packages/llm/README.md)               |
| [@sprqvntrs/workflows](https://www.npmjs.com/package/@sprqvntrs/workflows) | PostgreSQL-backed workflow orchestration on pg-boss      | [packages/workflows](packages/workflows/README.md)   |
| [@sprqvntrs/helpers](https://www.npmjs.com/package/@sprqvntrs/helpers) | Common helper utilities                                       | [packages/helpers](packages/helpers/README.md)       |
| [@sprqvntrs/logger](https://www.npmjs.com/package/@sprqvntrs/logger) | Structured logging with Pino                                    | [packages/logger](packages/logger/README.md)         |
| [@sprqvntrs/bot-verify](https://www.npmjs.com/package/@sprqvntrs/bot-verify) | Verify search-engine crawlers against published IP ranges | [packages/bot-verify](packages/bot-verify/README.md) |

## Container Images

| Image                                                                                       | Description                           | README                                       |
| ------------------------------------------------------------------------------------------- | ------------------------------------- | -------------------------------------------- |
| [ghcr.io/sprqvntrs/postgres](https://github.com/SPRQVNTRS/platform/pkgs/container/postgres) | PostgreSQL 17 with pgvector & pg_cron | [images/postgres](images/postgres/README.md) |

---

## Install

From npmjs.com. No token, no `.npmrc`:

```bash
pnpm add @sprqvntrs/llm
```

### The packages ship raw TypeScript

`main` and `types` both point at `index.ts`. There is no compiled build yet, so your
bundler must transpile the package sources.

**Vite / React Router / Remix** — add the scope to `ssr.noExternal`:

```ts
// vite.config.ts
export default defineConfig({
  ssr: {
    noExternal: [/^@sprqvntrs\//],
  },
});
```

**tsc** — use a bundler-style resolution:

```json
{
  "compilerOptions": {
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true
  }
}
```

### Installing from GitHub Packages instead

Only needed for consumers already pinned to the GitHub mirror. It needs a token even
though the packages are public:

```
@sprqvntrs:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GH_PACKAGES_TOKEN}
```

Create a [classic PAT](https://github.com/settings/tokens) with `read:packages`, then
`export GH_PACKAGES_TOKEN=ghp_xxx`.

---

## Publishing

`.github/workflows/release.yml` runs on every push to `main` and publishes to both
registries in one job:

1. **GitHub Packages** — `pnpm release` with `NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}`.
   Runs first; it must stay green.
2. **npmjs.com** — `npm publish --provenance --access public` per package directory,
   with **no** `NODE_AUTH_TOKEN`. It authenticates through npm Trusted Publishing
   (OIDC), which needs `id-token: write` on the job and npm CLI >= 11.5.1. Versions
   already present on npmjs are skipped, so re-runs are safe.

Both the runner `.npmrc` (written by `setup-node`'s `registry-url`) and the repo
`.npmrc` map `@sprqvntrs` to GitHub Packages. A bare `--registry` does **not** beat a
scoped mapping, so the npmjs step also passes `--@sprqvntrs:registry=https://registry.npmjs.org`.

### Operator steps: Trusted Publishing bootstrap

A trusted publisher can only be attached to a package that already exists on npmjs.com,
so the very first publish of each package needs a one-time token. Per package:

1. On npmjs.com, mint a **granular access token** scoped to that one package with
   read+write. Granular tokens expire after 90 days at most — this one is temporary.
2. Run the first publish by hand from the package directory:
   ```bash
   npm publish --access public \
     --registry https://registry.npmjs.org \
     --@sprqvntrs:registry=https://registry.npmjs.org
   ```
   (with the token in `~/.npmrc` as `//registry.npmjs.org/:_authToken=...`).
   Provenance is not available for a manual publish; that is fine for the bootstrap.
3. On npmjs.com, open the package → **Settings** → **Trusted Publisher**, and add
   GitHub Actions with repository `SPRQVNTRS/platform` and workflow `release.yml`.
4. **Delete the bootstrap token** from npmjs.com and from any repo secret. Nothing
   long-lived is stored: every publish after this authenticates via OIDC.

### Making a release

```bash
# 1. Make and commit your changes
git add . && git commit -m "feat: description"

# 2. Create a changeset and commit it
pnpm changeset
git add .changeset && git commit -m "chore: add changeset"

# 3. Push — the workflow versions, commits and publishes
git push
```

**Version types:** patch (0.0.X) | minor (0.X.0) | major (X.0.0)

## Adding a package

```bash
mkdir -p packages/your-package
```

```json
{
  "name": "@sprqvntrs/your-package",
  "version": "0.0.0",
  "type": "module",
  "main": "./index.ts",
  "types": "./index.ts",
  "exports": { ".": "./index.ts" },
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/SPRQVNTRS/platform.git",
    "directory": "packages/your-package"
  },
  "publishConfig": {
    "access": "public"
  }
}
```

Copy the root `LICENSE` into the new package directory, add the directory to the
npmjs loop in `release.yml`, and configure its trusted publisher after the first
publish.

## Pulling container images

- Create a GitHub classic token with `read:packages`.
- `docker login ghcr.io` with your GitHub username and that token as the password.
- Credentials are stored in Bitwarden.

## Development

```bash
pnpm install    # Install dependencies
pnpm -r test    # Run every package's tests
pnpm format     # Format code
pnpm clean      # Clean workspace
```

`@sprqvntrs/llm` also has `pnpm --filter @sprqvntrs/llm test:live`, which calls the real
provider APIs and needs `ANTHROPIC_API_KEY` / `OPENROUTER_API_KEY` / `OPENAI_API_KEY`.
It is deliberately outside `test`.

### Repository structure

```
platform/
├── packages/           # npm packages
│   ├── llm/
│   ├── workflows/
│   ├── helpers/
│   ├── logger/
│   └── bot-verify/
├── images/            # Container images
│   └── postgres/      # PostgreSQL with pgvector & pg_cron
├── .changeset/        # Changeset files
└── .github/workflows/ # CI/CD pipelines
```

## Follow-ups

- **A compiled JavaScript plus `.d.ts` build is owed.** The packages currently ship raw
  TypeScript, which works inside this workspace but pushes bundler configuration onto
  every generic consumer. Until that build exists, `ssr.noExternal` (or an equivalent)
  is mandatory for anyone using Vite.

## Security

**Never commit:** access tokens, an `.npmrc` with a hardcoded token, `.env` files.

**Safe to commit:** an `.npmrc` with `${ENV_VARIABLE}` placeholders.

**If a token leaks:** revoke it at https://github.com/settings/tokens (or on npmjs.com),
remove it from git history, and regenerate.
