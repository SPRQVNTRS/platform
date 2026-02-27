---
allowed-tools: Bash(git *), Bash(gh *), Bash(pnpm *), Read, Write, Glob, Grep
description: Analyze changes, create changesets, push to main, and monitor release
---

You are helping to release packages in this monorepo. Follow these steps:

1. **Verify working tree is clean**:
   ```bash
   git status --porcelain
   ```
   If there are uncommitted changes, warn the user and stop.

2. **Verify on main branch**:
   ```bash
   git branch --show-current
   ```
   If not on `main`, warn the user and stop.

3. **Check for existing changesets**:
   ```bash
   find .changeset -name '*.md' ! -name 'README.md' 2>/dev/null
   ```

4. **If no changesets exist**, analyze recent commits to create them:
   - Run `git log --oneline $(git describe --tags --abbrev=0 2>/dev/null || echo HEAD~10)..HEAD` to see commits since last tag
   - Identify affected packages and bump types from the commits
   - Create `.changeset/<name>.md` files directly using the Write tool (do NOT use `pnpm changeset` — it's interactive)
   - Format:
     ```md
     ---
     "@sprqvntrs/package-name": patch
     ---

     description of the change
     ```
   - Commit the changeset files:
     ```bash
     git add .changeset && git commit -m "chore: add changeset for <describe change>"
     ```

5. **Push to main** to trigger the release workflow:
   ```bash
   git push origin main
   ```

6. **Monitor the release workflow**:
   ```bash
   gh run list --workflow=release.yml --limit=1
   ```
   Then watch it:
   ```bash
   gh run watch $(gh run list --workflow=release.yml --limit=1 --json databaseId --jq '.[0].databaseId')
   ```

7. **Report results** to the user:
   - Which packages had changesets
   - Whether the workflow succeeded
   - If it failed, show the failure logs:
     ```bash
     gh run view <run-id> --log-failed
     ```

**Fallback**: If the workflow didn't trigger or failed, it can be re-run manually:
```bash
gh workflow run release.yml
```
