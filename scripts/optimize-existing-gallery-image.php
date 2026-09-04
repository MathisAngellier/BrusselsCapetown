<?php

declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require_once dirname(__DIR__) . '/httpdocs/api/admin/media-upload.php';

function bctOptimizerUsage(): string
{
    return <<<'TEXT'
Safely optimize existing gallery images one item at a time.

List candidates (read-only):
  php scripts/optimize-existing-gallery-image.php --expect-database=DATABASE
  php scripts/optimize-existing-gallery-image.php --expect-database=DATABASE --media-id=123

Create a required backup for one candidate:
  php scripts/optimize-existing-gallery-image.php --expect-database=DATABASE --media-id=123 \
    --expect-item=ITEM_SHA256 --backup=/absolute/path/to/new-backup-directory

Apply after the backup succeeds:
  php scripts/optimize-existing-gallery-image.php --expect-database=DATABASE --media-id=123 \
    --expect-item=ITEM_SHA256 --backup-manifest=/absolute/path/to/backup-manifest.json --apply

Restore the original after an applied conversion:
  php scripts/optimize-existing-gallery-image.php --expect-database=DATABASE --media-id=123 \
    --expect-item=ITEM_SHA256 --backup-manifest=/absolute/path/to/backup-manifest.json --restore

The apply mode refuses multiple media IDs, existing WebP files, changed rows, changed source
files, missing backups, backups inside httpdocs, and database-name mismatches. Restore never
overwrites a file and keeps the optimized WebP as an additional recovery copy.
TEXT;
}

function bctOptimizerFail(string $message): void
{
    fwrite(STDERR, 'ERROR: ' . $message . PHP_EOL);
    exit(1);
}

function bctOptimizerOptionString(array $options, string $name): ?string
{
    if (!array_key_exists($name, $options)) {
        return null;
    }

    $value = $options[$name];
    if (!is_string($value) || trim($value) === '') {
        bctOptimizerFail('--' . $name . ' requires a value.');
    }

    return trim($value);
}

function bctOptimizerMediaId(?string $value): ?int
{
    if ($value === null) {
        return null;
    }

    if (!preg_match('/^[1-9][0-9]*$/D', $value)) {
        bctOptimizerFail('--media-id must be one positive integer.');
    }

    $mediaId = (int) $value;
    if ($mediaId < 1 || (string) $mediaId !== $value) {
        bctOptimizerFail('--media-id is outside the supported integer range.');
    }

    return $mediaId;
}

function bctOptimizerIsAbsolutePath(string $path): bool
{
    return str_starts_with($path, '/')
        || preg_match('~^[A-Za-z]:[\\\\/]~', $path) === 1;
}

function bctOptimizerNormalizePath(string $path): string
{
    $normalized = rtrim(str_replace('\\', '/', $path), '/');
    return DIRECTORY_SEPARATOR === '\\' ? strtolower($normalized) : $normalized;
}

function bctOptimizerPathIsWithin(string $path, string $root): bool
{
    $path = bctOptimizerNormalizePath($path);
    $root = bctOptimizerNormalizePath($root);
    return $path === $root || str_starts_with($path, $root . '/');
}

function bctOptimizerReadRows(PDO $pdo, ?int $mediaId, bool $lock = false): array
{
    $sql = 'SELECT media_id, location_id, media_type, file_path, mime_type, file_size, sort_order
            FROM gallery_media
            WHERE media_type = :media_type
              AND (mime_type <> :webp_mime OR file_path NOT LIKE :webp_extension)';
    $parameters = [
        'media_type' => 'image',
        'webp_mime' => 'image/webp',
        'webp_extension' => '%.webp',
    ];

    if ($mediaId !== null) {
        $sql .= ' AND media_id = :media_id';
        $parameters['media_id'] = $mediaId;
    }

    $sql .= ' ORDER BY media_id ASC' . ($lock ? ' FOR UPDATE' : '');
    $statement = $pdo->prepare($sql);
    $statement->execute($parameters);
    return $statement->fetchAll(PDO::FETCH_ASSOC);
}

