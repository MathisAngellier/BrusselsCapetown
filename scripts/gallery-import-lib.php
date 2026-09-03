<?php

declare(strict_types=1);

// No bootstrap, session, database connection or filesystem writes on require.

/** Resolve paths strictly beneath a real root; reject traversal and symlinks. */
function bctImportPath(string $root, string $relative, bool $exists = true): string
{
    $base = realpath($root);
    if ($base === false || !is_dir($base) || $relative === ''
        || str_contains($relative, '\\') || str_contains($relative, "\0")) {
        throw new RuntimeException('Invalid import path.');
    }
    $path = $base;
    foreach (explode('/', $relative) as $part) {
        if ($part === '' || $part === '.' || $part === '..') {
            throw new RuntimeException('Unsafe import path: ' . $relative);
        }
        $path .= DIRECTORY_SEPARATOR . $part;
        if (is_link($path)) {
            throw new RuntimeException('Symlink refused: ' . $relative);
        }
    }
    if ($exists && !file_exists($path)) {
        throw new RuntimeException('Missing path: ' . $relative);
    }
    return $path;
}

function bctImportText($value, int $maximum, bool $required, string $field): string
{
    if (!is_string($value) || !preg_match('//u', $value)) {
        throw new RuntimeException('Invalid UTF-8 text: ' . $field);
    }
    preg_match_all('/./us', $value, $characters);
    if (($required && trim($value) === '') || count($characters[0]) > $maximum) {
        throw new RuntimeException('Empty or too long: ' . $field);
    }
    return $value; // Preserve the already-reviewed translations, including line breaks.
}

function bctImportNumber($value, float $min, float $max, string $field): float
{
    if ((!is_int($value) && !is_float($value)) || !is_finite((float) $value)
        || $value < $min || $value > $max) {
        throw new RuntimeException('Invalid number: ' . $field);
    }
    return (float) $value;
}

/** Read and hash media without loading whole photos/videos into memory. */
function bctImportMedia(array $media, string $root): array
{
    $source = $media['src'] ?? null;
    $type = $media['type'] ?? null;
    if (!is_string($source) || !preg_match('~\A/(img|video)/gallery/[A-Za-z0-9_-]+\.(jpg|jpeg|png|webp|gif|mp4|webm|mov|m4v)\z~i', $source, $match)) {
        throw new RuntimeException('Unsupported source media path.');
    }
    $path = bctImportPath($root, 'httpdocs/public' . $source);
    if (!is_file($path) || !is_readable($path)) {
        throw new RuntimeException('Unreadable media: ' . $source);
    }
    $size = filesize($path);
    if ($size === false || $size < 1) {
        throw new RuntimeException('Empty media: ' . $source);
    }
    $mime = (new finfo(FILEINFO_MIME_TYPE))->file($path);
    $types = [
        'image/jpeg' => ['image', ['jpg', 'jpeg'], 'jpg'],
        'image/png' => ['image', ['png'], 'png'],
        'image/webp' => ['image', ['webp'], 'webp'],
        'image/gif' => ['image', ['gif'], 'gif'],
        'video/mp4' => ['video', ['mp4', 'm4v'], 'mp4'],
        'video/webm' => ['video', ['webm'], 'webm'],
        'video/quicktime' => ['video', ['mov'], 'mov'],
        'video/x-m4v' => ['video', ['m4v'], 'm4v'],
    ];
    $rule = $types[$mime] ?? null;
    if ($rule === null || $rule[0] !== $type || !in_array(strtolower($match[2]), $rule[1], true)
        || ($type === 'image' && @getimagesize($path) === false)) {
        throw new RuntimeException('Media content/type/extension mismatch: ' . $source);
    }
    $sha = hash_file('sha256', $path);
    if ($sha === false) {
        throw new RuntimeException('Cannot hash media: ' . $source);
    }
    return ['source' => $source, 'relative' => 'httpdocs/public' . $source,
        'type' => $type, 'mime' => $mime, 'size' => $size, 'sha256' => $sha,
        'extension' => $rule[2]];
}

