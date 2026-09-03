<?php

declare(strict_types=1);

const BCT_MAX_MEDIA_FILES = 20;
const BCT_MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const BCT_MAX_VIDEO_BYTES = 200 * 1024 * 1024;
const BCT_MAX_TOTAL_MEDIA_BYTES = 350 * 1024 * 1024;

function bctIniSizeToBytes(string $value): int
{
    $value = trim($value);

    if ($value === '' || $value === '-1') {
        return -1;
    }

    $unit = strtolower(substr($value, -1));
    $number = (float) $value;

    switch ($unit) {
        case 'g':
            $number *= 1024;
            // Fall through.
        case 'm':
            $number *= 1024;
            // Fall through.
        case 'k':
            $number *= 1024;
    }

    return (int) $number;
}

function bctPostRequestExceedsServerLimit(): bool
{
    $contentLength = (int) ($_SERVER['CONTENT_LENGTH'] ?? 0);
    $postMaxBytes = bctIniSizeToBytes((string) ini_get('post_max_size'));

    return $postMaxBytes > 0 && $contentLength > $postMaxBytes;
}

function bctAllowedMediaTypes(): array
{
    return [
        'image/jpeg' => [
            'media_type' => 'image',
            'extension' => 'jpg',
            'max_bytes' => BCT_MAX_IMAGE_BYTES,
        ],
        'image/png' => [
            'media_type' => 'image',
            'extension' => 'png',
            'max_bytes' => BCT_MAX_IMAGE_BYTES,
        ],
        'image/webp' => [
            'media_type' => 'image',
            'extension' => 'webp',
            'max_bytes' => BCT_MAX_IMAGE_BYTES,
        ],
        'image/gif' => [
            'media_type' => 'image',
            'extension' => 'gif',
            'max_bytes' => BCT_MAX_IMAGE_BYTES,
        ],
        'video/mp4' => [
            'media_type' => 'video',
            'extension' => 'mp4',
            'max_bytes' => BCT_MAX_VIDEO_BYTES,
        ],
        'video/webm' => [
            'media_type' => 'video',
            'extension' => 'webm',
            'max_bytes' => BCT_MAX_VIDEO_BYTES,
        ],
        'video/quicktime' => [
            'media_type' => 'video',
            'extension' => 'mov',
            'max_bytes' => BCT_MAX_VIDEO_BYTES,
        ],
        'video/x-m4v' => [
            'media_type' => 'video',
            'extension' => 'm4v',
            'max_bytes' => BCT_MAX_VIDEO_BYTES,
        ],
    ];
}

function bctNormalizeUploadedFiles(?array $files): array
{
    if ($files === null || !isset($files['name'], $files['error'])) {
        return [];
    }

    $names = is_array($files['name']) ? $files['name'] : [$files['name']];
    $temporaryNames = is_array($files['tmp_name'] ?? null)
        ? $files['tmp_name']
        : [$files['tmp_name'] ?? ''];
    $errors = is_array($files['error']) ? $files['error'] : [$files['error']];

    $normalizedFiles = [];

    foreach ($names as $index => $name) {
        $temporaryName = $temporaryNames[$index] ?? null;
        $error = $errors[$index] ?? null;

        if (!is_string($name) || !is_string($temporaryName) || !is_int($error)) {
            throw new InvalidArgumentException('The file upload data is invalid.');
        }

        $safeName = basename(str_replace('\\', '/', (string) $name));

        $normalizedFiles[] = [
            'original_name' => $safeName,
            'tmp_name' => $temporaryName,
            'error' => $error,
        ];
    }

    return $normalizedFiles;
}

function bctUploadErrorMessage(int $errorCode, string $fileName): string
{
    $displayName = $fileName !== '' ? $fileName : 'A selected file';

    switch ($errorCode) {
        case UPLOAD_ERR_INI_SIZE:
        case UPLOAD_ERR_FORM_SIZE:
            return $displayName . ' is larger than the PHP upload limit.';
        case UPLOAD_ERR_PARTIAL:
            return $displayName . ' was only partially uploaded. Try again.';
        case UPLOAD_ERR_NO_FILE:
            return 'Select at least one photo or video.';
        default:
            return $displayName . ' could not be uploaded.';
    }
}

