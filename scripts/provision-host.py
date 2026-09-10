"""Run as root on the authorized Ubuntu host. No passwords are logged."""
from pathlib import Path
import json, os, shutil, subprocess, uuid

base = Path('/srv/caldav')
base.mkdir(mode=0o700, exist_ok=True)
os.chown(base, 1001, 1001)
for item in ['state', 'state/radicale', 'state/status', 'releases']:
    directory = base / item
    directory.mkdir(mode=0o700, parents=True, exist_ok=True)
    os.chown(directory, 1001, 1001)
env = base / '.env'
if not env.exists():
    previous = dict(line.split('=', 1) for line in Path('/srv/note/.env').read_text().splitlines() if '=' in line)
    login = previous.get('TAILSCALE_ALLOWED_LOGINS')
    if not login:
        raise SystemExit('Set the authorized Tailscale login explicitly.')
    env.write_text('TAILSCALE_ALLOWED_LOGINS=' + login + '\n')
    os.chmod(env, 0o600)
    os.chown(env, 1001, 1001)
credentials_dir = Path('/etc/caldav')
credentials_dir.mkdir(mode=0o700, exist_ok=True)
credentials = credentials_dir / 'nas.credentials'
if not credentials.exists():
    shutil.copyfile('/etc/note/nas.credentials', credentials)
    os.chmod(credentials, 0o600)
mount = Path('/mnt/caldav')
mount.mkdir(mode=0o700, exist_ok=True)
entry = '//100.75.89.101/Caldav /mnt/caldav cifs credentials=/etc/caldav/nas.credentials,vers=3.1.1,seal,uid=1001,gid=1001,file_mode=0600,dir_mode=0700,nosuid,nodev,noexec,nofail,_netdev,x-systemd.automount,x-systemd.mount-timeout=30,x-systemd.requires=tailscaled.service 0 0'
fstab = Path('/etc/fstab')
before = fstab.read_text()
existing = [line for line in before.splitlines() if not line.lstrip().startswith('#') and '/mnt/caldav' in line]
if existing and existing != [entry]:
    raise SystemExit('A different Caldav mount already exists; inspect it before proceeding.')
if not existing:
    shutil.copy2(fstab, '/etc/fstab.before-caldav')
    with fstab.open('a') as out: out.write('\n# Calendar NAS backup\n' + entry + '\n')
subprocess.run(['systemctl', 'daemon-reload'], check=True)
subprocess.run(['systemctl', 'start', 'mnt-caldav.automount'], check=True)
list(mount.iterdir())
mounts = json.loads(subprocess.check_output(['findmnt', '-J', '-T', str(mount)]))['filesystems']
if not any(info['fstype'] == 'cifs' and info['source'].lower() == '//100.75.89.101/caldav' for info in mounts):
    raise SystemExit('The intended NAS share is not mounted.')
marker = mount / '.calendar-backup-storage'
if not marker.exists(): marker.write_text(str(uuid.uuid4()) + '\n')
identity_path = credentials_dir / 'storage-id'
if identity_path.exists() and identity_path.read_text().strip() != marker.read_text().strip():
    raise SystemExit('NAS storage identity differs from the existing configuration.')
identity_path.write_text(marker.read_text())
os.chmod(credentials_dir / 'storage-id', 0o600)
(mount / 'backups').mkdir(mode=0o700, exist_ok=True)
for name in ['calendar-backup.service', 'calendar-backup.timer']:
    shutil.copy2(base / 'scripts' / name, Path('/etc/systemd/system') / name)
subprocess.run(['systemctl', 'daemon-reload'], check=True)
subprocess.run(['systemctl', 'enable', '--now', 'calendar-backup.timer'], check=True)
print('Calendar runtime, encrypted NAS mount, and daily backup installed.')
