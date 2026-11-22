"""Monemee für Python.

Download-Software (CLI, Desktop):

    from monemee import License
    lic = License(product_id=123)
    lic.activate("MM-XXXX-XXXX-XXXX-XXXX")   # einmal
    if lic.check().valid: ...                 # bei jedem Start, offline bis grace_days

Web-App mit Login (Flask, FastAPI, Django):

    from monemee import App
    monemee = App()                           # liest MONEMEE_APP_SECRET
    monemee.has_access(user_id)
    monemee.buy_url(user_id)
"""
from ._errors import MonemeeError
from .license import License, LicenseResult
from .app import App, AccessResult
from .webhook import verify_webhook

__all__ = ["License", "LicenseResult", "App", "AccessResult", "verify_webhook", "MonemeeError"]
__version__ = "0.1.1"
