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
- PHP 8.1 or newer with PDO MySQL, fileinfo, mbstring and ctype
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

## Author

Created by Mathis Angellier for his father's Brussels-to-Cape-Town cycling journey and fundraising project.

## License

This is a personal project. Unless otherwise specified, its original code, text, photography and other original content may not be reused without permission.
