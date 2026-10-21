---
name: sdd-deliver-pr
description: "After successful verification, validate one delivery unit's scope, commit/push it, create or update its draft PR, persist metadata, and advance delivery. Automatic and semi-supervised pace follow different authorization rules; supervised pace requires approval. Never merge PRs."
license: MIT
metadata: {author: miguel, version: "0.2"}
---

# SDD Deliver PR

## Activation Contract

Use after a persisted PASS/PASS WITH WARNINGS `verify-reports/{unit}.md`. Automatic pace authorizes immediate delivery, semi-supervised pace requires explicit continuation and reuses the PASS when no refactor event is uncovered, and supervised pace requires explicit user approval.

## User Authorization Override

These instructions are operational guidance. With explicit user authorization, bypass or replace this skill's guidance after briefly stating the affected safeguard; do not treat the skill as an independent veto.

## Required References

- `../_shared/new-sdd-pr-delivery-contract.md`
- `../_shared/new-sdd-orchestration-contract.md`

## Hard Rules

- In automatic and semi-supervised pace, follow the authorization rules exactly: automatic pace delivers immediately after passing verify, while semi-supervised pace delivers only after the review pause and explicit continuation when no refactor event is uncovered. In supervised pace, require explicit approval.
- Run `sdd check --change <change>` before any Git write.
- Operate on exactly one verified delivery unit.
- Derive the expected file set from owning tasks, verification `Files Changed`, the consolidated refactor record when applicable, and delivery metadata; stage no unrelated file.
- If working tree/index ownership is ambiguous, return blocked. Do not stash, reset, rebase, cherry-pick, or improvise cleanup.
- Create or update only a draft PR; never create a duplicate when persisted metadata identifies an existing open PR.
- For `chained-pr`, every slice targets the same `delivery.feature_base_branch`; never the previous slice branch. `depends_on` is sequencing, not a stacked base.
- A chained PR may have a temporary cumulative diff while dependency PRs remain open. Validate
  only the current slice's staged commit during delivery; reviewers validate the effective PR
  diff after every dependency has merged.
- Never merge a PR and never enable auto-merge. PR delivery ends after draft PR creation and metadata persistence.
- When the supporting CLI provides it, persist the exact planned PR metadata with
  `sdd record-delivery --change <change> --delivery-unit <unit> --branch <head> --base <base>
  --url <url> --status <status>` before `sdd advance delivery`. Keep the legacy state-file
  update only as a transition fallback when that command is unavailable; it must preserve the
  same validation and no-merge guarantees.
- Respect repository commit conventions and planned deterministic branch names.
- Do not re-verify or edit product code here.
- Re-entry after an external GitHub or Git failure must be resumable: inspect the planned branch's local and remote tip and search for an open PR with the planned head/base before staging, committing, or creating anything again.
- Optional Feature PR Mode is a separate archive-boundary operation: it uses `delivery.feature_base_branch` as head and `delivery.base_branch` as base, must not commit or push, and does not block archive.
- `record-delivery` and `advance delivery` report the relative `changed_paths` bookkeeping set in their machine-readable output. A successful handoff reports only `specs/changes/{change}/decision-state.md` and `specs/change-system/changes-index.md`; an idempotent retry reports `changed_paths: []`.
- Treat those state/index paths as chain-owned for the delivered slice and the following slice. The dedicated post-PR bookkeeping commit stages only those paths, accepts an already-clean tree or completes a partial staging set, and rejects unrelated or ambiguous paths.
- Retry on the same branch and same base, updates the same chain PR, and never merges or creates a second PR.

## Inputs

- authorization: automatic delivery, semi-supervised explicit continuation with no uncovered refactor event, or supervised explicit approval
- passing persisted `verify-reports/{unit}.md`
- tasks.md, current delivery unit, the applicable verification report, and consolidated `refactor.md` entries
- planned PR branch/base and repository Git state

## Delivery Procedure

Validate preconditions and expected scope before branch creation. Stage exactly that set, re-check it, create one focused commit, and push with upstream. If persisted metadata identifies an existing open PR, validate its head/base and update that PR; otherwise create a draft PR whose head/base match the Delivery Plan. If any step cannot preserve scope, stop safely.

## Chained PR Behavior

- Create or update one draft PR per verified slice; create it only when no open PR is already persisted. As later slices become verified, automatic pace invokes this skill again without waiting for earlier PRs to merge.
- In semi-supervised pace, pause before every slice's Git delivery. After explicit continuation, reuse the PASS when no refactor event is uncovered; deliver only the active slice, then return control to the normal slice loop until all planned slices have PRs.
- After a semi-supervised sliced delivery, stop before the next slice's apply.
- Every slice PR uses its own `pr_branch` and the same `delivery.feature_base_branch` as base.
- Keep every PR open. Never merge a PR and never enable auto-merge.
- `depends_on` defines the required merge order and review order. A later draft may show a temporary cumulative diff, so maintainers review it only after every dependency is merged and confirm that the resulting diff is limited to that slice. This skill performs no merge or history-rewrite action.

