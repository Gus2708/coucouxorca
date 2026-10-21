---
name: sdd-spec
description: "Author observable domain delta specs from proposal capabilities using requirements and Given/When/Then scenarios."
license: MIT
metadata: {author: miguel, version: "0.2"}
---

# SDD Spec

## Activation Contract

Use when `sdd next` returns `spec`. Create domain artifacts at `specs/changes/{change}/specs/{domain}/spec.md`; do not design or implement.

## User Authorization Override

These instructions are operational guidance. With explicit user authorization, bypass or replace this skill's guidance after briefly stating the affected safeguard; do not treat the skill as an independent veto.

## Required References

- `../_shared/new-sdd-artifact-formats.md`
- `../_shared/new-sdd-orchestration-contract.md`

## Hard Rules

- Map every proposal Capability to the correct domain.
- Describe observable behavior, never internal implementation.
- Use normative requirements and concrete Given/When/Then scenarios.
- For each Modified/Removed/Renamed Capability domain, read `specs/specs/{domain}/spec.md`; if it is absent, block instead of inventing an existing requirement.
- A `MODIFIED` requirement must reproduce the full updated requirement block, including unchanged scenarios that remain valid.
- Use `ADDED`, `MODIFIED`, `REMOVED`, and `RENAMED` only for their intended delta semantics.
- Preserve stable requirement identity/names when behavior changes.
- Block when two or more plausible outcomes would produce different GIVEN/WHEN/THEN assertions and the proposal/user decision does not select one.

## Inputs

- proposal.md, especially Capabilities
- exploration.md
- live specs for every Modified/Removed/Renamed Capability domain under `specs/specs/{domain}/spec.md`
- user decisions

## Semantic Quality

Each scenario must state a precondition that changes whether/how the trigger behaves, one externally observable trigger, and outcomes a test can assert. Add an error, boundary, or alternate scenario for every such behavior named by the proposal; do not invent unnamed variants. Avoid scenarios that merely assert an internal function call.

## Execution Steps

1. Read the artifact contract, proposal, exploration, and the exact live specs selected by the rule above.
2. Split capabilities into domain delta files.
3. Write full requirements with observable Given/When/Then scenarios.
4. For `MODIFIED`, carry forward all still-valid text and scenarios.
5. Cross-check that every capability is covered and no unexplained behavior was added.
6. Write all domain `spec.md` artifacts.
7. Run `sdd check --change <change>` and repair structural/semantic omissions.
8. Run `sdd advance spec --change <change>`.
9. Run `sdd next --change <change>` and route by pace.

## Output Contract

```markdown
**Status**: success|blocked
**Change**: {change}
**Artifacts**: {domain specs}
**Requirements/Scenarios**: {counts}
**Next Phase**: {CLI next_phase}
**Open Questions**: {none or list}
```
