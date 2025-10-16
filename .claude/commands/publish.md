---
allowed-tools: Bash(git *), Bash(pnpm *)
argument-hint: [version type: patch|minor|major]
description: Version and publish packages immediately (bypasses changeset PR flow)
---

You are helping to publish packages directly to GitHub Packages. Follow these steps:

1. **Check current status**:
   ```bash
   git status
   git diff
   ```

2. **Verify there are changesets** to process:
   ```bash
   ls -la .changeset/*.md 2>/dev/null | grep -v README
   ```

3. **Version the packages** based on changesets:
   ```bash
   pnpm version-packages
   ```

4. **Review the version changes** that were made:
   ```bash
   git diff
   ```

5. **Commit the version changes**:
   ```bash
   git add .
   git commit -m "chore: version packages"
   ```

6. **Push to remote**:
   ```bash
   git push
   ```

7. **Explain to the user**:
   - Which packages were versioned
   - What the new versions are
   - That the packages will be published automatically via GitHub Actions
   - Or if running locally with proper auth, they can run `pnpm release` to publish immediately

**Note:** This command requires existing changesets. If none exist, suggest running `/release` first to create a changeset.

If $ARGUMENTS is provided with a version type (patch/minor/major), inform the user that changesets handles versioning automatically based on the changeset files, so manual version specification isn't needed.
