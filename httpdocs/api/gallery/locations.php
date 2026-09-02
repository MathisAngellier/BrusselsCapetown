<?php

declare(strict_types=1);

// Public read-only endpoint: no admin session, credentials or filesystem paths in responses.
ini_set('display_errors', '0');
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'GET') {
    header('Allow: GET');
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Method not allowed.']);
    exit;
}

try {
    require dirname(__DIR__) . '/bootstrap.php';

    // One ordered LEFT JOIN includes locations without media and avoids one query per location.
    $statement = $pdo->query(
        'SELECT
            l.location_id, l.journey_date,
            l.location_en, l.location_fr, l.distance_km,
            l.latitude, l.longitude, l.description_en, l.description_fr,
            m.media_id, m.media_type, m.file_path, m.mime_type
         FROM gallery_locations AS l
         LEFT JOIN gallery_media AS m ON m.location_id = l.location_id
         ORDER BY l.journey_order ASC, l.location_id ASC,
                  m.sort_order ASC, m.media_id ASC'
    );

    $locationsById = [];

    while ($row = $statement->fetch(PDO::FETCH_ASSOC)) {
        $locationId = (int) $row['location_id'];

        if (!isset($locationsById[$locationId])) {
            $locationsById[$locationId] = [
                'id' => $locationId,
                'date' => (string) $row['journey_date'],
                'location' => [
                    'en' => (string) $row['location_en'],
                    'fr' => (string) $row['location_fr'],
                ],
                'distance' => (float) $row['distance_km'],
                'latitude' => (float) $row['latitude'],
                'longitude' => (float) $row['longitude'],
                'description' => [
                    'en' => (string) ($row['description_en'] ?? ''),
                    'fr' => (string) ($row['description_fr'] ?? ''),
                ],
                'media' => [],
            ];
        }

        if ($row['media_id'] === null) {
            continue;
        }

        $mediaType = (string) $row['media_type'];
        $filePath = (string) $row['file_path'];
        $extensions = $mediaType === 'image' ? 'jpg|jpeg|png|webp|gif' : 'mp4|webm|mov|m4v';
        $pathPattern = '~\A/uploads/gallery/' . $locationId
            . '/[A-Za-z0-9_-]+\.(?:' . $extensions . ')\z~i';

        // Never expose external URLs, traversal paths or executable files from a corrupted row.
        if (!in_array($mediaType, ['image', 'video'], true) || !preg_match($pathPattern, $filePath)) {
            continue;
        }

        $mediaNumber = count($locationsById[$locationId]['media']) + 1;
        $locationsById[$locationId]['media'][] = [
            'id' => (int) $row['media_id'],
            'type' => $mediaType,
            'src' => $filePath,
            'mimeType' => (string) $row['mime_type'],
            'alt' => [
                'en' => ($mediaType === 'video' ? 'Video' : 'Photo') . ' '
                    . $mediaNumber . ' — ' . $row['location_en'],
                'fr' => ($mediaType === 'video' ? 'Vidéo' : 'Photo') . ' '
                    . $mediaNumber . ' — ' . $row['location_fr'],
            ],
        ];
    }

    // Encode before writing any output so failures still produce one complete error response.
    $json = json_encode([
        'success' => true,
        'locations' => array_values($locationsById),
    ], JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
} catch (Throwable $error) {
    error_log('Public gallery read failed (' . get_class($error) . ').');
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'The gallery could not be loaded.']);
    exit;
}

echo $json;
