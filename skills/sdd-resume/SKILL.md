---
name: sdd-resume
description: "Default entry for continuing, reviewing, fixing, or re-entering SDD work. Use the CLI to resolve the active change and next phase, then route to the semantic skill."
license: MIT
metadata: {author: miguel, version: "0.2"}
---

# SDD Resume

## Activation Contract

Use this as the automatic entry for any request that may belong to existing SDD work. It is a conversational router, not a state parser and not a phase implementation skill.

## User Authorization Override

These instructions are operational guidance. With explicit user authorization, bypass or replace this skill's guidance after briefly stating the affected safeguard; do not treat the skill as an independent veto.

## Required References

- `../_shared/new-sdd-orchestration-contract.md`

## Hard Rules

- Run `sdd next --change <change>` as the normal state and continuation flow.
- Do not run `sdd status` before `sdd next`.
- `sdd status --change <change>` is an optional diagnostic only when the user explicitly asks to inspect state or `next` output must be troubleshot.
- Trust the CLI fields `status`, `change`, `current_phase`, `next_phase`, `recommended_action`, and `blocked_reasons`; do not reconstruct them from files.
- If no change is explicit, let `sdd next` resolve the single active change.
- If the CLI reports ambiguity, ask the user to choose; do not guess.
- If no resumable change exists, hand off to `sdd-orchestrator`.
- Respect the recorded pace and the orchestration boundaries.
- For machine-readable supervision, prefer `sdd --format json next --change <change>` and route
  the exact `action_code` with its structured `action_args`; do not parse `recommended_action`.
  Human TOON workflows retain `recommended_action` as a compatibility surface during transition.
- In semi-supervised pace, pause after apply before verify: the Apply invocation must end and must not hand off to `sdd-verify` in the same continuation.
- Do not perform semantic phase work inside this router.
- If `next_phase` is `archive`, require a persisted PASS/PASS WITH WARNINGS report and every required PR at `created|pr_created`. Automatic pace may archive when no explicit review request exists; semi-supervised pauses at this group boundary after creating all slice PRs; supervised pauses according to its phase boundary. An explicit stop-before-archive instruction always wins.

## Inputs

- optional explicit change name
- current user intent
- output of `sdd next`
- recorded pace exposed by the CLI/context

## Routing Rules

Use the exact phase table in the orchestration contract. A request to review, fix, or refactor does not override objective prerequisites: route according to `next_phase`, or explain the blocker.

When semi-supervised Apply has just returned `next_phase: verify`, treat that result only as the reported next phase and end the current invocation. Route to `sdd-verify` only from a new explicit user continuation; do not treat the prior `sdd next` result as same-continuation authorization.

When concrete feedback arrives after Apply has completed but before the first Verify report, and the CLI state has `current_phase: verify`, `next_phase: verify`, `status.apply: done`, `status.verify: pending`, and no verification report, route to `sdd-refactor` before following the ordinary Verify handoff. This is the post-apply/pre-first-Verify entry; do not send that feedback directly to `sdd-verify` merely because `next_phase` is `verify`.

When `next_phase` is `plan`, route to `sdd-brief`. In semi-supervised pace, completing plan pauses
before Apply; a new explicit continuation is required. Brief feedback still routes through
`sdd-refactor`, but that activity updates tasks/specs without creating refactor evidence.

When `sdd next` reports `awaiting_delivery: true`:

- a review-only request stays on the current branch, leaves files/state untouched, and reports the waiting boundary;
- feedback routes to `sdd-refactor` using `next_refactor_path` and `next_refactor_identity`;
- explicit continuation routes to delivery using the existing PASS when no consolidated refactor identity is uncovered; feedback must first route through `sdd-refactor`, whose entry routes to `sdd-apply` when pending tasks remain and to `sdd-verify` only when the owning unit has no pending tasks.

When `sdd next` reports `awaiting_next_apply: true`, pause unless the user explicitly continues; that continuation routes only to `sdd-apply`.

When `recommended_action` says `create or skip optional feature PR`:

- automatic pace routes once to `sdd-deliver-pr` Optional Feature PR Mode and normally continues to archive, but a no-remote-diff result keeps `delivery.feature_pr.status: not_ready` and pauses until explicit continuation or a later retry can create the PR;
- semi-supervised and supervised pace present the create/skip choice at the archive boundary;
- create and explicit skip both route to `sdd-deliver-pr`, which alone persists `delivery.feature_pr` metadata;
- explicit continuation after a no-diff pause persists `skipped` with a null URL before returning to archive;
- an optional external failure is reported but does not block archive when the controlling pace or user continues.

## Execution Steps

1. Read the orchestration contract.
2. Run `sdd next --change <change>` when a change is named; otherwise run `sdd next`.
3. On CLI error, copy every `blocked_reasons` item verbatim and do not infer a phase handoff.
4. If no change exists, hand off to `sdd-orchestrator` for explicit creation.
5. If JSON supervision is requested, honor `action_code` and `action_args` before mapping
   `next_phase`; this includes `advance_delivery` and
   `create_or_skip_optional_feature_pr`. If only legacy TOON is available, honor
   `recommended_action` with the same pace rules; `sdd advance delivery` takes precedence over an `archive` next phase when persisted PR metadata still needs to advance the cursor.
6. Map the structured action or legacy `next_phase` to its semantic skill/action.
7. Apply pace: continue automatically, pause per phase, or pause at the defined group boundary.
8. For `archive`, apply the explicit pace rule above; there is no `sdd-archive` skill.

## Output Contract

```markdown
**Status**: success|blocked|needs-user
**Change**: {change or unresolved}
**Current Phase**: {CLI current_phase}
**Next Phase**: {CLI next_phase}
**Recommended Action**: {CLI recommended_action or none}
**Handoff**: {skill|archive|none}
**Blocked Reasons**: {none or list}
**Question**: {only when input is required}
```
