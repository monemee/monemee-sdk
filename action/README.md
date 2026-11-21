# Monemee Release (GitHub Action)

Neue Version veröffentlichen, und deine Käufer haben sie: Die Action lädt die Datei hoch und ersetzt sie **im bestehenden Produkt**. Die Download-Links bisheriger Käufer bleiben gültig und liefern ab sofort die neue Version.

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
      - run: npm ci && npm run build && cd dist && zip -r ../meine-app.zip .
      - uses: monemee/monemee-dev/action@v1
        with:
          api-key: ${{ secrets.MONEMEE_API_KEY }}
          product-id: 123
          file: meine-app.zip
```

- **API-Key:** Monemee → Einstellungen → API-Keys. In GitHub unter *Settings → Secrets → Actions* als `MONEMEE_API_KEY` ablegen.
- **Dateitypen:** `.exe`, `.msi`, `.sh`, `.dll` und Ähnliches nimmt Monemee aus Sicherheitsgründen nicht direkt an. Verpacke sie als `.zip`.
- **Ausgaben:** `module-id`, `file-url`.