function bctOptimizerResolveItem(array $row, string $uploadRoot): array
{
    $mediaId = (int) ($row['media_id'] ?? 0);
    $locationId = (int) ($row['location_id'] ?? 0);
    $filePath = (string) ($row['file_path'] ?? '');
    $pattern = '~\A/uploads/gallery/' . $locationId
        . '/[A-Za-z0-9_-]+\.(?:jpe?g|png|gif)\z~i';

    if ($mediaId < 1 || $locationId < 1 || ($row['media_type'] ?? '') !== 'image'
        || preg_match($pattern, $filePath) !== 1) {
        throw new RuntimeException('Media row ' . $mediaId . ' has an unsafe or unsupported path.');
    }

    $locationDirectory = $uploadRoot . '/' . $locationId;
    $sourcePath = $locationDirectory . '/' . basename($filePath);
    $realUploadRoot = realpath($uploadRoot);
    $realLocationDirectory = realpath($locationDirectory);
    $realSourcePath = realpath($sourcePath);
    if ($realUploadRoot === false || $realLocationDirectory === false || $realSourcePath === false
        || is_link($locationDirectory) || is_link($sourcePath)
        || !is_file($realSourcePath)
        || dirname($realLocationDirectory) !== $realUploadRoot
        || dirname($realSourcePath) !== $realLocationDirectory) {
        throw new RuntimeException('Media row ' . $mediaId . ' does not resolve to a safe source file.');
    }

    $fileSize = filesize($realSourcePath);
    $sourceHash = hash_file('sha256', $realSourcePath);
    if ($fileSize === false || $fileSize < 1 || !is_string($sourceHash)) {
        throw new RuntimeException('Media row ' . $mediaId . ' has an unreadable source file.');
    }

    if (!class_exists('finfo')) {
        throw new RuntimeException('The PHP Fileinfo extension is required.');
    }
    $fileInfo = new finfo(FILEINFO_MIME_TYPE);
    $actualMimeType = $fileInfo->file($realSourcePath);
    if (!is_string($actualMimeType)
        || !in_array($actualMimeType, ['image/jpeg', 'image/png', 'image/gif'], true)) {
        throw new RuntimeException('Media row ' . $mediaId . ' is not a supported legacy image.');
    }

    $item = [
        'media_id' => $mediaId,
        'location_id' => $locationId,
        'sort_order' => (int) ($row['sort_order'] ?? 0),
        'file_path' => $filePath,
        'database_mime_type' => (string) ($row['mime_type'] ?? ''),
        'database_file_size' => (int) ($row['file_size'] ?? 0),
        'actual_mime_type' => $actualMimeType,
        'actual_file_size' => (int) $fileSize,
        'source_sha256' => $sourceHash,
    ];

    $item['item_sha256'] = hash(
        'sha256',
        json_encode($item, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES)
    );
    $item['source_path'] = $realSourcePath;
    return $item;
}

