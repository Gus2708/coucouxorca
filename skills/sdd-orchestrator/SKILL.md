---
name: sdd-orchestrator
description: "Start a new SDD change explicitly, optionally brainstorm, choose correction, brief, or spec flow and pace, initialize through the CLI, and route with sdd next."
license: MIT
metadata: {author: miguel, version: "0.2"}
---

# SDD Orchestrator

## Activation Contract

Use only when the user explicitly starts a new change, invokes orchestration, or `sdd-resume` establishes that no resumable change exists. Existing work belongs to `sdd-resume`.

When brainstorming is selected, it runs before repository initialization/change creation and returns its document to this skill. The orchestrator remains the SDD entry point.

## User Authorization Override

These instructions are operational guidance. With explicit user authorization, bypass or replace this skill's guidance after briefly stating the affected safeguard; do not treat the skill as an independent veto.

## Required References

- `../_shared/new-sdd-orchestration-contract.md`

## Hard Rules

- The skill decides semantic flow and pace; the CLI creates canonical files and controls routing.
- Do not edit indexes or reconstruct state manually.
- Prefer configured creation with `sdd new <change> --flow <flow>` plus the selected `--pace`,
  `--mode`, and `--verbosity`; when a legacy CLI cannot create configured state, use
  `sdd configure --change <change> --flow <flow>` before the transition-era routing fallback.
- Run `sdd init` unconditionally from the project root before `sdd new`. The command is idempotent: it preserves existing canonical files and creates missing ones. A nonzero exit (for example, a canonical file/directory collision) blocks creation; report the CLI error without repairing paths implicitly.
- Create a kebab-case change with `sdd new <change>`.
- Recommend `correction` only for a localized defect/correction whose expected behavior is already known, with one target spec domain, no public interface/schema/migration change, and a focused forecast of at most 400 changed lines and 12 product files.
- Default normal functional work to `brief`. Recommend `spec` only when explicit staged/multi-file review adds value or public contracts, irreversible risk, or coordinated multi-domain behavior warrants separate approval gates. An explicit user choice of brief overrides that recommendation.
- Ask when two or more plausible choices would change flow, acceptance behavior, pace, or explicit constraints and the user has not selected one. Do not ask about values covered by documented defaults.
- Default to strict TDD, strict review, draft PRs, and `semi-supervised` pace unless the user chooses otherwise.
- In `semi-supervised` pace, keep apply and verify as separate phases, but continue refactor through its routed apply without pausing; pause after that apply before the follow-up verify. In `supervised` pace, pause before the routed apply.
- Leave delivery strategy unresolved until tasks/correction can forecast the work.
- Do not use `sdd status` as a handoff prerequisite. Route with `sdd next --change <change>`.
- If the user explicitly requests brainstorming, hand off immediately to `sdd-brainstorming`; do not ask whether they want it.
- Recommend brainstorming only when the Idea Vagueness Gate classifies the request as very vague. Do not offer it for a sufficiently defined request or merely because implementation details are unknown.
- When an orchestrator-started brainstorm returns successfully, use its Initial Direction as the request and choose `correction`, `brief`, or `spec` with the normal flow-selection gates. Do not preselect a flow merely because brainstorming occurred.

## Inputs

- user request
- optional change name
- requested flow/mode/pace, if any
- optional completed `docs/brainstorms/{topic}.md` returned by `sdd-brainstorming`

## Idea Vagueness Gate

Evaluate these three elements using only the user request:

1. **Problem / opportunity**: what is wrong, missing, or worth improving.
2. **Target users / context**: who encounters it or where it occurs.
3. **Observable outcome**: what should become possible or different.

Classify the idea as **very vague** only when at least two elements are absent. Then recommend brainstorming and ask one yes/no question using the question tool.

- If accepted, hand off to `sdd-brainstorming` in `orchestrator-preflight` mode.
- If declined, remain in orchestrator and ask only the missing preflight decisions required to select flow and describe the change.
- If zero or one element is absent, do not mention brainstorming; continue normal orchestration.
- A request is explicit when it contains “brainstorm”, “brainstorming”, “lluvia de ideas”, “idear”, or directly asks to compare possible product ideas before defining the change. It bypasses classification and starts brainstorming immediately.

