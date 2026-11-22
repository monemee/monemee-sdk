# Contributing to the Monemee SDK

Thanks for helping. This repository contains the open-source SDK packages; the Monemee platform itself is not part of it.

## Report a bug

Open an [issue](https://github.com/monemee/monemee-sdk/issues/new/choose) with the package name and version, your runtime (Node, Python, browser, Electron), a minimal code example and what you expected. Questions about your Monemee account, payouts or a specific purchase belong in the support form of your dashboard, not here.

## Develop locally

```bash
git clone https://github.com/monemee/monemee-sdk.git
cd monemee-sdk
npm install
npm test                    # all JavaScript and Python packages
```

Requirements: Node.js 20 or newer, Python 3.9 or newer with `cryptography` for the Python tests.

| Folder | Package |
|---|---|
| `packages/cli` | `monemee` CLI |
| `packages/node` | `@monemee/node` |
| `packages/react` | `@monemee/react` |
| `packages/client` | `@monemee/client` |
| `packages/python` | `monemee` on PyPI |
| `action` | GitHub Action |

## Pull requests

- One topic per pull request, with tests for new behaviour.
- No new runtime dependencies without a good reason; the packages are deliberately dependency-free.
- Keep public APIs backwards compatible. Breaking changes need a major version.
- Add an entry to `CHANGELOG.md`.
- Never include secrets, real license keys or customer data in code, tests or issues.

## Releases (maintainers)

1. Bump `version` in the `package.json` of each changed package and in `packages/python/pyproject.toml`.
2. Move the `Unreleased` entries in `CHANGELOG.md` under a new `## [x.y.z] - YYYY-MM-DD` heading.
3. Tag and push: `git tag vx.y.z && git push origin vx.y.z`. The release workflow runs the tests, publishes changed packages to npm (with provenance) and PyPI, and creates the GitHub release from the changelog.
4. For the GitHub Action, move the major tag: `git tag -f v1 && git push -f origin v1`.

By contributing you agree that your contribution is licensed under the [MIT License](LICENSE) and that you follow our [Code of Conduct](CODE_OF_CONDUCT.md).
