# Media management for existing locations

Open **Manage locations → Edit**, then scroll to **Photos and videos**. The text form remains independent; media actions never submit or reset unsaved text changes.

## Available actions

- Existing photos and videos have previews. Image previews load lazily; videos have playback controls. No thumbnail files are generated. Missing/unplayable media show a preview warning; MOV support still depends on the browser's codecs.
- Add up to 20 new files **per request**, using the existing upload limits: 15 MB per image, 200 MB per video, 350 MB total. A location can contain more than 20 files across multiple uploads. Newly uploaded media appear at the end.
- Use **Earlier** / **Later**, then **Save order**. Until saved, the order is only local. **Discard order changes** restores the loaded order. Upload/delete are disabled while an unsaved order exists.
- **Delete** asks for confirmation and removes only the selected media record and file. Deleting the last item is allowed; the journey location itself stays.
- **Reload media list** refreshes only media, not the location form. After a failed/uncertain request or a stale list, reload before trying another mutation. Selected upload files are only cleared after confirmed success.

The frontend reads `sort_order` from the database, so reload `/gallery` to see saved changes. There is no draft/publish step: on production, completed actions affect subsequent gallery loads immediately.

## Endpoint and safety

`httpdocs/api/admin/media.php` accepts authenticated GET requests for a list and CSRF-protected POST requests for `upload`, `reorder` or `delete`. Input is validated server-side, including MIME/content checks for uploads, ID ownership and an exact permutation of all current media IDs for sorting. Paths come from validated database records, never from a client-supplied filename. Symlinked upload destinations and traversal paths are refused.

All mutations lock the location row first, then its media, and check a media revision. This avoids overwriting an order based on a stale list and serializes concurrent append/delete/reorder operations. Location text, coordinates, distances, IDs and journey order are untouched.

The shared upload helper supports appending but retains its original default behavior for a newly created location. Rollback cleanup tracks only files created by that upload and never removes an existing location directory.

## Deletion recovery and permissions

PHP must be able to write to `httpdocs/uploads/gallery` and to the existing **repository-root `private` directory outside `httpdocs`**. Do not move private configuration into the webroot or enable world-writable permissions.

For deletion, the exact media file is first moved to `private/gallery-trash/<media-id>-<random>.bin`. A matching `.json` manifest records the original public path and media/location IDs. The directory is created with restrictive permissions and excluded from Git. Once the database deletion commits, both temporary files are removed. No recycle-bin UI or automatic retention is provided: successful deletion is permanent without an external backup.

On a confirmed database rollback, the file is restored. A process crash, uncertain commit, failed restoration or failed final cleanup can leave a recovery pair. Database transactions cannot make filesystem changes crash-atomic. An explicit warning is returned for failed post-commit cleanup; other recovery failures are also recorded in the PHP error log. Never bulk-delete recovery files without checking their records.

To investigate a specific recovery pair:

1. Read its manifest and check that exact `media_id` / `location_id` in `gallery_media`.
2. If the record still exists and the original file is missing, restore that `.bin` to the manifest's validated path, without overwriting another file. Remove the matching manifest only after verifying recovery.
3. If the record no longer exists, the database deletion completed. The matching private file and manifest can be removed after verifying that no recovery is needed.
4. If the state is unclear, preserve the pair and inspect the PHP error log/database backup. Do not rerun a deletion blindly.

These are exceptional recovery instructions, not a normal extra step for each deletion. Back up both database and uploads before enabling destructive actions on the live site.

## Local acceptance checks

1. Pull `main` and run the Laragon/PHP and Vite setup described in `README.md`.
2. Open a location with both a photo and a video. Verify previews/playback on desktop and the intended mobile browser.
3. Enter an unsaved text change, then upload an extra file. The text must remain in the form; originals must remain present on disk and in the database.
4. Move a media item, confirm nothing changes on `/gallery` before **Save order**, then save and reload the gallery.
5. Cancel a deletion, then confirm deletion of a disposable test upload. Check its exact database row and file disappeared; all other media must remain.
6. Repeat with the last media item, then upload to the empty location.
7. Open the same location in two tabs. Save an order or upload in one; a mutation from the older list must report a conflict until reloaded.
8. Log out and verify media actions are rejected. Recheck adding a completely new location with media.

The shared private directory's permissions and actual MySQL locks must be verified on Laragon and Cloud86. PHP/admin files are served directly and are not included in Vite's `dist`.
