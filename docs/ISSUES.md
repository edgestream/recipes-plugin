# GitHub Issues

Every GitHub issue for this repository requires a complete title and
description plus the following metadata:

- **Type**: choose exactly one of `Bug`, `Feature`, or `Task`.
- **Priority**: choose exactly one of `Low`, `Medium`, `High`, or `Urgent`.
- **Effort**: choose exactly one of `Low`, `Medium`, or `High`.
- **Labels**: choose at least one applicable topical or work-area label.

Use GitHub's native issue type and organization-level issue fields rather than
labels or text in the issue body for Type, Priority, and Effort. Labels
complement that metadata by describing durable subject areas such as MCP, UI,
transport, storage, import, search, CLI, ChatGPT, or documentation. Verify all
selected values after creating or editing an issue.

## Description format

Write the issue description in English and use the sections for its type in the
documented order. Keep it focused on the user-visible problem or intended
outcome; link to source code, documentation, screenshots, logs, or external
examples as needed.

### Required sections

1. `## Summary` — one concise paragraph describing the problem or requested
   outcome.
2. `## Expected behavior` — the observable result after the work is complete.
3. `## Acceptance criteria` — an unchecked Markdown task list (`- [ ]`) of
   specific, independently verifiable conditions that define completion. State
   outcomes rather than merely repeating implementation steps.

### Type-specific sections

- **Bug**: add `## Actual behavior` and `## Reproduction` after `## Summary` and
  before `## Expected behavior`. Include the smallest reliable reproduction,
  relevant input or URL, and the observed error or result.
- **Feature**: use the complete Feature template below. It adds `## Motivation`,
  `## Scope`, and `## Dependencies` before `## Expected behavior`, followed by
  the planning and risk sections.
- **Task**: add `## Context` after `## Summary` and before `## Expected
  behavior`; state the concrete deliverable and dependencies if applicable.

### Optional sections for Bug and Task issues

- `## Investigation` — confirmed technical facts, affected files, or links that
  help implementation. Separate facts from hypotheses.
- `## Implementation notes` — constraints or a possible approach. Do not turn a
  suggestion into an architectural decision without supporting context.
- `## Verification` — required automated tests, bundle or protocol smoke tests,
  manual checks, or metadata verification beyond the acceptance criteria.
- `## Risks` — applicable regression or delivery risks and their mitigations.

Do not invent a reproduction, cause, or implementation approach. State unknowns
explicitly. Do not duplicate metadata such as Type, Priority, Effort, or labels
in the description.

## Feature issue template

Copy this template for every Feature issue. Replace the guidance and examples;
do not leave placeholder text in the submitted issue. Keep a concise section
when it adds useful information, and use an explicit justified `Not applicable`
instead of filler when a risk category is irrelevant.

```markdown
## Summary

<!-- Describe the requested user-visible outcome in one concise paragraph. -->

## Motivation

<!-- Explain who needs this, the problem it solves, and why it matters. -->

## Scope

### In scope

- <!-- State an outcome or boundary included in this issue. -->

### Out of scope

- <!-- State material non-goals or work deliberately deferred elsewhere. -->

## Dependencies

### Strict blockers

- None
<!-- Or list only issues without which this work cannot proceed, for example:
- #123
-->

### Other relationships

- Optional integrations: None
- Preferred ordering: None
- Related work: None
- Documentation coordination: None
<!-- Keep non-blocking relationships here; do not create native blockers for them. -->

## Expected behavior

<!-- Describe the observable result after this Feature is complete. -->

## Acceptance criteria

- [ ] <!-- Add one independently verifiable outcome. -->
- [ ] <!-- Add another independently verifiable outcome. -->

## Investigation

### Confirmed facts and sources

- <!-- Record verified facts and links to supporting evidence. -->

### Hypotheses and unresolved decisions

- None
<!-- Clearly identify assumptions, open questions, and decisions still needed. -->

## Implementation notes

<!-- Outline possible steps and established constraints. Suggestions here are not
architectural decisions unless the issue links to an accepted decision. -->

## Verification

- Automated tests: <!-- Unit, integration, or contract tests, or not applicable. -->
- Bundle or protocol smoke tests: <!-- Required runtime checks, or not applicable. -->
- Manual end-to-end checks: <!-- User-visible workflow checks, or not applicable. -->
- GitHub metadata and relationship checks: <!-- Type, fields, labels, and dependencies. -->

## Risks

- Current-behavior regressions: <!-- Risk and mitigation, or not applicable with a reason. -->
- Compatibility: <!-- Risk and mitigation, or not applicable with a reason. -->
- Security and privacy: <!-- Risk and mitigation, or not applicable with a reason. -->
- Data integrity: <!-- Risk and mitigation, or not applicable with a reason. -->
- Performance and upstream load: <!-- Risk and mitigation, or not applicable with a reason. -->
- Documentation drift: <!-- Risk and mitigation, or not applicable with a reason. -->
```

