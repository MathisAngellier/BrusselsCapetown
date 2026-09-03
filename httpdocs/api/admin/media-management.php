<?php

declare(strict_types=1);

function bctReadLocationMedia(PDO $pdo, int $locationId, bool $lock = false): array
{
    $statement = $pdo->prepare(
        'SELECT media_id, location_id, media_type, file_path, mime_type, file_size, sort_order
         FROM gallery_media WHERE location_id = :location_id
         ORDER BY sort_order ASC, media_id ASC' . ($lock ? ' FOR UPDATE' : '')
    );
    $statement->execute(['location_id' => $locationId]);
    return $statement->fetchAll();
}

function bctMediaRevision(array $rows): string
{
    $values = [];
    foreach ($rows as $row) {
        $values[] = [(int) $row['media_id'], (int) $row['sort_order'], (string) $row['file_path']];
    }
    return hash('sha256', json_encode($values, JSON_THROW_ON_ERROR));
}

function bctSafeMediaPath(array $row, int $locationId): bool
{
    if ((int) $row['location_id'] !== $locationId || !in_array($row['media_type'], ['image', 'video'], true)) {
        return false;
    }
    $extensions = $row['media_type'] === 'image' ? 'jpg|jpeg|png|webp|gif' : 'mp4|webm|mov|m4v';
    return preg_match('~\A/uploads/gallery/' . $locationId . '/[A-Za-z0-9_-]+\.(?:' . $extensions . ')\z~i', (string) $row['file_path']) === 1;
}

function bctMediaPayload(array $rows, int $locationId): array
{
    return [
        'success' => true,
        'revision' => bctMediaRevision($rows),
        'media' => array_map(static function (array $row) use ($locationId): array {
            return [
                'media_id' => (int) $row['media_id'],
                'media_type' => $row['media_type'],
                'url' => bctSafeMediaPath($row, $locationId) ? $row['file_path'] : null,
                'file_size' => (int) $row['file_size'],
                'sort_order' => (int) $row['sort_order'],
            ];
        }, $rows),
    ];
}

function bctValidateMediaOrder($json, array $rows): array
{
    if (!is_string($json) || strlen($json) > 1048576) {
        throw new InvalidArgumentException('Invalid media order.');
    }
    try { $ids = json_decode($json, false, 512, JSON_THROW_ON_ERROR); }
    catch (Throwable $error) { throw new InvalidArgumentException('Invalid media order.'); }
    if (!is_array($ids) || array_values($ids) !== $ids || count($ids) !== count($rows)) {
        throw new InvalidArgumentException('The order must include every media item exactly once.');
    }
    foreach ($ids as $id) {
        if (!is_int($id) || $id < 1) {
            throw new InvalidArgumentException('Invalid media ID in the order.');
        }
    }
    $expected = array_map(static function (array $row): int { return (int) $row['media_id']; }, $rows);
    $actual = $ids;
    sort($expected);
    sort($actual);
    if ($expected !== $actual || count(array_unique($ids)) !== count($ids)) {
        throw new InvalidArgumentException('The order must contain only media from this location, each exactly once.');
    }
    return $ids;
}

/** Move the exact file out of the webroot before deleting its database row. */
function bctStageMediaDeletion(array $row, int $locationId, ?string $uploadRoot = null, ?string $privateRoot = null): array
{
    if (!bctSafeMediaPath($row, $locationId)) {
        throw new RuntimeException('Unsafe media path; deletion refused.');
    }
    $uploadRoot = $uploadRoot ?? dirname(__DIR__, 2) . '/uploads/gallery';
    $privateRoot = $privateRoot ?? dirname(__DIR__, 3) . '/private';
    $directory = $uploadRoot . '/' . $locationId;
    $source = $directory . '/' . basename($row['file_path']);
    foreach ([dirname($uploadRoot), $uploadRoot, $directory, $source, $privateRoot] as $path) {
        if (is_link($path)) { throw new RuntimeException('Symbolic links are not valid media destinations.'); }
    }
    $staged = ['source' => $source, 'staged' => null, 'manifest' => null];
    // A broken/missing upload can still be removed from the database.
    if (!file_exists($source)) { return $staged; }
    if (!is_file($source) || dirname((string) realpath($source)) !== realpath($directory)
        || dirname((string) realpath($directory)) !== realpath($uploadRoot)) {
        throw new RuntimeException('Invalid media destination.');
    }
    if (!is_dir($privateRoot) || !is_writable($privateRoot)) {
        throw new RuntimeException('The private recovery directory is not writable.');
    }
    $trash = $privateRoot . '/gallery-trash';
    if (is_link($trash) || (!is_dir($trash) && !@mkdir($trash, 0700))
        || dirname((string) realpath($trash)) !== realpath($privateRoot)) {
        throw new RuntimeException('The private recovery directory could not be created.');
    }
    $base = $trash . '/' . (int) $row['media_id'] . '-' . bin2hex(random_bytes(16));
    $staged['staged'] = $base . '.bin';
    $staged['manifest'] = $base . '.json';
    $manifest = json_encode([
        'media_id' => (int) $row['media_id'], 'location_id' => $locationId,
        'file_path' => $row['file_path'], 'created_at' => gmdate('c'),
    ], JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES);
    $handle = @fopen($staged['manifest'], 'x');
    if ($handle === false) { throw new RuntimeException('Could not create a recovery manifest.'); }
    @chmod($staged['manifest'], 0600);
    $written = fwrite($handle, $manifest);
    fclose($handle);
    if ($written !== strlen($manifest) || !@rename($source, $staged['staged'])) {
        @unlink($staged['manifest']);
        throw new RuntimeException('The media file could not be staged for deletion.');
    }
    return $staged;
}

function bctRestoreStagedMedia(array $staged): bool
{
    if ($staged['staged'] === null) { return true; }
    // Never overwrite a different file if recovery itself runs into a conflict.
    if (file_exists($staged['source']) || is_link($staged['source'])
        || !@rename($staged['staged'], $staged['source'])) {
        return false;
    }
    return @unlink($staged['manifest']);
}

function bctFinishMediaDeletion(array $staged): bool
{
    if ($staged['staged'] === null) { return true; }
    if (!@unlink($staged['staged'])) { return false; }
    return @unlink($staged['manifest']);
}
