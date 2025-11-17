# SPRQVNTRS Packages

Private monorepo for `@sprqvntrs` scoped packages published to GitHub Packages.

## 📦 Available Packages

- **[@sprqvntrs/llm](packages/llm)** - LLM integration utilities

## 🛠️ Development Workflow

### Making Changes

1. **Make your changes** to the code
2. **Commit your changes** manually:
   ```bash
   git add .
   git commit -m "feat: your feature description"
   ```
3. **Release the changes** using Claude Code:
   ```
   /release
   ```
   This will:
   - Analyze what changed
   - Create changesets for affected packages
   - Version the packages
   - Commit version changes
   - Push to trigger GitHub Actions publishing

### Manual Workflow (without Claude Code)

```bash
# 1. Make and commit your changes
git add . && git commit -m "feat: description"

# 2. Create a changeset
pnpm changeset
# Follow prompts to select packages and version bump type

# 3. Commit the changeset
git add .changeset && git commit -m "chore: add changeset"

# 4. Version packages
pnpm version-packages

# 5. Commit version changes
git add . && git commit -m "chore: version packages"

# 6. Push to trigger publishing
git push
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

## 🛠️ Development Commands

```bash
pnpm install    # Install dependencies
pnpm format     # Format code
pnpm clean      # Clean workspace
```

### Repository Structure

```
platform/
├── packages/           # Published packages
│   └── llm/           # @sprqvntrs/llm
├── .changeset/        # Changeset files (created by /release)
└── .claude/           # Claude Code configuration
    └── commands/
        └── release.md # /release command
```
