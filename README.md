# pi-ddd-contexts

Pi package that adds reusable DDD bounded-context memory commands for any project.

It uses this per-project convention:

```text
.planning/
  contexts/
    billing/
      rules.md
      STATE.md
    users/
      rules.md
      STATE.md
```

## Install

From this local checkout:

```bash
pi install ./
```

Or project-local:

```bash
pi install -l ./
```

After install, restart Pi or run:

```text
/reload
```

## Commands

```text
/ddd:init billing users
/ddd:contexts
/ddd:state billing
/ddd:plan Add checkout with invoice generation
/ddd:run Add checkout with invoice generation
```

## Recommended flow

1. Initialize contexts:

```text
/ddd:init billing users
```

2. Edit each `rules.md` with strict bounded-context rules.

3. Ask for a plan:

```text
/ddd:plan <ticket>
```

4. Execute the workflow:

```text
/ddd:run <ticket>
```

The run prompt instructs Pi to plan by dependency order, implement changes, run tests, and update each affected `STATE.md`.

## Tool exposed to the model

The extension also registers `ddd_contexts`, a model-facing tool to list, read, or initialize context memory.
