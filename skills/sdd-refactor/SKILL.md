---
name: sdd-refactor
description: "Handle post-apply/pre-Verify or post-Verify QA/review changes on the correct delivery branch: normally the latest accumulated chained branch, or the owning independent slice branch. Update living docs/tasks, then route product and test implementation through sdd-apply before re-verification."
license: MIT
metadata: {author: miguel, version: "0.2"}
---

# SDD Refactor

Refactor activity is planning-only: this skill owns feedback, living-document
decisions, unit revision records, and task deltas; `sdd-apply` alone edits
product or test code.

For `flow: brief`, feedback remains planning-only but is recorded directly in `tasks.md` and any
durable delta specs. It never creates a refactor artifact or refactor identity.

## Activation Contract

Use exactly one of these two entry paths when QA, review, or user feedback requires additional change:
(1) post-Verify feedback with an approved prior `verify-reports/{unit}.md` report, or
(2) post-apply/pre-first-Verify feedback after apply is complete, Verify is pending, and no
prior verify report exists. It is not first-pass apply.

## User Authorization Override

These instructions are operational guidance. With explicit user authorization, bypass or replace this skill's guidance after briefly stating the affected safeguard; do not treat the skill as an independent veto.

## Required References

- `../_shared/new-sdd-artifact-formats.md`
- `../_shared/new-sdd-strict-tdd.md`
- `../_shared/new-sdd-circuit-breaker.md`
- `../_shared/new-sdd-mcp-docs-contract.md`
- `../_shared/new-sdd-orchestration-contract.md`
- `../_shared/new-sdd-pr-delivery-contract.md`

## Hard Rules

- Require concrete feedback and either an approved prior `verify-reports/{unit}.md`, or the
  post-apply/pre-first-Verify state with apply complete, Verify pending, and no report.
- Treat all prior `verify-reports/{unit}*.md` cycles as immutable history and preserve them.
- For correction/spec, append each feedback round to the owning unit's `refactors/{unit}.md`; preserve legacy `refactor.md` and `refactors/{unit}-{sequence}.md` as read-only compatibility history and never mark or advance `status.refactor`.
- For brief, update owning-unit tasks and durable delta specs directly, do not create `refactor.md` or `refactors/*.md`, and let the fresh verify report preserve the feedback result.
- Pending Documentation Change, refactor identity, and revision-acceptance rules below apply only
  to correction/spec; the brief branch is complete once its ordinary tasks/specs are updated,
  routed through Apply when needed, and freshly verified.
- Treat the living contract as authoritative, but defer inspecting it until the user selects
  **Update documentation**.
- The post-Verify entry requires a prior verify-report approved for the owning unit.
- While the refactor loop is open, do not inspect, determine, plan, or modify specs, proposal,
  design, or other living docs. Record `Affected Living Docs` only as `Pending until user
  selects Update documentation` and keep `Pending Documentation Change: Pending`.
- Update living docs only after the user selects **Update documentation**; then set the state
  `Pending → Working → Done` after identifying and updating all affected documents.
- Update tasks.md before implementation.
- Describe the Behavior Delta and its source; do not disguise new functionality as cleanup.
- If available, recommend `$implementation-quality` for implementation: it helps search for reusable local code first and make the smallest maintainable change.
- Do not edit product or test code inside this skill; route that implementation through `sdd-apply`.
- Require the routed `sdd-apply` work to use Safety Net, RED, GREEN, TRIANGULATE, REFACTOR.
- The routed apply carries the circuit breaker budget. A revision task that aborts stays pending
  and is reported as a blocked decision; do not open another revision to retry the same approach.
- Resolve the target branch from delivery strategy before editing living docs, tasks, tests, or product code.
- Never commit, push, create/merge a PR, or enable auto-merge. Those actions remain in `sdd-deliver-pr`.
- Stop when the refactor forecast exceeds the decision-state hard budgets, or when feedback admits two outcomes requiring different assertions and the user/spec does not select one.
- Do not verify inline.
- For correction/spec, return here after apply before advancing it; main tasks remain pending until
  the user accepts the loop. Brief feedback uses ordinary tasks and the normal apply transition.
