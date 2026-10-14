export const MAX_IMPORT_FILE_BYTES = 32 * 1024 * 1024;
export class ImportFileError extends Error {
    code = "file_too_large";
}
export function validateImportFile(file) {
    if (file.size > MAX_IMPORT_FILE_BYTES) throw new ImportFileError();
}
export async function readImportFile(file) {
    validateImportFile(file);
    return file.text();
}


//# sourceURL=ui/import-file.ts