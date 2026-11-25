# Figma token inspection

Local, read-only inspection of an extracted Figma `canvas.fig` using `openfig-core`. The goal is to understand variable collections, modes, aliases and styles before implementing normalized design-token extraction and CSS theme generation.

## Setup

Requires Node.js and npm. Install the decoder with an exact version (prefer the version already validated in your existing local project):

```sh
npm install --save-exact openfig-core
```

If you know the existing version, use `npm install --save-exact openfig-core@VERSION` instead. Keep the resulting package lock for reproducibility.

## Run

```sh
node inspect-tokens.mjs /path/to/canvas.fig inspection
```

The input must be the extracted binary canvas, not the entire exported archive. The script defaults to `canvas.fig` and output directory `inspection`.

Outputs:
- `variables.raw.json`: original variable and collection records, preserving modes and aliases.
- `structure.report.json`: node counts, page mapping, field frequencies and style diagnostics.

## Privacy

This repository is public. Keep source design files, credentials and generated reports local. Review output before sharing it anywhere. Custom output directories outside the ignored paths are not automatically protected.

## Status

Initial inspection script imported from prior work. Runtime validation against the actual canvas, token normalization, alias resolution and CSS generation remain to be completed.
