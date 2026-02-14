# Release Process

## 1) Prepare

1. Ensure `main` is green and review-ready
2. Update `CHANGELOG.md` for this release
3. Run:

```bash
npm install
npm run check
```

4. Execute manual smoke checks:
   - SSH connect/disconnect and reconnect
   - transfer queue, retry, and conflict strategy
   - transfer recovery and audit visibility

## 2) Version Bump

Choose one:

```bash
npm version patch
npm version minor
npm version major
```

Rules are in `docs/UPGRADE_POLICY.md`.

## 3) Tag and Push

```bash
git push origin main --tags
```

## 4) GitHub Release

- Create release from the version tag
- Paste changelog highlights
- Attach build artifacts (if generated in CI)

## 5) Post Release

- Create next milestone
- Move unfinished items back to `Unreleased`
- Start next iteration branch
