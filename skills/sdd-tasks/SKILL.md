---
name: sdd-tasks
description: "Turn approved specs/design into an ordered strict-TDD checklist, forecast review workload, and choose whole or sliced PR delivery without implementing."
license: MIT
metadata: {author: miguel, version: "0.2"}
---

# SDD Tasks

## Activation Contract

Use when `sdd next` returns `tasks`. Create only `tasks.md`; do not implement.

## User Authorization Override

These instructions are operational guidance. With explicit user authorization, bypass or replace this skill's guidance after briefly stating the affected safeguard; do not treat the skill as an independent veto.

## Required References

- `../_shared/new-sdd-artifact-formats.md`
- `../_shared/new-sdd-strict-tdd.md`
- `../_shared/new-sdd-pr-delivery-contract.md`
- `../_shared/new-sdd-orchestration-contract.md`

## Hard Rules

- Read proposal, specs, design, and focused code evidence before planning.
- Read `review_budget_lines`, `review_hard_limit_lines`, `review_budget_files`, and `review_hard_limit_files` from `specs/changes/{change}/decision-state.md`; do not invent independent numeric defaults in the skill or template.
- Every task must be concrete, ordered, file-aware, verifiable, and traceable to a requirement/design decision.
- Record an Evidence Ladder level for every task that adds or changes a test. Do not default to `L2` when a cheaper level falsifies the requirement, and do not climb without stating what the cheaper level cannot prove.
- Use mandatory hierarchical syntax for new plans: `## Slice: {whole|slice-N} — Title`, one or more sequential `### Phase N: Description` headings, `- [ ] N.M description` main tasks, and exactly five indented `N.M.a`–`N.M.e` strict-TDD subtasks.
- Plan strict TDD vertically under each main task: Safety Net, RED, GREEN, TRIANGULATE, and REFACTOR. Keep `N.M.d` with an explicit reason when triangulation is structural and not applicable.
- Include a Review Workload Forecast and Delivery Plan.
- Forecast lines/files approximately from evidence; do not pretend exact pre-implementation counts.
- Use the decision-state target budgets as the preferred review envelope and the decision-state hard budgets as the non-negotiable ceiling; if a planned whole delivery or slice exceeds the hard budgets, narrow the design before continuing.
- Use `split-if-large` only for independent slices. Independent means both: no slice modifies the same product file as another slice, and each slice's tests pass from the common base without code from another slice. Otherwise use `chained-pr`.
- For `chained-pr`, every slice `pr_base` is the same `delivery.feature_base_branch`, not the previous slice branch. `depends_on` records sequencing only; this is not stacked PR delivery.
- For `chained-pr`, reuse the safe current branch as `delivery.feature_base_branch` when it is a safe current branch for every slice; otherwise use `sdd/{change}--base`. Do this without remote validation.
- For `chained-pr`, also persist the repository default branch as `delivery.base_branch` and initialize `delivery.feature_pr` as `{draft_pr: true, status: not_ready, url: null}`. This optional final PR is recommended later and is never an archive prerequisite.
- Later chained PRs may show a temporary cumulative diff until their dependencies merge. This is
  expected; creation-time scope validation applies to each slice's staged commit, while review
  waits for every dependency to merge and then validates the effective PR diff.
- Every new sliced implementation task belongs to its enclosing `## Slice:` heading; do not repeat a slice tag on each task. Legacy flat plans may retain their explicit tags.
- Do not pre-create speculative post-verify refactor slices.
- PR creation is draft-only after successful verify: automatic pace delivers immediately, semi-supervised pace pauses after initial verify and resumes on explicit continuation when no refactor event is uncovered, and supervised pace requires explicit approval.

## Inputs

- proposal.md, change specs, design.md
- correction.md when used by correction flow
- `specs/changes/{change}/decision-state.md`
- project tests/conventions
- user-selected delivery constraints, if any

## Planning Method