Scope must record both included work and explicit non-goals whenever a boundary
is material. Dependencies must distinguish strict blockers from optional
integrations, convenient implementation order, related work, and documentation
coordination. Investigation must distinguish evidence from hypotheses.
Implementation notes are an outline or constraint set, not approval for a new
architecture. Verification should cover each applicable layer named in the
template. Risks should assess regressions to current behavior, compatibility,
security and privacy, data integrity, performance or upstream load, and
documentation drift; omit nothing applicable, but mark an irrelevant category
`Not applicable` with a short reason.

## Label assessment

Every issue created by an AI agent must receive an explicit label assessment
and at least one applicable topical or work-area label.

1. Inspect the complete issue scope and choose native Type, Priority, and
   Effort.
2. List the repository's current labels before selecting any:

   ```bash
   gh label list --limit 100 --json name,description,color
   ```

3. Select the smallest set of existing labels that accurately describes the
   materially affected subject areas. Reuse the established taxonomy whenever
   it fits.
4. Reject labels that only repeat the native Type. In particular, do not assign
   `bug` to a Bug or `enhancement` to a Feature. Documentation-only work receives
   `documentation`; add another label only when that area is materially affected.
5. Apply status or contributor labels such as `duplicate`, `invalid`, `wontfix`,
   `help wanted`, or `good first issue` only when that independent meaning is
   intentionally true.
6. Create a new label only when no existing label fits and the concept is
   reusable across future issues. Give it a consistent name, English
   description, and color.
7. Add selected labels without removing unrelated existing labels, for example
   with `gh issue edit <number> --add-label <label>`. Remove a label only when
   the requested change explicitly requires it.
8. Read the issue back, sort its labels, and compare the exact set with the
   intended set:

   ```bash
   gh issue view <number> --json labels \
     --jq '[.labels[].name] | sort'
   ```

If a `.github/ISSUE_TEMPLATE` file is added later, it must not preselect labels
that conflict with the native Type or bypass this topical-label assessment. If
credentials cannot create or assign labels, report the authorization blocker
and do not claim that labeling succeeded.

## Feature dependency assessment

Every Feature issue created by an AI agent requires an explicit dependency
assessment. Record `None` under strict blockers when the Feature can proceed
independently. Before creating it, inspect relevant open issues and their
existing dependency relationships; issue numbers, titles, optional
integrations, shared context, documentation coordination, and a preferred order
do not by themselves establish a blocker.