function bctOptimizerCreateBackup(
    array $item,
    string $expectedItemHash,
    string $backupDirectory,
    string $databaseName,
    string $webRoot
): string {
    if (!hash_equals($item['item_sha256'], $expectedItemHash)) {
        throw new RuntimeException('The item hash does not match. Run the read-only command again.');
    }
    if (!bctOptimizerIsAbsolutePath($backupDirectory)) {
        throw new RuntimeException('--backup must be an absolute path.');
    }
    if (file_exists($backupDirectory) || is_link($backupDirectory)) {
        throw new RuntimeException('The backup directory must not already exist.');
    }

    $parent = realpath(dirname($backupDirectory));
    if ($parent === false || !is_dir($parent) || !is_writable($parent)) {
        throw new RuntimeException('The backup parent directory does not exist or is not writable.');
    }
    if (!@mkdir($backupDirectory, 0700)) {
        throw new RuntimeException('The backup directory could not be created.');
    }

    $realBackupDirectory = realpath($backupDirectory);
    if ($realBackupDirectory === false || bctOptimizerPathIsWithin($realBackupDirectory, $webRoot)) {
        @rmdir($backupDirectory);
        throw new RuntimeException('The backup directory must be outside httpdocs.');
    }

    $extension = strtolower((string) pathinfo($item['file_path'], PATHINFO_EXTENSION));
    $backupFileName = 'media-' . $item['media_id'] . '-original.' . $extension;
    $backupPath = $realBackupDirectory . '/' . $backupFileName;
    $source = @fopen($item['source_path'], 'rb');
    $destination = @fopen($backupPath, 'xb');
    if ($source === false || $destination === false) {
        if (is_resource($source)) {
            fclose($source);
        }
        if (is_resource($destination)) {
            fclose($destination);
        }
        @unlink($backupPath);
        @rmdir($realBackupDirectory);
        throw new RuntimeException('The source backup could not be created.');
    }

    $copiedBytes = stream_copy_to_stream($source, $destination);
    fclose($source);
    fclose($destination);
    @chmod($backupPath, 0600);
    $backupHash = is_file($backupPath) ? hash_file('sha256', $backupPath) : false;
    if ($copiedBytes !== $item['actual_file_size'] || !is_string($backupHash)
        || !hash_equals($item['source_sha256'], $backupHash)) {
        @unlink($backupPath);
        @rmdir($realBackupDirectory);
        throw new RuntimeException('The source backup failed its integrity check.');
    }

    $manifest = [
        'version' => 1,
        'created_at' => gmdate('c'),
        'database' => $databaseName,
        'item' => array_diff_key($item, ['source_path' => true]),
        'backup_file' => $backupFileName,
        'backup_sha256' => $backupHash,
    ];
    $manifestJson = json_encode(
        $manifest,
        JSON_THROW_ON_ERROR | JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES
    ) . PHP_EOL;
    $manifestPath = $realBackupDirectory . '/backup-manifest.json';
    $manifestHandle = @fopen($manifestPath, 'xb');
    if ($manifestHandle === false) {
        @unlink($backupPath);
        @rmdir($realBackupDirectory);
        throw new RuntimeException('The backup manifest could not be created.');
    }
    $written = fwrite($manifestHandle, $manifestJson);
    fclose($manifestHandle);
    @chmod($manifestPath, 0600);
    if ($written !== strlen($manifestJson)) {
        @unlink($manifestPath);
        @unlink($backupPath);
        @rmdir($realBackupDirectory);
        throw new RuntimeException('The backup manifest could not be written completely.');
    }

    return $manifestPath;
}

function bctOptimizerVerifyBackup(
    string $manifestPath,
    array $item,
    string $expectedItemHash,
    string $databaseName,
    string $webRoot
): void {
    if (!bctOptimizerIsAbsolutePath($manifestPath)) {
        throw new RuntimeException('--backup-manifest must be an absolute path.');
    }
    $realManifestPath = realpath($manifestPath);
    if ($realManifestPath === false || !is_file($realManifestPath)
        || bctOptimizerPathIsWithin($realManifestPath, $webRoot)) {
        throw new RuntimeException('The backup manifest is missing or is inside httpdocs.');
    }

    $manifestBytes = file_get_contents($realManifestPath);
    $manifest = is_string($manifestBytes)
        ? json_decode($manifestBytes, true, 64, JSON_THROW_ON_ERROR)
        : null;
    if (!is_array($manifest) || ($manifest['version'] ?? null) !== 1
        || ($manifest['database'] ?? null) !== $databaseName
        || !is_array($manifest['item'] ?? null)
        || ($manifest['item']['media_id'] ?? null) !== $item['media_id']
        || ($manifest['item']['item_sha256'] ?? null) !== $expectedItemHash
        || !hash_equals($item['item_sha256'], $expectedItemHash)) {
        throw new RuntimeException('The backup manifest does not match the current database item.');
    }

    $backupFileName = $manifest['backup_file'] ?? null;
    $backupHash = $manifest['backup_sha256'] ?? null;
    if (!is_string($backupFileName) || $backupFileName !== basename($backupFileName)
        || !is_string($backupHash) || !preg_match('/^[a-f0-9]{64}$/D', $backupHash)) {
        throw new RuntimeException('The backup manifest contains an invalid backup reference.');
    }

    $backupPath = dirname($realManifestPath) . '/' . $backupFileName;
    $realBackupPath = realpath($backupPath);
    if ($realBackupPath === false || !is_file($realBackupPath)
        || dirname($realBackupPath) !== dirname($realManifestPath)) {
        throw new RuntimeException('The backup file is missing or outside its backup directory.');
    }
    $actualBackupHash = hash_file('sha256', $realBackupPath);
    if (!is_string($actualBackupHash) || !hash_equals($backupHash, $actualBackupHash)
        || !hash_equals($item['source_sha256'], $actualBackupHash)) {
        throw new RuntimeException('The backup file failed its integrity check.');
    }
}

