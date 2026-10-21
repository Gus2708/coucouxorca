# New SDD MCP Docs Contract

## Purpose

Use live documentation tools such as Context7 for the version-sensitive cases listed below so technical decisions do not rely on stale model memory.

## When To Use

Consult Context7 or an equivalent MCP/docs tool before making decisions about:

- framework APIs
- library APIs
- package configuration
- build/test tooling
- migration guides
- deprecations or version-specific behavior
- unfamiliar platform features

If MCP/docs tools are unavailable, omit the project version, or return no answer for the API/configuration being decided, search official documentation, source repositories, standards, changelogs, or release notes before asking the user.

## Phase Rules

| Phase | Rule |
|---|---|
| `sdd-exploration` | Use docs when identifying framework/library constraints or comparing approaches. |
| `sdd-design` | Use docs before choosing an approach that depends on external APIs or version-specific behavior. |
| `sdd-apply` | Use docs before implementing unfamiliar APIs, configuration, or tooling behavior. |
| `sdd-verify` | Use docs when failures appear related to tooling, framework behavior, or configuration semantics. |

## Hard Rules

- Prefer official docs exposed through MCP/docs tools.
- If live docs are unavailable or insufficient, use web search before asking the user for technical facts that can reasonably be researched.
- Prefer official documentation, source repositories, standards, changelogs, release notes, and vendor docs over blogs or secondary summaries.
- Use docs only for an external API, package configuration, build/test tool, migration, deprecation, or platform feature named by the current decision. Do not research behavior implemented entirely in local project code.
- Record the consulted library/tool and the specific decision it informed.
- If docs and web search are unavailable or disagree, continue only when the repository pins the version and contains a passing test/example for the exact API/configuration. Otherwise state the unresolved fact and ask the user.
- Do not cite stale model memory as authoritative for current APIs.

## Output Evidence

When docs affected a decision, include a short note:

```markdown
### External Docs Consulted
- `{library/tool}`: {what was checked and how it affected the decision}
- `{source}`: {web source checked, if MCP docs were unavailable or insufficient}
```
