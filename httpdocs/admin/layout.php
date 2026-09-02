<?php

declare(strict_types=1);

function bctAdminEscape($value): string
{
    return htmlspecialchars((string) $value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function bctAdminPageStart(string $title): void
{
    ?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="robots" content="noindex, nofollow">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title><?= bctAdminEscape($title) ?></title>
    <link rel="stylesheet" href="/admin/admin.css">
</head>
<body>
    <header class="admin-header">
        <p>Logged in as <?= bctAdminEscape($_SESSION['admin_username'] ?? 'admin') ?></p>
        <form action="/admin/logout.php" method="post">
            <input type="hidden" name="csrf_token" value="<?= bctAdminEscape(bctCsrfToken()) ?>">
            <button class="logout-button" type="submit">Log out</button>
        </form>
    </header>
    <?php
}
