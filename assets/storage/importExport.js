import { sha256Hex } from "./fingerprint.js";
import { parseJsonWithoutDuplicateKeys, stableJson } from "./strictJson.js";
import { ARCHIVE_KIND, ARCHIVE_SCHEMA_VERSION, MAX_ARCHIVE_BYTES, validateArchive } from "./schema.js";
import { storageError } from "./errors.js";
function byteLength(text) {
    return new TextEncoder().encode(text).byteLength;
}
async function dispatchDocument(value) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
        throw storageError("invalid-archive", "The imported document must be a JSON object.", "$archive");
    }
    const input = value;
    if (input.kind !== ARCHIVE_KIND) {
        throw storageError("invalid-archive", "This file is not a LönKoll planning archive.", "$archive.kind");
    }
    switch(input.schemaVersion){
        case ARCHIVE_SCHEMA_VERSION:
            {
                if (input.integrity === null || typeof input.integrity !== "object" || Array.isArray(input.integrity)) {
                    throw storageError("invalid-archive", "Archive integrity proof is missing.", "$archive.integrity");
                }
                const integrity = input.integrity;
                if (Object.keys(integrity).sort().join("\0") !== [
                    "algorithm",
                    "digest"
                ].sort().join("\0") || integrity.algorithm !== "SHA-256" || typeof integrity.digest !== "string" || !/^[0-9a-f]{64}$/u.test(integrity.digest)) {
                    throw storageError("invalid-archive", "Archive integrity proof is malformed.", "$archive.integrity");
                }
                const { integrity: _integrity, ...archiveMembers } = input;
                const archive = validateArchive(archiveMembers);
                const digest = await sha256Hex(stableJson(archive));
                if (digest !== integrity.digest) {
                    throw storageError("invalid-archive", "Archive integrity verification failed.", "$archive.integrity.digest");
                }
                return archive;
            }
        default:
            throw storageError("unsupported-schema", "The archive schema version is not supported.", "$archive.schemaVersion");
    }
}
export async function previewArchiveImport(text) {
    if (byteLength(text) > MAX_ARCHIVE_BYTES) {
        throw storageError("archive-too-large", `Archive exceeds the ${MAX_ARCHIVE_BYTES}-byte limit.`);
    }
    const archive = await dispatchDocument(parseJsonWithoutDuplicateKeys(text));
    const canonicalJson = stableJson(archive);
    const fingerprint = await sha256Hex(canonicalJson);
    return Object.freeze({
        archive,
        fingerprint,
        canonicalJson,
        summary: Object.freeze({
            profile: archive.profile !== null,
            employers: archive.employers.length,
            employments: archive.employments.length,
            payRates: archive.payRates.length,
            ruleSets: archive.ruleSets.length,
            shifts: archive.shifts.length,
            calculationHistory: archive.calculationHistory.length,
            recurrences: archive.recurrences.length
        })
    });
}
export async function archiveFingerprint(value) {
    const archive = validateArchive(value);
    const canonicalJson = stableJson(archive);
    if (byteLength(canonicalJson) > MAX_ARCHIVE_BYTES) {
        throw storageError("archive-too-large", `Archive exceeds the ${MAX_ARCHIVE_BYTES}-byte limit.`);
    }
    return {
        archive,
        canonicalJson,
        fingerprint: await sha256Hex(canonicalJson)
    };
}
export async function exportArchiveJson(value) {
    const { archive, fingerprint } = await archiveFingerprint(value);
    const integrity = {
        algorithm: "SHA-256",
        digest: fingerprint
    };
    const output = `${stableJson({
        ...archive,
        integrity
    }, 2)}\n`;
    if (byteLength(output) > MAX_ARCHIVE_BYTES) {
        throw storageError("archive-too-large", `Archive exceeds the ${MAX_ARCHIVE_BYTES}-byte limit.`);
    }
    return output;
}
export async function exportArchiveBlob(value) {
    return new Blob([
        await exportArchiveJson(value)
    ], {
        type: "application/json;charset=utf-8"
    });
}
export function suggestedArchiveFileName(date = new Date()) {
    const day = date.toISOString().slice(0, 10);
    return `lonkoll-backup-${day}.json`;
}


//# sourceURL=storage/importExport.ts