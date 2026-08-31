<?php

declare(strict_types=1);

require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/media-upload.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    header('Allow: POST');

    bctJsonResponse([
        'success' => false,
        'message' => 'Method not allowed.',
    ], 405);
}

bctRequireAdminApi();

if (bctPostRequestExceedsServerLimit()) {
    bctJsonResponse([
        'success' => false,
        'message' => 'The selected files are larger than the server upload limit.',
    ], 413);
}

if (!bctVerifyCsrfToken($_POST['csrf_token'] ?? null)) {
    bctJsonResponse([
        'success' => false,
        'message' => 'Your session expired. Refresh the page and try again.',
    ], 419);
}

require_once dirname(__DIR__) . '/bootstrap.php';

function bctInput(string $name): string
{
    $value = $_POST[$name] ?? '';

    return is_string($value) ? trim($value) : '';
}

function bctTextLength(string $value): int
{
    if (function_exists('mb_strlen')) {
        return mb_strlen($value, 'UTF-8');
    }

    return strlen($value);
}

function bctIsValidDate(string $value): bool
{
    $date = DateTimeImmutable::createFromFormat('!Y-m-d', $value);

    return $date !== false && $date->format('Y-m-d') === $value;
}

function bctTranslateFrenchToEnglish(array $texts, array $config): array
{
    $apiKey = trim((string) ($config['deepl_api_key'] ?? ''));

    if ($apiKey === '') {
        throw new RuntimeException('The DeepL API key is not configured.');
    }

    if (!function_exists('curl_init')) {
        throw new RuntimeException('The PHP cURL extension is not available.');
    }

    $apiUrl = trim((string) (
        $config['deepl_api_url']
        ?? 'https://api-free.deepl.com/v2/translate'
    ));

    $requestBody = json_encode([
        'text' => array_values($texts),
        'source_lang' => 'FR',
        'target_lang' => 'EN-GB',
    ], JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE);

    $request = curl_init($apiUrl);

    if ($request === false) {
        throw new RuntimeException('The translation request could not be initialized.');
    }

    curl_setopt_array($request, [
        CURLOPT_POST => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 5,
        CURLOPT_TIMEOUT => 20,
        CURLOPT_HTTPHEADER => [
            'Authorization: DeepL-Auth-Key ' . $apiKey,
            'Content-Type: application/json',
        ],
        CURLOPT_POSTFIELDS => $requestBody,
    ]);

    $responseBody = curl_exec($request);
    $curlError = curl_error($request);
    $statusCode = (int) curl_getinfo($request, CURLINFO_RESPONSE_CODE);

    curl_close($request);

    if ($responseBody === false) {
        throw new RuntimeException('DeepL request failed: ' . $curlError);
    }

    if ($statusCode < 200 || $statusCode >= 300) {
        throw new RuntimeException('DeepL returned HTTP status ' . $statusCode . '.');
    }

    $response = json_decode($responseBody, true, 512, JSON_THROW_ON_ERROR);
    $translations = $response['translations'] ?? null;

    if (!is_array($translations) || count($translations) !== count($texts)) {
        throw new RuntimeException('DeepL returned an unexpected response.');
    }

    $translatedTexts = [];

    foreach ($translations as $translation) {
        $translatedText = is_array($translation)
            ? trim((string) ($translation['text'] ?? ''))
            : '';

        if ($translatedText === '') {
            throw new RuntimeException('DeepL returned an empty translation.');
        }

        $translatedTexts[] = $translatedText;
    }

    return $translatedTexts;
}

$journeyDate = bctInput('journey_date');
$locationFr = bctInput('location_fr');
$distanceInput = bctInput('distance_km');
$latitudeInput = bctInput('latitude');
$longitudeInput = bctInput('longitude');
$descriptionFr = bctInput('description_fr');
$expectedMediaCountInput = bctInput('expected_media_count');

$errors = [];
$distanceKm = 0.0;
$latitude = 0.0;
$longitude = 0.0;
$expectedMediaCount = 0;

if (!bctIsValidDate($journeyDate)) {
    $errors['journey_date'] = 'Enter a valid date.';
}

if ($locationFr === '' || bctTextLength($locationFr) > 150) {
    $errors['location_fr'] = 'Enter a French location of no more than 150 characters.';
}

if ($distanceInput === '' || !is_numeric($distanceInput)) {
    $errors['distance_km'] = 'Enter a valid distance.';
} else {
    $distanceKm = (float) $distanceInput;

    if (!is_finite($distanceKm) || $distanceKm < 0 || $distanceKm > 999999.99) {
        $errors['distance_km'] = 'Distance must be between 0 and 999999.99 km.';
    }
}