function bctOptimizerReadCurrentRow(PDO $pdo, int $mediaId, bool $lock = false): ?array
{
    $sql = 'SELECT media_id, location_id, media_type, file_path, mime_type, file_size, sort_order
            FROM gallery_media WHERE media_id = :media_id' . ($lock ? ' FOR UPDATE' : '');
    $statement = $pdo->prepare($sql);
    $statement->execute(['media_id' => $mediaId]);
    $row = $statement->fetch(PDO::FETCH_ASSOC);
    return is_array($row) ? $row : null;
}

function bctOptimizerLoadRestoreBackup(
    string $manifestPath,
    int $mediaId,
    string $expectedItemHash,
    string $databaseName,
    string $webRoot
): array {
    if (!bctOptimizerIsAbsolutePath($manifestPath)) {
        throw new RuntimeException('--backup-manifest must be an absolute path.');
    }
    $realManifestPath = realpath($manifestPath);
    if ($realManifestPath === false || !is_file($realManifestPath)
        || bctOptimizerPathIsWithin($realManifestPath, $webRoot)) {
        throw new RuntimeException('The backup manifest is missing or is inside httpdocs.');
    }

    $manifestBytes = file_get_contents($realManifestPath);
    $manifest = is_string($manifestBytes)
        ? json_decode($manifestBytes, true, 64, JSON_THROW_ON_ERROR)
        : null;
    $item = is_array($manifest) && is_array($manifest['item'] ?? null)
        ? $manifest['item']
        : null;
    if (!is_array($manifest) || ($manifest['version'] ?? null) !== 1
        || ($manifest['database'] ?? null) !== $databaseName
        || !is_array($item)
        || ($item['media_id'] ?? null) !== $mediaId
        || ($item['item_sha256'] ?? null) !== $expectedItemHash) {
        throw new RuntimeException('The backup manifest does not match the requested database item.');
    }

    $itemForHash = $item;
    unset($itemForHash['item_sha256']);
    $calculatedItemHash = hash(
        'sha256',
        json_encode($itemForHash, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES)
    );
    if (!hash_equals($expectedItemHash, $calculatedItemHash)) {
        throw new RuntimeException('The backup manifest item failed its integrity check.');
    }

    $backupFileName = $manifest['backup_file'] ?? null;
    $backupHash = $manifest['backup_sha256'] ?? null;
    if (!is_string($backupFileName) || $backupFileName !== basename($backupFileName)
        || !is_string($backupHash) || !preg_match('/^[a-f0-9]{64}$/D', $backupHash)) {
        throw new RuntimeException('The backup manifest contains an invalid backup reference.');
    }
    $backupPath = dirname($realManifestPath) . '/' . $backupFileName;
    $realBackupPath = realpath($backupPath);
    $actualBackupHash = $realBackupPath !== false && is_file($realBackupPath)
        ? hash_file('sha256', $realBackupPath)
        : false;
    if ($realBackupPath === false || dirname($realBackupPath) !== dirname($realManifestPath)
        || !is_string($actualBackupHash)
        || !hash_equals($backupHash, $actualBackupHash)
        || !hash_equals((string) ($item['source_sha256'] ?? ''), $actualBackupHash)) {
        throw new RuntimeException('The backup file failed its integrity check.');
    }

    return ['item' => $item, 'backup_path' => $realBackupPath];
}

