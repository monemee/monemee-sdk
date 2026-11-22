---
title: License key validation for a Python CLI or desktop app
description: Add license keys to a Python command-line tool or desktop app. Activate once, check on every run and keep working offline with signed responses.
permalink: /guides/python-license-key/
updated: 2026-11-22
last_modified_at: 2026-11-22
faq:
  - q: Why install monemee with the offline extra?
    a: The extra installs cryptography, which the package uses to verify the Ed25519 signature of license responses. The SDK checks signatures on online responses too, so install monemee[offline] in every app that uses License.
  - q: Where does the Python SDK store the license?
    a: In license.json under ~/.config/monemee-<product_id>/ on Linux and macOS, or %APPDATA%\monemee-<product_id>\ on Windows. Change the folder name with app_name or the full path with store_dir.
  - q: Which Python versions are supported?
    a: Python 3.10 or newer. The package uses only the standard library; cryptography is the one optional dependency.
---

# License key validation for a Python CLI or desktop app

<p class="lead">To validate license keys in a Python tool, install <code>monemee[offline]</code>, create <code>License(product_id=...)</code>, call <code>activate(key)</code> once and <code>check()</code> on every run. Each response is signed with Ed25519 and stored locally, so the tool keeps working offline for <code>grace_days</code>, seven by default.</p>

## Prerequisites

- Python 3.10 or newer.
- A Monemee product with license keys enabled, and its product ID.
- A test key from the dashboard under *License keys > Test key*.

## Steps

### 1. Install the package

```bash
pip install "monemee[offline]"
```

Add `monemee[offline]` to your `pyproject.toml` or `requirements.txt` as well. Without `cryptography`, `check()` cannot verify signed responses and reports `invalid_signature`.

### 2. Create the license object

```python
# mytool/licensing.py
from monemee import License

lic = License(product_id=123, app_name="mytool", grace_days=7)
```

| Argument | Default | |
|---|---|---|
| `product_id` | – | Your Monemee product ID |
| `grace_days` | `7` | How long the last signed response counts without a connection |
| `app_name` | `monemee-<product_id>` | Folder name for the stored state |
| `store_dir` | – | Full path for the stored state, overrides `app_name` |
| `device_name` | – | Shown in the device list of your dashboard |
| `timeout` | `8` | Seconds per request |

### 3. Add activate, deactivate and status commands

```python
# mytool/cli.py
import argparse
import sys

from monemee import MonemeeError
from mytool.licensing import lic


def main():
    parser = argparse.ArgumentParser(prog="mytool")
    sub = parser.add_subparsers(dest="command")
    act = sub.add_parser("activate", help="activate a license key")
    act.add_argument("key")
    sub.add_parser("deactivate", help="free this device")
    sub.add_parser("status", help="show the license status")
    args = parser.parse_args()

    if args.command == "activate":
        try:
            result = lic.activate(args.key)
        except MonemeeError as err:          # wrong format or no connection
            sys.exit(f"Could not activate: {err}")
        if not result.valid:
            sys.exit(f"Not activated: {result.reason}")
        print("Activated.")
        return

    if args.command == "deactivate":
        print("Device freed." if lic.deactivate() else "Nothing to deactivate.")
        return

    status = require_license()
    if args.command == "status":
        print(f"Licensed ({status.plan or 'standard'}){' - offline' if status.offline else ''}")
        return
    run_pro_features(status.plan)


def require_license():
    try:
        status = lic.check()
    except MonemeeError as err:
        sys.exit(f"License check failed: {err}")
    if not status.valid:
        print("This feature needs a license: mytool activate MM-XXXX-XXXX-XXXX-XXXX", file=sys.stderr)
        print("Buy one at https://monemee.com/p/123", file=sys.stderr)
        sys.exit(1)
    return status
```

`check()` returns a `LicenseResult` with `valid`, `reason`, `plan`, `expires_at`, `test` and `offline`. Network errors do not raise: they fall back to the stored response. Other API errors raise `MonemeeError`.

### 4. Desktop apps

The calls block while they talk to Monemee (up to `timeout` seconds). In a GUI app, run `check()` in a background thread at startup and enable paid features when it returns. `lic.stored_key` tells you whether to show the activation dialog at all.

```python
import threading

# Tkinter example: root is your Tk window, set_pro your own function
def check_in_background(root, set_pro):
    def worker():
        status = lic.check()
        root.after(0, lambda: set_pro(status.valid))   # back to the UI thread
    threading.Thread(target=worker, daemon=True).start()
```

## How it works

`activate(key)` normalizes the key, sends it with the product ID and a random device ID to Monemee and, if the key is valid and the device limit allows it, stores the key and the signed response in `license.json`. `check()` validates online and stores every new signed response. Without a connection it accepts the stored response only if the signature, key hash, product, device and issue time (within `grace_days`) match, and the license has not expired. A refund makes the next online check return `reason="revoked"` and removes the stored key. `deactivate()` frees the device slot so the buyer can move to another computer.

## FAQ
{% for item in page.faq %}
### {{ item.q }}

{{ item.a }}
{% endfor %}

## Next steps

- [License keys reference]({{ '/license-keys/' | relative_url }}): reasons a key is not valid, offline verification
- [Python package on GitHub](https://github.com/monemee/monemee-sdk/tree/main/packages/python): also covers Flask, FastAPI and Django
- [Ship new versions from GitHub Releases]({{ '/github-action/' | relative_url }})
- [All guides]({{ '/guides/' | relative_url }})