1. Map requirements/scenarios to implementation units.
2. Select each test level with the Evidence Ladder in the strict-TDD contract: the cheapest level that can falsify the requirement, naming what the cheaper level cannot prove whenever the plan climbs. Record the selected level in the task. If the selected level's harness is absent, record the downgrade in the task.
3. Order each unit so the failing test precedes production changes.
4. Forecast review burden and group cohesive work into reviewable delivery units.
5. Validate task-to-slice ownership and PR bases.
6. For `chained-pr`, persist `delivery.feature_base_branch` from the safe current branch when valid for every slice; otherwise persist the deterministic fallback `sdd/{change}--base` without checking whether that branch exists on a remote.

## Persistence Contract

Write the checklist to `specs/changes/{change}/tasks.md`. Read the four review-budget fields from `specs/changes/{change}/decision-state.md` and mirror those values in the Review Workload Forecast. Write only delivery planning fields to `specs/changes/{change}/decision-state.md`:

Writable roots: `pr_strategy`, `delivery.model`, `delivery.whole_pr`, `delivery.feature_base_branch`, `delivery.base_branch`, `delivery.feature_pr`, `delivery.active_slice`, `delivery.next_slice`, and `delivery.slices`.

| Model | State updates |
|---|---|
| Whole | `pr_strategy: single-pr`; `delivery.model: whole`; fill `delivery.whole_pr.branch` and `.base` from the PR contract; keep `.draft_pr: true`, `.status: not_ready`, `.url: null`; set `delivery.feature_base_branch` and `delivery.base_branch` to null; reset `delivery.feature_pr` to not-ready/null; set `delivery.active_slice` and `delivery.next_slice` to null; keep `delivery.slices: []`. |
| Sliced | `pr_strategy: split-if-large|chained-pr`; `delivery.model: sliced`; keep `delivery.whole_pr` unused/not-ready; set `delivery.active_slice` to the first slice and `delivery.next_slice` to the second (or null); fill `delivery.slices`. For chained PRs set `delivery.feature_base_branch`, set `delivery.base_branch` to the repository default, initialize `delivery.feature_pr`, and use the feature base as every slice `pr_base`; for split PRs keep both branch fields null, reset the optional PR metadata, and use the repository default branch. |

Each `delivery.slices` item must contain: `id`, `title`, `phase: apply`, `pr_branch`, `pr_base`, `draft_pr: true`, `pr_url: null`, `depends_on`, `estimated_lines`, `estimated_files`, `scope_summary`, `status: pending`, and `task_refs`. Use branch defaults from the PR delivery contract. `depends_on` never changes `pr_base`.

Do not edit `current_phase`, `next_phase`, `status`, or `artifacts`; `sdd advance tasks` owns the phase transition. Preserve every unrelated state field. Re-read both files after writing and confirm the Delivery Plan matches decision-state.

## Execution Steps

1. Read required contracts and planning artifacts.
2. Build requirement/design/test traceability.
3. Draft the Review Workload Forecast.
4. Resolve `single-pr`, `split-if-large`, or `chained-pr` from objective constraints.
5. Write Delivery Plan branches, common bases, dependencies, estimates, and scopes.
6. Write hierarchical strict-TDD checkbox tasks under each slice and numbered phase; reset the task number within each phase.
7. Ensure every scenario has a test task and each task has a source.
8. Write `tasks.md` and the matching decision-state delivery fields using the Persistence Contract.
9. Re-read both files, then run `sdd check --change <change>` and fix mismatches before continuing.
10. Run `sdd advance tasks --change <change>`.
11. Run `sdd next --change <change>` and route by pace.

## Output Contract

```markdown
**Status**: success|blocked
**Change**: {change}
**Artifact**: tasks.md
**Task Count**: {N}
**Review Forecast**: {lines/files/risk}
**Delivery Plan**: {whole or slices/strategy/base}
**Next Phase**: {CLI next_phase}
```
