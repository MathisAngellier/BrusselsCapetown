<?php

declare(strict_types=1);

require_once __DIR__ . '/auth.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    header('Allow: POST');

    bctJsonResponse([
        'success' => false,
        'message' => 'Method not allowed.',
    ], 405);
}

bctRequireAdminApi();

if (!bctVerifyCsrfToken($_POST['csrf_token'] ?? null)) {
    bctJsonResponse([
        'success' => false,
        'message' => 'Your session expired. Refresh the page and try again.',
    ], 419);
}

require_once dirname(__DIR__) . '/bootstrap.php';

function bctInput(string $name): string
{
    return trim((string) ($_POST[$name] ?? ''));
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

$journeyDate = bctInput('journey_date');
$locationEn = bctInput('location_en');
$distanceInput = bctInput('distance_km');
$latitudeInput = bctInput('latitude');
$longitudeInput = bctInput('longitude');
$descriptionEn = bctInput('description_en');
$descriptionFr = bctInput('description_fr');

$errors = [];
$distanceKm = 0.0;
$latitude = 0.0;
$longitude = 0.0;

if (!bctIsValidDate($journeyDate)) {
    $errors['journey_date'] = 'Enter a valid date.';
}

if ($locationEn === '' || bctTextLength($locationEn) > 150) {
    $errors['location_en'] = 'Enter an English location of no more than 150 characters.';
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

if ($descriptionEn === '' || bctTextLength($descriptionEn) > 10000) {
    $errors['description_en'] = 'Enter an English description of no more than 10000 characters.';
}

if ($descriptionFr === '' || bctTextLength($descriptionFr) > 10000) {
    $errors['description_fr'] = 'Enter a French description of no more than 10000 characters.';
}

if ($errors !== []) {
    bctJsonResponse([
        'success' => false,
        'message' => 'Check the form fields and try again.',
        'errors' => $errors,
    ], 422);
}

// Automatic EN-to-FR location translation will replace this temporary fallback.
$locationFr = $locationEn;

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

    $pdo->commit();

    bctJsonResponse([
        'success' => true,
        'message' => 'Journey location added.',
        'location' => [
            'location_id' => $locationId,
            'journey_order' => $journeyOrder,
            'journey_date' => $journeyDate,
            'location_en' => $locationEn,
        ],
    ], 201);
} catch (Throwable $error) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }

    error_log($error->getMessage());

    bctJsonResponse([
        'success' => false,
        'message' => 'The location could not be saved.',
    ], 500);
}
