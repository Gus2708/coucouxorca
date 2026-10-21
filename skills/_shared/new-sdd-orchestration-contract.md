# SDD Orchestration Contract

## Purpose

Skills control semantic work; the `sdd` CLI controls state resolution, structural validation, phase transitions, sync, and archive. The normal routing source is `sdd next --change <change>`.

## Entry

- `sdd-resume` is the only automatic entry skill. It runs `sdd next` first.
- `sdd-orchestrator` is on-demand for a new change or an explicit flow start.
- `sdd status` is an optional diagnostic, not a prerequisite for `sdd next`.
- If `sdd next` reports no resumable change, hand off to `sdd-orchestrator`.

## Pace

- `automatic`: continue phases until a blocker or archive.
- `supervised`: pause after every phase and before a refactor's routed apply.
- `semi-supervised`: pause at the group boundaries below. Keep apply and verify as separate phases: completing Apply ends the current invocation, and a `next_phase: verify` result identifies the next phase without authorizing `sdd-verify` in that continuation. Verify requires a new explicit user continuation, but continue refactor through its routed apply without pausing, then end that continuation after Apply before the follow-up Verify. A verify-only refactor also pauses before Verify. Automatic pace may continue directly across these boundaries.

Correction groups:

```text
1. correction + tasks
2. apply
3. verify
4. optional refactor activity + routed apply
5. follow-up verify
6. archive
```

Brief groups:

```text
1. adaptive plan
2. apply
3. verify
4. optional feedback activity + routed apply
5. follow-up verify
6. archive
```

Spec groups:

```text
1. exploration
2. proposal + spec + design + tasks
3. apply
4. verify
5. optional refactor activity + routed apply
6. follow-up verify
7. archive
```

Refactor is a repeatable QA/review activity, not a CLI phase. It is planning-only:
it owns unit revisions, living-document status, user choices, and task deltas;
`sdd-apply` owns product/test edits. If it creates pending tasks, automatic and
semi-supervised pace route them immediately through `sdd-apply` in the same user
continuation; main tasks remain pending until the user accepts the loop. Supervised
pace pauses before that implementation. Its follow-up Verify always remains a
separate phase.

For sliced delivery, every planned slice follows the separate `apply -> verify -> sdd-deliver-pr` phases. Automatic pace does not pause between slices and does not wait for earlier PRs to merge. Semi-supervised pace pauses after apply before verify, must pause before every slice's Git delivery, and pauses after delivery before the next slice's apply; explicit continuation authorizes only the active slice's delivery or next apply. Supervised pace retains per-phase/approval pauses.

For final `chained-pr` delivery, `sdd next` may keep `next_phase: archive` while recommending `create or skip optional feature PR`. Automatic pace attempts it once through `sdd-deliver-pr` and then continues, except that no remote diff pauses with `not_ready` so the transient state can be retried; explicit continuation converts that state to `skipped` and resumes archive. Semi-supervised and supervised pace present the create/skip choice at their archive boundary. A created, reused, skipped, unavailable, or externally failed optional Feature PR never changes the verification verdict: archive remains permitted once the ordinary slice PR gates pass.

Brainstorming is optional and is not a CLI phase. It may run before `sdd-orchestrator` when invoked directly, or as an orchestrator preflight when the idea-vagueness gate selects it. It remains conversational without writing and persists one single concise topic document only on explicit request. Technical `exploration` remains the first phase of every spec flow.

## Phase Routing

| `next_phase` | Skill/action |
|---|---|
| `orchestrator` | `sdd-orchestrator` |
| `plan` | `sdd-brief` |
| `correction` | `sdd-correction` |
| `exploration` | `sdd-exploration` |
| `proposal` | `sdd-proposal` |
| `spec` | `sdd-spec` |
| `design` | `sdd-design` |
| `tasks` | `sdd-tasks` |
| `apply` | `sdd-apply` |
| `verify` | `sdd-verify` |
| `archive` | run `sdd archive --change <change>` |

Never infer the next phase from filenames when the CLI can resolve it.

## Subagent Mode

Subagents are used only when the user explicitly requests them. If used, preserve phase order and route semantic work to the exact roles below:

| Phase | Agent |
|---|---|
| exploration | `sdd-explorer` |
| plan, correction, proposal, spec, design, tasks | `sdd-planner` |
| apply, refactor activity | `sdd-implementer` |
| verify | `sdd-verifier` |

The controlling skill retains pace boundaries and runs the CLI transitions. If the host cannot provide requested subagents, report blocked rather than inventing agent names.

## Gates

- No tasks: no apply.
- No prior verify report: no post-verify refactor for correction/spec. Brief feedback is task/spec
  planning and may reopen before first Verify without a refactor artifact.
- A completed post-verify consolidated refactor entry with pending tasks must invoke the globally installed `sdd reopen --to apply --change <change> --delivery-unit <unit>` and route through `sdd-apply`; its follow-up verify cycle is mandatory. When the owning unit has no pending tasks, invoke `sdd reopen --to verify --change <change> --delivery-unit <unit>` before `sdd next`; that verify cycle is mandatory and prior reports remain preserved.
- Unresolved behavior: stop before spec or implementation.
- Failed verification or CRITICAL findings: no archive.
- When `sdd next` returns `archive`, the controlling skill executes archive only if the pace boundary and required approval/review are satisfied.
