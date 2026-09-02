# Manage and edit journey locations

This change only adds an authenticated overview and editing of location details. No database migration is needed. It does not deploy the website or implement media editing/deletion.

## Use locally

1. Pull `admin-gallery` and start the same Laragon/PHP and Vite servers as before.
2. Log in, then choose **Manage locations** on the add-location page, or open `/admin/locations.php` through Vite.
3. The overview shows date, French location, journey stop and separate photo/video counts. Locations with no media are included.
4. Choose **Edit**, change the details and select **Save changes**. Return to the overview or reload `/gallery` to see them.

The public gallery and its styles are unchanged. The overview lists latest journey stops first; editing a date does not change `journey_order`. IDs and existing media remain unchanged.

Only changed, nonempty French location/description text is sent to DeepL. Editing dates, distance or coordinates does not call DeepL. Clearing the description clears both languages. A translation failure leaves the entire location unchanged. There is no draft state: on a production deployment, a saved edit would be visible in the public gallery on its next load.

## Safety

- Both pages require the existing admin login and send `Cache-Control: no-store`.
- `/api/admin/update-location.php` only accepts authenticated, CSRF-protected POST requests.
- All fields are validated server-side; only an explicit list of columns can be updated.
- Values are escaped when displayed; error responses do not reveal database or translation credentials.
- A revision hash detects a stale form. The row is checked again under a transaction lock after translation, so another edit is not silently overwritten. If there is a conflict, copy any text you want to keep, then reload the location.
- Database updates are transactional. Media records and uploaded files are never modified by this endpoint.

The existing add endpoint now shares validation/translation helpers in `httpdocs/api/admin/location-fields.php`. Its upload behavior is unchanged. The existing inline admin styles were moved to `httpdocs/admin/admin.css` for reuse.

## Automated checks

From the repository root, with PHP CLI (including PDO SQLite, session, ctype and mbstring) and Node installed:

```sh
php tests/admin-location-fields.php
node --test tests/admin-location-api.test.mjs tests/admin-edit-form.test.mjs
```

The API tests default to the `php` executable. Set `PHP_BINARY` to a different executable if necessary. They execute the real update endpoint with an in-memory SQLite fixture replacing only its database bootstrap; they never use private config, production records or DeepL. SQLite does not implement MySQL `FOR UPDATE`, so locking is simulated. Successful changed-text translation is tested using a fake translator at the shared-helper level; a failed translation is tested through the endpoint.

From `httpdocs`, `npm run build` still builds the public frontend. Admin PHP, CSS and JS are served directly, not bundled by Vite. If deploying later, include the complete changed `admin` and `api/admin` files, not just `dist`. Do not upload `tests` or private configuration into the webroot.

## Laragon checks before deploying

- Open the overview with zero locations, then with your existing locations. Check photo/video counts.
- Edit only a distance. Check the database and gallery total after reload; the English texts and media should stay unchanged.
- Change the French location and description. Check the English translation in the database and gallery language toggle.
- Clear the description. Both database fields must become empty, and gallery spacing must remain correct.
- Save the same form twice; both saves should work.
- Open one location in two tabs. Save a change in the first tab; saving the second must report a conflict.
- Log out, then try opening the overview/edit URL or saving an already-open form; access must be denied.
- Add a new location with media once more to confirm the existing add/upload flow still works.

Actual MySQL locking, the configured DeepL account and browser behavior still need these local checks. Nothing in this change merges `admin-gallery` into `main` or publishes it to Cloud86.
