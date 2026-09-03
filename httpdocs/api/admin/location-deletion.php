<?php

declare(strict_types=1);

require_once __DIR__ . '/location-fields.php';
require_once __DIR__ . '/media-management.php';

function bctReadDeletionLocation(PDO $pdo, int $locationId, bool $lock = false)
{
    $statement = $pdo->prepare(
        'SELECT location_id, journey_order, journey_date, location_fr, location_en,
            distance_km, latitude, longitude, description_fr, description_en
         FROM gallery_locations WHERE location_id = :location_id' . ($lock ? ' FOR UPDATE' : '')
    );
    $statement->execute(['location_id' => $locationId]);
    return $statement->fetch();
}

function bctLocationDeletionRevision(array $location, array $media): string
{
    // A change to either the location or its media invalidates an open confirmation page.
    return hash('sha256', bctLocationRevision($location) . ':' . bctMediaRevision($media));
}

function bctRestoreLocationMedia(array $stagedFiles): bool
{
    $restored = true;
    foreach (array_reverse($stagedFiles) as $staged) {
        try {
            if (!bctRestoreStagedMedia($staged)) { $restored = false; }
        } catch (Throwable $error) {
            // Continue restoring the remaining files even when one restoration fails.
            $restored = false;
        }
    }
    return $restored;
}

function bctFinishLocationMediaDeletion(array $stagedFiles): bool
{
    $cleaned = true;
    foreach ($stagedFiles as $staged) {
        try {
            if (!bctFinishMediaDeletion($staged)) { $cleaned = false; }
        } catch (Throwable $error) { $cleaned = false; }
    }
    return $cleaned;
}

function bctRemoveEmptyLocationDirectory(int $locationId): bool
{
    if ($locationId < 1) { return false; }
    $root = dirname(__DIR__, 2) . '/uploads/gallery';
    $directory = $root . '/' . $locationId;
    foreach ([dirname($root), $root, $directory] as $path) {
        if (is_link($path)) { return false; }
    }
    if (!file_exists($directory)) { return true; }
    if (!is_dir($directory) || dirname((string) realpath($directory)) !== realpath($root)) { return false; }
    // Never recursively delete unexpected files or directories that are not in the database.
    return @rmdir($directory);
}
