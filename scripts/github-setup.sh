#!/usr/bin/env bash
# Sets the repository metadata that GitHub search and Google use.
# Run once after creating github.com/monemee/monemee-sdk (needs: gh auth login, admin rights).
set -euo pipefail
REPO="${1:-monemee/monemee-sdk}"

DESCRIPTION="Sell your app with license keys, a paywall and checkout. SDK and CLI for Express, Next.js, React, Electron, Tauri and Python: hosted checkout, unlock after payment, offline license key validation and GitHub Releases delivery."
HOMEPAGE="https://dev.monemee.com"
TOPICS=(
  license-key license-key-validation software-licensing licensing paywall
  monetization sell-software checkout saas indie-hackers
  sdk cli nodejs express nextjs react electron tauri python github-actions
)

echo "Description, homepage, features"
gh repo edit "$REPO" \
  --description "$DESCRIPTION" \
  --homepage "$HOMEPAGE" \
  --enable-issues --enable-wiki=false --enable-projects=false \
  --delete-branch-on-merge

echo "Topics (${#TOPICS[@]})"
gh api -X PUT "repos/$REPO/topics" -H "Accept: application/vnd.github+json" \
  --input <(printf '{"names":[%s]}' "$(printf '"%s",' "${TOPICS[@]}" | sed 's/,$//')") >/dev/null

echo "GitHub Pages from /docs (custom domain via docs/CNAME)"
gh api -X POST "repos/$REPO/pages" -f "source[branch]=main" -f "source[path]=/docs" >/dev/null 2>&1 \
  || gh api -X PUT "repos/$REPO/pages" -f "source[branch]=main" -f "source[path]=/docs" >/dev/null
gh api -X PUT "repos/$REPO/pages" -F https_enforced=true >/dev/null 2>&1 || true

cat <<'NEXT'

Done. Two things GitHub only allows in the browser:
  1. Settings > General > Social preview: upload .github/social-preview.png
  2. DNS: CNAME record dev.monemee.com -> monemee.github.io (then Settings > Pages shows the certificate)
NEXT