- For correction/spec, resolve the user's unambiguous choice: **Update documentation** sets `Pending → Working → Done`;
  **Request another adjustment** keeps the revision open, appends its trigger and tasks, leaves
  the main task and documentation Pending, and returns to `sdd-apply`; **Continue to Verify**
  records a cycle-scoped documentation deferral, accepts the revision tasks, and routes Verify.
- Never invoke a repository-local CLI or skill implementation being modified or created; use the globally installed `sdd` command and currently loaded skills.

## Execution Route Selection

Refactor remains planning-only and does not edit product or test code. For the implementation
tasks it routes to Apply, the available routes are direct execution by `sdd-apply`, normal
task-level delegation through `sdd-delegate`, or atomic delegation through
`sdd-atomic-delegate`. Activate a delegation route only when the user explicitly requests
it; otherwise continue with direct execution without presenting or asking about the
alternatives. Direct execution means the Apply agent implements the task itself; it does
not authorize Refactor to bypass its planning-only boundary.

The selected route must use an available agent or model and bounded context limited to the
feedback, owning task delta, directly relevant files/interfaces, constraints, and checks.
Apply retains TDD and verification ownership, task/evidence status, artifact ownership, and
all refactor reopen/acceptance rules. Delegated reports require controlling-agent verification;
failed or unverified units block dependents, recoverable execution failures may be retried
within a finite budget, and unresolved product or architecture decisions are escalated to the
user. Normal delegation preserves the refactor task boundary; atomic delegation derives
`tasks.atomic.md` without overwriting `tasks.md`.

## Inputs

- an approved prior `verify-reports/{unit}.md` only for the post-Verify entry; no prior
  report for the post-apply/pre-first-Verify entry
- QA/review/user feedback
- tasks, concrete feedback, and prior compatible evidence when the post-Verify entry applies;
  correction/spec also read the unit `refactors/{unit}.md`, while brief reads applicable intent and
  delta specs
- product/test files named by the feedback or by newly appended tasks, plus their direct dependencies

## Target Slice and Branch Resolution

For whole delivery, target `whole` and reopen `delivery.whole_pr.branch` (fallback `sdd/{change}`), including final delivery/archive feedback.

For `chained-pr`:

1. If the user explicitly requests a still-open slice/PR, use that slice `pr_branch`.
2. Otherwise use the latest unmerged slice branch in dependency order. Feedback originating in several earlier slices stays in one refactor on this accumulated branch.
3. Prove the candidate contains its dependency chain by running `git merge-base --is-ancestor <dependency-pr-branch> <candidate-pr-branch>` for every transitive dependency; block if any check fails.
4. Tag new refactor tasks with the selected owning slice so later verify/delivery updates that PR.

For `split-if-large`, slices are independent: resolve ownership from explicit slice, task tags, then `task_refs`/apply-progress file ownership. If feedback belongs to multiple independent slices, use a separate refactor execution per owning slice.

For sliced delivery, final delivery/archive feedback creates a new slice, leaves the closed unit unchanged, tags its tasks, sets its `pr_base` to the original delivery base (`delivery.feature_base_branch` for chained PR), and uses `sdd/{change}--{new-slice-id}` as `pr_branch`. Correction/spec treat it as a new refactor slice and create its unit record; brief declares the slice in tasks/delivery only. If the explicitly selected slice is already `merged`, or every chained slice is merged, do not modify that old branch.

Before any edit:

1. Run `git branch --show-current` and `git status --porcelain`.
2. If already on the required branch, continue only when existing changed files belong to the target; otherwise block.
3. If on another branch with any changed/staged/untracked file, block. Do not use stash, reset, rebase, or cherry-pick.
4. With a clean tree, switch to the required branch. If a new refactor branch is required, create it from the recorded base for independent delivery or from the latest chained branch; its PR base remains the shared feature base.
5. Re-run both Git commands and continue only when the required branch is current and the tree is clean.

