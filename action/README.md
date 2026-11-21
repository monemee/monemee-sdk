# Monemee Release (GitHub Action)

Publish a new version of your app and your buyers have it. The action uploads a release file and replaces it inside your existing Monemee product. Download links that buyers already received keep working and deliver the new version.

```yaml
# .github/workflows/monemee.yml
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

| Input | Required | |
|---|---|---|
| `api-key` | yes | Monemee API key (`monemee_...`) from *Settings > API keys*. Store it as a repository secret. |
| `product-id` | yes | Your Monemee product ID |
| `file` | yes | Path to the file, for example `dist/my-app.zip` |
| `base-url` | no | Only for testing against another Monemee instance |

Outputs: `module-id`, `file-url`.

For security reasons Monemee does not accept `.exe`, `.msi`, `.sh`, `.dll` and similar files directly. Package them as `.zip`.

MIT License