function bctImportPlan(array $manifest, string $root): array
{
    if (($manifest['version'] ?? null) !== 1 || !isset($manifest['locations'])
        || !is_array($manifest['locations']) || !array_is_list($manifest['locations'])
        || $manifest['locations'] === [] || count($manifest['locations']) > 10000) {
        throw new RuntimeException('Unsupported or empty import manifest.');
    }
    $source = bctImportPath($root, 'httpdocs/src/assets/js/galleryData.js');
    if (($manifest['sourcePath'] ?? null) !== 'httpdocs/src/assets/js/galleryData.js'
        || !is_string($manifest['sourceSha256'] ?? null)
        || !hash_equals(hash_file('sha256', $source), $manifest['sourceSha256'])) {
        throw new RuntimeException('galleryData.js changed since export. Review and export again.');
    }
    $plan = ['locations' => [], 'warnings' => [], 'bytes' => 0, 'media_count' => 0];
    $keys = [];
    $oldIds = [];
    $previousDate = '';
    foreach ($manifest['locations'] as $index => $location) {
        if (!is_array($location)) {
            throw new RuntimeException('Invalid location entry.');
        }
        $date = $location['date'] ?? '';
        $parsed = is_string($date) ? DateTimeImmutable::createFromFormat('!Y-m-d', $date) : false;
        if ($parsed === false || !preg_match('/\A[0-9]{4}-[0-9]{2}-[0-9]{2}\z/', $date)
            || $parsed->format('Y-m-d') !== $date || (int) substr($date, 0, 4) < 1000
            || $date < $previousDate) {
            throw new RuntimeException('Invalid date or journey order at position ' . ($index + 1));
        }
        $previousDate = $date;
        if (($location['isDeparture'] ?? false) === true && $index !== 0) {
            throw new RuntimeException('The departure location must be first.');
        }
        $fields = ['journey_order' => $index + 1, 'journey_date' => $date];
        foreach (['location' => 150, 'description' => 10000] as $name => $limit) {
            foreach (['fr', 'en'] as $lang) {
                $fields[$name . '_' . $lang] = bctImportText(
                    $location[$name][$lang] ?? ($name === 'description' ? '' : null),
                    $limit, $name === 'location', $name . '_' . $lang
                );
            }
        }
        $fields['distance_km'] = bctImportNumber($location['distance'] ?? null, 0, 999999.99, 'distance');
        $fields['latitude'] = bctImportNumber($location['latitude'] ?? null, -90, 90, 'latitude');
        $fields['longitude'] = bctImportNumber($location['longitude'] ?? null, -180, 180, 'longitude');
        if ($index === 0 && $fields['distance_km'] !== 0.0) {
            throw new RuntimeException('The frontend treats the first stop as departure; its distance must be zero.');
        }
        $key = $date . "\n" . trim($fields['location_fr']);
        if (isset($keys[$key])) {
            throw new RuntimeException('Duplicate date/location in manifest.');
        }
        $keys[$key] = true;
        if (isset($location['id']) && (is_int($location['id']) || is_string($location['id']))) {
            $oldId = (string) $location['id'];
            if (isset($oldIds[$oldId])) {
                $plan['warnings'][] = 'Repeated static ID ' . $oldId . ': new database IDs will be allocated.';
            }
            $oldIds[$oldId] = true;
        }
        $mediaList = $location['media'] ?? [];
        if (!is_array($mediaList) || !array_is_list($mediaList)) {
            throw new RuntimeException('Invalid media list.');
        }
        $files = [];
        $seen = [];
        foreach ($mediaList as $media) {
            if (!is_array($media)) {
                throw new RuntimeException('Invalid media entry.');
            }
            $file = bctImportMedia($media, $root);
            if (isset($seen[$file['source']])) {
                throw new RuntimeException('Repeated media within one location: ' . $file['source']);
            }
            $seen[$file['source']] = true;
            $files[] = $file;
            $plan['bytes'] += $file['size'];
            $plan['media_count']++;
        }
        $plan['locations'][] = ['fields' => $fields, 'media' => $files];
    }
    $plan['fingerprint'] = hash('sha256', json_encode($plan['locations'], JSON_THROW_ON_ERROR));
    return $plan;
}

/** This preparation tool intentionally cannot target production or the normal local DB. */
function bctImportValidateTarget(array $config, string $expected): void
{
    if (!preg_match('/\A[a-zA-Z0-9_]+_migration_test\z/', $expected)
        || ($config['database'] ?? null) !== $expected
        || !in_array($config['host'] ?? null, ['localhost', '127.0.0.1', '::1'], true)
        || !is_int($config['port'] ?? null) || $config['port'] < 1 || $config['port'] > 65535
        || !is_string($config['username'] ?? null) || $config['username'] === ''
        || !is_string($config['password'] ?? null)) {
        throw new RuntimeException('Only an explicitly named local *_migration_test database is allowed.');
    }
}

function bctImportAssertEmpty(PDO $pdo, bool $lock = false): void
{
    foreach (['gallery_locations' => 'location_id', 'gallery_media' => 'media_id'] as $table => $id) {
        $sql = 'SELECT ' . $id . ' FROM ' . $table . ' ORDER BY ' . $id . ($lock ? ' FOR UPDATE' : '');
        if ($pdo->query($sql)->fetchColumn() !== false) {
            throw new RuntimeException('Import refused: ' . $table . ' is not empty. No existing records are replaced.');
        }
    }
}

