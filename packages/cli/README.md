# monemee (CLI)

Sell your app through Monemee. One command sets up checkout, unlocking after purchase and access checks in your project.

[Monemee SDK](https://github.com/monemee/monemee-sdk) · [Deutsch](https://github.com/monemee/monemee-sdk/blob/main/README.de.md) · [Documentation](https://dev.monemee.com)

```bash
npx monemee init
```

`init` does the following:

1. detects your project (Express, Next.js, React, Python and more) and how users log in (cookie or token),
2. logs you in to Monemee through the browser, so there is no API key to copy,
3. creates your product or picks an existing one,
4. writes `MONEMEE_APP_SECRET` (test mode) and `MONEMEE_PRODUCT_ID` to `.env` and adds `.env` to `.gitignore`,
5. wires Monemee into your code: Express server, Next.js route, React paywall.

Then:

```bash
npx monemee test-buy     # free test purchase through the real flow
npx monemee live         # return URL, live secret and webhook for production
npx monemee doctor       # checks your setup
```

| Option | |
|---|---|
| `--yes` | Accept defaults without prompting (CI, AI assistants) |
| `--product <id>` | Use an existing product |
| `--title`, `--price` | Create a new product without prompts |
| `--url <https://...>` | (`live`) Address of your production app |
| `--ref <id>` | (`test-buy`) Test purchase for a specific user ID |
| `--skip-install` | Print the install command instead of running it |
| `--base-url <url>` | Use another Monemee instance, for example staging |

Your login is stored in `~/.config/monemee/credentials.json` with permissions limited to your user. `npx monemee logout` deletes it, and you can revoke it in Monemee under *Settings > Connected apps*.

Requires Node.js 18.17 or newer. No dependencies.

MIT License
