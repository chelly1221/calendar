"""Restore the latest NAS snapshot into a temporary directory and verify Radicale storage."""
from pathlib import Path
import hashlib, json, os, subprocess, tarfile, tempfile, sys

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
    if len(sys.argv)>1:
        needle=('UID:'+sys.argv[1]).encode()
        assert any(needle in file.read_bytes() for file in root.rglob('*') if file.is_file()), 'Expected fixture event not found in restored backup'
    for directory,_,files in os.walk(root):
        os.chown(directory,1001,1001)
        for name in files:os.chown(Path(directory)/name,1001,1001)
    result=subprocess.run(['docker','run','--rm','--network=none','--cap-drop=ALL','--security-opt=no-new-privileges:true','-v',f'{root}/radicale:/data','calendar-radicale:0.1.0','python','-m','radicale','--verify-storage'],capture_output=True,text=True)
    if result.returncode:
        raise RuntimeError('Restored Radicale storage verification failed: '+result.stderr[-1500:])
print('PASS: NAS SHA-256, archive extraction into an isolated temporary directory, and Radicale --verify-storage.')
