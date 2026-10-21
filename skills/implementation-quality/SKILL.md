---
name: implementation-quality
description: Improve implementation quality for code changes in existing projects. Use whenever the user asks to build, modify, refactor, extend, or review code, components, services, hooks, modules, or UI and the agent should preserve architecture, reuse existing code, avoid duplication, and make the smallest maintainable change. Use this skill during the apply phase of SDD whenever implementation work is being performed. Prefer this before creating new helpers, abstractions, UI primitives, or project structure.
---

# Implementation Quality

## Goal
Produce code that fits the project: reuse first, minimal change, clear responsibilities, and low accidental complexity.

## Use
Apply this skill for real implementation work in established codebases. Skip it for throwaway scripts, pure brainstorming, or disposable prototypes.

## Programming principles
- **DRY:** do not duplicate logic, rules, or structure. Search, reuse, extract, or generalize first.
- **KISS:** prefer the simplest solution that fits the current codebase.
- **YAGNI:** do not add extension points, options, or abstractions without a present need.
- **Composition over inheritance:** prefer explicit composition and small units over deep hierarchies.
- **Consistency over novelty:** when local patterns conflict with generic ideals, prefer local consistency unless the task requires otherwise.

## Workflow
1. Read only the smallest useful context: nearby files, interfaces, tests, and config.
2. Identify local patterns for naming, layering, data flow, and UI composition.
3. Search before creating anything new. If unsure whether it exists, search more.
4. Decide in this order:
   - reuse existing code if it fits
   - refactor existing code if something close exists
   - create new only if neither is reasonable
5. Make the smallest sufficient change. Do not turn the task into broad cleanup.
6. Keep logic in the correct layer. Do not leak domain logic into UI, transport, or glue code.
7. Prefer composition, explicit dependencies, and simple control flow.
8. Add abstractions late. Use the Rule of Three unless duplication is already clearly harmful.
9. Validate only the affected behavior.

## Reuse and fit
- Do not copy/paste logic with minor variations.
- Do not create N similar files, components, or functions when one parameterized solution would do.
- Reuse existing components, hooks, services, helpers, tokens, and utilities before inventing new ones.
- If two implementations mainly differ by parameters, extract the shared part.
- If code is similar but not identical, refactor the existing path instead of creating a parallel implementation.
- Keep the project's vocabulary, file layout, naming, and API style.
- Reuse UI primitives and design tokens; do not hardcode design-system values.

## Code quality
- Use intention-revealing names.
- Keep each function/module focused on one clear job.
- Prefer readability over cleverness.
- Handle errors explicitly; avoid silent fallbacks.
- Remove dead branches, temporary scaffolding, and needless flags when safe.

## Red flags
Stop and reconsider if you are about to:
- create a helper without searching for one
- add an abstraction for a single use
- touch many files for a small request
- duplicate a component with cosmetic changes
- introduce a pattern nearby code does not use
- mix presentation, orchestration, and domain logic
- keep two near-identical implementations alive
- invent a new visual pattern before checking existing primitives or variants

## Decision rule
If several solutions work, choose the one that reuses more, duplicates less, changes less, and adds less complexity.

## Done when
- the request is solved
- no meaningful duplication was added
- the change matches local conventions
- design and architecture stay consistent
- the result is clearer or at least not worse
- affected behavior was validated
