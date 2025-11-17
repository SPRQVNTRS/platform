---
allowed-tools: Bash(git *), Bash(pnpm *)
description: Analyze changes, create changesets, version, and publish packages
model: claude-haiku-4-5-20251001
---

You are helping to release packages in this monorepo. The user has already committed their changes. Follow these steps:

1. **Check what has changed since the last release**:
   ```bash
   git log --oneline -10
   git diff HEAD~1
   ```

2. **Check for existing changesets**:
   ```bash
   ls -la .changeset/*.md 2>/dev/null | grep -v README || echo "No changesets found"
   ```

3. **Analyze the recent commits** to determine:
   - Which packages are affected
   - What type of changes were made (patch/minor/major)
   - Whether changesets already exist

4. **If no changesets exist**, create them:
   - Run: `pnpm changeset add`
   - Select affected package(s)
   - Choose appropriate version bump
   - Provide clear summary based on the commits
   - Commit the changeset: `git add .changeset && git commit -m "chore: add changeset for [describe change]"`

5. **Version the packages**:
   ```bash
   pnpm version-packages
   ```

6. **Review version changes**:
   ```bash
   git diff
   ```

7. **Commit version changes**:
   ```bash
   git add .
   git commit -m "chore: version packages"
   ```

8. **Push to trigger CI/CD**:
   ```bash
   git push
   ```

9. **Inform the user**:
   - Which packages were versioned
   - What the new versions are
   - That packages will be published via GitHub Actions
   - Or they can run `pnpm release` locally if they have proper authentication

**Summary**: This command handles the complete release workflow from analyzing changes to pushing versioned packages.