## Optional Feature PR Mode

Use this mode only when `sdd next` recommends `create or skip optional feature PR` at the final chained archive boundary. It is not another delivery unit and does not run the normal staging, commit, push, or `sdd advance delivery` steps.

1. Resolve head from `delivery.feature_base_branch` and base from `delivery.base_branch`; require non-empty distinct branch names.
2. On explicit skip, run `sdd record-delivery --change <change> --delivery-unit feature --branch <head> --base <base> --status skipped` when available; otherwise use the legacy state-file fallback. Persist `delivery.feature_pr.status: skipped` with `url: null` and return archive routing without a remote write.
3. On create, inspect the remote branches and search open PRs by exact head/base before any create call. Reuse exactly one matching open PR and persist its URL.
4. If no match exists, create one draft PR only when the remote head/base comparison has a diff. On no remote diff, keep `delivery.feature_pr.status: not_ready`, return an optional warning, and pause before archive even in automatic pace; never create an empty commit merely to open the PR. Only explicit continuation after that warning persists `skipped` with a null URL and returns archive routing.
5. Persist a reused or created PR with `sdd record-delivery --change <change> --delivery-unit feature --branch <head> --base <base> --url <url> --status created` when available; otherwise use the legacy state-file fallback. This records `delivery.feature_pr.status: created` with its URL and never creates a duplicate for a previously persisted or externally discovered match.
6. Multiple matches, mismatched persisted metadata, or an external lookup/create failure return an optional warning without mutation. The operation does not block archive, and automatic pace attempts it once before continuing unless the no-diff pause above applies.

This mode must not commit or push, never merges or enables auto-merge, and leaves all slice PR metadata unchanged.

## Execution Steps

1. Read the PR delivery contract and confirm automatic authorization, semi-supervised explicit continuation with no uncovered refactor event, or supervised explicit approval.
2. Run `sdd check --change <change>`.
3. Read verified-unit evidence and compute the expected file set.
4. Compare expected files with working tree and index; block on extras/missing/ambiguity.
5. Resolve branch and base from the Delivery Plan.
6. Create/switch the exact branch recorded in Delivery Plan only after scope validation. Confirm its merge-base belongs to the planned base; if the branch exists with different lineage, return blocked without branch surgery.
7. Before repeating any write, inspect the planned branch's local HEAD, `git ls-remote` branch tip, and open PRs matching the planned head/base. Reuse an already published delivery commit and matching open PR; block on ambiguity or mismatched head/base.
8. Stage exactly the expected files and validate the staged set again only when the delivery commit is not already published.
9. Commit and push with upstream when needed. If the delivery metadata or external lookup identifies an existing open PR with the planned head/base, update that PR; otherwise create the draft PR.
10. Prefer `sdd record-delivery --change <change> --delivery-unit <unit> --branch <head> --base
    <base> --url <url> --status <status>` to persist the resulting PR metadata. The command is
    idempotent and does not advance the cursor; use the documented legacy state-file fallback
    only when the command is unavailable.
11. Run `sdd advance delivery --change <change>` after `sdd record-delivery` so the CLI validates
    persisted PR metadata, advances `delivery.active_slice`, and resets the apply/verify gates.
    Do not rely on `sdd next` to mutate state. Report the route. For chained delivery with
    pending slices, continue to the next delivery unit without waiting for merges; if it returns
    archive, leave the optional Feature PR recommendation and archive decision to the controlling
    skill/review boundary.
12. After `sdd advance delivery` succeeds, collect the `changed_paths` from both
    `sdd record-delivery` and `sdd advance delivery` and take their union. If the union is empty,
    no bookkeeping commit is needed. Otherwise, require it to contain only
    `specs/changes/{change}/decision-state.md` and `specs/change-system/changes-index.md`, inspect
    the worktree and index for unrelated or ambiguous paths, and stop blocked if any are present.
    Complete any partial staging set with only those chain-owned paths, then create the dedicated
    bookkeeping commit, push it to the same planned branch, and update the existing chain PR
    with the same head/base; never create a second PR. An already-clean tree is a no-op.
13. If registration succeeds but advancement or the bookkeeping commit fails, retry from the
    existing `changed_paths` handoff. Do not restage product files, change the planned branch or
    base, create another PR, or merge.

## Output Contract

```markdown
**Status**: success|blocked
**Change**: {change}
**Delivery Unit**: {whole|slice-id}
**Branch**: {head}
**Base**: {base}
**PR**: {draft URL}
**Next Phase**: {CLI next_phase}
**Blocked Reasons**: {none or list}
```
