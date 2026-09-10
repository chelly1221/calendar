"""Consistent snapshot; restart CalDAV even if backup fails. NAS mount is mandatory."""
from pathlib import Path
from datetime import datetime, timezone
import fcntl, hashlib, json, os, subprocess, tarfile, tempfile

base = Path('/srv/caldav')
mount = Path('/mnt/caldav')
status = base / 'state/status/backup.json'
stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
lock = open('/run/lock/calendar-backup.lock', 'w')
fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)

def run(args): return subprocess.run(args, check=True, capture_output=True, text=True)
def record(value):
    temp = status.with_suffix('.tmp')
    temp.write_text(json.dumps(value, ensure_ascii=False) + '\n')
    os.chmod(temp, 0o600); os.chown(temp, 1001, 1001)
    os.replace(temp, status)

try:
    list(mount.iterdir())  # Trigger automount before checking the backing filesystem.
    mounts = json.loads(run(['findmnt', '-J', '-T', str(mount)]).stdout)['filesystems']
    if not any(info['fstype'] == 'cifs' and info['source'].lower() == '//100.75.89.101/caldav' for info in mounts):
        raise RuntimeError('NAS mount missing')
    expected = Path('/etc/caldav/storage-id').read_text().strip()
    if not expected or (mount / '.calendar-backup-storage').read_text().strip() != expected:
        raise RuntimeError('NAS identity mismatch')
    backups = mount / 'backups'
    if not backups.is_dir(): raise RuntimeError('Backup directory missing')
    destination = backups / ('calendar-' + stamp + '.tar.gz')
    partial = destination.with_suffix('.partial')
    # Stage locally to keep the write interruption brief even on a slow NAS.
    with tempfile.TemporaryDirectory(prefix='calendar-backup-') as work:
        archive = Path(work) / destination.name
        stopped = False
        try:
            run(['docker', 'compose', 'stop', '-t', '30', 'radicale']); stopped = True
            with tarfile.open(archive, 'w:gz') as out:
                out.add(base / 'state/radicale', arcname='radicale')
                out.add(base / 'server/radicale.conf', arcname='radicale.conf')
        finally:
            # Also start after a timeout/uncertain stop result.
            run(['docker', 'compose', 'up', '-d', 'radicale'])
        digest = hashlib.sha256()
        with archive.open('rb') as src, partial.open('xb') as dst:
            while chunk := src.read(1024 * 1024): digest.update(chunk); dst.write(chunk)
            dst.flush(); os.fsync(dst.fileno())
        verify = hashlib.sha256()
        with partial.open('rb') as src:
            while chunk := src.read(1024 * 1024): verify.update(chunk)
        if digest.digest() != verify.digest(): raise RuntimeError('Backup checksum mismatch')
        with tarfile.open(partial, 'r:gz') as check:
            for member in check.getmembers():
                if member.isfile():
                    handle = check.extractfile(member)
                    while handle.read(1024 * 1024): pass
        os.replace(partial, destination)
        destination.with_suffix('.gz.sha256').write_text(digest.hexdigest() + '  ' + destination.name + '\n')
    completed = datetime.now(timezone.utc).isoformat()
    record({'ok': True, 'completedAt': completed, 'archive': destination.name, 'bytes': destination.stat().st_size, 'sha256': digest.hexdigest()})
    # Retention touches only archives created by this application in this exact share.
    for old in sorted(backups.glob('calendar-????????T??????Z.tar.gz'), reverse=True)[30:]:
        old.unlink(); old.with_suffix('.gz.sha256').unlink(missing_ok=True)
    print('NAS backup verified:', destination.name)
except Exception:
    record({'ok': False, 'failedAt': datetime.now(timezone.utc).isoformat(), 'message': 'NAS 백업이 실패했어요. 서버의 calendar-backup.service 기록을 확인해 주세요.'})
    raise
