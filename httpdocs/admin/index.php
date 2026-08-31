<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/api/admin/auth.php';

bctRequireAdminPage();

header('Cache-Control: no-store');

$username = $_SESSION['admin_username'] ?? 'admin';
$csrfToken = bctCsrfToken();
?>

<!DOCTYPE html>
<html lang="en">

<head>
    <meta charset="UTF-8">
    <meta name="robots" content="noindex, nofollow">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Admin panel</title>
</head>

<body>
    <main>
        <h1>Admin panel</h1>

        <p>
            Logged in as
            <?= htmlspecialchars($username, ENT_QUOTES, 'UTF-8') ?>
        </p>

        <form action="/admin/logout.php" method="post">
            <input
                type="hidden"
                name="csrf_token"
                value="<?= htmlspecialchars($csrfToken, ENT_QUOTES, 'UTF-8') ?>">

            <button type="submit">Log out</button>
        </form>
    </main>
</body>

</html>