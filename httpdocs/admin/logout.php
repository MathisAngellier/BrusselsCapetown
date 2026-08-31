<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/api/admin/auth.php';

if (
    $_SERVER['REQUEST_METHOD'] !== 'POST'
    || !bctIsAdminLoggedIn()
    || !bctVerifyCsrfToken($_POST['csrf_token'] ?? null)
) {
    http_response_code(403);
    exit('Forbidden');
}

$_SESSION = [];

if (ini_get('session.use_cookies')) {
    $parameters = session_get_cookie_params();

    setcookie(session_name(), '', [
        'expires' => time() - 42000,
        'path' => $parameters['path'],
        'secure' => $parameters['secure'],
        'httponly' => $parameters['httponly'],
        'samesite' => 'Strict',
    ]);
}

session_destroy();

header('Location: /admin/login.php');
exit;