function bctOptimizerRestore(PDO $pdo, array $backup, string $uploadRoot): array
{
    $item = $backup['item'];
    $mediaId = (int) $item['media_id'];
    $locationId = (int) $item['location_id'];
    $originalPublicPath = (string) $item['file_path'];
    $expectedOriginalPath = '/uploads/gallery/' . $locationId . '/' . basename($originalPublicPath);
    if ($mediaId < 1 || $locationId < 1 || $originalPublicPath !== $expectedOriginalPath
        || preg_match('~\.(?:jpe?g|png|gif)\z~i', $originalPublicPath) !== 1) {
        throw new RuntimeException('The manifest contains an unsafe original path.');
    }

    $locationDirectory = realpath($uploadRoot . '/' . $locationId);
    $realUploadRoot = realpath($uploadRoot);
    if ($locationDirectory === false || $realUploadRoot === false
        || dirname($locationDirectory) !== $realUploadRoot || is_link($locationDirectory)) {
        throw new RuntimeException('The original gallery directory is unsafe or missing.');
    }
    $originalPath = $locationDirectory . '/' . basename($originalPublicPath);
    if (file_exists($originalPath) || is_link($originalPath)) {
        throw new RuntimeException('Restore refused because the original destination already exists.');
    }

    $temporaryPath = $originalPath . '.restore-' . bin2hex(random_bytes(8)) . '.tmp';
    if (!copy($backup['backup_path'], $temporaryPath)) {
        throw new RuntimeException('The original file could not be copied from the backup.');
    }
    @chmod($temporaryPath, 0644);
    $restoredHash = hash_file('sha256', $temporaryPath);
    if (!is_string($restoredHash) || !hash_equals((string) $item['source_sha256'], $restoredHash)
        || !rename($temporaryPath, $originalPath)) {
        @unlink($temporaryPath);
        throw new RuntimeException('The restored file failed verification or could not be finalized.');
    }

    $optimizedPublicPath = null;
    try {
        $pdo->beginTransaction();
        $current = bctOptimizerReadCurrentRow($pdo, $mediaId, true);
        $optimizedPattern = '~\A/uploads/gallery/' . $locationId . '/[A-Za-z0-9_-]+\.webp\z~i';
        if (!is_array($current) || (int) $current['location_id'] !== $locationId
            || ($current['media_type'] ?? '') !== 'image'
            || ($current['mime_type'] ?? '') !== 'image/webp'
            || preg_match($optimizedPattern, (string) ($current['file_path'] ?? '')) !== 1) {
            throw new RuntimeException('The current database row is not the expected optimized image.');
        }
        $optimizedPublicPath = (string) $current['file_path'];

        $statement = $pdo->prepare(
            'UPDATE gallery_media
             SET file_path = :file_path, mime_type = :mime_type, file_size = :file_size
             WHERE media_id = :media_id AND location_id = :location_id AND file_path = :current_path'
        );
        $statement->execute([
            'file_path' => $originalPublicPath,
            'mime_type' => (string) $item['database_mime_type'],
            'file_size' => (int) $item['database_file_size'],
            'media_id' => $mediaId,
            'location_id' => $locationId,
            'current_path' => $optimizedPublicPath,
        ]);
        if ($statement->rowCount() !== 1 || !$pdo->commit()) {
            throw new RuntimeException('The database refused the guarded restore update.');
        }
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) {
            try {
                $pdo->rollBack();
            } catch (Throwable $rollbackError) {
                // Verify the authoritative database state below.
            }
        }
        try {
            $current = bctOptimizerReadCurrentRow($pdo, $mediaId);
        } catch (Throwable $stateError) {
            throw new RuntimeException(
                'The database state is uncertain. The restored original and optimized WebP were both kept.',
                0,
                $error
            );
        }
        if (($current['file_path'] ?? null) !== $originalPublicPath) {
            @unlink($originalPath);
            throw $error;
        }
    }

    return ['file_path' => $originalPublicPath, 'kept_webp' => $optimizedPublicPath];
}

