# Delete a complete journey location

Open **Manage locations → Delete** next to the intended location. The link only opens a read-only confirmation page. Review the French name, date, journey stop, location ID and photo/video counts, then type the exact French location name and choose **Delete location and media**. Cancel returns to the overview without changing anything.

The result stays visible after deletion so any file-cleanup warning can be read. Successful deletion is permanent through this admin panel; a full restore requires an external database/uploads backup. Test with a disposable location before using this on real journey data.

## What changes

- Exactly one `gallery_locations` record is deleted.
- Its `gallery_media` records are removed by the existing `ON DELETE CASCADE` foreign key. The endpoint verifies that none remain; if the schema does not cascade as expected, it rolls back.
- Each registered media file is staged and then removed, using the same private recovery mechanism as individual media deletion.
- The location upload directory is removed only if empty. Unregistered files, unexpected directories and symlinks are never recursively deleted; a warning identifies the folder to inspect.
- Missing media files do not prevent removal of their database records. Locations with no media can also be deleted.

Other locations, their IDs, `journey_order`, translations, coordinates and distances are not changed or renumbered. As a result, journey-order values may have gaps. The gallery's cumulative distance is recomputed from the remaining records; review the following stop's distance manually if removing an intermediate stop changes the intended distance calculation.

No SQL migration or production dependency is added. No public gallery styles are changed. Reload the gallery to see the deletion; this is not a draft/publish workflow.

## Request protection and concurrent edits

The confirmation page requires admin login. `httpdocs/api/admin/delete-location.php` requires POST, the existing admin session, a valid CSRF token, a valid location ID, the exact typed name, and a revision matching the reviewed location **and all its media**. Visiting a GET URL never deletes anything.

The endpoint locks the location row before its media, matching the lock order of existing edit/upload/reorder/delete actions. Changed location text, newly uploaded media or a changed media order invalidates an old confirmation page. Reload it and review the new state before deleting. A repeated request after deletion returns 404 and cannot delete a different location.

## Recovery and permissions

PHP needs write access to the existing uploads directory and repository-root `private` directory outside `httpdocs`. No new config keys are required; `private/gallery-trash` is already ignored by Git.

All registered files are moved one at a time to private recovery pairs before deleting the location record. If staging fails partway or a database failure is definitely rolled back, all previously staged files are restored. Restoration continues even if one file fails; a conflicting existing file is never overwritten. The remaining recovery pair is preserved and the API reports that manual recovery is required.

If commit or rollback cannot be confirmed, the endpoint retains all staged copies/manifests rather than deleting or blindly restoring them. A process crash can also leave recovery pairs: database transactions and filesystem operations are not one crash-atomic operation. Inspect the exact IDs in the database and follow the per-file recovery instructions in [ADMIN_MEDIA_MANAGEMENT.md](ADMIN_MEDIA_MANAGEMENT.md). Do not bulk-delete `private/gallery-trash` without resolving each pair.

Once the database deletion is confirmed, private staged files are removed. Cleanup failure is reported as **successful location deletion with a warning**, not as a failed deletion to retry. Unknown files left in a location's upload folder are also reported and left untouched.

## Local checks

1. Add a disposable location containing at least two photos/videos. Keep another location to verify isolation.
2. Open its Delete link, check the counts and cancel. Nothing should change.
3. Enter an incorrect name: deletion must stay disabled. Enter the exact name and delete.
4. Verify that the target location, linked database records and registered files are gone; the other location and its media must remain unchanged.
5. Repeat for a location with no media and, if applicable, the last location in a test database.
6. Open a confirmation page in one tab and edit/upload/reorder that location in another. The old confirmation must be rejected until reloaded.
7. Log out and verify the confirmation page and API cannot be used.

Actual MySQL locking, filesystem permissions and browser behavior still require local Laragon/Cloud86 checks. Implementation/testing does not delete live data, merge to `main` or deploy the website.

## Automated tests

From the repository root:

```sh
node --test tests/admin-delete-location-ui.test.mjs
```

For PHP integration tests, use the same separate `@php-wasm/cli@3.1.52` tooling and `BCT_PHP_WASM_MODULES` setup documented in [ADMIN_MEDIA_MANAGEMENT.md](ADMIN_MEDIA_MANAGEMENT.md):

```sh
node --test tests/admin-delete-location.test.mjs
```

Tests execute the production page, endpoint and filesystem helpers in a disposable virtual filesystem. SQLite has a real cascading foreign key; only the database bootstrap and MySQL locking behavior are simulated. Coverage includes partial staging failure, rollback, missing cascades/files, restoration conflicts, ambiguous commits, unregistered-file preservation, cross-location isolation, stale confirmations, authentication, CSRF, name validation and escaped page output.

Run the existing media and text-edit suites as regression checks. Admin PHP/JS/CSS are served directly, not bundled into Vite's `dist`; include the changed admin/API files in any later deployment and keep test tooling out of the webroot.