## Preflight Decisions

- Flow: `correction`, `brief`, or `spec`.
- Spec mode: `standard` or `strict`.
- Pace: `automatic`, `semi-supervised`, or `supervised`.
- Blocking product questions and explicit constraints.

Record these in the CLI-created `decision-state.md` without changing its schema. Do not resolve PR topology prematurely.

## Fields Orchestrator May Edit

After `sdd new`, edit only these existing fields:

| Field | Value rule |
|---|---|
| `flow` | Use the selected `correction`, `brief`, or `spec`. |
| `mode` | Use `standard` for correction. For brief/spec, use `strict` only when explicitly requested or when the change affects authorization, destructive/data migration behavior, or an externally consumed public interface; otherwise use `standard`. Intent depth remains independent of mode. |
| `pace` | Preserve an explicit user choice. Otherwise use `supervised` for strict mode and `semi-supervised` for correction/standard brief/spec. |
| `verbosity` | Preserve an explicit choice; otherwise use `concise`, independently of flow and mode. |
| `tdd_mode` | Set `strict`. |
| `review_mode` | Set `strict`. |
| `pr_mode` | Set `draft`. |
| `decisions` | Keep a list of concise strings only for explicit durable choices not represented by another field. If brainstorming was used, append exactly `Brainstorming source: docs/brainstorms/{topic}.md`. |
| `open_questions` | Keep a list of unresolved questions. Before advancing, resolve any question that could change flow, scope, or observable behavior; non-blocking questions may remain. |
| `updated_at` | Replace with the current UTC timestamp in ISO 8601 format after saving the edits. |

Do not add fields. Preserve the YAML types created by `sdd new`.

## Fields Orchestrator Must Leave Unchanged

- `change`: keep the value created by `sdd new`.
- `artifact_store`: keep `files`.
- `pr_strategy`: keep `unresolved` until `sdd-tasks` or `sdd-correction` resolves delivery.
- `delivery.model`: keep `unresolved`; leave `whole_pr`, `feature_base_branch`, `active_slice`, `next_slice`, and `slices` unchanged.
- `review_budget_lines`, `review_hard_limit_lines`, `review_budget_files`, and `review_hard_limit_files`: preserve CLI defaults.
- `current_phase`, `next_phase`, `status`, `artifacts`, and `blocked_reasons`: do not edit; CLI commands own them.

## Execution Steps

1. Confirm this is new work: the user explicitly requested creation, or `sdd-resume` returned no resumable change. Otherwise hand off to `sdd-resume`.
2. Apply the Idea Vagueness Gate before running CLI commands.
3. On explicit brainstorming intent, or accepted recommendation, hand off to `sdd-brainstorming` and stop this invocation.
4. When that orchestrator-preflight brainstorm returns, read its Initial Direction and continue to normal flow selection; if the user cancelled it, stop without creating a change.
5. Run `sdd init` unconditionally from the project root. Continue only on exit code 0.
6. Infer or ask for a concise kebab-case change name.
7. Recommend `correction`, `brief`, or `spec` from the completed Initial Direction using the flow-selection gates above, then resolve pace.
8. Run `sdd new <change> --flow <flow>` with the selected optional routing values when the CLI
   supports configured creation.
9. If the created state remains unresolved, run `sdd configure --change <change> --flow <flow>`
   with the selected optional routing values. Only when neither surface is available may the
   transition fallback update the fields listed above; re-read the state and preserve all
   CLI-owned fields.
10. Run `sdd next --change <change>`.
11. For an external supervisor, request JSON and route the returned `action_code` and
    `action_args`; for human TOON output, route the legacy fields without changing their
    semantic ownership. Then hand off to the phase skill returned by the CLI.

## Output Contract

```markdown
**Status**: success|blocked|needs-user
**Change**: {change}
**Flow**: correction|brief|spec
**Pace**: automatic|semi-supervised|supervised
**Next Phase**: {CLI next_phase}
**Handoff**: sdd-brainstorming|sdd-correction|sdd-brief|sdd-exploration|none
**Brainstorming Document**: {path or none}
**Blocked Reasons**: {none or list}
```
