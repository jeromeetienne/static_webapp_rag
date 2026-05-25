# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Coding Style

When generating TypeScript code, follow these conventions:

### Conditionals
- **Never use `!varName` in if conditions.** Always use explicit checks: `=== null`, `=== undefined`, `=== false`, `!== null`, `!== undefined`, etc.

### TypeScript
- Prefer `type` aliases and Zod schemas for data shapes
- Use `async/await` over raw Promises
- Avoid `any`; prefer `unknown` when the type is genuinely unknown
- Named exports only; no default exports

### Naming
- `camelCase` for variables and functions
- `PascalCase` for classes, interfaces, and type aliases
- `kebab-case` for file names
- `UPPER_SNAKE_CASE` for true constants

### Formatting
- 8-tab indentation
- Single quotes for strings
- Trailing commas in multi-line structures
- Semicolons required

### Code Organization
- All exported functions in a module must live in a static class named after the file (kebab-case → PascalCase). Example: `ai-client.ts` → `class AiClient { static … }`. Classes with internal state use instance methods instead.
- Early returns over deeply nested conditions
- No unnecessary comments — let code speak for itself
