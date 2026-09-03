<?php

declare(strict_types=1);

ini_set('display_errors', '0');
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/location-deletion.php';

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    header('Allow: POST');
    bctJsonResponse(['success' => false, 'message' => 'Method not allowed.'], 405);
}
bctRequireAdminApi();
$token = $_POST['csrf_token'] ?? null;
if (!is_string($token) || !bctVerifyCsrfToken($token)) {
    bctJsonResponse(['success' => false, 'message' => 'Your session expired. Log in again and reload the confirmation page.'], 419);
}
$locationId = bctLocationId($_POST['location_id'] ?? null);
$revision = $_POST['deletion_revision'] ?? null;
$confirmation = $_POST['confirmation_name'] ?? null;
if ($locationId === null || !is_string($revision) || !preg_match('/^[a-f0-9]{64}$/D', $revision)
    || !is_string($confirmation) || trim($confirmation) === '' || bctTextLength($confirmation) > 150 || $_FILES !== []) {
    bctJsonResponse(['success' => false, 'message' => 'Use the confirmation page and enter the exact location name.'], 422);
}

$pdo = null;
$stagedFiles = [];
try {
    require dirname(__DIR__) . '/bootstrap.php';
    $pdo->beginTransaction();
    // Same lock order as text/media editing: location first, then its media.
    $location = bctReadDeletionLocation($pdo, $locationId, true);
    if ($location === false) {
        $pdo->rollBack();
        bctJsonResponse(['success' => false, 'message' => 'This location no longer exists. Return to the overview.'], 404);
    }
    $media = bctReadLocationMedia($pdo, $locationId, true);
    if (!hash_equals(bctLocationDeletionRevision($location, $media), $revision)) {
        $pdo->rollBack();
        bctJsonResponse(['success' => false, 'message' => 'The location or its media changed. Reload the confirmation page and review it before deleting.'], 409);
    }
    if (trim($confirmation) !== (string) $location['location_fr']) {
        $pdo->rollBack();
        bctJsonResponse(['success' => false, 'message' => 'The confirmation name does not match this location.'], 422);
    }

    foreach ($media as $row) {
        $stagedFiles[] = bctStageMediaDeletion($row, $locationId);
    }
    $delete = $pdo->prepare('DELETE FROM gallery_locations WHERE location_id = :location_id');
    $delete->execute(['location_id' => $locationId]);
    // The existing gallery_media foreign key uses ON DELETE CASCADE. Fail safely if that differs.
    if ($delete->rowCount() !== 1 || bctReadLocationMedia($pdo, $locationId, true) !== []) {
        throw new RuntimeException('The location or its media records were not deleted as expected.');
    }
    $pdo->commit();
} catch (Throwable $error) {
    $rolledBack = false;
    try {
        if ($pdo instanceof PDO && $pdo->inTransaction()) {
            $pdo->rollBack();
            $rolledBack = true;
        }
    } catch (Throwable $rollbackError) {
        error_log('Location deletion rollback failed; inspect private/gallery-trash recovery manifests.');
    }
    $recoveryRequired = $stagedFiles !== [] && !$rolledBack;
    if ($rolledBack && !bctRestoreLocationMedia($stagedFiles)) { $recoveryRequired = true; }
    // An uncertain commit must never cause the staged copies to be destroyed or blindly restored.
    error_log('Location deletion failed (' . get_class($error) . '), location ' . $locationId . '.');
    if ($recoveryRequired) {
        error_log('Location deletion recovery required, location ' . $locationId . '; inspect private/gallery-trash.');
    }
    bctJsonResponse([
        'success' => false,
        'message' => $recoveryRequired
            ? 'Deletion could not be confirmed or file restoration failed. Check the overview and private/gallery-trash recovery files before retrying.'
            : 'The location could not be deleted. Reload the confirmation page before retrying.',
    ], 500);
}

$warnings = [];
if (!bctFinishLocationMediaDeletion($stagedFiles)) {
    $warnings[] = 'Some private file cleanup failed. Check private/gallery-trash on the server.';
}
if (!bctRemoveEmptyLocationDirectory($locationId)) {
    $warnings[] = 'The upload folder could not be removed. Any unexpected files were left untouched; inspect uploads/gallery/' . $locationId . '.';
}
if ($warnings !== []) { error_log('Location deletion cleanup required, location ' . $locationId . '.'); }
bctJsonResponse([
    'success' => true,
    'message' => 'Location deleted with its associated media records. Other journey stops were not changed.',
    'location_id' => $locationId,
    'media_count' => count($media),
    'warning' => implode(' ', $warnings),
]);
