<?php

declare(strict_types=1);

if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require dirname(__DIR__) . '/httpdocs/api/admin/location-fields.php';

$checks = 0;
function check(bool $condition, string $message): void
{
    global $checks;
    if (!$condition) { throw new RuntimeException($message); }
    $checks++;
}

$input = [
    'journey_date' => '2026-09-02', 'location_fr' => ' Bruxelles ',
    'distance_km' => '12.50', 'latitude' => '50.85034', 'longitude' => '4.35171',
    'description_fr' => '',
];
[$fields, $errors] = bctValidateLocationFields($input);
check($errors === [], 'Valid fields must pass.');
check($fields['location_fr'] === 'Bruxelles' && $fields['distance_km'] === 12.5, 'Normalize input.');
check(bctIsValidDate('2024-02-29') && !bctIsValidDate('2026-02-29'), 'Validate leap days.');
check(!bctIsValidDate("2026-09-02\0") && !bctIsValidDate('0000-01-01'), 'Reject invalid MySQL dates safely.');

foreach ([
    ['journey_date', '2026-09-32'], ['location_fr', ''], ['location_fr', str_repeat('a', 151)],
    ['description_fr', str_repeat('a', 10001)], ['description_fr', ['unexpected']],
    ['distance_km', '-1'], ['distance_km', '1000000'], ['distance_km', '1e999'],
    ['distance_km', 'abc'], ['latitude', '90.01'], ['longitude', '-180.01'], ['latitude', []],
] as [$name, $value]) {
    [, $invalid] = bctValidateLocationFields(array_replace($input, [$name => $value]));
    check(isset($invalid[$name]), 'Reject invalid ' . $name);
}
foreach (['0', '-1', '1 OR 1=1', '1.5', '4294967296', [], null] as $id) {
    check(bctLocationId($id) === null, 'Reject invalid ID.');
}
check(bctLocationId('42') === 42, 'Accept valid ID.');

$original = $fields + ['location_id' => 7, 'journey_order' => 3, 'location_en' => 'Brussels', 'description_en' => ''];
$neverTranslate = function (): array { throw new RuntimeException('Translation must not run.'); };
$updated = bctPrepareLocationUpdate($original, array_replace($fields, ['distance_km' => 42.0]), $neverTranslate);
check($updated['location_en'] === 'Brussels', 'Keep English when only numbers change.');

$calls = [];
$translate = function (array $texts) use (&$calls): array {
    $calls[] = $texts;
    return array_map(static function (string $text): string { return 'English: ' . $text; }, $texts);
};
$updated = bctPrepareLocationUpdate($original, array_replace($fields, ['location_fr' => 'Paris']), $translate);
check($calls === [['Paris']] && $updated['location_en'] === 'English: Paris', 'Translate only changed location.');
$calls = [];
$updated = bctPrepareLocationUpdate($original, array_replace($fields, ['description_fr' => 'Une étape.']), $translate);
check($calls === [['Une étape.']] && $updated['location_en'] === 'Brussels', 'Translate only changed description.');
$calls = [];
bctPrepareLocationUpdate($original, array_replace($fields, ['location_fr' => 'Paris', 'description_fr' => 'Étape.']), $translate);
check($calls === [['Paris', 'Étape.']], 'Batch both changed fields.');
$withDescription = array_replace($original, ['description_fr' => 'Texte.', 'description_en' => 'Text.']);
$updated = bctPrepareLocationUpdate($withDescription, $fields, $neverTranslate);
check($updated['description_fr'] === '' && $updated['description_en'] === '', 'Clear both descriptions without DeepL.');

foreach ([[], [''], [str_repeat('a', 151)]] as $badTranslation) {
    try {
        bctPrepareLocationUpdate($original, array_replace($fields, ['location_fr' => 'Paris']), static function () use ($badTranslation): array { return $badTranslation; });
        throw new LogicException('Bad translation was accepted.');
    } catch (RuntimeException $error) { check(true, 'Reject malformed or oversized translation.'); }
}
$revision = bctLocationRevision($original);
check($revision === bctLocationRevision(array_reverse($original, true)), 'Revision independent of key order.');
check($revision === bctLocationRevision($original + ['photo_count' => 4]), 'Media counts do not invalidate text edit.');
check($revision !== bctLocationRevision(array_replace($original, ['distance_km' => 13])), 'Detect stale data.');
echo $checks . " field/translation checks passed.\n";