function bctImportJournal($handle, array $event): void
{
    $line = json_encode($event, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . "\n";
    if (fwrite($handle, $line) !== strlen($line) || !fflush($handle)
        || (function_exists('fsync') && !fsync($handle))) {
        throw new RuntimeException('Recovery journal write failed.');
    }
}

/** Never overwrite a destination; verify copied bytes against the reviewed dry-run plan. */
function bctImportCopy(string $source, string $target, array $media, array &$created): void
{
    $in = fopen($source, 'rb');
    if ($in === false) {
        throw new RuntimeException('Cannot read source media.');
    }
    $out = @fopen($target, 'x+b');
    if ($out === false) {
        fclose($in);
        throw new RuntimeException('Destination exists or is not writable.');
    }
    $created[$target] = $media['sha256'];
    try {
        $written = stream_copy_to_stream($in, $out);
        if ($written !== $media['size'] || !fflush($out)
            || (function_exists('fsync') && !fsync($out))) {
            throw new RuntimeException('Media copy failed.');
        }
    } finally {
        fclose($in);
        fclose($out);
    }
    if (!hash_equals($media['sha256'], hash_file('sha256', $target))) {
        throw new RuntimeException('Source changed or copy checksum mismatch.');
    }
    if (!chmod($target, 0644)) {
        throw new RuntimeException('Cannot set media permissions.');
    }
}

/** Core import, after target/schema validation. Only INSERT, never UPDATE/DELETE/TRUNCATE. */
function bctImportApply(PDO $pdo, array $plan, string $root, string $database): array
{
    bctImportAssertEmpty($pdo);
    bctImportPath($root, 'private');
    bctImportPath($root, 'httpdocs/uploads/gallery');
    $journalPath = bctImportPath($root, 'private/gallery-import-run.jsonl', false);
    $journal = @fopen($journalPath, 'x+b');
    if ($journal === false) {
        throw new RuntimeException('An import journal already exists, or private is not writable. Review it before retrying.');
    }
    $files = [];
    $directories = [];
    $mapping = [];
    $storedMedia = [];
    $commitStarted = false;
    $committed = false;
    try {
        if (!chmod($journalPath, 0600)) {
            throw new RuntimeException('Cannot protect the recovery journal.');
        }
        bctImportJournal($journal, ['event' => 'start', 'database' => $database,
            'fingerprint' => $plan['fingerprint'], 'started_at' => gmdate('c')]);
        $pdo->beginTransaction();
        // SERIALIZABLE is set by the CLI. InnoDB next-key locks protect empty ranges.
        bctImportAssertEmpty($pdo, true);
        $insertLocation = $pdo->prepare('INSERT INTO gallery_locations
            (journey_order, journey_date, location_fr, location_en, description_fr, description_en, distance_km, latitude, longitude)
            VALUES (:journey_order, :journey_date, :location_fr, :location_en, :description_fr, :description_en, :distance_km, :latitude, :longitude)');
        $insertMedia = $pdo->prepare('INSERT INTO gallery_media
            (location_id, media_type, file_path, mime_type, file_size, sort_order)
            VALUES (:location_id, :media_type, :file_path, :mime_type, :file_size, :sort_order)');
        foreach ($plan['locations'] as $location) {
            $insertLocation->execute($location['fields']);
            $id = filter_var($pdo->lastInsertId(), FILTER_VALIDATE_INT,
                ['options' => ['min_range' => 1, 'max_range' => 4294967295]]);
            if ($id === false) {
                throw new RuntimeException('Invalid generated location ID.');
            }
            $mapping[] = ['journey_order' => $location['fields']['journey_order'], 'location_id' => $id];
            bctImportJournal($journal, ['event' => 'location', 'location_id' => $id, 'fields' => $location['fields']]);
            if ($location['media'] === []) {
                continue;
            }
            $relativeDir = 'httpdocs/uploads/gallery/' . $id;
            $dir = bctImportPath($root, $relativeDir, false);
            bctImportJournal($journal, ['event' => 'create_directory', 'relative' => $relativeDir]);
            if (!@mkdir($dir, 0755)) {
                throw new RuntimeException('Location upload directory already exists or cannot be created: ' . $id);
            }
            $directories[] = $dir;
            foreach ($location['media'] as $order => $media) {
                $src = bctImportPath($root, $media['relative']);
                $public = '/uploads/gallery/' . $id . '/' . bin2hex(random_bytes(16)) . '.' . $media['extension'];
                $target = bctImportPath($root, 'httpdocs' . $public, false);
                bctImportJournal($journal, ['event' => 'copy', 'source' => $media['source'],
                    'file_path' => $public, 'sha256' => $media['sha256'], 'size' => $media['size']]);
                bctImportCopy($src, $target, $media, $files);
                $mediaRow = ['location_id' => $id, 'media_type' => $media['type'],
                    'file_path' => $public, 'mime_type' => $media['mime'],
                    'file_size' => $media['size'], 'sort_order' => $order];
                $insertMedia->execute($mediaRow);
                $storedMedia[] = $mediaRow;
            }
        }
        // Detect coercion/truncation in schema variants before committing.
        $readLocation = $pdo->prepare('SELECT journey_order, journey_date, location_fr, location_en,
            description_fr, description_en, distance_km, latitude, longitude
            FROM gallery_locations WHERE location_id = ?');
        foreach ($mapping as $index => $item) {
            $readLocation->execute([$item['location_id']]);
            $actual = $readLocation->fetch(PDO::FETCH_ASSOC);
            foreach ($plan['locations'][$index]['fields'] as $field => $expected) {
                $numeric = in_array($field, ['journey_order', 'distance_km', 'latitude', 'longitude'], true);
                if (!is_array($actual) || !array_key_exists($field, $actual)
                    || ($numeric ? (float) $actual[$field] !== (float) $expected : (string) $actual[$field] !== $expected)) {
                    throw new RuntimeException('Database changed an imported value: ' . $field);
                }
            }
        }
        if ((int) $pdo->query('SELECT COUNT(*) FROM gallery_media')->fetchColumn() !== $plan['media_count']) {
            throw new RuntimeException('Unexpected imported media count.');
        }
        $actualMedia = $pdo->query('SELECT location_id, media_type, file_path, mime_type, file_size, sort_order
            FROM gallery_media ORDER BY location_id, sort_order, media_id')->fetchAll(PDO::FETCH_ASSOC);
        foreach ($storedMedia as $index => $row) {
            foreach ($row as $field => $expected) {
                if ((string) ($actualMedia[$index][$field] ?? '') !== (string) $expected) {
                    throw new RuntimeException('Database changed an imported media value: ' . $field);
                }
            }
        }
        bctImportJournal($journal, ['event' => 'commit_pending', 'mapping' => $mapping]);
        $commitStarted = true;
        if (!$pdo->commit()) {
            throw new RuntimeException('Database commit was not confirmed.');
        }
        $committed = true;
        bctImportJournal($journal, ['event' => 'committed']);
        return ['mapping' => $mapping, 'warning' => ''];
    } catch (Throwable $error) {
        // After confirmed commit, a journal failure must never remove referenced files.
        if ($committed) {
            return ['mapping' => $mapping, 'warning' => 'Import committed, but the final journal entry failed. Preserve and inspect the journal.'];
        }
        $rolledBack = false;
        try {
            if ($pdo->inTransaction()) {
                $rolledBack = $pdo->rollBack();
            } elseif (!$commitStarted) {
                $rolledBack = true;
            }
        } catch (Throwable $ignored) {
            // Keep all files if the database outcome cannot be confirmed.
        }
        $cleanupComplete = $rolledBack;
        if ($rolledBack) {
            foreach ($files as $file => $sha) {
                // Only this run's exact, unchanged copies; partial/replaced files are kept.
                try {
                    bctImportPath($root, str_replace(DIRECTORY_SEPARATOR, '/', substr($file, strlen((string) realpath($root)) + 1)));
                } catch (Throwable $ignored) {
                    $cleanupComplete = false;
                    continue;
                }
                if (is_link($file) || !is_file($file) || !hash_equals($sha, (string) @hash_file('sha256', $file))
                    || !@unlink($file)) {
                    $cleanupComplete = false;
                }
            }
            foreach (array_reverse($directories) as $directory) {
                if (is_link($directory) || !@rmdir($directory)) {
                    $cleanupComplete = false;
                }
            }
        }
        try {
            bctImportJournal($journal, ['event' => 'failed', 'rollback_confirmed' => $rolledBack,
                'cleanup_complete' => $cleanupComplete]);
        } catch (Throwable $ignored) {
        }
        throw new RuntimeException(($rolledBack ? 'Database rolled back. ' : 'Database outcome uncertain; copies preserved. ')
            . 'Review private/gallery-import-run.jsonl before retrying. ' . $error->getMessage(), 0, $error);
    } finally {
        fclose($journal);
    }
}
