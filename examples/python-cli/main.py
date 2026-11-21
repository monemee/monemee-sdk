# pip install "monemee[offline]"
import sys
from monemee import License

lic = License(product_id=123, app_name="my-tool")

if len(sys.argv) > 2 and sys.argv[1] == "activate":
    r = lic.activate(sys.argv[2])
    print("Activated." if r.valid else f"Not activated: {r.reason}")
    sys.exit(0 if r.valid else 1)

status = lic.check()
if not status.valid:
    print("Pro features need a license: my-tool activate MM-XXXX-XXXX-XXXX-XXXX")
    print("Buy: https://monemee.com/p/123")
    sys.exit(1)

print(f"Pro ({status.plan or 'standard'}){' - offline' if status.offline else ''}")
