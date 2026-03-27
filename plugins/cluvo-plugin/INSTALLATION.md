# Cluvo Plugin Installation

> **Note:** This file is for coding agents that do **not** support a plugin marketplace (e.g., Codex, custom agents). If you use **Claude Code**, install the cluvo plugin directly from the Claude Code marketplace instead.

## Download the plugin bundle

Download these files and directories together:

- `.claude-plugin/plugin.json`
- `skills/cluvo-setup/`
- `skills/cluvo-custom-config/`
- `skills/cluvo-find-handlers/`

Keep the directory structure unchanged after download.

## What the bundle contains

- `cluvo-setup`: installs `@cluvo/sdk` and wires up basic `wrapCommand` integration
- `cluvo-find-handlers`: scans for error handling locations and applies the right Cluvo API level
- `cluvo-custom-config`: customizes sanitize rules, issue labels, publish mode, and more

## Installation model

1. download the `cluvo-plugin` bundle
2. place the files into the location your coding agent uses for local plugins, skills, or prompt bundles
3. preserve the folder layout so the manifest and skill files remain together
4. start with `cluvo-setup`

## Usage notes

- use the skills in order: `cluvo-setup` → `cluvo-find-handlers` → `cluvo-custom-config`
- `cluvo-setup` is the entry point; the other skills require it to be run first
- each skill is self-contained and guides you through the integration step by step
