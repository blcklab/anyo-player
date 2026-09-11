# Release procedure

## 1. Prepare

- update `package.json` version;
- update `CHANGELOG.md`;
- keep public docs current;
- keep `.internal` notes repository-only;
- run the full release gate.

```bash
npm install
npm run check
npm pack --dry-run
```

## 2. Merge

Merge the release branch into the repository's protected release branch (`master` in the current workflow).

## 3. Tag

The tag must exactly match the package version.

```bash
git checkout master
git pull origin master
git tag v0.5.0
git push origin v0.5.0
```

The publish workflow rejects a tag that does not equal `v${package.json.version}`.

## 4. Publish

GitHub Actions runs the package gate and publishes with npm provenance. The workflow uses the `npm` GitHub environment and `NPM_TOKEN` when token authentication is configured.

## 5. Verify

After publication, verify the npm metadata, package contents, and CDN/no-build path before announcing the release.
