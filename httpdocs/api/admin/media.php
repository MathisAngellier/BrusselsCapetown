<?php

declare(strict_types=1);

ini_set('display_errors', '0');
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/location-fields.php';
require_once __DIR__ . '/media-upload.php';
require_once __DIR__ . '/media-management.php';

$method = $_SERVER['REQUEST_METHOD'] ?? '';
if (!in_array($method, ['GET', 'POST'], true)) {
    header('Allow: GET, POST');
    bctJsonResponse(['success' => false, 'message' => 'Method not allowed.'], 405);
}
bctRequireAdminApi();
$input = $method === 'GET' ? $_GET : $_POST;
if ($method === 'POST') {
    if (bctPostRequestExceedsServerLimit()) {
        bctJsonResponse(['success' => false, 'message' => 'The upload exceeds the server request limit.'], 413);
    }
    $token = $input['csrf_token'] ?? null;
    if (!is_string($token) || !bctVerifyCsrfToken($token)) {
        bctJsonResponse(['success' => false, 'message' => 'Your session expired. Log in again and reload the media list.'], 419);
    }
}
$locationId = bctLocationId($input['location_id'] ?? null);
if ($locationId === null) {
    bctJsonResponse(['success' => false, 'message' => 'Select a valid location.'], 422);
}
$action = $method === 'POST' ? ($input['action'] ?? null) : 'list';
if (!is_string($action) || !in_array($action, ['list', 'upload', 'delete', 'reorder'], true)
    || ($method === 'POST' && $action === 'list')) {
    bctJsonResponse(['success' => false, 'message' => 'Invalid media action.'], 422);
}
$revision = $input['media_revision'] ?? null;
if ($method === 'POST' && (!is_string($revision) || !preg_match('/^[a-f0-9]{64}$/D', $revision))) {
    bctJsonResponse(['success' => false, 'message' => 'Reload the media list before making changes.'], 422);
}
if ($action !== 'upload' && $_FILES !== []) {
    bctJsonResponse(['success' => false, 'message' => 'Files are only accepted by the upload action.'], 422);
}

$validatedFiles = [];
if ($action === 'upload') {
    $expectedCount = bctLocationId($input['expected_media_count'] ?? null);
    if ($expectedCount === null || $expectedCount > BCT_MAX_MEDIA_FILES) {
        bctJsonResponse(['success' => false, 'message' => 'Select between 1 and 20 media files per upload.'], 422);
    }
    try {
        $validatedFiles = bctValidateMediaUploads($_FILES['media_files'] ?? null, $expectedCount);
    } catch (InvalidArgumentException $error) {
        bctJsonResponse(['success' => false, 'message' => $error->getMessage()], 422);
    } catch (Throwable $error) {
        error_log('Admin media validation failed (' . get_class($error) . ').');
        bctJsonResponse(['success' => false, 'message' => 'The selected files could not be checked.'], 500);
    }
}

$stored = ['directory' => null, 'paths' => []];
$staged = null;
$pdo = null;
try {
    require dirname(__DIR__) . '/bootstrap.php';
    if ($method === 'POST') { $pdo->beginTransaction(); }
    // All media mutations lock the parent first, including empty media lists.
    $location = $pdo->prepare('SELECT location_id FROM gallery_locations WHERE location_id = :location_id'
        . ($method === 'POST' ? ' FOR UPDATE' : ''));
    $location->execute(['location_id' => $locationId]);
    if ($location->fetch() === false) {
        if ($pdo->inTransaction()) { $pdo->rollBack(); }
        bctJsonResponse(['success' => false, 'message' => 'This location no longer exists.'], 404);
    }
    $rows = bctReadLocationMedia($pdo, $locationId, $method === 'POST');
    if ($method === 'GET') { bctJsonResponse(bctMediaPayload($rows, $locationId)); }
    if (!hash_equals(bctMediaRevision($rows), $revision)) {
        $pdo->rollBack();
        bctJsonResponse(['success' => false, 'message' => 'The media list changed in another tab or session. Reload the media list before trying again.'], 409);
    }

    if ($action === 'upload') {
        $startOrder = $rows === [] ? 0 : max(array_column($rows, 'sort_order')) + 1;
        $stored = bctStoreMediaFiles($pdo, $locationId, $validatedFiles, (int) $startOrder, true);
        $message = count($validatedFiles) . ' media file(s) added at the end of the gallery.';
    } elseif ($action === 'reorder') {
        $ids = bctValidateMediaOrder($input['ordered_media_ids'] ?? null, $rows);
        $update = $pdo->prepare('UPDATE gallery_media SET sort_order = :sort_order WHERE media_id = :media_id AND location_id = :location_id');
        foreach ($ids as $order => $id) {
            $update->execute(['sort_order' => $order, 'media_id' => $id, 'location_id' => $locationId]);
        }
        $message = 'Media order saved.';
    } else {
        $mediaId = bctLocationId($input['media_id'] ?? null);
        $selected = null;
        foreach ($rows as $row) {
            if ((int) $row['media_id'] === $mediaId) { $selected = $row; break; }
        }
        if ($selected === null) {
            throw new InvalidArgumentException('This media item does not belong to the selected location.');
        }
        $staged = bctStageMediaDeletion($selected, $locationId);
        $delete = $pdo->prepare('DELETE FROM gallery_media WHERE media_id = :media_id AND location_id = :location_id');
        $delete->execute(['media_id' => $mediaId, 'location_id' => $locationId]);
        $message = 'Media item deleted. This cannot be undone through the admin panel.';
    }
    $payload = bctMediaPayload(bctReadLocationMedia($pdo, $locationId, true), $locationId);
    $payload['message'] = $message;
    // Fail encoding before commit, rather than returning an invalid success response.
    json_encode($payload, JSON_THROW_ON_ERROR);
    $pdo->commit();
} catch (Throwable $error) {
    $rolledBack = false;
    try {
        if ($pdo instanceof PDO && $pdo->inTransaction()) {
            $pdo->rollBack();
            $rolledBack = true;
        }
    } catch (Throwable $rollbackError) {
        error_log('Admin media rollback failed; inspect the private gallery-trash recovery manifests.');
    }
    if ($rolledBack) {
        bctCleanupStoredMedia($stored);
        if ($staged !== null && !bctRestoreStagedMedia($staged)) {
            error_log('Admin media recovery required for location ' . $locationId . '; inspect private/gallery-trash.');
        }
    }
    // If commit/rollback is uncertain, keep staged files and manifests for recovery.
    error_log('Admin media action failed (' . get_class($error) . '), location ' . $locationId . '.');
    bctJsonResponse([
        'success' => false,
        'message' => $error instanceof InvalidArgumentException ? $error->getMessage()
            : 'The media action could not be completed. Reload the media list to check its state before retrying.',
    ], $error instanceof InvalidArgumentException ? 422 : 500);
}

if ($staged !== null && !bctFinishMediaDeletion($staged)) {
    error_log('Admin media private cleanup required for location ' . $locationId . '.');
    $payload['warning'] = 'The item is removed from the gallery, but private file cleanup failed. Check private/gallery-trash on the server.';
}
bctJsonResponse($payload, $action === 'upload' ? 201 : 200);