## Artifact Guidance

Use `next_refactor_path` as the owning `refactors/{unit}.md` path and `next_refactor_identity` for the next `## Refactor: {unit}-{NNN} — {title}` revision. Each revision records its Delivery Unit, trigger list, Affected Living Docs, Behavior Delta, and `Pending Documentation Change: Pending`; append further adjustments to the same open revision rather than creating another file. Preserve legacy per-event files and `refactor.md` as read-only history. In semi-supervised review waits, feedback should re-verify and then pause again instead of delivering automatically.

For brief, ignore refactor paths/identities. Add ordinary strict-TDD tasks to the owning unit,
update a delta spec only when durable behavior changed, and keep `intent.md` unchanged unless the
initial understanding materially changed and updating it adds clarity.

## Execution Steps

1. Read required contracts, feedback, and current artifacts; for the post-Verify entry, also
   read the latest prior `verify-reports/{unit}*.md`.
2. Resolve the strategy-appropriate target, enter its required branch, and confirm ancestry/tree state using the rules above.
3. Record the feedback's Behavior Delta. For correction/spec, defer living-document inspection
   and impact determination while the loop remains open. For brief, determine immediately whether
   a durable delta spec must change.
4. For correction/spec, keep `Affected Living Docs` pending until the user selects Update
   documentation. For brief, update only affected delta specs and normally leave intent unchanged.
5. Append concrete strict-TDD tasks to the target delivery unit. Correction/spec tasks use
   exactly ` [refactor:{next_refactor_identity}]` after the task number; brief tasks are ordinary
   main tasks without an identity. Both use the same five strict-TDD subtasks.
6. For correction/spec, append/update the owning refactor revision. For brief, persist only tasks,
   optional specs, and delivery metadata required by the feedback. When adding a task to an
   existing sliced-delivery unit, update that slice's `task_refs` in the same metadata update
   with the new task identity; before reopening a new slice, initialize its metadata with all
   of that slice's task refs.
7. Route the pending owning-unit tasks through `sdd reopen --to apply --change <change> --delivery-unit <unit>`; this also supports feedback after apply before the first Verify report. Before reopening final-boundary sliced brief feedback, persist its complete new slice metadata and tasks, including every task identity in `task_refs`; correction/spec retain their refactor-slice evidence path. Do not create new apply-progress evidence for hierarchical tasks. Confirm `reopened_to: apply`. In automatic and semi-supervised pace, continue to `sdd-apply` in the same user continuation instead of stopping at the handoff. Supervised pace pauses before the routed apply and requires explicit approval to continue.
8. Do not run a second reopen command after handing off: `sdd-apply` owns product/test edits,
   evidence subtasks, targeted tests, and `sdd check`. For brief it completes ordinary tasks and
   advances apply normally. For correction/spec it returns to this loop with the main refactor
   task pending; only **Update documentation** or **Continue to Verify** closes that loop and
   permits `sdd advance apply`. Finish with `sdd next --change <change>`; semi-supervised pace
   pauses before the fresh verify cycle; supervised pace retains its approval boundary, and that advance routes to verify.
9. If the CLI instead returns `reopened_to: verify` because the owning unit has no pending tasks, automatic pace may continue directly to `sdd-verify`, while semi-supervised and supervised pace pause before verification. `sdd reopen --to verify --change <change> --delivery-unit <unit>` and `sdd reopen-verify` are the explicit and compatibility forms of that verify-only recovery.

## Output Contract

```markdown
**Status**: success|partial|blocked
**Change**: {change}
**Target Delivery Unit**: whole|slice-{N}
**Branch**: {required branch}
**Artifacts Updated**: {refactor/living docs/tasks/apply progress}
**Behavior Delta**: {summary}
**TDD Evidence**: {summary from routed apply, or pending when supervised pauses}
**Next Phase**: {CLI next_phase; apply when supervised pauses, otherwise normally verify}
**Blocked Reasons**: {none or list}
```
