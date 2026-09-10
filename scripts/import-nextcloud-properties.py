"""Run on the Docker host with a private Nextcloud JSON export path argument."""
import hashlib, json, subprocess, sys
from pathlib import Path
import urllib.request
import xml.etree.ElementTree as ET

if len(sys.argv) == 2:
    subprocess.run(['docker', 'exec', '-i', 'calendar-radicale', 'python', '-c', Path(__file__).read_text()],
        input=Path(sys.argv[1]).read_bytes(), check=True)
    sys.exit(0)

source = json.load(sys.stdin)
assert source['format'] == 'calendar-nextcloud-export-v1'
D = '{DAV:}'
C = '{urn:ietf:params:xml:ns:caldav}'
A = '{http://apple.com/ns/ical/}'


def request(path, method, root):
    req = urllib.request.Request('http://127.0.0.1:5232' + path,
        ET.tostring(root, encoding='utf-8'), method=method,
        headers={'X-Remote-User': 'calendar', 'Depth': '0', 'Content-Type': 'application/xml'})
    with urllib.request.urlopen(req, timeout=30) as response:
        assert response.status == 207
        return ET.fromstring(response.read())


def read(path, names):
    root = ET.Element(D + 'propfind')
    props = ET.SubElement(root, D + 'prop')
    for name in names:
        ET.SubElement(props, name)
    result = {}
    for stat in request(path, 'PROPFIND', root).iter(D + 'propstat'):
        if ' 200 ' in (stat.findtext(D + 'status') or ''):
            for prop in stat.find(D + 'prop'):
                result[prop.tag] = prop.text or ''
    return result


pending = []
for calendar in source['calendars']:
    identity = json.dumps([source['user'], calendar['sourceId'], calendar['uri']], ensure_ascii=False, separators=(',', ':'))
    path = '/calendar/nextcloud-' + hashlib.sha256(identity.encode()).hexdigest()[:24] + '/'
    props = {C + 'calendar-description': calendar['description'], C + 'calendar-timezone': calendar['timezone']}
    props = {k: v.replace('\r\n', '\n') for k, v in props.items() if v}
    current = read(path, [D + 'displayname', A + 'calendar-color', *props])
    assert current.get(D + 'displayname') == calendar['name'].strip(), 'Destination calendar name differs'
    assert current.get(A + 'calendar-color', '').lower()[:7] == calendar['color'].lower()[:7], 'Destination color differs'
    for name, value in props.items():
        assert name not in current or current[name].replace('\r\n', '\n') == value, 'Existing property differs; refusing overwrite'
    pending.append((path, props, {k: v for k, v in props.items() if k not in current}))

count = 0
for path, props, missing in pending:
    if missing:
        root = ET.Element(D + 'propertyupdate')
        values = ET.SubElement(ET.SubElement(root, D + 'set'), D + 'prop')
        for name, value in missing.items():
            ET.SubElement(values, name).text = value
        result = request(path, 'PROPPATCH', root)
        assert all(' 200 ' in (status.text or '') for status in result.iter(D + 'status'))
    actual = read(path, props)
    for name, value in props.items():
        assert actual[name].replace('\r\n', '\n') == value
        count += 1
print(f'PASS: {len(pending)} calendar names/colors and {count} source description/timezone properties verified.')