function bctOptimizerApply(PDO $pdo, array $item, string $uploadRoot): array
{
    $locationDirectory = dirname($item['source_path']);
    $targetFileName = sprintf(
        '%03d-%s.webp',
        $item['sort_order'] + 1,
        bin2hex(random_bytes(16))
    );
    $targetPath = $locationDirectory . '/' . $targetFileName;
    $targetPublicPath = '/uploads/gallery/' . $item['location_id'] . '/' . $targetFileName;
    if (file_exists($targetPath) || is_link($targetPath)) {
        throw new RuntimeException('The generated WebP destination already exists.');
    }

    $optimized = bctOptimizeImageUpload(
        $item['source_path'],
        $targetPath,
        $item['actual_mime_type']
    );
    $committed = false;
    $commitRecovered = false;

    try {
        $pdo->beginTransaction();
        $lockedRows = bctOptimizerReadRows($pdo, $item['media_id'], true);
        if (count($lockedRows) !== 1) {
            throw new RuntimeException('The media row changed before the database update.');
        }
        $lockedItem = bctOptimizerResolveItem($lockedRows[0], $uploadRoot);
        if (!hash_equals($item['item_sha256'], $lockedItem['item_sha256'])) {
            throw new RuntimeException('The media row or source file changed before the database update.');
        }

        $statement = $pdo->prepare(
            'UPDATE gallery_media
             SET file_path = :file_path, mime_type = :mime_type, file_size = :file_size
             WHERE media_id = :media_id AND location_id = :location_id AND file_path = :old_file_path'
        );
        $statement->execute([
            'file_path' => $targetPublicPath,
            'mime_type' => $optimized['mime_type'],
            'file_size' => $optimized['file_size'],
            'media_id' => $item['media_id'],
            'location_id' => $item['location_id'],
            'old_file_path' => $item['file_path'],
        ]);
        if ($statement->rowCount() !== 1) {
            throw new RuntimeException('The database refused the guarded media update.');
        }

        if (!$pdo->commit()) {
            throw new RuntimeException('The database commit did not report success.');
        }
        $committed = true;
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) {
            try {
                $pdo->rollBack();
            } catch (Throwable $rollbackError) {
                // Resolve the authoritative row state below before touching the new file.
            }
        }

        $currentPath = null;
        try {
            $stateStatement = $pdo->prepare(
                'SELECT file_path FROM gallery_media WHERE media_id = :media_id AND location_id = :location_id'
            );
            $stateStatement->execute([
                'media_id' => $item['media_id'],
                'location_id' => $item['location_id'],
            ]);
            $currentPath = $stateStatement->fetchColumn();
        } catch (Throwable $stateError) {
            // An unknown database state must keep both files for manual recovery.
        }

        if ($currentPath === $targetPublicPath) {
            $committed = true;
            $commitRecovered = true;
        } elseif ($currentPath === $item['file_path'] && is_file($targetPath)) {
            @unlink($targetPath);
        }

        if (!$committed) {
            if ($currentPath === null) {
                throw new RuntimeException(
                    'The database state is uncertain. Both source and WebP files were kept for manual recovery.',
                    0,
                    $error
                );
            }
            throw $error;
        }
    }

    $currentSourceHash = is_file($item['source_path'])
        ? hash_file('sha256', $item['source_path'])
        : false;
    $originalRemoved = is_string($currentSourceHash)
        && hash_equals($item['source_sha256'], $currentSourceHash)
        && @unlink($item['source_path']);
    return [
        'file_path' => $targetPublicPath,
        'mime_type' => $optimized['mime_type'],
        'file_size' => $optimized['file_size'],
        'original_removed' => $originalRemoved,
        'commit_recovered' => $commitRecovered,
    ];
}

$options = getopt('', [
    'help',
    'expect-database:',
    'media-id:',
    'expect-item:',
    'backup:',
    'backup-manifest:',
    'apply',
    'restore',
]);
if ($options === false) {
    bctOptimizerFail('The command-line options could not be parsed.');
}
if (isset($options['help'])) {
    echo bctOptimizerUsage() . PHP_EOL;
    exit(0);
}

$expectedDatabase = bctOptimizerOptionString($options, 'expect-database');
if ($expectedDatabase === null) {
    bctOptimizerFail('--expect-database is required.' . PHP_EOL . bctOptimizerUsage());
}
$mediaId = bctOptimizerMediaId(bctOptimizerOptionString($options, 'media-id'));
$expectedItemHash = bctOptimizerOptionString($options, 'expect-item');
$backupDirectory = bctOptimizerOptionString($options, 'backup');
$backupManifest = bctOptimizerOptionString($options, 'backup-manifest');
$apply = isset($options['apply']);
$restore = isset($options['restore']);

if ($apply && $restore) {
    bctOptimizerFail('--apply and --restore cannot be combined.');
}
if ($backupDirectory !== null && ($apply || $restore || $backupManifest !== null)) {
    bctOptimizerFail('--backup cannot be combined with --apply or --backup-manifest.');
}
if ($apply && ($mediaId === null || $expectedItemHash === null || $backupManifest === null)) {
    bctOptimizerFail('--apply requires --media-id, --expect-item and --backup-manifest.');
}
if ($restore && ($mediaId === null || $expectedItemHash === null || $backupManifest === null)) {
    bctOptimizerFail('--restore requires --media-id, --expect-item and --backup-manifest.');
}
if ($backupDirectory !== null && ($mediaId === null || $expectedItemHash === null)) {
    bctOptimizerFail('--backup requires --media-id and --expect-item.');
}
if (!$apply && !$restore && $backupDirectory === null
    && ($expectedItemHash !== null || $backupManifest !== null)) {
    bctOptimizerFail('--expect-item and --backup-manifest are only valid for backup, apply or restore operations.');
}
if ($expectedItemHash !== null && !preg_match('/^[a-f0-9]{64}$/D', $expectedItemHash)) {
    bctOptimizerFail('--expect-item must be a lowercase SHA-256 value.');
}

