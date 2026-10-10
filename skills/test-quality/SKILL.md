---
name: test-quality
description: Required whenever adding, modifying, planning, auditing, or running automated tests, or reporting validation. Focuses coverage on application-owned contracts and concrete regressions, requires investigation of test blockers, and distinguishes executed coverage from skipped or unstarted checks.
---

# Test Quality

Treat tests as maintained production code, not as a coverage inventory. Test application-owned behavior and credible regressions rather than translating each changed declaration or code branch into an assertion.

## Before writing tests

1. Identify the requirement, invariant, failure mode, or prior regression the change owns.
2. Map each proposed test to an externally meaningful outcome: returned value, persisted state, state transition, side effect, authorization decision, error contract, filtering result, or boundary behavior.
3. Inspect nearby tests for project conventions, but do not copy a pattern merely because it exists. Extend an existing table or helper when the new case shares its setup and assertions; introduce separate structure only when the behavior requires it.
4. Prefer the cheapest test level that exercises the real contract without reproducing the implementation.

Do not assume every production-code change needs a new test. Existing higher-level coverage may already protect it, and stable framework behavior can be trusted.

## Value gate

Add or retain a test only when it has a clear answer to all of these:

- What application-owned contract or concrete regression does this protect?
- What realistic implementation defect would make it fail without requiring the framework or language runtime itself to be broken?
- Does the assertion observe behavior rather than restate the implementation?
- Is the behavior not already covered more effectively elsewhere?
- Will the test remain useful through a reasonable internal refactor?

If the only answer is “this line/declaration was added,” omit the test.

## Usually omit

- Conventional association, getter, setter, delegation, or dependency-injection wiring tested by round-tripping the objects just configured.
- Built-in framework validations, enum helpers, ORM persistence, or library behavior with no application-specific logic.
- Shared concern, mixin, or helper behavior repeated for every class that includes it.
- Generic public-ID, timestamp, factory-validity, constructor, or serialization-shape tests when the model does not customize that behavior.
- Assertions that a mock was called exactly as the implementation is written when the interaction is not itself a contract.
- Tests added only to mirror branches, increase coverage, or enumerate all changed symbols.

These are heuristics, not bans. Test framework integration when custom keys, scopes, callbacks, configuration, overrides, compatibility boundaries, or past regressions create a real application risk.

## Prefer

- Business invariants and negative paths.
- Non-default lifecycle behavior such as retention, cascade, restriction, retry, timeout, and rollback semantics.
- Custom validation conditions and boundaries, without retesting the framework primitive beneath them.
- Queries and scopes through included and excluded records.
- State transitions and their disallowed transitions.
- Permission boundaries, externally visible errors, persistence constraints, and regression reproductions.

For declarative framework code, assert the application outcome created by a meaningful non-default option. For example, test that deletion is blocked or a discarded record is retained; do not enumerate both directions of an ordinary ORM association.

## Execution and blocker recovery

1. Identify the changed contract and which existing tests exercise it. Inspect repository test commands, harness initialization, required tool versions, and relevant skip conditions before assuming external infrastructure is needed. Integration and end-to-end tests may provision their own dependencies.
2. Run the smallest set of checks sufficient to exercise that contract, plus repository-required checks. Include integration or differential tests when those establish the behavior; unit-only checks are not automatically sufficient. Do not require live production validation unless the changed contract actually needs it.
3. Investigate setup failures before declaring a blocker. For a missing executable, inspect documented setup and installed tool locations, including versioned package-manager installations such as Homebrew formula prefixes. Verify compatibility with the repository's required version, then retry using a command-scoped `PATH` or a supported explicit binary path. Do not silently substitute an incompatible version.
4. Keep recovery scoped and bounded. Use safe, authorized local setup; ask before installing software, changing persistent configuration, or touching shared infrastructure. Do not bypass guardrails, disable checks, weaken assertions, or endlessly retry an unchanged failure. Keep laptop-specific workarounds out of shared code and documentation.
5. Inspect results for skipped tests, missing prerequisites, and filters that matched no tests. Distinguish passed, failed, skipped, and never started. A successful process exit does not establish coverage when the relevant tests did not execute.
6. Report which changed behavior was exercised and any meaningful remaining gap. For an unresolved blocker, give the attempted command, observed failure, discovery or recovery attempted, and remaining prerequisite. Separate setup failures from assertion failures. Do not replace this evidence with test counts or generic "full suite/production validation not run" caveats.

Keep command-level diagnostics in the session or subagent handoff; follow the PR skill's rules for what belongs in a public description.

## Final deletion pass

Before declaring the change complete, inspect every added or materially changed test independently of the implementation:

1. State the plausible application defect it catches.
2. Check whether another test already catches that defect.
3. Delete it if it only confirms stable framework behavior, repeats a shared helper's own coverage, or mirrors a declaration without protecting an application outcome.
4. Keep test names behavior-oriented and keep setup, action, and assertions visually distinct when repository conventions require it.

Do not preserve a weak test merely because it passes or was already written during the task.
