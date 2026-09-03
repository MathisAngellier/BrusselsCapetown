<?php

declare(strict_types=1);

// This file belongs OUTSIDE httpdocs. There is deliberately no browser endpoint.
if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require __DIR__ . '/gallery-import-lib.php';

try {
    $apply = false;
    $dry = false;
    $expected = '';
    $expectedPlan = '';
    foreach (array_slice($argv, 1) as $argument) {
        if ($argument === '--help') {
            echo "Usage: php scripts/import-gallery.php --expect-database=brusselscapetown_migration_test [--dry-run|--apply --expect-plan=SHA256]\n";
            echo "Default: read-only dry-run. Only local *_migration_test databases are allowed.\n";
            exit(0);
        } elseif ($argument === '--apply' && !$apply) {
            $apply = true;
        } elseif ($argument === '--dry-run' && !$dry) {
            $dry = true;
        } elseif (str_starts_with($argument, '--expect-database=') && $expected === '') {
            $expected = substr($argument, strlen('--expect-database='));
        } elseif (str_starts_with($argument, '--expect-plan=') && $expectedPlan === '') {
            $expectedPlan = substr($argument, strlen('--expect-plan='));
        } else {
            throw new RuntimeException('Unknown or repeated option. Use --help.');
        }
    }
    if ($apply && $dry) {
        throw new RuntimeException('Choose --dry-run or --apply, not both.');
    }
    if ($expected === '') {
        throw new RuntimeException('Supply --expect-database explicitly. Use --help.');
    }
    if (($apply || $expectedPlan !== '') && !preg_match('/\A[a-f0-9]{64}\z/', $expectedPlan)) {
        throw new RuntimeException('--apply requires --expect-plan= followed by the SHA-256 from a successful dry-run.');
    }
    $root = dirname(__DIR__);
    $config = require bctImportPath($root, 'private/gallery-import.config.php');
    if (!is_array($config)) {
        throw new RuntimeException('Invalid import configuration.');
    }
    bctImportValidateTarget($config, $expected);
    foreach (['pdo_mysql', 'fileinfo'] as $extension) {
        if (!extension_loaded($extension)) {
            throw new RuntimeException('Enable the PHP CLI extension: ' . $extension);
        }
    }
    $manifestPath = bctImportPath($root, 'private/gallery-import.manifest.json');
    if (!is_file($manifestPath) || filesize($manifestPath) > 16 * 1024 * 1024) {
        throw new RuntimeException('Manifest is not a file or exceeds 16 MiB.');
    }
    $manifest = json_decode(file_get_contents($manifestPath), true, 128, JSON_THROW_ON_ERROR);
    if (!is_array($manifest)) {
        throw new RuntimeException('Invalid manifest.');
    }
    $plan = bctImportPlan($manifest, $root);
    if ($expectedPlan !== '' && !hash_equals($plan['fingerprint'], $expectedPlan)) {
        throw new RuntimeException('The import plan changed since review. Run and review a new dry-run.');
    }
    $uploadRoot = bctImportPath($root, 'httpdocs/uploads/gallery');
    bctImportPath($root, 'httpdocs/uploads/gallery/.htaccess');
    $privateRoot = bctImportPath($root, 'private');
    if (!is_dir($uploadRoot) || !is_writable($uploadRoot) || !is_writable($privateRoot)) {
        throw new RuntimeException('private and uploads/gallery must be writable directories.');
    }
    if (file_exists(bctImportPath($root, 'private/gallery-import-run.jsonl', false))) {
        throw new RuntimeException('An import journal already exists. Inspect it before another import.');
    }
    $free = disk_free_space($uploadRoot);
    if ($free === false || $free < $plan['bytes'] + 64 * 1024 * 1024) {
        throw new RuntimeException('Cannot confirm enough disk space for copies plus a 64 MiB reserve.');
    }
    $pdo = new PDO(sprintf('mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4',
        $config['host'], $config['port'], $config['database']), $config['username'], $config['password'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
    if ($pdo->query('SELECT DATABASE()')->fetchColumn() !== $expected) {
        throw new RuntimeException('Connected database does not match --expect-database.');
    }
    $tables = $pdo->query("SELECT TABLE_NAME, ENGINE FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('gallery_locations', 'gallery_media')")->fetchAll();
    if (count($tables) !== 2) {
        throw new RuntimeException('Import the structure of both gallery tables first; this script does not create tables.');
    }
    foreach ($tables as $table) {
        if (strtolower((string) $table['ENGINE']) !== 'innodb') {
            throw new RuntimeException('Both gallery tables must use InnoDB for safe rollback.');
        }
    }
    // A preparation database should not have triggers with unreviewed side effects.
    $triggers = $pdo->query("SELECT COUNT(*) FROM information_schema.TRIGGERS
        WHERE TRIGGER_SCHEMA = DATABASE() AND EVENT_OBJECT_TABLE IN ('gallery_locations', 'gallery_media')")->fetchColumn();
    if ((int) $triggers !== 0) {
        throw new RuntimeException('Gallery triggers found. Review them before using this importer.');
    }
    $foreignKey = $pdo->query("SELECT COUNT(*) FROM information_schema.KEY_COLUMN_USAGE k
        JOIN information_schema.REFERENTIAL_CONSTRAINTS r
        ON r.CONSTRAINT_SCHEMA = k.CONSTRAINT_SCHEMA AND r.CONSTRAINT_NAME = k.CONSTRAINT_NAME
        AND r.TABLE_NAME = k.TABLE_NAME
        WHERE k.TABLE_SCHEMA = DATABASE() AND k.TABLE_NAME = 'gallery_media'
        AND k.COLUMN_NAME = 'location_id' AND k.REFERENCED_TABLE_SCHEMA = DATABASE()
        AND k.REFERENCED_TABLE_NAME = 'gallery_locations' AND k.REFERENCED_COLUMN_NAME = 'location_id'
        AND r.DELETE_RULE = 'CASCADE'")->fetchColumn();
    if ((int) $foreignKey < 1) {
        throw new RuntimeException('Expected gallery_media foreign key with ON DELETE CASCADE is missing.');
    }
    // Also verify required columns before displaying a successful dry-run.
    $pdo->query('SELECT location_id, journey_order, journey_date, location_fr, location_en,
        description_fr, description_en, distance_km, latitude, longitude FROM gallery_locations LIMIT 0');
    $pdo->query('SELECT media_id, location_id, media_type, file_path, mime_type, file_size, sort_order FROM gallery_media LIMIT 0');
    bctImportAssertEmpty($pdo);
    echo ($apply ? 'APPLY' : 'DRY-RUN') . ' target: ' . $config['host'] . ':' . $config['port'] . '/' . $expected . "\n";
    foreach ($plan['locations'] as $location) {
        $f = $location['fields'];
        echo sprintf("%02d | %s | %s | %d media\n", $f['journey_order'], $f['journey_date'], $f['location_fr'], count($location['media']));
    }
    echo sprintf("Total: %d locations, %d media, %.2f MiB to copy\n", count($plan['locations']), $plan['media_count'], $plan['bytes'] / 1048576);
    echo 'Plan SHA-256: ' . $plan['fingerprint'] . "\n";
    foreach ($plan['warnings'] as $warning) {
        echo 'NOTE: ' . $warning . "\n";
    }
    if (!$apply) {
        echo "Dry-run passed. No records, files or directories were created/changed.\n";
        exit(0);
    }
    // Connection-local settings only, after explicit --apply. No global server changes.
    $pdo->exec('SET SESSION innodb_lock_wait_timeout = 10');
    $pdo->exec('SET TRANSACTION ISOLATION LEVEL SERIALIZABLE');
    $result = bctImportApply($pdo, $plan, $root, $expected);
    echo "Import committed. Original media and private/config.php are unchanged.\n";
    foreach ($result['mapping'] as $mapping) {
        echo 'Journey ' . $mapping['journey_order'] . ' -> location_id ' . $mapping['location_id'] . "\n";
    }
    if ($result['warning'] !== '') {
        echo 'WARNING: ' . $result['warning'] . "\n";
    }
} catch (Throwable $error) {
    $databaseError = $error instanceof PDOException || $error->getPrevious() instanceof PDOException;
    fwrite(STDERR, $databaseError
        ? "Import stopped by a database error. Check the local schema/permissions and preserve any import journal before retrying.\n"
        : 'Import stopped: ' . $error->getMessage() . "\n");
    exit(1);
}
