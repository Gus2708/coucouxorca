---
name: sdd-verify
description: "Execute tests and semantically verify tasks, scenarios, design, TDD evidence, changed-file coverage, and assertion quality before delivery/archive."
license: MIT
metadata: {author: miguel, version: "0.2"}
---

# SDD Verify

## Activation Contract

Use when `sdd next` returns `verify` and either the recorded pace is automatic or Verify is entered from a new explicit user continuation after a pace boundary; an explicit user request to verify also authorizes entry. A `next_phase: verify` result produced inside semi-supervised Apply does not authorize this skill in that same continuation. This is a semantic quality gate for the current delivery unit, not PR review.

## User Authorization Override

These instructions are operational guidance. With explicit user authorization, bypass or replace this skill's guidance after briefly stating the affected safeguard; do not treat the skill as an independent veto.

## Required References

- `../_shared/new-sdd-verify-contract.md`
- `../_shared/new-sdd-strict-tdd.md`
- `../_shared/new-sdd-circuit-breaker.md`
- `../_shared/new-sdd-mcp-docs-contract.md`
- `../_shared/new-sdd-pr-delivery-contract.md`
- `../_shared/new-sdd-orchestration-contract.md`

## Hard Rules

- Execute tests; inspection alone is not verification.
- Judge only the current delivery unit; future-slice tasks are not incomplete evidence.
- Map every applicable task and scenario to implementation code, an executed covering test, and asserted observable outcomes.
- A scenario is `COMPLIANT` only when its test reaches the trigger and asserts every relevant THEN. Weak existence/non-null assertions, unreachable triggers, and snapshot-only evidence are insufficient.
- Attempt adversarial refutation: inspect invalid states, boundaries, side effects, regressions, assertion strength, and whether tests can pass without the behavior.
- Classify findings as `CRITICAL`, `WARNING`, or `SUGGESTION`; missing strict evidence is CRITICAL.
- Promote every CRITICAL or WARNING whose root cause is a repeatable environment, tooling, or convention error into a Learned Constraint in `specs/change-system/profile.md`, and name its `LC-NNN` in the Findings row. Findings specific to this change's own logic record `None` instead.
- Direct remediation is allowed only for an unequivocal violation of an existing task/spec/design contract. It may span the files necessary inside the active unit, has no arbitrary size limit, and must not add functionality or make a product decision.
- For direct remediation, add a meaningful RED test, implement the smallest GREEN correction, triangulate where useful, rerun affected tests, update `tasks.md`, Files Changed, findings, and this report, and re-review affected requirements.
- Bound direct remediation with the circuit breaker: two consecutive attempts per finding, then abort that remediation, record the root cause in the report, and leave the finding classified rather than continuing to patch.
- Ambiguous or out-of-contract findings must not be changed; record FAIL or blocked and route to `sdd-refactor`.
- Preserve each verification cycle at `verify-reports/{unit}.md` or the allocated `verify-reports/{unit}-{cycle:03}.md`; never overwrite an earlier cycle.
- For correction/spec, inspect the active unit's `refactors/{unit}.md` revisions (and legacy `refactor.md` compatibility evidence) plus immutable prior reports. Brief feedback is represented by tasks/specs and has no refactor artifact.
- If Pending documentation has no matching same-cycle deferral, offer **Update documentation** or explicit continuation. Consume a matching deferral from the immediately preceding refactor loop without prompting twice. On continuation, record a stable debt ID, `pending` state, and brief description; on completion, record the same ID as `resolved`.
- A documentation debt may produce `PASS WITH WARNINGS` only when no other blocker exists. Reevaluate unresolved debt in every later cycle or revision and never carry a decision to another unit.
- In automatic pace, call `sdd-deliver-pr` without prompting after PASS/PASS WITH WARNINGS and completed-unit gates.
- In semi-supervised pace, the initial verify for a slice must pause with `awaiting_delivery`; explicit continuation reuses the PASS when no refactor event is uncovered and authorizes delivery of only the active slice. Review or QA changes must first use `sdd-refactor`, whose uncovered event requires verification.
- In supervised pace, explicit approval is required before that handoff.
- For the final unit of `chained-pr`, include a `## Feature PR Recommendation` section with `delivery.feature_base_branch` as head and `delivery.base_branch` as base. State explicitly that creation is optional and archive remains permitted; verification never creates the PR.

