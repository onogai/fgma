# Figma token inspection

Local, read-only tools for inspecting an extracted Figma `canvas.fig` and collecting evidence for a CSS theme from selected design pages.

## Setup

Requires Node.js and npm. Install the decoder using the version already validated in your local project:

```sh
npm install --no-save --package-lock=false openfig-core@VERSION
```

Replace VERSION with the installed/validated version. If the dependency is already available in local node_modules, skip this step.

## Whole-document inventory

```sh
npm run inspect -- /path/to/canvas.fig inspection
```

Outputs `variables.raw.json` (collections, modes and variables) and `structure.report.json` (page IDs, node counts and field frequencies).

## Selected-page evidence

Choose the page IDs from the structure report.

```sh
npm run inspect:scope -- /path/to/canvas.fig PAGE_ID [PAGE_ID ...]
```

Page IDs use the sessionID:localID format. Output: `inspection-scope/scope.raw.json`.

The report contains page/section inventory, selected-page node properties, candidate component dependency subtrees, referenced style candidates, and diagnostic lists of instances without a candidate and ambiguous references. It preserves hidden layers, rich text data, variable bindings, instance overrides, layout and visual attributes. Candidate matching is not an effective-style or instance-override resolver; unresolved or ambiguous references must be reviewed. No CSS theme is generated automatically.

The scope export additionally includes ancestor records (without automatically exporting unrelated sibling trees), property-definition owners, raw document-wide variable collections and variables, candidate dependencies discovered through symbol swaps, a typed reference ledger with requested versions, an override-path inventory, and missing/ambiguous reference diagnostics. These fields are additive to the original scope format. They do not evaluate effective visibility, property defaults, mode selection, or override precedence. Missing external library data cannot be reconstructed from a local file.

```sh
npm run check
npm test
```

Checks syntax and synthetic dependency-closure cases. The scope export includes all decoded document variables, including string values; inspect locally before sharing.

## Privacy

This repository is public. Never commit source designs, generated reports, client-specific IDs, credentials or private data. Review generated JSON before sharing; it can include design text, names and overrides. Keep outputs in ignored directories.
