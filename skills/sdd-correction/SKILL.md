---
name: sdd-correction
description: "Plan a small localized correction in correction.md plus tasks.md, preserving behavior/spec/design/TDD rigor in a compact flow."
license: MIT
metadata: {author: miguel, version: "0.2"}
---

# SDD Correction

## Activation Contract

Use when `sdd next` returns `correction`. Perform focused exploration and create `correction.md` plus `tasks.md`; do not implement.

## User Authorization Override

These instructions are operational guidance. With explicit user authorization, bypass or replace this skill's guidance after briefly stating the affected safeguard; do not treat the skill as an independent veto.

## Required References

- `../_shared/new-sdd-artifact-formats.md`
- `../_shared/new-sdd-strict-tdd.md`
- `../_shared/new-sdd-pr-delivery-contract.md`
- `../_shared/new-sdd-orchestration-contract.md`

## Hard Rules

- Correction eligibility is objective: exactly one target live-spec domain; forecast `<= 400` changed lines and `<= 12` product files; no public interface/schema/data migration; and no change requiring coordinated behavior across two independently deployable modules. If any check fails or is unknown after the focused read, use spec flow.
- Do not edit product code.
- Keep a complete compact contract: Problem, Scope, Success Criteria, Spec Delta, Design, Project Placement, TDD Notes, risks, and questions.
- The Spec Delta must use a Target Domain and a full affected requirement, not a prose patch.
- Include current-bug and fixed-behavior scenarios when correcting a defect.
- Reproduce the defect before planning the fix. Locating the suspected code is not reproduction; a correction planned from a report alone fixes the wrong thing confidently. When reproduction is genuinely impossible, record why under Risks, name what would make it reproducible, and treat the correction as unproven until a test reproduces it.
- Always create strict-TDD checkbox tasks with a First failing test.
- Select the target test layer with the Evidence Ladder in the strict-TDD contract and name its
  level in TDD Notes alongside the layer. A correction is small: prefer the cheapest level that
  reproduces the defect.
- Require a real-file integration test when the corrected behavior creates, reads, rewrites, moves, or deletes files and an integration runner exists. If the runner is absent, make adding it a task or record the explicit downgrade before implementation.
- Use whole/single draft PR delivery only; otherwise switch to spec flow.

## Inputs

- user request and decisions
- the single target live spec named by the correction
- source/test/configuration files reached from the reported command/symbol by direct call/import references
- CLI-created change context

## Artifact Guidance

Follow the full Correction Artifact and Tasks Artifact templates. `correction.md` combines proposal, one-domain delta spec, smallest safe design, compact Project Placement, risks, and TDD Notes; Project Placement replaces a separate Files table and does not duplicate its paths elsewhere. `tasks.md` includes Review Workload Forecast, whole Delivery Plan, and RED/GREEN/TRIANGULATE/REFACTOR/verification tasks.

## Execution Steps

1. Read required contracts, reproduce the reported behavior, follow direct call/import references to its first change seam, inspect its current tests, and read the single target live spec.
2. Confirm correction eligibility; otherwise return to orchestration for the default brief flow or
   spec when separate review phases are justified.
3. Define Problem, In/Out Scope, and observable Success Criteria.
4. Write the one-domain Spec Delta and smallest evidence-based design.
5. Define test layers, First failing test, and verification commands.
6. Write `correction.md` and `tasks.md`.
7. Run `sdd check --change <change>` and fix artifact issues.
8. Run `sdd advance correction --change <change>`, then `sdd advance tasks --change <change>` because correction flow creates and completes both artifacts before apply.
9. Run `sdd next --change <change>` and route by pace.

## Output Contract

```markdown
**Status**: success|blocked
**Change**: {change}
**Artifacts**: correction.md, tasks.md
**Target Domain**: {domain}
**First Failing Test**: {test/layer}
**Review Forecast**: {lines/files}
**Next Phase**: {CLI next_phase}
```
