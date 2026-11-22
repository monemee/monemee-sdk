# monemee (Python)

Sell your Python app through Monemee: license key validation with offline support for CLIs and desktop tools, plus access checks for web apps built with Flask, FastAPI or Django. Standard library only; `cryptography` is optional for offline verification.

[Monemee SDK](https://github.com/monemee/monemee-sdk) · [Deutsch](https://github.com/monemee/monemee-sdk/blob/main/README.de.md) · [Documentation](https://dev.monemee.com)

```bash
pip install "monemee[offline]"    # [offline] enables offline verification of signed responses
```

## License keys for CLIs and desktop apps

```python
from monemee import License

lic = License(product_id=123)

if not lic.stored_key:
    result = lic.activate(input("License key: "))
    if not result.valid:
        raise SystemExit(f"Invalid: {result.reason}")

status = lic.check()          # online; offline the last check stays valid for grace_days (7)
if status.valid:
    run_pro(plan=status.plan)
```

Data is stored in `~/.config/monemee-<id>/license.json` (`%APPDATA%` on Windows). `lic.deactivate()` frees the device slot.

## Web apps with login (Flask, FastAPI, Django)

```python
from monemee import App
monemee = App()                         # reads MONEMEE_APP_SECRET (npx monemee init)

# Flask
@app.get("/pro")
def pro():
    if not monemee.has_access(current_user.id):
        return redirect(monemee.buy_url(current_user.id))
    return render_template("pro.html")

# Return after purchase (set the return URL in Monemee to https://your-app.com/monemee/return)
@app.get("/monemee/return")
def monemee_return():
    result = monemee.unlock(current_user.id, claim=request.args["monemee_claim"])
    return redirect("/pro" if result.access else f"/?error={result.reason}")

# Webhook (optional, applies refunds instantly)
@app.post("/monemee/webhook")
def monemee_webhook():
    try:
        monemee.handle_webhook(request.get_data(), request.headers.get("Monemee-Signature"))
    except ValueError:
        abort(400)
    return "", 204
```

Free test purchase (with a `mmapp_test_...` secret only): `redirect(monemee.test_buy_url(current_user.id, "http://localhost:5000/monemee/return"))`.

Requires Python 3.10 or newer.

MIT License
