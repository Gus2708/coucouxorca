---
name: sdd-exploration
description: "Explore real code and tests for an existing spec-flow change, compare technically viable approaches, and author exploration.md before proposal."
license: MIT
metadata: {author: miguel, version: "0.2"}
---

# SDD Exploration

## Activation Contract

Use when `sdd next` returns `exploration`. This is always a technical codebase phase. It creates only `specs/changes/{change}/exploration.md` and supplies evidence for proposal/design.

## User Authorization Override

These instructions are operational guidance. With explicit user authorization, bypass or replace this skill's guidance after briefly stating the affected safeguard; do not treat the skill as an independent veto.

## Required References

- `../_shared/new-sdd-artifact-formats.md`
- `../_shared/new-sdd-mcp-docs-contract.md`
- `../_shared/new-sdd-orchestration-contract.md`

## Hard Rules

- Read real code and tests; do not guess architecture.
- Prefer targeted search and bounded reads.
- Do not edit product files or author later-phase artifacts.
- Tie every Affected Areas entry to a symbol, test, configuration, or observed behavior.
- Compare real Options when more than one viable approach exists.
- Use current primary documentation for version-sensitive external APIs.
- Surface assumptions and Open Questions; block when they change expected behavior.
- Read the profile's `### Learned Constraints` and surface every row an Option could violate under Risks. Do not repeat rows no Option touches.
- Recommend restarting as correction only when focused evidence establishes all correction gates: one spec domain, no public interface/schema/migration change, and a forecast of at most 400 changed lines and 12 product files. Otherwise retain spec flow.

## Inputs

- user request and constraints
- change name
- project profile and repository configuration, including its `### Learned Constraints`
- source entry points named by the request or reached by one call/import/configuration edge
- tests that currently cover those entry points
- live specs for proposal/request domains
- brainstorming document referenced by decision-state, when present

## Artifact Guidance

Include: Request Understanding, Current State, Affected Areas with evidence, Existing Tests, Options with tradeoffs/risk/effort, Recommendation, Risks, Open Questions, and Ready For Planning. Record external docs consulted when they affected a decision.

## Execution Steps

1. Read required contracts, the user request, and the exact brainstorming document referenced by `Brainstorming source:` in decision-state when present.
2. Start from user-named commands/symbols/files; follow direct call, import, configuration, and test references until current behavior and the first change seam are evidenced.
3. Stop expanding the search when every Affected Areas row has a concrete symbol/test/configuration citation and every proposed option names its change seam.
4. Identify Existing Tests. Mark integration available only when the repository exposes an integration command/fixture; mark e2e available only when an existing e2e harness and command are present.
5. Compare Options and recommend one based on repository evidence.
6. Write `exploration.md` using the semantic authoring contract.
7. Run `sdd check --change <change>`; repair only artifact problems.
8. Run `sdd advance exploration --change <change>`.
9. Run `sdd next --change <change>` and route by pace.

## Output Contract

```markdown
**Status**: success|blocked
**Change**: {change}
**Artifact**: exploration.md
**Recommendation**: {one line}
**Affected Areas**: {list}
**Next Phase**: {CLI next_phase}
**Open Questions**: {none or list}
```
