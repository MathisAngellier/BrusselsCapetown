<?php

declare(strict_types=1);

const BCT_MAX_MEDIA_FILES = 20;
const BCT_MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const BCT_MAX_VIDEO_BYTES = 200 * 1024 * 1024;
const BCT_MAX_TOTAL_MEDIA_BYTES = 350 * 1024 * 1024;
const BCT_MAX_IMAGE_LONG_EDGE = 2560;
const BCT_MAX_IMAGE_PIXELS = 60000000;
const BCT_WEBP_QUALITY = 82;

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

        if ($typeSettings['media_type'] === 'image') {
            bctAssertImageOptimizationSupport($mimeType);
        }

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

function bctAssertImageOptimizationSupport(string $mimeType): void
{
    $requiredFunctions = [
        'getimagesize',
        'imagecreatefromstring',
        'imagecreatetruecolor',
        'imagecopyresampled',
        'imagewebp',
        'imageflip',
        'imagerotate',
        'imagetypes',
    ];
    foreach ($requiredFunctions as $function) {
        if (!function_exists($function)) {
            throw new RuntimeException('The PHP GD extension with WebP support is required for image uploads.');
        }
    }

    if (!defined('IMG_WEBP') || (imagetypes() & IMG_WEBP) !== IMG_WEBP) {
        throw new RuntimeException('The PHP GD extension does not support WebP output.');
    }

    $sourceTypeFlags = [
        'image/jpeg' => defined('IMG_JPG') ? IMG_JPG : 0,
        'image/png' => defined('IMG_PNG') ? IMG_PNG : 0,
        'image/gif' => defined('IMG_GIF') ? IMG_GIF : 0,
        'image/webp' => IMG_WEBP,
    ];
    $sourceTypeFlag = $sourceTypeFlags[$mimeType] ?? 0;
    if ($sourceTypeFlag === 0 || (imagetypes() & $sourceTypeFlag) !== $sourceTypeFlag) {
        throw new RuntimeException('The PHP GD extension cannot decode this image type.');
    }

    if ($mimeType === 'image/jpeg' && !function_exists('exif_read_data')) {
        throw new RuntimeException('The PHP EXIF extension is required to optimize JPEG uploads safely.');
    }
}

function bctReadJpegOrientation(string $path, string $mimeType): int
{
    if ($mimeType !== 'image/jpeg') {
        return 1;
    }

    if (!function_exists('exif_read_data')) {
        throw new RuntimeException('The PHP EXIF extension is required to optimize JPEG uploads safely.');
    }

    $exif = @exif_read_data($path, 'IFD0', true, false);
    if (!is_array($exif)) {
        return 1;
    }

    $orientation = (int) ($exif['IFD0']['Orientation'] ?? $exif['Orientation'] ?? 1);
    return $orientation >= 1 && $orientation <= 8 ? $orientation : 1;
}

function bctRotateImage($image, int $angle)
{
    $rotated = @imagerotate($image, $angle, 0);
    if ($rotated === false) {
        throw new RuntimeException('The uploaded photo orientation could not be applied.');
    }

    imagealphablending($rotated, false);
    imagesavealpha($rotated, true);
    imagedestroy($image);
    return $rotated;
}

function bctApplyImageOrientation($image, int $orientation)
{
    try {
        switch ($orientation) {
            case 2:
                if (!imageflip($image, IMG_FLIP_HORIZONTAL)) {
                    throw new RuntimeException('The uploaded photo orientation could not be applied.');
                }
                break;
            case 3:
                $image = bctRotateImage($image, 180);
                break;
            case 4:
                if (!imageflip($image, IMG_FLIP_VERTICAL)) {
                    throw new RuntimeException('The uploaded photo orientation could not be applied.');
                }
                break;
            case 5:
                $image = bctRotateImage($image, -90);
                if (!imageflip($image, IMG_FLIP_HORIZONTAL)) {
                    throw new RuntimeException('The uploaded photo orientation could not be applied.');
                }
                break;
            case 6:
                $image = bctRotateImage($image, -90);
                break;
            case 7:
                $image = bctRotateImage($image, 90);
                if (!imageflip($image, IMG_FLIP_HORIZONTAL)) {
                    throw new RuntimeException('The uploaded photo orientation could not be applied.');
                }
                break;
            case 8:
                $image = bctRotateImage($image, 90);
                break;
        }
    } catch (Throwable $error) {
        imagedestroy($image);
        throw $error;
    }

    return $image;
}