try {
    require dirname(__DIR__) . '/httpdocs/api/bootstrap.php';
    $databaseName = (string) ($config['database'] ?? '');
    if (!hash_equals($expectedDatabase, $databaseName)) {
        throw new RuntimeException(
            'Connected database "' . $databaseName . '" does not match --expect-database.'
        );
    }

    $uploadRoot = dirname(__DIR__) . '/httpdocs/uploads/gallery';
    $webRoot = realpath(dirname(__DIR__) . '/httpdocs');
    if ($webRoot === false || realpath($uploadRoot) === false) {
        throw new RuntimeException('The gallery upload root is missing.');
    }

    if ($restore) {
        $backup = bctOptimizerLoadRestoreBackup(
            $backupManifest,
            $mediaId,
            $expectedItemHash,
            $databaseName,
            $webRoot
        );
        $result = bctOptimizerRestore($pdo, $backup, $uploadRoot);
        echo 'Restored media ' . $mediaId . ' to its original file.' . PHP_EOL;
        echo 'Restored path: ' . $result['file_path'] . PHP_EOL;
        echo 'Safety copy kept: ' . $result['kept_webp'] . PHP_EOL;
        exit(0);
    }

    $rows = bctOptimizerReadRows($pdo, $mediaId);
    if ($rows === []) {
        throw new RuntimeException(
            $mediaId === null
                ? 'No legacy gallery images need optimization.'
                : 'The selected media ID is missing, unsafe or already WebP.'
        );
    }
    if (($apply || $backupDirectory !== null) && count($rows) !== 1) {
        throw new RuntimeException('Backup and apply modes operate on exactly one media item.');
    }

    $items = [];
    foreach ($rows as $row) {
        $items[] = bctOptimizerResolveItem($row, $uploadRoot);
    }

    if ($backupDirectory !== null) {
        $manifestPath = bctOptimizerCreateBackup(
            $items[0],
            $expectedItemHash,
            $backupDirectory,
            $databaseName,
            $webRoot
        );
        echo 'Backup verified for media ' . $items[0]['media_id'] . '.' . PHP_EOL;
        echo 'Manifest: ' . $manifestPath . PHP_EOL;
        exit(0);
    }

    if ($apply) {
        bctOptimizerVerifyBackup(
            $backupManifest,
            $items[0],
            $expectedItemHash,
            $databaseName,
            $webRoot
        );
        $result = bctOptimizerApply($pdo, $items[0], $uploadRoot);
        echo 'Optimized media ' . $items[0]['media_id'] . ' successfully.' . PHP_EOL;
        echo 'New path: ' . $result['file_path'] . PHP_EOL;
        echo 'New size: ' . number_format($result['file_size'] / 1024 / 1024, 2) . ' MiB' . PHP_EOL;
        if (!$result['original_removed']) {
            fwrite(
                STDERR,
                'WARNING: The database uses the new WebP, but the original file could not be removed.' . PHP_EOL
            );
        }
        if ($result['commit_recovered']) {
            fwrite(
                STDERR,
                'WARNING: The commit response was uncertain, but the database row was verified on the new WebP.' . PHP_EOL
            );
        }
        exit(0);
    }

    echo 'Database: ' . $databaseName . PHP_EOL;
    echo 'Legacy image candidates: ' . count($items) . PHP_EOL;
    foreach ($items as $item) {
        echo PHP_EOL
            . 'Media ID: ' . $item['media_id'] . PHP_EOL
            . 'Location ID: ' . $item['location_id'] . PHP_EOL
            . 'Path: ' . $item['file_path'] . PHP_EOL
            . 'Actual type: ' . $item['actual_mime_type'] . PHP_EOL
            . 'Size: ' . number_format($item['actual_file_size'] / 1024 / 1024, 2) . ' MiB' . PHP_EOL
            . 'ITEM SHA-256: ' . $item['item_sha256'] . PHP_EOL;
    }
    echo PHP_EOL . 'Read-only check complete. No files or database rows were changed.' . PHP_EOL;
} catch (Throwable $error) {
    bctOptimizerFail($error->getMessage());
}
