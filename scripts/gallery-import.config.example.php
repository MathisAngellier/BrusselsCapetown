<?php

// Copy to private/gallery-import.config.php, outside httpdocs, in an ISOLATED
// local checkout. Do not replace the config of your normal project/live site.
return [
    'host' => '127.0.0.1',
    'port' => 3306,
    'database' => 'brusselscapetown_migration_test',
    'username' => 'YOUR_LOCAL_DATABASE_USER',
    'password' => 'YOUR_LOCAL_DATABASE_PASSWORD',
];
