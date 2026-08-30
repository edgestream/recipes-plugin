# GitHub Issues

Every GitHub issue for this repository requires a complete title and
description plus the following metadata:

- **Type**: choose exactly one of `Bug`, `Feature`, or `Task`.
- **Priority**: choose exactly one of `Low`, `Medium`, `High`, or `Urgent`.
- **Effort**: choose exactly one of `Low`, `Medium`, or `High`.

Use GitHub's native issue type and organization-level issue fields rather than
labels or text in the issue body. Verify the selected values after creating or
editing the issue.

## Description format

Write the issue description in English and use the following sections in this
order. Keep it focused on the user-visible problem or intended outcome; link to
source code, documentation, screenshots, logs, or external examples as needed.

### Required sections

1. `## Summary` — one concise paragraph describing the problem or requested
   outcome.
2. `## Expected behavior` — the observable result after the work is complete.
3. `## Acceptance criteria` — a checklist of specific, testable conditions that
   define completion.

### Type-specific sections

- **Bug**: add `## Actual behavior` and `## Reproduction` before `## Expected
  behavior`. Include the smallest reliable reproduction, relevant input or URL,
  and the observed error or result.
- **Feature**: add `## Motivation` before `## Expected behavior` and, where
  useful, `## Scope` to state intentional boundaries or non-goals.
- **Task**: add `## Context` before `## Expected behavior`; state the concrete
  deliverable and dependencies if applicable.

### Optional sections

- `## Investigation` — confirmed technical facts, affected files, or links that
  help implementation. Separate facts from hypotheses.
- `## Implementation notes` — constraints or a possible approach. Do not turn a
  suggestion into an architectural decision without supporting context.
- `## Verification` — required tests, manual checks, or runtime verification
  beyond the acceptance criteria.

Do not invent a reproduction, cause, or implementation approach. State unknowns
explicitly. Do not duplicate metadata such as Type, Priority, or Effort in the
description.

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

## API procedure

The values in the issue sidebar are organization-level issue fields, not
project-specific custom fields. Use the GitHub REST API through `gh` to manage
them.

1. Confirm access with `gh auth status`. Listing organization fields requires
   `read:org`; setting issue types and field values requires repository write
   access. The `project` scope is additionally required only when using Project
   GraphQL queries.
2. List organization fields, their numeric IDs, and option names with
   `gh api orgs/edgestream/issue-fields`. Do not assume IDs or option names;
   field values use the exact option names.
3. Set the native issue type with:

   ```bash
   gh api --method PATCH repos/edgestream/recipes-plugin/issues/<number> \
     -f type=<Bug|Feature|Task>
   ```

4. Add Priority and Effort without clearing any unrelated existing fields with
   `POST repos/edgestream/recipes-plugin/issues/<number>/issue-field-values`.
   Send a JSON object containing an `issue_field_values` array. Each element
   requires a numeric `field_id` and a `value` matching the field option name.
   CLI form arguments serialize field IDs as strings, so use a JSON request body
   when numeric IDs are required.
5. Do not use the corresponding `PUT` endpoint unless intentionally replacing
   every existing issue-field value; it clears values absent from its request.
6. Verify issue fields with:

   ```bash
   gh api repos/edgestream/recipes-plugin/issues/<number>/issue-field-values
   ```

   Verify the issue type separately with:

   ```bash
   gh api repos/edgestream/recipes-plugin/issues/<number>
   ```

If GitHub credentials cannot read or write issue fields, report that
authorization blocker and do not claim the metadata was set. Never include
access tokens or other credentials in issue content, commands recorded in the
repository, or agent output.
