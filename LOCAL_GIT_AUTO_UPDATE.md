# Local Git Auto Update

The app in `/Applications` is a symlink to this project:

```text
/Applications/Credit Analyzer USB Key.app
-> dist/mac/Credit Analyzer USB Key.app
```

That means the installed app updates when `dist/mac/Credit Analyzer USB Key.app`
is rebuilt.

## Install Local Hooks

Run once after `git init`:

```bash
./scripts/install-local-git-hooks.sh
```

This installs local Git hooks that rebuild the linked app after:

- `git commit`
- `git pull` when a merge happens

Git hooks are local machine settings. They are not pushed to Git remotes.

## Manual Rebuild

```bash
./scripts/rebuild-linked-mac-app.sh
```

## Important Limit

Pushing to GitHub/Git by itself cannot update `/Applications` on your Mac unless
something on this Mac runs a pull/build step. The linked app updates when this
local project rebuilds.

Recommended workflow on this Mac:

```text
Edit in VSCode
Commit
Hook rebuilds linked app
Push to Git
Open app from /Applications
```

For another Mac, clone the repo, install dependencies, run the hook installer,
and create the `/Applications` symlink.