## Inputs

- current delivery unit and changed files
- applicable tasks, intent, correction/spec, proposal, and design
- `tasks.md`, prior `verify-reports/{unit}*.md`, and non-brief refactor evidence when present
- repository test/build/quality commands

## Verification Method

Build the full report defined in the verify contract: Completeness, Build & Tests Execution, Files Changed, the Spec Compliance Matrix mapping requirement/scenario to implementation path, an Executed test, and Asserted outcomes, TDD Compliance, Changed File Coverage, Coherence, Assertion Quality, classified Findings, remediation/re-review evidence, limitations, PR Readiness, and Verdict. Derive TDD Compliance from `tasks.md`, the diff, executed tests, and assertions, including a meaningful second case when applicable. Inspect assertions, not merely test names or green output.

## Execution Steps

1. Read the required contracts, current artifacts, all prior cycles, and the active unit's evidence.
2. Run the profile's `### Verification Entry Point` when it is recorded. Only when it is absent or does not cover a category, resolve that category from the profile's tool tables, then `pyproject.toml`, package/task configuration, or CI. Mark categories `Not configured` only when no source defines them.
3. Execute named tests and real-file integration tests for filesystem behavior when available.
4. Build the semantic matrix and attempt refutation of every applicable task/scenario.
5. Evaluate unit-scoped `Pending Documentation Change` states before the verdict: consume an immediately preceding same-cycle deferral once, otherwise prompt for synchronization or explicit debt continuation and persist the stable debt ID in the new report.
6. If an existing-contract violation is determined, perform strict RED/GREEN/TRIANGULATE/REFACTOR remediation under the circuit breaker budget and re-review it. On abort, record the root cause and leave the finding classified. Otherwise classify the finding and route to refactor without inventing behavior.
7. Promote qualifying findings to Learned Constraints using the artifact formats write rules, allocating the next free `LC-NNN` without renumbering existing rows.
8. Persist the next collision-free `verify-reports/{unit}` cycle, including documentation debt state, findings and their constraint IDs, corrections, limitations, final verdict, and the final chained `## Feature PR Recommendation` when applicable; run `sdd check --change <change>`.
9. On PASS/PASS WITH WARNINGS, run `sdd advance verify --change <change>`.
10. Apply PR authorization after all are true: verdict is PASS/PASS WITH WARNINGS, current-unit tasks are complete, `sdd check` passes, and `sdd advance verify` succeeds. Persist `Covered Refactors`. In automatic pace call `sdd-deliver-pr` without prompting; in semi-supervised pace pause after the initial pass and require explicit continuation, reusing the PASS when no refactor event is uncovered; in supervised pace ask for approval.
11. After delivery or an explicit skip, run `sdd next --change <change>`. Automatic pace continues through slices without merge waits; semi-supervised pace pauses at each delivery boundary and at archive. When final chained delivery returns the create-or-skip recommendation, let `sdd-resume` route the optional Feature PR decision to `sdd-deliver-pr`; otherwise route archive normally. After that optional decision, run `sdd archive --change <change>` when pace permits unless review or an explicit stop-before-archive instruction wins. The optional PR never changes the verification verdict or archive eligibility.

## Output Contract

```markdown
**Status**: success|blocked
**Change**: {change}
**Delivery Unit**: {whole|slice-id}
**Verdict**: PASS|PASS WITH WARNINGS|FAIL
**Tests**: {executed results}
**Critical Issues/Warnings**: {none or list}
**PR Action**: not-ready|automatic-delivery|prompted|deliver-pr|skipped
**Next Phase**: {CLI next_phase}
```
