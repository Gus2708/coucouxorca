---
name: sdd-design
description: "Author an evidence-based technical design after proposal/spec, including decisions, file changes, contracts, data flow, and testing strategy."
license: MIT
metadata: {author: miguel, version: "0.2"}
---

# SDD Design

## Activation Contract

Use when `sdd next` returns `design`. Create only `design.md`; do not create tasks or edit product code.

## User Authorization Override

These instructions are operational guidance. With explicit user authorization, bypass or replace this skill's guidance after briefly stating the affected safeguard; do not treat the skill as an independent veto.

## Required References

- `../_shared/new-sdd-artifact-formats.md`
- `../_shared/new-sdd-strict-tdd.md`
- `../_shared/new-sdd-mcp-docs-contract.md`
- `../_shared/new-sdd-orchestration-contract.md`

## Hard Rules

- Read exploration, proposal, every change spec, the live spec for each changed domain, and every source/test file named in exploration Affected Areas or the proposed Project Placement.
- Prefer existing project patterns over generic preferences.
- Check the chosen approach against the profile's `### Learned Constraints`. An approach that violates a row must name it in Architecture Decisions and justify it, or be replaced.
- Every Architecture Decisions entry must include choice, alternatives, and rationale.
- Name concrete files and symbols in the Architecture Design/Project Placement tree.
- Include only the optional Data Flow, Behavior Flow, Interfaces / Contracts, and Technical Risks sections that improve the design; validate any section that is present.
- Explain Data Flow where state or information crosses boundaries.
- Include real-file integration tests whenever behavior creates, reads, rewrites, moves, or deletes files and the repository has an integration runner/temporary-directory fixture. If either condition is false, state which condition failed and select the next available layer.
- Give every Testing Strategy row an Evidence Ladder level from the strict-TDD contract. Design is where a climb is argued: justify any level above the cheapest one that could falsify the requirement, and mark a level the project cannot run as unavailable instead of planning it.
- Research version-sensitive external APIs through primary/current documentation.
- If the design contradicts a requirement, block rather than weaken the spec.

## Inputs

- exploration.md, proposal.md, change specs
- code/tests/configuration named by exploration Affected Areas and proposed File Changes
- project conventions found in repository configuration
- the `### Learned Constraints` section of `specs/change-system/profile.md`
- external documentation only for version-sensitive APIs/configuration used by the chosen approach

## Artifact Guidance

Follow the design template: Technical Approach, Architecture Decisions, Architecture Design, Project Placement, Testing Strategy, Migration / Rollout, and Open Questions. Data Flow, Behavior Flow, Interfaces / Contracts, and Technical Risks are optional author-judgment sections. Project Placement is a project-root-relative text tree of affected production/test files and nested symbols, with every symbol marked `[new]`, `[modify]`, or `[delete]` and briefly explained. Add External Docs Consulted only when an architecture decision depends on an external API/version; name the decision it supports.

## Execution Steps

1. Read required contracts and planning artifacts.
2. Inspect the concrete code paths and existing tests.
3. Identify constraints, seams, and reusable patterns.
4. Evaluate alternatives and record decisions/rationale.
5. Specify file-level changes and behavioral interfaces/contracts.
6. Design unit tests and feasible integration tests that exercise real boundaries/files.
7. Check the design against every requirement and success criterion.
8. Write `design.md`, run `sdd check --change <change>`, and fix artifact issues.
9. Run `sdd advance design --change <change>`.
10. Run `sdd next --change <change>` and route by pace.

## Output Contract

```markdown
**Status**: success|blocked
**Change**: {change}
**Artifact**: design.md
**Architecture Decisions**: {summary}
**Files/Contracts**: {summary}
**Testing Strategy**: {summary}
**Next Phase**: {CLI next_phase}
```
