---
allowed-tools: Bash(git *), Bash(pnpm *)
argument-hint: [changeset description (optional)]
description: Create a changeset, commit, and push changes for release
---

You are helping to create a release for this monorepo. Follow these steps:

1. **Check git status** to see what files have changed

2. **Check git diff** to understand the changes made

3. **Analyze the changes** and determine:
   - Which packages are affected
   - What type of change this is (patch/minor/major)
   - A clear, concise summary of the changes

4. **Create a changeset** by running:
   ```bash
   pnpm changeset add
   ```
   When prompted:
   - Select the affected package(s)
   - Choose the appropriate version bump (patch/minor/major)
   - Provide a clear summary: $ARGUMENTS (or generate one based on the diff if no argument provided)

5. **Stage and commit** the changeset:
   ```bash
   git add .changeset
   git commit -m "chore: add changeset for [describe the change]"
   ```

6. **Push to trigger the release workflow**:
   ```bash
   git push
   ```

7. **Inform the user** that:
   - The changeset has been created and pushed
   - A "Version Packages" PR will be created automatically
   - Merging that PR will publish the packages to GitHub Packages

If the user provided a description via $ARGUMENTS, use that for the changeset summary. Otherwise, analyze the git diff and create an appropriate summary yourself.
