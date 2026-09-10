"""Restore the latest NAS snapshot into a temporary directory and verify Radicale storage."""
from pathlib import Path
import argparse, hashlib, json, os, re, subprocess, tarfile, tempfile

parser = argparse.ArgumentParser()
parser.add_argument('expected_uid', nargs='?')
parser.add_argument('--import-report', type=Path)
parser.add_argument('--source-export', type=Path)
args = parser.parse_args()

base=Path('/srv/caldav')
status=json.loads((base/'state/status/backup.json').read_text())
assert status['ok'], 'A successful snapshot is required'
archive=Path('/mnt/caldav/backups')/status['archive']
assert archive.parent==Path('/mnt/caldav/backups')
assert hashlib.sha256(archive.read_bytes()).hexdigest()==status['sha256']
with tempfile.TemporaryDirectory(prefix='calendar-restore-') as work:
    root=Path(work)
    with tarfile.open(archive,'r:gz') as source:
        source.extractall(root,filter='data')
    if args.expected_uid:
        needle=('UID:'+args.expected_uid).encode()
        assert any(needle in file.read_bytes() for file in root.rglob('*') if file.is_file()), 'Expected fixture event not found in restored backup'
    if args.import_report:
        report=json.loads(args.import_report.read_text())
        assert report['format']=='calendar-nextcloud-import-v1'
        verified=0
        for calendar in report['calendars']:
            assert re.fullmatch(r'nextcloud-[a-f0-9]{24}', calendar['id'])
            collection=root/'radicale/collections/collection-root/calendar'/calendar['id']
            assert collection.is_dir(), 'Imported calendar missing from backup'
            for event in calendar['events']:
                assert re.fullmatch(r'nextcloud-[a-f0-9]{32}\.ics', event['id'])
                assert hashlib.sha256((collection/event['id']).read_bytes()).hexdigest()==event['storedSha256'], 'Imported event checksum mismatch in backup'
                verified+=1
        assert verified==report['verified']
        print(f'PASS: all {verified} imported resources match the verified API content in the restored NAS snapshot.')
        if args.source_export:
            source=json.loads(args.source_export.read_text())
            assert len(source['calendars'])==len(report['calendars'])
            for original, calendar in zip(source['calendars'], report['calendars']):
                assert original['name']==calendar['name']
                collection=root/'radicale/collections/collection-root/calendar'/calendar['id']
                props=json.loads((collection/'.Radicale.props').read_text())
                assert props['D:displayname']==original['name']
                assert props['ICAL:calendar-color'].lower()[:7]==original['color'].lower()[:7]
                for source_key, prop_key in [('timezone','C:calendar-timezone'), ('description','C:calendar-description')]:
                    if original[source_key]:
                        assert props[prop_key].replace('\r\n','\n')==original[source_key].replace('\r\n','\n')
            print('PASS: imported calendar names, colors, descriptions and timezones match the source in the restored snapshot.')
    for directory,_,files in os.walk(root):
        os.chown(directory,1001,1001)
        for name in files:os.chown(Path(directory)/name,1001,1001)
    result=subprocess.run(['docker','run','--rm','--network=none','--cap-drop=ALL','--security-opt=no-new-privileges:true','-v',f'{root}/radicale:/data','calendar-radicale:0.1.0','python','-m','radicale','--verify-storage'],capture_output=True,text=True)
    if result.returncode:
        raise RuntimeError('Restored Radicale storage verification failed: '+result.stderr[-1500:])
print('PASS: NAS SHA-256, archive extraction into an isolated temporary directory, and Radicale --verify-storage.')
