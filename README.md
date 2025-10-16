# SPRQVNTRS Packages

Private monorepo for `@sprqvntrs` scoped packages published to GitHub Packages.

## 📦 Available Packages

- **[@sprqvntrs/llm](packages/llm)** - LLM integration utilities

## 🚀 Publishing

### Quick Start (Claude Code)

```
/release "your changes"   # Create changeset → PR → merge → auto-publish
/publish                   # Version & publish immediately
```

### Manual Workflow

```bash
pnpm changeset              # Create changeset
git add . && git commit -m "feat: description" && git push
# GitHub creates PR → merge to publish
```

**Version types:** patch (0.0.X) | minor (0.X.0) | major (X.0.0)

## 📥 Consuming Packages

### 1. Create Token

[Create classic PAT](https://github.com/settings/tokens) with `read:packages` scope (fine-grained tokens not officially supported yet).

### 2. Configure Authentication

**Project `.npmrc` (recommended, safe to commit):**
```
@sprqvntrs:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GH_PACKAGES_TOKEN}
```

Then set in shell: `export GH_PACKAGES_TOKEN=ghp_xxx`

**Or user `~/.npmrc` (not committed):**
```
@sprqvntrs:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=ghp_xxx
```

### 3. Install

```bash
pnpm add @sprqvntrs/llm
```

### GitHub Actions

```yaml
- uses: actions/setup-node@v4
  with:
    registry-url: 'https://npm.pkg.github.com'
- run: npm install
  env:
    NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}  # Same repo
    # NODE_AUTH_TOKEN: ${{ secrets.GH_PACKAGES_TOKEN }}  # Cross-repo
```

### TypeScript Config

Packages are TypeScript source files. Configure your bundler to transpile `node_modules/@sprqvntrs/*`, or use:

```json
{
  "compilerOptions": {
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true
  }
}
```

## 📦 Adding Packages

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
  "repository": {
    "type": "git",
    "url": "git+https://github.com/SPRQVNTRS/platform.git",
    "directory": "packages/your-package"
  },
  "publishConfig": {
    "registry": "https://npm.pkg.github.com"
  }
}
```

## 🔐 Security

**Never commit:** PATs, `.npmrc` with hardcoded tokens, `.env` files with secrets

**Safe to commit:** `.npmrc` with `${ENV_VARIABLE}` placeholders

**Token scopes:**
- Install: `read:packages`
- Publish: `write:packages`, `repo`

**If token leaked:** Revoke at https://github.com/settings/tokens, remove from git history, regenerate

## 🛠️ Development

```bash
pnpm install    # Install dependencies
pnpm format     # Format code
pnpm clean      # Clean workspace
```