A strict blocker is work without which the Feature cannot proceed. Each
confirmed strict blocker must also be represented by GitHub's native `blocked
by` relationship during the same issue-creation workflow. A prose reference is
useful context but is not a substitute for the native relationship. Native
issue dependencies are repository metadata and do not require a GitHub Project
or the Project API.

Use the repository issue-dependency API directly, following the official
[GitHub REST API documentation](https://docs.github.com/en/rest/issues/issue-dependencies):

1. Resolve the new blocked issue's number and database `id`, and the number and
   database `id` of every confirmed blocker. The dependency mutation requires
   the blocker's numeric database `id`, not its issue number.
2. Read the new issue's current blockers before writing:

   ```bash
   gh api repos/edgestream/recipes-plugin/issues/<blocked-number>/dependencies/blocked_by
   ```

3. Reject a self-dependency or reversed relationship. Walk the prospective
   blocker's existing dependency graph far enough to reject a path back to the
   blocked issue, which would create a cycle. Compare the existing blocker set
   with the exact intended set, including unexpected extra blockers.
4. For each intended blocker that is absent, send exactly one request on the
   blocked issue. Build JSON with a numeric `issue_id`; do not pass it as a form
   string:

   ```bash
   blocking_id="$(gh api \
     repos/edgestream/recipes-plugin/issues/<blocking-number> \
     --jq '.id')"

   jq -n --argjson issue_id "$blocking_id" '{issue_id: $issue_id}' | \
     gh api --method POST \
       repos/edgestream/recipes-plugin/issues/<blocked-number>/dependencies/blocked_by \
       --input -
   ```

5. Do not perform a reciprocal write. GitHub automatically exposes the new
   relationship in the blocker's `blocking` view.
6. Read back both directions and compare them with the intended topology:

   ```bash
   gh api repos/edgestream/recipes-plugin/issues/<blocked-number>/dependencies/blocked_by
   gh api repos/edgestream/recipes-plugin/issues/<blocking-number>/dependencies/blocking
   ```

This procedure is additive: reruns skip relationships that already exist and
never remove unrelated dependencies. If credentials cannot write dependencies,
report the authorization blocker and do not claim that the relationship was
created.

### Current backlog example

The following verified topology demonstrates the distinction between topical
labels and native dependencies:

| Issue | Native Type | Topical labels | Strictly blocked by |
| --- | --- | --- | --- |
| #14 | Feature | `mcp`, `ui` | None |
| #15 | Feature | `mcp`, `search`, `ui` | #14 |
| #16 | Feature | `mcp`, `ui` | #14 |
| #17 | Feature | `mcp`, `transport` | None |
| #18 | Task | `chatgpt`, `documentation`, `mcp` | #17 |
| #19 | Task | `documentation`, `mcp` | #18 |
| #20 | Task | `documentation` | None |

The possible #15-to-#16 integration is optional, so neither issue blocks the
other. Completing #20 early is preferred ordering only and is not a strict
blocker for #14–#19.

## Pull request links

A pull request that fully implements an issue must link to it in the pull
request description as soon as the pull request is created. Add a standalone
line using a supported closing keyword, for example:

```text
Closes #123
```

Use `Closes`, `Fixes`, or `Resolves` with the issue number. Do not use
unsupported wording such as `Completes`. When the pull request targets the
repository's default branch, this creates the bidirectional Development link
while the pull request is still open and closes the linked issue when the pull
request merges.

Before merging, verify the relationship with:

```bash
gh pr view <number> --json closingIssuesReferences
```

If a pull request relates to an issue but must not close it, manually link the
pull request and issue in GitHub's **Development** sidebar instead. Do this
before merging; changing the description of an already merged pull request does
not reliably create a retrospective Development link.

## Issue creation and metadata procedure

The values in the issue sidebar are organization-level issue fields, not
project-specific custom fields. Use the GitHub REST API through `gh` to manage
them.

1. Confirm access with `gh auth status`. Listing organization fields requires
   `read:org`; setting issue types, field values, labels, and dependencies
   requires repository write access. The `project` scope is additionally
   required only when using Project GraphQL queries.
2. Inspect the issue scope and relevant open issues. Choose Type, Priority,
   Effort, and the smallest suitable topical label set. For a Feature, identify
   strict dependencies or explicitly conclude that there are none.
3. List organization fields, their numeric IDs, and option names with
   `gh api orgs/edgestream/issue-fields`. Do not assume IDs or option names;
   field values use the exact option names.
4. List and assess repository labels as described in [Label
   assessment](#label-assessment).
5. Create the issue with its complete description and selected labels.
6. Set the native issue type with:

   ```bash
   gh api --method PATCH repos/edgestream/recipes-plugin/issues/<number> \
     -f type=<Bug|Feature|Task>
   ```

7. Add Priority and Effort without clearing any unrelated existing fields with
   `POST repos/edgestream/recipes-plugin/issues/<number>/issue-field-values`.
   Send a JSON object containing an `issue_field_values` array. Each element
   requires a numeric `field_id` and a `value` matching the field option name.
   CLI form arguments serialize field IDs as strings, so use a JSON request body
   when numeric IDs are required.
8. Do not use the corresponding `PUT` endpoint unless intentionally replacing
   every existing issue-field value; it clears values absent from its request.
9. For a Feature, create each missing native strict dependency as described in
   [Feature dependency assessment](#feature-dependency-assessment).
10. Read back the issue and compare its exact native Type, Priority, Effort, and
    sorted label set with the intended values:

    ```bash
    gh api repos/edgestream/recipes-plugin/issues/<number>/issue-field-values
    gh api repos/edgestream/recipes-plugin/issues/<number>
    gh issue view <number> --json labels \
      --jq '[.labels[].name] | sort'
    ```

11. For a Feature, also verify the exact `blocked_by` set and every blocker's
    reciprocal `blocking` view. Treat a self-dependency, reversed relationship,
    cycle, missing blocker, or unexpected extra blocker as a verification
    failure. Report the final metadata, sorted label set, and dependency result.

Apply the same read-back and exact comparison after editing an existing issue;
do not limit verification to initial issue creation.

If GitHub credentials cannot read or write issue fields, labels, or
dependencies, report the authorization blocker and do not claim that the
metadata or relationship was set. Never include access tokens or other
credentials in issue content, commands recorded in the repository, or agent
output.