if ($latitudeInput === '' || !is_numeric($latitudeInput)) {
    $errors['latitude'] = 'Enter a valid latitude.';
} else {
    $latitude = (float) $latitudeInput;

    if (!is_finite($latitude) || $latitude < -90 || $latitude > 90) {
        $errors['latitude'] = 'Latitude must be between -90 and 90.';
    }
}

if ($longitudeInput === '' || !is_numeric($longitudeInput)) {
    $errors['longitude'] = 'Enter a valid longitude.';
} else {
    $longitude = (float) $longitudeInput;

    if (!is_finite($longitude) || $longitude < -180 || $longitude > 180) {
        $errors['longitude'] = 'Longitude must be between -180 and 180.';
    }
}

if ($descriptionFr === '' || bctTextLength($descriptionFr) > 10000) {
    $errors['description_fr'] = 'Enter a French description of no more than 10000 characters.';
}

if (!ctype_digit($expectedMediaCountInput)) {
    $errors['media_files'] = 'Select at least one photo or video.';
} else {
    $expectedMediaCount = (int) $expectedMediaCountInput;

    if ($expectedMediaCount < 1 || $expectedMediaCount > BCT_MAX_MEDIA_FILES) {
        $errors['media_files'] = 'Select between 1 and 30 media files.';
    }
}

$mediaFiles = [];

try {
    $mediaFiles = bctValidateMediaUploads(
        $_FILES['media_files'] ?? null,
        $expectedMediaCount
    );
} catch (InvalidArgumentException $error) {
    $errors['media_files'] = $error->getMessage();
} catch (Throwable $error) {
    error_log('Media validation failed: ' . $error->getMessage());

    bctJsonResponse([
        'success' => false,
        'message' => 'The selected media files could not be checked.',
    ], 500);
}

if ($errors !== []) {
    bctJsonResponse([
        'success' => false,
        'message' => 'Check the form fields and try again.',
        'errors' => $errors,
    ], 422);
}

try {
    [$locationEn, $descriptionEn] = bctTranslateFrenchToEnglish([
        $locationFr,
        $descriptionFr,
    ], $config);
} catch (Throwable $error) {
    error_log('DeepL translation failed: ' . $error->getMessage());

    bctJsonResponse([
        'success' => false,
        'message' => 'The French text could not be translated. Try again later.',
    ], 502);
}

if (bctTextLength($locationEn) > 150 || bctTextLength($descriptionEn) > 10000) {
    error_log('DeepL translation exceeded a database field limit.');

    bctJsonResponse([
        'success' => false,
        'message' => 'The English translation is too long to save.',
    ], 502);
}

$storedMedia = [
    'directory' => null,
    'paths' => [],
];

try {
    $pdo->beginTransaction();

    $orderStatement = $pdo->query(
        'SELECT journey_order
         FROM gallery_locations
         ORDER BY journey_order DESC
         LIMIT 1
         FOR UPDATE'
    );

    $lastJourneyOrder = $orderStatement->fetchColumn();
    $journeyOrder = $lastJourneyOrder === false
        ? 1
        : ((int) $lastJourneyOrder) + 1;

    $insertStatement = $pdo->prepare(
        'INSERT INTO gallery_locations (
            journey_order,
            journey_date,
            location_en,
            location_fr,
            distance_km,
            latitude,
            longitude,
            description_en,
            description_fr
        ) VALUES (
            :journey_order,
            :journey_date,
            :location_en,
            :location_fr,
            :distance_km,
            :latitude,
            :longitude,
            :description_en,
            :description_fr
        )'
    );

    $insertStatement->execute([
        'journey_order' => $journeyOrder,
        'journey_date' => $journeyDate,
        'location_en' => $locationEn,
        'location_fr' => $locationFr,
        'distance_km' => number_format($distanceKm, 2, '.', ''),
        'latitude' => number_format($latitude, 7, '.', ''),
        'longitude' => number_format($longitude, 7, '.', ''),
        'description_en' => $descriptionEn,
        'description_fr' => $descriptionFr,
    ]);

    $locationId = (int) $pdo->lastInsertId();
    $storedMedia = bctStoreMediaFiles($pdo, $locationId, $mediaFiles);

    $pdo->commit();
} catch (Throwable $error) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }

    bctCleanupStoredMedia($storedMedia);

    error_log($error->getMessage());

    bctJsonResponse([
        'success' => false,
        'message' => 'The location could not be saved.',
    ], 500);
}

bctJsonResponse([
    'success' => true,
    'message' => 'Journey location added.',
    'location' => [
        'location_id' => $locationId,
        'journey_order' => $journeyOrder,
        'journey_date' => $journeyDate,
        'location_en' => $locationEn,
        'location_fr' => $locationFr,
        'media_count' => count($mediaFiles),
    ],
], 201);
