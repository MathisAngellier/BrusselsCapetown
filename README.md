# BrusselsCapeTown

BrusselsCapeTown documents a cycling journey from Brussels, Belgium, to Cape Town, South Africa. The website follows the route and shares locations, photos, videos and stories while supporting the journey's fundraising project.

The public website is available in English and French. Journey locations and media are managed through a protected admin panel and stored in a MySQL/MariaDB database.

## Technologies

- HTML5, CSS3 and JavaScript ES modules
- Vite
- PHP with PDO
- MySQL or MariaDB
- Leaflet and OpenStreetMap
- DeepL API for French-to-English admin translations
- Formspree for contact and newsletter forms

The frontend intentionally does not use a JavaScript framework.

## Project structure

- `httpdocs/src` contains the Vite source files.
- `httpdocs/public` contains static public assets.
- `httpdocs/admin` contains the protected admin pages.
- `httpdocs/api` contains the public gallery and protected admin endpoints.
- `httpdocs/uploads/gallery` is used for uploaded gallery media and is ignored by Git, except for its security `.htaccess` file.
- `private/config.php` contains local or hosting credentials and must never be committed.

## Running locally

Requirements:

- Node.js and npm
- PHP 8.1 or newer with PDO MySQL, fileinfo, mbstring, ctype, GD with WebP support, and EXIF
- MySQL or MariaDB

Install the frontend dependencies:

```bash
git clone https://github.com/MathisAngellier/BrusselsCapetown.git
cd BrusselsCapetown/httpdocs
npm install
```

Create `private/config.php` in the repository root with the local database and DeepL settings. Do not use production credentials locally or commit this file.

Start PHP from the repository root:

```bash
php -S localhost:8000 -t httpdocs
```

In another terminal, start Vite from `httpdocs`:

```bash
npm run dev
```

Open the URL printed by Vite, normally `http://localhost:5173`.

## Production build

From `httpdocs`:

```bash
npm run build
```

Vite writes the frontend build to `httpdocs/dist`. PHP admin/API files, uploaded media and the private configuration are not part of that build and must be deployed or backed up separately.

## Admin panel

The admin panel can add, edit and delete journey locations and manage their photos and videos. French location and description text is translated to English before both languages are stored. Changes made on production are visible in the public gallery immediately; there is no separate publish step.

See the admin documentation in the repository root for detailed editing, media-management and deletion behavior.

## Optimizing existing gallery images

New admin uploads are optimized automatically. Existing JPEG, PNG and GIF gallery files can be converted separately with `scripts/optimize-existing-gallery-image.php`. The script is command-line only and applies exactly one database media ID per run.

First perform a read-only inspection and copy the displayed item hash:

```bash
php scripts/optimize-existing-gallery-image.php \
  --expect-database=brusselscapetown \
  --media-id=123
```

Create a new backup directory outside `httpdocs`. The directory must not exist yet:

```bash
php scripts/optimize-existing-gallery-image.php \
  --expect-database=brusselscapetown \
  --media-id=123 \
  --expect-item=ITEM_SHA256 \
  --backup=/absolute/path/gallery-image-123-backup
```

Only after the backup and its SHA-256 verification succeed, apply the conversion with the manifest path printed by the backup command:

```bash
php scripts/optimize-existing-gallery-image.php \
  --expect-database=brusselscapetown \
  --media-id=123 \
  --expect-item=ITEM_SHA256 \
  --backup-manifest=/absolute/path/gallery-image-123-backup/backup-manifest.json \
  --apply
```

The new WebP receives a unique filename. The database is updated only after the output file passes verification, and the original is removed only after the database commit succeeds. Changed rows, changed files, missing backups and database-name mismatches are refused.

## Author

This project was created for my father to document his cycling journey from Brussels to Cape Town and support the associated fundraising challenge.

It is also a personal development project created to learn and gain practical experience with modern web development technologies.

## License

This is a personal project. Unless otherwise specified, its original code, text, photography and other original content may not be reused without permission.
