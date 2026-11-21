# monemee (CLI)

Verkaufe deine App über Monemee. Ein Befehl richtet alles ein.

```bash
npx monemee init
```

1. erkennt dein Projekt (Express, Next.js, React, Python …) und deinen Login (Cookie oder Token),
2. loggt dich im Browser bei Monemee ein (kein API-Key zum Kopieren),
3. legt dein Produkt an oder nimmt ein bestehendes,
4. schreibt `MONEMEE_APP_SECRET` (Testmodus) und `MONEMEE_PRODUCT_ID` in die `.env` und trägt sie in `.gitignore` ein,
5. bindet Monemee in deinen Code ein: Express-Server, Next.js-Route, React-Paywall.

Danach:

```bash
npx monemee test-buy     # Testkauf ohne Geld, echter Ablauf bis zur Freischaltung
npx monemee live         # Rücksprung-URL, Live-Secret, Webhook für dein Produktivsystem
npx monemee doctor       # prüft die Einrichtung
```

| Option | |
|---|---|
| `--yes` | Fragen mit dem Standardwert beantworten (CI, KI-Assistenten) |
| `--product <id>` | bestehendes Produkt verwenden |
| `--title`, `--price` | neues Produkt ohne Rückfragen |
| `--url <https://…>` | (`live`) Adresse deiner Live-App |
| `--ref <id>` | (`test-buy`) Testkauf für eine bestimmte Nutzer-ID |
| `--skip-install` | Pakete nicht installieren, nur Befehl anzeigen |
| `--base-url <url>` | andere Monemee-Instanz, z. B. Staging |

Der Login liegt unter `~/.config/monemee/credentials.json` (nur für dich lesbar). `npx monemee logout` löscht ihn. Widerrufen kannst du ihn in Monemee unter *Einstellungen → Verbundene Apps*.

MIT-Lizenz
