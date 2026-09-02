<?php

// Isolated endpoint regression fixture. Never connects to the configured database or DeepL.
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require dirname(__DIR__) . '/httpdocs/api/admin/auth.php';
require dirname(__DIR__) . '/httpdocs/api/admin/location-fields.php';

$scenario = $argv[1] ?? 'success';
class TestLocationPdo extends PDO
{
    public string $scenario;
    public function prepare(string $query, array $options = []): PDOStatement|false
    {
        if ($this->scenario === 'save-error' && str_starts_with($query, 'UPDATE')) {
            throw new RuntimeException('Simulated database failure.');
        }
        // SQLite exercises SQL and rollback; real MySQL locking still needs a Laragon test.
        return parent::prepare(str_replace(' FOR UPDATE', '', $query), $options);
    }
    public function beginTransaction(): bool
    {
        if ($this->scenario === 'changed-during-save') {
            $this->exec("UPDATE gallery_locations SET location_fr = 'Autre modification' WHERE location_id = 1");
        }
        if ($this->scenario === 'deleted-during-save') {
            $this->exec('DELETE FROM gallery_locations WHERE location_id = 1');
        }
        return parent::beginTransaction();
    }
}
$pdo = new TestLocationPdo('sqlite::memory:');
$pdo->scenario = $scenario;
$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
$pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
$pdo->exec('CREATE TABLE gallery_locations (
    location_id INTEGER PRIMARY KEY, journey_order INTEGER, journey_date TEXT,
    location_fr TEXT, location_en TEXT, distance_km TEXT, latitude TEXT, longitude TEXT,
    description_fr TEXT, description_en TEXT
)');
$pdo->exec("INSERT INTO gallery_locations VALUES (1, 3, '2026-09-02', 'Bruxelles', 'Brussels', '12.50', '50.8503400', '4.3517100', 'Une étape.', 'A stop.')");
$pdo->exec('CREATE TABLE gallery_media (media_id INTEGER, location_id INTEGER, file_path TEXT)');
$pdo->exec("INSERT INTO gallery_media VALUES (8, 1, '/uploads/gallery/1/001-photo.jpg')");
$original = $pdo->query('SELECT * FROM gallery_locations')->fetch();

$_SESSION = ['admin_id' => 1, 'csrf_token' => str_repeat('a', 64)];
$_SERVER['REQUEST_METHOD'] = 'POST';
$_FILES = [];
$_POST = [
    'csrf_token' => $_SESSION['csrf_token'], 'location_id' => '1', 'revision' => bctLocationRevision($original),
    'journey_date' => '2026-09-03', 'location_fr' => 'Bruxelles', 'distance_km' => '25.50',
    'latitude' => '51.1234567', 'longitude' => '-3.1234567', 'description_fr' => 'Une étape.',
    'journey_order' => '999', 'location_en' => 'FORGED', // Must be ignored.
];
switch ($scenario) {
    case 'unauthenticated': $_SESSION = []; break;
    case 'wrong-method': $_SERVER['REQUEST_METHOD'] = 'GET'; break;
    case 'bad-csrf': $_POST['csrf_token'] = 'bad'; break;
    case 'array-csrf': $_POST['csrf_token'] = ['bad']; break;
    case 'bad-id': $_POST['location_id'] = '1 OR 1=1'; break;
    case 'bad-input': $_POST['latitude'] = '91'; break;
    case 'array-description': $_POST['description_fr'] = ['bad']; break;
    case 'stale': $_POST['revision'] = str_repeat('0', 64); break;
    case 'missing': $_POST['location_id'] = '999'; break;
    case 'clear-description': $_POST['description_fr'] = ''; break;
    case 'translation-error': $_POST['location_fr'] = 'Paris'; break;
    case 'files': $_FILES = ['media_files' => ['name' => 'photo.jpg']]; break;
    case 'no-change': foreach ($original as $name => $value) { if (isset($_POST[$name])) $_POST[$name] = (string) $value; } break;
}

register_shutdown_function(function () use ($pdo): void {
    echo "\n" . json_encode([
        'status' => http_response_code(),
        'location' => $pdo->query('SELECT * FROM gallery_locations WHERE location_id = 1')->fetch(),
        'media' => $pdo->query('SELECT * FROM gallery_media')->fetchAll(),
        'in_transaction' => $pdo->inTransaction(),
    ]) . "\n";
});

$source = file_get_contents(dirname(__DIR__) . '/httpdocs/api/admin/update-location.php');
$source = str_replace("require_once __DIR__ . '/auth.php';", '', $source);
$source = str_replace("require_once __DIR__ . '/location-fields.php';", '', $source);
$source = str_replace("require dirname(__DIR__) . '/bootstrap.php';", '$config = [];', $source);
eval(substr($source, 5));
