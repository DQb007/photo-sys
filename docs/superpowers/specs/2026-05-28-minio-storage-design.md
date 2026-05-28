# MinIO Storage Design

## Context

The API currently stores uploaded reference images and generated images on the local filesystem under `STORAGE_DIR`. Database rows keep relative storage keys such as `uploads/example.png` and `generated/example.png`, and `/files/:folder/:filename` performs authorization before serving the local file.

The production system needs MinIO support without breaking local development or existing server images.

## Goals

- Support both local filesystem storage and MinIO through `STORAGE_DRIVER=local|minio`.
- Keep existing storage keys unchanged so database rows do not need a bulk rewrite.
- Preserve the existing authorized `/files/...` access path.
- Add a repeatable migration script that uploads existing local files to MinIO using the same object keys.
- Keep local files untouched during migration so rollback remains simple.

## Non-Goals

- No CDN integration in this change.
- No long-term dual-read fallback where MinIO misses are silently served from local disk.
- No database schema changes for storage keys.

## Approach

Add a storage abstraction in `apps/api/src/storage.ts` with a common set of operations:

- initialize storage
- save uploaded reference files
- save generated base64 images
- read stored files for relay processing
- stream stored files through Express responses
- delete stored files
- check object existence for migration
- upload a local file using a specific storage key

Local mode keeps the current filesystem behavior. MinIO mode uses the same `uploads/...` and `generated/...` keys as object names in a configured bucket.

Uploads will still land in a local temporary directory first through Multer. The route will compute the SHA-256 hash from the temporary file, decide whether a duplicate reference already exists, and only upload new reference images to the configured storage driver. Temporary files are deleted after request handling.

Generated images will be written directly through the selected storage driver.

`/files/:folder/:filename` keeps its authorization checks. After authorization, local mode sends the file from disk and MinIO mode streams the object from MinIO through the API. This preserves current frontend URLs and token behavior.

## Existing Server Photos

Existing server files under `storage/uploads` and `storage/generated` will be migrated with a script. The script scans the local storage directory, computes the relative key, and uploads each file to MinIO with that key. Existing MinIO objects are skipped by default so the script can be re-run safely.

The production rollout sequence is:

1. Deploy code with `STORAGE_DRIVER=local`.
2. Configure MinIO environment variables.
3. Run migration in dry-run mode.
4. Run migration with `--apply`.
5. Switch production to `STORAGE_DRIVER=minio`.
6. Restart the API and verify old and new images.
7. Keep local storage as backup until MinIO is verified.

## Configuration

New API environment variables:

- `STORAGE_DRIVER=local|minio`, default `local`
- `MINIO_ENDPOINT`
- `MINIO_PORT`, default `9000`
- `MINIO_USE_SSL`, default `false`
- `MINIO_ACCESS_KEY`
- `MINIO_SECRET_KEY`
- `MINIO_BUCKET`, default `photo-sys`

MinIO variables are required only when `STORAGE_DRIVER=minio` or when running the migration script.

## Error Handling

- Missing MinIO configuration in MinIO mode fails API startup with a clear configuration error.
- Upload failures delete temporary files and do not create database references for failed objects.
- Duplicate reference uploads delete only the temporary upload, not the existing object.
- Migration failures are reported with a non-zero exit code and do not delete local files.

## Testing

- Run API typecheck.
- Verify local mode still builds and keeps current behavior.
- Verify migration dry-run can list local files without writing to MinIO.
- MinIO runtime verification requires configured MinIO credentials in the deployment environment.
