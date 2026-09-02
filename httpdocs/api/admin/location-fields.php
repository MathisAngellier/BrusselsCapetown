<?php

declare(strict_types=1);

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
    if (!preg_match('/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/D', $value)
        || (int) substr($value, 0, 4) < 1000) {
        return false;
    }

    $date = DateTimeImmutable::createFromFormat('!Y-m-d', $value);

    return $date !== false && $date->format('Y-m-d') === $value;
}

/** Shared validation for adding and editing a location; descriptions remain optional. */
function bctValidateLocationFields(array $input): array
{
    $fields = [];
    $errors = [];
    foreach (['journey_date', 'location_fr', 'distance_km', 'latitude', 'longitude', 'description_fr'] as $name) {
        $value = $input[$name] ?? '';
        if (!is_string($value)) {
            $errors[$name] = 'Enter a single text or number value.';
        }
        $fields[$name] = is_string($value) ? trim($value) : '';
    }

    if (!bctIsValidDate($fields['journey_date'])) {
        $errors['journey_date'] = 'Enter a valid date.';
    }
    if ($fields['location_fr'] === '' || bctTextLength($fields['location_fr']) > 150) {
        $errors['location_fr'] = 'Enter a French location of no more than 150 characters.';
    }
    if (bctTextLength($fields['description_fr']) > 10000) {
        $errors['description_fr'] = 'The French description must not exceed 10000 characters.';
    }

    foreach ([
        'distance_km' => [0, 999999.99, 'Distance must be between 0 and 999999.99 km.'],
        'latitude' => [-90, 90, 'Latitude must be between -90 and 90.'],
        'longitude' => [-180, 180, 'Longitude must be between -180 and 180.'],
    ] as $name => [$minimum, $maximum, $message]) {
        $raw = $fields[$name];
        $number = (float) $raw;
        if ($raw === '' || !is_numeric($raw) || !is_finite($number)
            || $number < $minimum || $number > $maximum) {
            $errors[$name] = $message;
        }
        $fields[$name] = $number;
    }

    return [$fields, $errors];
}

function bctLocationId($value): ?int
{
    if (!is_string($value) || !ctype_digit($value)) {
        return null;
    }
    $id = filter_var($value, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1, 'max_range' => 4294967295]]);
    return $id === false ? null : $id;
}

/** Detect stale forms without adding a database column. Media are deliberately excluded. */
function bctLocationRevision(array $row): string
{
    $values = [];
    foreach (['location_id', 'journey_order', 'journey_date', 'location_fr', 'location_en',
        'distance_km', 'latitude', 'longitude', 'description_fr', 'description_en'] as $name) {
        $values[$name] = (string) ($row[$name] ?? '');
    }
    return hash('sha256', json_encode($values, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE));
}

/** Only changed, nonempty French fields need a translation request. */
function bctPrepareLocationUpdate(array $original, array $fields, callable $translate): array
{
    $texts = [];
    $targets = [];
    foreach (['location', 'description'] as $name) {
        $french = $fields[$name . '_fr'];
        $fields[$name . '_en'] = (string) ($original[$name . '_en'] ?? '');
        if ($name === 'description' && $french === '') {
            $fields['description_en'] = '';
        } elseif ($french !== (string) ($original[$name . '_fr'] ?? '')) {
            $texts[] = $french;
            $targets[] = $name . '_en';
        }
    }

    if ($texts !== []) {
        $translations = $translate($texts);
        if (!is_array($translations) || count($translations) !== count($targets)) {
            throw new RuntimeException('Unexpected translation count.');
        }
        foreach ($targets as $index => $target) {
            if (!isset($translations[$index]) || !is_string($translations[$index])
                || trim($translations[$index]) === '') {
                throw new RuntimeException('Empty translation.');
            }
            $fields[$target] = trim($translations[$index]);
        }
    }

    if (bctTextLength($fields['location_en']) > 150 || bctTextLength($fields['description_en']) > 10000) {
        throw new RuntimeException('English translation exceeds the field limit.');
    }
    return $fields;
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
