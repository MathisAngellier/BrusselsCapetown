<?php

declare(strict_types=1);

ini_set('display_errors', '0');
require_once dirname(__DIR__) . '/api/admin/auth.php';
bctRequireAdminPage();
header('Cache-Control: no-store');
require_once __DIR__ . '/layout.php';

$locations = [];
$loadError = false;
try {
    require dirname(__DIR__) . '/api/bootstrap.php';
    $locations = $pdo->query(
        'SELECT l.location_id, l.journey_order, l.journey_date, l.location_fr,
            COALESCE(m.photo_count, 0) AS photo_count,
            COALESCE(m.video_count, 0) AS video_count
         FROM gallery_locations AS l
         LEFT JOIN (
             SELECT location_id,
                 SUM(CASE WHEN media_type = \'image\' THEN 1 ELSE 0 END) AS photo_count,
                 SUM(CASE WHEN media_type = \'video\' THEN 1 ELSE 0 END) AS video_count
             FROM gallery_media GROUP BY location_id
         ) AS m ON m.location_id = l.location_id
         ORDER BY l.journey_order DESC, l.location_id DESC'
    )->fetchAll();
} catch (Throwable $error) {
    error_log('Admin location list failed (' . get_class($error) . ').');
    http_response_code(500);
    $loadError = true;
}

bctAdminPageStart('Manage journey locations');
?>
    <main class="admin-main admin-main-wide">
        <nav class="admin-navigation" aria-label="Admin navigation">
            <a href="/admin/index.php">Add location</a>
            <a href="/gallery" target="_blank" rel="noopener">View gallery</a>
        </nav>
        <h1>Journey locations</h1>
        <?php if ($loadError): ?>
            <p class="form-status error" role="alert">Locations could not be loaded. <a href="/admin/locations.php">Try again</a>.</p>
        <?php elseif ($locations === []): ?>
            <p>No journey locations yet. <a href="/admin/index.php">Add your first location</a>.</p>
        <?php else: ?>
            <div class="table-scroll" role="region" aria-label="Journey locations" tabindex="0">
                <table class="locations-table">
                    <caption><?= count($locations) ?> location<?= count($locations) === 1 ? '' : 's' ?> · Latest journey stop first</caption>
                    <thead>
                        <tr><th scope="col">Stop</th><th scope="col">Date</th><th scope="col">Location (FR)</th><th scope="col">Photos</th><th scope="col">Videos</th><th scope="col">Action</th></tr>
                    </thead>
                    <tbody>
                        <?php foreach ($locations as $location): ?>
                            <tr>
                                <td><?= (int) $location['journey_order'] ?></td>
                                <td class="date-cell"><?= bctAdminEscape($location['journey_date']) ?></td>
                                <th scope="row"><?= bctAdminEscape($location['location_fr']) ?></th>
                                <td><?= (int) $location['photo_count'] ?></td>
                                <td><?= (int) $location['video_count'] ?></td>
                                <td>
                                    <div class="location-row-actions">
                                        <a class="edit-link" href="/admin/edit-location.php?id=<?= (int) $location['location_id'] ?>" aria-label="Edit <?= bctAdminEscape($location['location_fr']) ?>">Edit</a>
                                        <a class="edit-link danger-link" href="/admin/delete-location.php?id=<?= (int) $location['location_id'] ?>" aria-label="Delete <?= bctAdminEscape($location['location_fr']) ?>">Delete</a>
                                    </div>
                                </td>
                            </tr>
                        <?php endforeach; ?>
                    </tbody>
                </table>
            </div>
        <?php endif; ?>
    </main>
</body>
</html>
