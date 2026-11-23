---
title: "Guides: license keys and paywalls step by step"
description: Step-by-step guides for selling software with Monemee. License keys in Electron, Tauri, Chrome extensions, Python and Swift, paywalls in Next.js and Express.
permalink: /guides/
updated: 2026-11-23
last_modified_at: 2026-11-23
---

# Guides

<p class="lead">Each guide solves one task end to end, with code that uses the published packages. Pick the one that matches your app.</p>

## Paywalls for web apps

| Guide | Packages |
|---|---|
| [Add a paywall to a Next.js App Router app]({{ '/guides/nextjs-paywall/' | relative_url }}) | `monemee-node`, `monemee-react` |
| [Add a paywall to an Express and React app]({{ '/guides/express-react-paywall/' | relative_url }}) | `monemee-node`, `monemee-react` |

## License keys for downloadable software

| Guide | Package |
|---|---|
| [Add license key validation to an Electron app]({{ '/guides/electron-license-key/' | relative_url }}) | `monemee-client` |
| [Add license key validation to a Tauri app]({{ '/guides/tauri-license-key/' | relative_url }}) | `monemee-client` |
| [Sell a Chrome extension with license keys]({{ '/guides/chrome-extension-license-key/' | relative_url }}) | `monemee-client` |
| [License key validation for a Python CLI or desktop app]({{ '/guides/python-license-key/' | relative_url }}) | `monemee` (PyPI) |
| [License key validation for a Swift macOS app]({{ '/guides/swift-macos-license-key/' | relative_url }}) | `Monemee` (Swift) |

## Testing and going live

| Guide | Tools |
|---|---|
| [Test the purchase flow without paying]({{ '/guides/test-purchase-flow/' | relative_url }}) | `npx monemee test-buy`, `npx monemee live` |

Looking for reference material instead? See [web apps]({{ '/web-apps/' | relative_url }}), [license keys]({{ '/license-keys/' | relative_url }}) and the [CLI]({{ '/cli/' | relative_url }}).
