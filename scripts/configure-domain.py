"""Publish the Calendar web shell through the existing Caddy on the Ubuntu host."""
from datetime import datetime, timezone
from pathlib import Path
import re
import shutil
import subprocess
import urllib.request

config = Path('/srv/proxy/Caddyfile')
domain = 'calendar.3chan.kr'
site = '\n# Calendar personal address book\n' + domain + ' {\n\tencode zstd gzip\n\treverse_proxy calendar-web:8792\n}\n'

# Check the intended static upstream before changing the shared proxy.
with urllib.request.urlopen('http://127.0.0.1:8792/', timeout=10) as response:
    if response.status != 200 or '<title>달력</title>' not in response.read().decode('utf-8'):
        raise SystemExit('The Calendar web upstream is not ready.')

before = config.read_text()
existing = re.search(r'(?m)^calendar\.3chan\.kr\s*\{[^}]*\}', before)
if existing and existing.group().strip() != site.split('\n', 2)[2].strip():
    raise SystemExit('A different calendar.3chan.kr route exists; inspect it first.')

changed = existing is None
if changed:
    stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    shutil.copy2(config, config.with_name(f'Caddyfile.bak.{stamp}-calendar'))
    # Keep the inode because Caddy bind-mounts this file.
    config.write_text(before + site)

try:
    subprocess.run(['docker', 'exec', 'caddy', 'caddy', 'validate', '--config', '/etc/caddy/Caddyfile'], check=True)
    subprocess.run(['docker', 'exec', 'caddy', 'caddy', 'reload', '--config', '/etc/caddy/Caddyfile'], check=True)
except subprocess.CalledProcessError:
    if changed:
        config.write_text(before)
        subprocess.run(['docker', 'exec', 'caddy', 'caddy', 'reload', '--config', '/etc/caddy/Caddyfile'], check=True)
    raise

print('Calendar web configured at https://calendar.3chan.kr')
