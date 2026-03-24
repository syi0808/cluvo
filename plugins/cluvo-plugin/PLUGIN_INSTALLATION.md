# Cluvo Plugin — Consumer Guide

## Prerequisites

- A Node.js or Bun project with a `package.json`
- A GitHub repository for bug report submission

## Skills included

| Skill | Purpose |
|-------|---------|
| `/cluvo-setup` | Install `@cluvo/sdk` and add basic `wrapCommand` integration |
| `/cluvo-find-handlers` | Scan for error handling locations and apply appropriate Cluvo API |
| `/cluvo-custom-config` | Customize sanitize rules, issue labels, publish mode, and more |

## Recommended order

1. `/cluvo-setup` — always start here
2. `/cluvo-find-handlers` — add error reporting at specific try/catch locations
3. `/cluvo-custom-config` — tune configuration to match your project

## Required permissions

The plugin needs these tool permissions:

- **Bash**: package manager commands (`npm install`, `yarn add`, `pnpm add`, `bun add`)
- **Read**: reading project files (`package.json`, entry points, source files)
- **Write/Edit**: modifying source files to add Cluvo integration code
- **Glob/Grep**: searching for error handling patterns and existing configuration
