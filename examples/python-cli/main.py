# pip install "monemee[offline]"
import sys
from monemee import License

lic = License(product_id=123, app_name="mein-tool")

if len(sys.argv) > 2 and sys.argv[1] == "activate":
    r = lic.activate(sys.argv[2])
    print("Aktiviert ✓" if r.valid else f"Nicht aktiviert: {r.reason}")
    sys.exit(0 if r.valid else 1)

status = lic.check()
if not status.valid:
    print("Pro-Funktionen brauchen eine Lizenz: mein-tool activate MM-XXXX-XXXX-XXXX-XXXX")
    print("Kaufen: https://monemee.com/p/123")
    sys.exit(1)

print(f"Pro ({status.plan or 'Standard'}){' – offline' if status.offline else ''}")
