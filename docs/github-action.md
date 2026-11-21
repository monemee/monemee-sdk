---
title: Deliver app updates to buyers from GitHub Releases
description: A GitHub Action that uploads each release to your Monemee product. Buyers get the new version through the download links they already have.
permalink: /github-action/
updated: 2026-11-22
---

# Deliver app updates from GitHub Releases

<p class="lead">Publish a release on GitHub and every existing buyer can download the new version. The Monemee action replaces the file inside your product, so download links stay valid.</p>

```yaml
name: Monemee
on:
  release:
    types: [published]
jobs:
  upload:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci && npm run build && cd dist && zip -r ../my-app.zip .
      - uses: monemee/monemee-sdk/action@v1
        with:
          api-key: ${{ secrets.MONEMEE_API_KEY }}
          product-id: 123
          file: my-app.zip
```

## Setup

1. In Monemee, open *Settings > API keys* and create a key.
2. In your GitHub repository, add it under *Settings > Secrets and variables > Actions* as `MONEMEE_API_KEY`.
3. Add the workflow above and publish a release.

## Inputs and outputs

| Input | Required | Description |
|---|---|---|
| `api-key` | yes | Monemee API key (`monemee_...`) |
| `product-id` | yes | Your product ID |
| `file` | yes | Path to the release file |

Outputs: `module-id` and `file-url`.

## File types

For security reasons `.exe`, `.msi`, `.sh`, `.dll` and similar files are not accepted directly. Package installers as `.zip`.

## Add a buy button to your README

```markdown
[![Buy on Monemee](https://monemee.com/api/v1/products/123/badge.svg)](https://monemee.com/p/123)
```
