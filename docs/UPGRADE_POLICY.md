# Upgrade Policy

## Semantic Versioning

Format: `MAJOR.MINOR.PATCH`

- **PATCH**: bug fixes, no behavior break
- **MINOR**: backward-compatible features
- **MAJOR**: breaking changes in behavior, API, or migration requirements

## Breaking Change Criteria

Any of the following should trigger a MAJOR release:

- IPC contract changes that break existing renderer/main compatibility
- behavior changes that alter default transfer/security semantics
- config schema changes requiring migration

## Migration Notes

For any release with compatibility risk:

1. add a "Migration" section in release notes
2. explain old vs new behavior
3. provide rollback or fallback path

## Deprecation Rule

- Mark old behavior in docs for at least one MINOR version before removing.
