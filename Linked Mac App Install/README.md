# Linked Mac App Install

This folder is a local, linked install area for development.

## What Is Linked

`Credit Analyzer USB Key.app` points to:

```text
../dist/mac/Credit Analyzer USB Key.app
```

When you rebuild the Mac app, this linked app points at the rebuilt version.

## Important

A DMG installer is a snapshot. It will not update automatically when you edit
files in VSCode.

For live development, double-click:

```text
Run Latest Dev App.command
```

To configure this Mac's local Keygen credentials, double-click:

```text
Configure Keygen.command
```

For an updated packaged app, double-click:

```text
Rebuild Linked App.command
```

Then open:

```text
Credit Analyzer USB Key.app
```

## Production Install

For a normal Mac install, use the DMG in `dist/`. That installed copy will not
be linked to VSCode edits.

Railway environment variables configure the Railway backend only. They do not
automatically configure this local Mac fulfillment app.
