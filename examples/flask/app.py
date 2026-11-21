# pip install flask "monemee"   ·   MONEMEE_APP_SECRET in der Umgebung
from flask import Flask, abort, redirect, request, session
from monemee import App

app = Flask(__name__)
app.secret_key = "dev"
monemee = App()


@app.get("/login")
def login():
    session["user"] = "demo"
    return redirect(request.args.get("next", "/"))


@app.get("/")
def index():
    user = session.get("user")
    if not user:
        return redirect("/login")
    if monemee.has_access(user):
        return "<h1>Pro ✓</h1>"
    return f'<a href="{monemee.buy_url(user)}">Pro kaufen</a> · <a href="/test-buy">Testkauf</a>'


@app.get("/test-buy")
def test_buy():
    return redirect(monemee.test_buy_url(session["user"], request.host_url + "monemee/return"))


@app.get("/monemee/return")                  # Rücksprung-URL in Monemee
def monemee_return():
    if "user" not in session:
        return redirect("/login?next=" + request.full_path)
    result = monemee.unlock(session["user"], claim=request.args["monemee_claim"])
    return redirect("/" if result.access else f"/?fehler={result.reason}")


@app.post("/monemee/webhook")
def webhook():
    try:
        monemee.handle_webhook(request.get_data(), request.headers.get("Monemee-Signature"))
    except ValueError:
        abort(400)
    return "", 204
