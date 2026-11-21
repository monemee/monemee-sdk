# monemee (Python)

Verkaufe deine Python-App über Monemee.

```bash
pip install "monemee[offline]"    # [offline] = Offline-Prüfung signierter Antworten
```

## Download-Software (CLI, Desktop, Skripte)

```python
from monemee import License

lic = License(product_id=123)

if not lic.stored_key:
    result = lic.activate(input("Lizenzschlüssel: "))
    if not result.valid:
        raise SystemExit(f"Ungültig: {result.reason}")

status = lic.check()          # online, ohne Netz gilt die letzte Prüfung bis grace_days (7)
if status.valid:
    run_pro(plan=status.plan)
```

Gespeichert wird in `~/.config/monemee-<id>/license.json` (Windows: `%APPDATA%`). `lic.deactivate()` gibt das Gerät frei.

## Web-App mit Login (Flask, FastAPI, Django)

```python
from monemee import App
monemee = App()                         # MONEMEE_APP_SECRET aus der Umgebung (npx monemee init)

# Flask
@app.get("/pro")
def pro():
    if not monemee.has_access(current_user.id):
        return redirect(monemee.buy_url(current_user.id))
    return render_template("pro.html")

# Rücksprung nach dem Kauf (Rücksprung-URL in Monemee: https://deine-app.de/monemee/return)
@app.get("/monemee/return")
def monemee_return():
    result = monemee.unlock(current_user.id, claim=request.args["monemee_claim"])
    return redirect("/pro" if result.access else f"/?fehler={result.reason}")

# Webhook (optional, Erstattungen sofort wirksam)
@app.post("/monemee/webhook")
def monemee_webhook():
    try:
        monemee.handle_webhook(request.get_data(), request.headers.get("Monemee-Signature"))
    except ValueError:
        abort(400)
    return "", 204
```

Testkauf ohne Geld (nur mit `mmapp_test_…`): `redirect(monemee.test_buy_url(current_user.id, "http://localhost:5000/monemee/return"))`.

Ohne Abhängigkeiten außer der Standardbibliothek. `cryptography` wird nur für die Offline-Prüfung gebraucht.

MIT-Lizenz
