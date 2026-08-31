<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/api/bootstrap.php';
require_once dirname(__DIR__) . '/api/admin/auth.php';

header('Cache-Control: no-store');

if (bctIsAdminLoggedIn()) {
    header('Location: /admin/');
    exit;
}

$error = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $username = trim($_POST['username'] ?? '');
    $password = $_POST['password'] ?? '';
    $csrfToken = $_POST['csrf_token'] ?? null;

    $lockedUntil = (int) ($_SESSION['login_locked_until'] ?? 0);

    if ($lockedUntil > time()) {
        $error = 'Too many attempts. Try again later.';
    } elseif (!bctVerifyCsrfToken($csrfToken)) {
        $error = 'Your session expired. Refresh the page.';
    } elseif ($username === '' || $password === '') {
        $error = 'Enter your username and password.';
    } else {
        $statement = $pdo->prepare(
            'SELECT admin_id, username, password_hash, is_active
             FROM admins
             WHERE username = :username
             LIMIT 1'
        );

        $statement->execute([
            'username' => $username,
        ]);

        $admin = $statement->fetch();

        $validLogin = $admin
            && (int) $admin['is_active'] === 1
            && password_verify($password, $admin['password_hash']);

        if (!$validLogin) {
            $attempts = (int) ($_SESSION['login_attempts'] ?? 0) + 1;
            $_SESSION['login_attempts'] = $attempts;

            if ($attempts >= 5) {
                $_SESSION['login_locked_until'] = time() + 900;
                unset($_SESSION['login_attempts']);

                $error = 'Too many attempts. Try again in 15 minutes.';
            } else {
                $error = 'Invalid username or password.';
            }
        } else {
            session_regenerate_id(true);

            $_SESSION['admin_id'] = (int) $admin['admin_id'];
            $_SESSION['admin_username'] = $admin['username'];
            $_SESSION['csrf_token'] = bin2hex(random_bytes(32));

            unset(
                $_SESSION['login_attempts'],
                $_SESSION['login_locked_until']
            );

            $update = $pdo->prepare(
                'UPDATE admins
                 SET last_login_at = NOW()
                 WHERE admin_id = :admin_id'
            );

            $update->execute([
                'admin_id' => $admin['admin_id'],
            ]);

            header('Location: /admin/');
            exit;
        }
    }
}

$csrfToken = bctCsrfToken();
?>

<!DOCTYPE html>
<html lang="en">

<head>
    <meta charset="UTF-8">
    <meta name="robots" content="noindex, nofollow">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Admin login</title>

    <style>
        body {
            margin: 0;
            min-height: 100vh;
            display: grid;
            place-items: center;
            font-family: Arial, sans-serif;
            background: #e8e7e7;
        }

        .login-container {
            width: min(400px, calc(100% - 40px));
        }

        label,
        input,
        button {
            display: block;
            width: 100%;
            box-sizing: border-box;
        }

        input {
            margin: 6px 0 20px;
            padding: 12px;
        }

        button {
            padding: 12px;
            cursor: pointer;
        }

        .error {
            color: #a00000;
        }
    </style>
</head>

<body>
    <main class="login-container">
        <h1>Admin login</h1>

        <?php if ($error !== ''): ?>
            <p class="error">
                <?= htmlspecialchars($error, ENT_QUOTES, 'UTF-8') ?>
            </p>
        <?php endif; ?>

        <form method="post">
            <input
                type="hidden"
                name="csrf_token"
                value="<?= htmlspecialchars($csrfToken, ENT_QUOTES, 'UTF-8') ?>">

            <label for="username">Username</label>
            <input
                type="text"
                id="username"
                name="username"
                maxlength="50"
                autocomplete="username"
                required>

            <label for="password">Password</label>
            <input
                type="password"
                id="password"
                name="password"
                autocomplete="current-password"
                required>

            <button type="submit">Log in</button>
        </form>
    </main>
</body>

</html>