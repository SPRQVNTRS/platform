# SPRQVNTRS Packages

Private monorepo for `@sprqvntrs` scoped packages published to GitHub Packages.

## 📦 Available Packages

- **[@sprqvntrs/llm](packages/llm)** - LLM integration utilities

## 🚀 Publishing Packages

### Using Claude Code Commands (Easiest)

**`/release [optional description]`**

Creates a changeset by analyzing your changes. Does NOT immediately publish.

- Analyzes git diff to determine affected packages
- Creates a `.changeset/*.md` file with version bump info
- Commits and pushes the changeset
- Triggers "Version Packages" PR creation
- When PR is merged → packages publish automatically

**`/publish`**

Consumes existing changesets and publishes immediately.

- Requires changesets to already exist (from `/release`)
- Runs `pnpm version-packages` (updates package.json, CHANGELOG)
- Commits version changes
- Pushes to trigger immediate publishing via GitHub Actions

**Typical workflow:**
1. Make changes → `/release "description"` → creates PR
2. Review & merge PR → auto-publish

**Direct publish:**
1. Make changes → `/release` → `/publish` → immediate publish

### Manual Release Workflow

1. Create a changeset describing your changes:
   ```bash
   pnpm changeset
   ```
   - Select which packages changed
   - Choose version bump type (patch/minor/major)
   - Write a summary of changes

2. Commit and push the changeset:
   ```bash
   git add .
   git commit -m "feat: your feature description"
   git push
   ```

3. The workflow will automatically:
   - Create a "Version Packages" PR
   - When merged, publish packages to GitHub Packages

### Manual Release

Use the GitHub Actions workflow dispatch:

1. Go to **Actions** → **Publish Packages**
2. Click **Run workflow**
3. Select version type (patch/minor/major)
4. Packages will be versioned and published immediately

### Local Publishing (Development)

```bash
# Version packages based on changesets
pnpm version-packages

# Publish all packages
pnpm release
```

**Note:** Ensure `NODE_AUTH_TOKEN` is set with a GitHub PAT that has `packages:write` permission.

## 📦 Adding New Packages

1. Create package directory:
   ```bash
   mkdir -p packages/your-package
   cd packages/your-package
   ```

2. Create `package.json`:
   ```json
   {
     "name": "@sprqvntrs/your-package",
     "version": "0.0.0",
     "type": "module",
     "main": "./index.ts",
     "types": "./index.ts",
     "exports": {
       ".": "./index.ts"
     },
     "license": "proprietary",
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

3. Create your package files (`index.ts`, etc.)

4. Install dependencies from workspace root:
   ```bash
   pnpm install
   ```

## 📥 Consuming Packages

### Setup Authentication

Create or edit `.npmrc` in your project or home directory (`~/.npmrc`):

```
@sprqvntrs:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=YOUR_GITHUB_PERSONAL_ACCESS_TOKEN
```

**Create a GitHub Personal Access Token:**
1. Go to GitHub Settings → Developer settings → Personal access tokens → Tokens (classic)
2. Generate new token with `read:packages` scope
3. Copy the token and add to `.npmrc`

### Install Packages

```bash
# Using pnpm
pnpm add @sprqvntrs/llm

# Using npm
npm install @sprqvntrs/llm

# Using yarn
yarn add @sprqvntrs/llm
```

### TypeScript Configuration

Since packages are published as TypeScript source files, ensure your project can compile them:

```json
{
  "compilerOptions": {
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true
  }
}
```

Or configure your bundler (Vite, Next.js, etc.) to transpile `node_modules/@sprqvntrs/*`.

## 🛠️ Development

```bash
# Install dependencies
pnpm install

# Format code
pnpm format

# Clean workspace
pnpm clean
```

## 📝 Changeset Workflow

Changesets help manage versions and changelogs in a monorepo:

- **patch**: Bug fixes, small changes (0.0.X)
- **minor**: New features, backwards compatible (0.X.0)
- **major**: Breaking changes (X.0.0)

Each changeset becomes part of the changelog when versions are published.