function bctValidateMediaUploads(?array $files, int $expectedFileCount): array
{
    $uploadedFiles = bctNormalizeUploadedFiles($files);

    if ($uploadedFiles === []) {
        throw new InvalidArgumentException('Select at least one photo or video.');
    }

    if (count($uploadedFiles) > BCT_MAX_MEDIA_FILES) {
        throw new InvalidArgumentException(
            'Select no more than ' . BCT_MAX_MEDIA_FILES . ' files.'
        );
    }

    if ($expectedFileCount > 0 && count($uploadedFiles) !== $expectedFileCount) {
        throw new InvalidArgumentException(
            'The server received only '
            . count($uploadedFiles)
            . ' of '
            . $expectedFileCount
            . ' files. Reduce the selection or increase PHP max_file_uploads.'
        );
    }

    if (!class_exists('finfo')) {
        throw new RuntimeException('The PHP Fileinfo extension is not available.');
    }

    $fileInfo = new finfo(FILEINFO_MIME_TYPE);
    $allowedTypes = bctAllowedMediaTypes();
    $validatedFiles = [];
    $totalBytes = 0;

    foreach ($uploadedFiles as $uploadedFile) {
        if ($uploadedFile['error'] !== UPLOAD_ERR_OK) {
            throw new InvalidArgumentException(
                bctUploadErrorMessage(
                    $uploadedFile['error'],
                    $uploadedFile['original_name']
                )
            );
        }

        $temporaryName = $uploadedFile['tmp_name'];

        if ($temporaryName === '' || !is_uploaded_file($temporaryName)) {
            throw new InvalidArgumentException(
                $uploadedFile['original_name'] . ' is not a valid uploaded file.'
            );
        }

        $fileSize = filesize($temporaryName);

        if ($fileSize === false || $fileSize <= 0) {
            throw new InvalidArgumentException(
                $uploadedFile['original_name'] . ' is empty or unreadable.'
            );
        }

        $mimeType = $fileInfo->file($temporaryName);

        if (!is_string($mimeType) || !isset($allowedTypes[$mimeType])) {
            throw new InvalidArgumentException(
                $uploadedFile['original_name'] . ' is not a supported photo or video.'
            );
        }

        $typeSettings = $allowedTypes[$mimeType];

        if ($fileSize > $typeSettings['max_bytes']) {
            $maximumMegabytes = (int) ($typeSettings['max_bytes'] / 1024 / 1024);

            throw new InvalidArgumentException(
                $uploadedFile['original_name']
                . ' is larger than '
                . $maximumMegabytes
                . ' MB.'
            );
        }

        $totalBytes += $fileSize;

        if ($totalBytes > BCT_MAX_TOTAL_MEDIA_BYTES) {
            throw new InvalidArgumentException(
                'The selected files are larger than the 350 MB total limit.'
            );
        }

        $validatedFiles[] = [
            'tmp_name' => $temporaryName,
            'media_type' => $typeSettings['media_type'],
            'mime_type' => $mimeType,
            'extension' => $typeSettings['extension'],
            'file_size' => $fileSize,
        ];
    }

    return $validatedFiles;
}

function bctStoreMediaFiles(PDO $pdo, int $locationId, array $mediaFiles, int $startSortOrder = 0, bool $append = false): array
{
    $galleryUploadRoot = dirname(__DIR__, 2) . '/uploads/gallery';

    if ($locationId < 1 || $startSortOrder < 0 || $startSortOrder + count($mediaFiles) > 4294967295
        || is_link(dirname($galleryUploadRoot)) || is_link($galleryUploadRoot)) {
        throw new RuntimeException('Invalid gallery upload destination.');
    }

    if (!is_dir($galleryUploadRoot) && !@mkdir($galleryUploadRoot, 0755, true)) {
        throw new RuntimeException('The gallery upload directory could not be created.');
    }

    if (!is_writable($galleryUploadRoot)) {
        throw new RuntimeException('The gallery upload directory is not writable.');
    }

    $locationDirectory = $galleryUploadRoot . '/' . $locationId;
    $directoryExists = is_dir($locationDirectory);
    if (is_link($locationDirectory) || ($directoryExists && !$append)
        || (!$directoryExists && !@mkdir($locationDirectory, 0755))) {
        throw new RuntimeException('The location upload directory could not be created.');
    }

    if (!is_writable($locationDirectory) || dirname((string) realpath($locationDirectory)) !== realpath($galleryUploadRoot)) {
        throw new RuntimeException('Invalid location upload directory.');
    }

    $storedMedia = [
        // Rollback may remove a newly created directory, never an existing one.
        'directory' => $directoryExists ? null : $locationDirectory,
        'paths' => [],
    ];

    $insertStatement = $pdo->prepare(
        'INSERT INTO gallery_media (
            location_id,
            media_type,
            file_path,
            mime_type,
            file_size,
            sort_order
        ) VALUES (
            :location_id,
            :media_type,
            :file_path,
            :mime_type,
            :file_size,
            :sort_order
        )'
    );

    try {
        foreach (array_values($mediaFiles) as $index => $mediaFile) {
            $sortOrder = $startSortOrder + $index;
            $fileName = sprintf(
                '%03d-%s.%s',
                $sortOrder + 1,
                bin2hex(random_bytes(16)),
                $mediaFile['extension']
            );
            $absolutePath = $locationDirectory . '/' . $fileName;
            $publicPath = '/uploads/gallery/' . $locationId . '/' . $fileName;

            if (file_exists($absolutePath) || is_link($absolutePath)
                || !@move_uploaded_file($mediaFile['tmp_name'], $absolutePath)) {
                throw new RuntimeException('An uploaded file could not be stored.');
            }

            $storedMedia['paths'][] = $absolutePath;

            $insertStatement->execute([
                'location_id' => $locationId,
                'media_type' => $mediaFile['media_type'],
                'file_path' => $publicPath,
                'mime_type' => $mediaFile['mime_type'],
                'file_size' => $mediaFile['file_size'],
                'sort_order' => $sortOrder,
            ]);
        }
    } catch (Throwable $error) {
        bctCleanupStoredMedia($storedMedia);

        throw $error;
    }

    return $storedMedia;
}

function bctCleanupStoredMedia(array $storedMedia): void
{
    foreach ($storedMedia['paths'] ?? [] as $path) {
        if (is_string($path) && is_file($path)) {
            @unlink($path);
        }
    }

    $directory = $storedMedia['directory'] ?? null;

    if (is_string($directory) && is_dir($directory)) {
        @rmdir($directory);
    }
}