/** Decode, orient and resize an uploaded image, then atomically store a metadata-free WebP. */
function bctOptimizeImageUpload(string $sourcePath, string $destinationPath, string $mimeType): array
{
    bctAssertImageOptimizationSupport($mimeType);

    $imageInfo = @getimagesize($sourcePath);
    $sourceWidth = (int) ($imageInfo[0] ?? 0);
    $sourceHeight = (int) ($imageInfo[1] ?? 0);
    if ($sourceWidth < 1 || $sourceHeight < 1
        || $sourceWidth > intdiv(BCT_MAX_IMAGE_PIXELS, $sourceHeight)) {
        throw new InvalidArgumentException('An uploaded photo has invalid or excessively large dimensions.');
    }

    $orientation = bctReadJpegOrientation($sourcePath, $mimeType);
    $sourceBytes = @file_get_contents($sourcePath);
    if (!is_string($sourceBytes) || $sourceBytes === '') {
        throw new RuntimeException('An uploaded photo could not be read for optimization.');
    }

    $sourceImage = @imagecreatefromstring($sourceBytes);
    unset($sourceBytes);
    if ($sourceImage === false) {
        throw new InvalidArgumentException('An uploaded photo could not be decoded.');
    }

    $scale = min(1, BCT_MAX_IMAGE_LONG_EDGE / max($sourceWidth, $sourceHeight));
    $targetWidth = max(1, (int) round($sourceWidth * $scale));
    $targetHeight = max(1, (int) round($sourceHeight * $scale));
    $optimizedImage = imagecreatetruecolor($targetWidth, $targetHeight);
    if ($optimizedImage === false) {
        imagedestroy($sourceImage);
        throw new RuntimeException('The optimized photo canvas could not be created.');
    }

    imagealphablending($optimizedImage, false);
    imagesavealpha($optimizedImage, true);
    $transparent = imagecolorallocatealpha($optimizedImage, 0, 0, 0, 127);
    imagefill($optimizedImage, 0, 0, $transparent);

    $resampled = imagecopyresampled(
        $optimizedImage,
        $sourceImage,
        0,
        0,
        0,
        0,
        $targetWidth,
        $targetHeight,
        $sourceWidth,
        $sourceHeight
    );
    imagedestroy($sourceImage);
    if (!$resampled) {
        imagedestroy($optimizedImage);
        throw new RuntimeException('The uploaded photo could not be resized.');
    }

    $partialPath = $destinationPath . '.part';
    try {
        $optimizedImage = bctApplyImageOrientation($optimizedImage, $orientation);
        try {
            if (file_exists($partialPath) || is_link($partialPath)
                || !@imagewebp($optimizedImage, $partialPath, BCT_WEBP_QUALITY)) {
                throw new RuntimeException('The optimized WebP photo could not be written.');
            }
        } finally {
            imagedestroy($optimizedImage);
        }

        clearstatcache(true, $partialPath);
        $fileSize = filesize($partialPath);
        $storedInfo = @getimagesize($partialPath);
        $storedMimeType = is_array($storedInfo) ? ($storedInfo['mime'] ?? '') : '';
        if ($fileSize === false || $fileSize <= 0 || $storedMimeType !== 'image/webp'
            || max((int) ($storedInfo[0] ?? 0), (int) ($storedInfo[1] ?? 0)) > BCT_MAX_IMAGE_LONG_EDGE) {
            throw new RuntimeException('The optimized WebP photo failed verification.');
        }

        @chmod($partialPath, 0644);
        if (!@rename($partialPath, $destinationPath)) {
            throw new RuntimeException('The optimized WebP photo could not be stored.');
        }
    } catch (Throwable $error) {
        if (is_file($partialPath)) {
            @unlink($partialPath);
        }
        throw $error;
    }

    return [
        'mime_type' => 'image/webp',
        'file_size' => (int) $fileSize,
    ];
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
            $storedExtension = $mediaFile['media_type'] === 'image'
                ? 'webp'
                : $mediaFile['extension'];
            $fileName = sprintf(
                '%03d-%s.%s',
                $sortOrder + 1,
                bin2hex(random_bytes(16)),
                $storedExtension
            );
            $absolutePath = $locationDirectory . '/' . $fileName;
            $publicPath = '/uploads/gallery/' . $locationId . '/' . $fileName;
            $storedMedia['paths'][] = $absolutePath;

            if (file_exists($absolutePath) || is_link($absolutePath)) {
                throw new RuntimeException('The generated media destination already exists.');
            }

            if ($mediaFile['media_type'] === 'image') {
                $storedFile = bctOptimizeImageUpload(
                    $mediaFile['tmp_name'],
                    $absolutePath,
                    $mediaFile['mime_type']
                );
            } else {
                if (!@move_uploaded_file($mediaFile['tmp_name'], $absolutePath)) {
                    throw new RuntimeException('An uploaded video could not be stored.');
                }
                $storedFile = [
                    'mime_type' => $mediaFile['mime_type'],
                    'file_size' => $mediaFile['file_size'],
                ];
            }

            $insertStatement->execute([
                'location_id' => $locationId,
                'media_type' => $mediaFile['media_type'],
                'file_path' => $publicPath,
                'mime_type' => $storedFile['mime_type'],
                'file_size' => $storedFile['file_size'],
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
