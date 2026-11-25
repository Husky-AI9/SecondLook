"""Prints the screenshots as small base64 JPEGs into the job log (SHOT|name|part|data)."""
import base64
import io
import os
import sys

from PIL import Image

out = sys.argv[1]
for name in sorted(f for f in os.listdir(out) if f.endswith('.png')):
    try:
        im = Image.open(os.path.join(out, name)).convert('RGB')
    except Exception as e:  # noqa: BLE001
        print(f'SHOT|{name}|skip|{e}')
        continue
    im.thumbnail((420, 940))
    buf = io.BytesIO()
    im.save(buf, 'JPEG', quality=62)
    data = base64.b64encode(buf.getvalue()).decode()
    for i in range(0, len(data), 3000):
        print(f'SHOT|{name}|{i // 3000}|{data[i:i + 3000]}')
