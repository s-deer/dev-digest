# Skills library

Reviewer skills for the two skill-driven agents. Each folder is one skill in the
Claude-skill layout: a `SKILL.md` with YAML frontmatter (`name`, `description`,
`type`) and a Markdown body with a **Rule**, a **Good** and a **Bad** example. The
`description` is the skill's interface, so it is written as a directive.

| Agent | Skills |
| --- | --- |
| Test Quality Reviewer | `uncovered-branches`, `boundary-cases`, `over-mocking`, `flaky-tests` |
| API Contract Reviewer | `breaking-change`, `response-schema`, `semver-discipline`, `deprecation-policy` |

These files are not loaded automatically. Import them from **Skills → Add Skill →
Import from file** (the database is the source of truth), then attach them to the
agent on its **Skills** tab.

## Import fixtures

- Any `SKILL.md` here imports as a single `.md` file.
- `flaky-tests/` also contains `scripts/setup.sh` to check the archive path. Zip
  the folder and import the archive: the preview must list the script under
  "Ignored files", and the importer never runs it.

  ```sh
  cd docs/skills-library && zip -r /tmp/flaky-tests.zip flaky-tests
  ```
