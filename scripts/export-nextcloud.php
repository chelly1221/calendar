<?php
// Read-only export. Run as www-data inside the Nextcloud container.
declare(strict_types=1);
define('OC_CONSOLE', 1);
require '/var/www/html/lib/base.php';
$uid = $argv[1] ?? '';
if ($uid === '' || !\OC::$server->getUserManager()->get($uid)) {
    throw new RuntimeException('An existing Nextcloud user is required');
}
$backend = \OC::$server->get(\OCA\DAV\CalDAV\CalDavBackend::class);
$principal = 'principals/users/' . $uid;
$tokenKey = '{http://sabredav.org/ns}sync-token';
$calendars = $backend->getCalendarsForUser($principal);
$result = ['format' => 'calendar-nextcloud-export-v1', 'user' => $uid,
    'exportedAt' => gmdate('c'), 'calendars' => []];
$tokens = [];
foreach ($calendars as $calendar) {
    $tokens[(string)$calendar['id']] = (string)($calendar[$tokenKey] ?? '');
    $book = [
        'sourceId' => (string)$calendar['id'], 'uri' => $calendar['uri'],
        'name' => $calendar['{DAV:}displayname'] ?? $calendar['uri'],
        'color' => $calendar['{http://apple.com/ns/ical/}calendar-color'] ?? '#b59ae8',
        'description' => $calendar['{urn:ietf:params:xml:ns:caldav}calendar-description'] ?? '',
        'timezone' => $calendar['{urn:ietf:params:xml:ns:caldav}calendar-timezone'] ?? '',
        'syncToken' => $tokens[(string)$calendar['id']], 'objects' => [],
    ];
    foreach ($backend->getCalendarObjects($calendar['id']) as $entry) {
        $object = $backend->getCalendarObject($calendar['id'], $entry['uri']);
        if (!$object || $object['etag'] !== $entry['etag']) {
            throw new RuntimeException('Source changed during export; retry');
        }
        $ical = $object['calendardata'];
        if (is_resource($ical)) $ical = stream_get_contents($ical);
        $book['objects'][] = ['uri' => $entry['uri'], 'component' => $entry['component'],
            'etag' => $entry['etag'], 'ical' => $ical, 'sha256' => hash('sha256', $ical)];
    }
    usort($book['objects'], fn($a, $b) => strcmp($a['uri'], $b['uri']));
    $result['calendars'][] = $book;
}
$after = [];
foreach ($backend->getCalendarsForUser($principal) as $calendar) {
    $after[(string)$calendar['id']] = (string)($calendar[$tokenKey] ?? '');
}
ksort($tokens); ksort($after);
if ($tokens !== $after) throw new RuntimeException('Source changed during export; retry');
echo json_encode($result, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR) . "\n";
