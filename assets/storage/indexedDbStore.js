import { PlanningStorageError, storageError } from "./errors.js";
import { sha256Hex } from "./fingerprint.js";
import { archiveFingerprint, previewArchiveImport } from "./importExport.js";
import { validateArchive } from "./schema.js";
import { stableJson } from "./strictJson.js";
export const DATABASE_NAME = "lonkoll-planning";
export const DATABASE_VERSION = 5;
const DOCUMENTS_STORE = "documents";
const META_STORE = "meta";
const CURRENT_DOCUMENT_KEY = "current";
export const TAX_PROFILES_STORE = "taxProfiles";
export const SHIFT_STATUS_MODES_STORE = "shiftStatusModes";
export const EMPLOYER_PROFILES_STORE = "employerProfiles";
export const EMPLOYER_STATES_STORE = "employerStates";
function assertEmployerState(value) {
    if (!/^[0-9a-f-]{36}$/u.test(value.employerId) || typeof value.archived !== "boolean" || typeof value.updatedAt !== "string") throw storageError("invalid-archive", "Employer state is invalid.");
    return Object.freeze({
        ...value
    });
}
function assertEmployerProfile(value) {
    if (!/^[0-9a-f-]{36}$/u.test(value.employerId) || value.employerSector !== undefined && ![
        "private",
        "public",
        "unknown"
    ].includes(value.employerSector) || typeof value.branch !== "string" || !value.branch || typeof value.occupation !== "string" || !value.occupation || ![
        "direct",
        "staffing",
        "consultant",
        "other"
    ].includes(value.employmentType) || (value.employmentType === "staffing" ? !value.clientCompany : value.clientCompany !== null) || ![
        "unknown",
        "none",
        "catalog",
        "manual"
    ].includes(value.agreementChoice) || typeof value.agreementConfirmed !== "boolean" || ![
        "yes",
        "no",
        "unknown"
    ].includes(value.unionMembership) || ![
        "yes",
        "no",
        "unknown"
    ].includes(value.unemploymentFundMembership) || typeof value.createdAt !== "string" || typeof value.updatedAt !== "string") throw storageError("invalid-archive", "Employer profile is invalid.");
    if (value.agreementChoice === "catalog" !== (value.agreementId !== null) || value.agreementChoice === "manual" && !value.agreementName || value.unionMembership !== "yes" && value.unionName !== null || value.unemploymentFundMembership !== "yes" && value.unemploymentFundName !== null) throw storageError("invalid-archive", "Employer profile selections are inconsistent.");
    return Object.freeze({
        ...value
    });
}
function assertShiftStatusMode(value) {
    if (!/^[0-9a-f-]{36}$/u.test(value.shiftId) || ![
        "automatic",
        "manual"
    ].includes(value.mode) || typeof value.updatedAt !== "string") throw storageError("invalid-archive", "Shift status mode is invalid.");
    return Object.freeze({
        ...value
    });
}
function assertTaxProfile(profile) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(profile.employerId) || profile.taxYear !== 2026 || ![
        "automatic",
        "manual"
    ].includes(profile.tableMode) || ![
        "automatic",
        "manual"
    ].includes(profile.columnMode) || ![
        "main",
        "secondary",
        "unknown"
    ].includes(profile.incomeType) || ![
        "monthly",
        "fortnightly"
    ].includes(profile.payrollPeriod) || ![
        "none",
        "percentage",
        "amount"
    ].includes(profile.adjustmentType) || typeof profile.confirmedByUser !== "boolean" || typeof profile.datasetVersion !== "string" || typeof profile.sourceMetadata !== "string" || typeof profile.createdAt !== "string" || typeof profile.updatedAt !== "string") throw storageError("invalid-archive", "Tax profile is invalid.");
    if (profile.tableMode === "manual" && (profile.tableNumber === null || profile.tableNumber < 29 || profile.tableNumber > 42)) throw storageError("invalid-archive", "Manual tax table is invalid.");
    if (profile.columnMode === "manual" && (profile.column === null || profile.column < 1 || profile.column > 6)) throw storageError("invalid-archive", "Manual tax column is invalid.");
    if (profile.adjustmentType === "none" ? profile.adjustmentValue !== null : profile.adjustmentValue === null || !Number.isSafeInteger(profile.adjustmentValue) || profile.adjustmentValue < 0) throw storageError("invalid-archive", "Tax adjustment is invalid.");
    return Object.freeze({
        ...profile
    });
}
function migration(db, transaction, oldVersion, newVersion) {
    let version = oldVersion;
    if (version === 0) {
        db.createObjectStore(DOCUMENTS_STORE, {
            keyPath: "key"
        });
        db.createObjectStore(META_STORE, {
            keyPath: "key"
        });
        transaction.objectStore(META_STORE).put({
            key: "databaseSchema",
            version: 1
        });
        version = 1;
    }
    if (version === 1) {
        db.createObjectStore(TAX_PROFILES_STORE, {
            keyPath: "employerId"
        });
        transaction.objectStore(META_STORE).put({
            key: "databaseSchema",
            version: 2
        });
        version = 2;
    }
    if (version === 2) {
        db.createObjectStore(SHIFT_STATUS_MODES_STORE, {
            keyPath: "shiftId"
        });
        transaction.objectStore(META_STORE).put({
            key: "databaseSchema",
            version: 3
        });
        version = 3;
    }
    if (version === 3) {
        db.createObjectStore(EMPLOYER_PROFILES_STORE, {
            keyPath: "employerId"
        });
        transaction.objectStore(META_STORE).put({
            key: "databaseSchema",
            version: 4
        });
        version = 4;
    }
    if (version === 4) {
        db.createObjectStore(EMPLOYER_STATES_STORE, {
            keyPath: "employerId"
        });
        transaction.objectStore(META_STORE).put({
            key: "databaseSchema",
            version: 5
        });
        version = 5;
    }
    if (version !== newVersion || version !== DATABASE_VERSION) {
        throw storageError("unsupported-schema", `No IndexedDB migration exists from version ${oldVersion} to ${String(newVersion)}.`);
    }
}
function requestValue(request) {
    return new Promise((resolve, reject)=>{
        request.onsuccess = ()=>resolve(request.result);
        request.onerror = ()=>reject(request.error ?? storageError("transaction-failed", "IndexedDB request failed."));
    });
}
function transactionCompletion(transaction) {
    return new Promise((resolve, reject)=>{
        transaction.oncomplete = ()=>resolve();
        transaction.onabort = ()=>reject(transaction.error ?? storageError("transaction-failed", "IndexedDB transaction was aborted."));
        transaction.onerror = ()=>reject(transaction.error ?? storageError("transaction-failed", "IndexedDB transaction failed."));
    });
}
function assertStoredDocument(value) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
        throw storageError("corrupt-storage", "Stored archive record is malformed.");
    }
    const input = value;
    const keys = Object.keys(input).sort();
    if (keys.join("\0") !== [
        "archive",
        "canonicalJson",
        "fingerprint",
        "key"
    ].sort().join("\0") || input.key !== CURRENT_DOCUMENT_KEY || typeof input.canonicalJson !== "string" || typeof input.fingerprint !== "string" || !/^[0-9a-f]{64}$/u.test(input.fingerprint)) {
        throw storageError("corrupt-storage", "Stored archive record is malformed.");
    }
    let archive;
    try {
        archive = validateArchive(input.archive);
    } catch (cause) {
        throw storageError("corrupt-storage", "Stored archive failed schema validation.", undefined, cause);
    }
    const canonicalJson = stableJson(archive);
    if (canonicalJson !== input.canonicalJson) {
        throw storageError("corrupt-storage", "Stored archive does not match its canonical copy.");
    }
    return {
        key: CURRENT_DOCUMENT_KEY,
        archive,
        canonicalJson,
        fingerprint: input.fingerprint
    };
}
async function confirmationToken(sourceFingerprint, currentFingerprint) {
    return sha256Hex(`lonkoll-import-confirmation\u0000${sourceFingerprint}\u0000${currentFingerprint ?? "empty"}`);
}
export class PlanningStore {
    #databaseName;
    #indexedDB;
    #databasePromise = null;
    constructor(options = {}){
        const factory = options.indexedDB ?? globalThis.indexedDB;
        if (!factory) throw storageError("storage-unavailable", "IndexedDB is unavailable in this browser.");
        this.#databaseName = options.databaseName ?? DATABASE_NAME;
        this.#indexedDB = factory;
    }
    async #database() {
        if (this.#databasePromise) return this.#databasePromise;
        this.#databasePromise = new Promise((resolve, reject)=>{
            const request = this.#indexedDB.open(this.#databaseName, DATABASE_VERSION);
            request.onupgradeneeded = (event)=>{
                try {
                    migration(request.result, request.transaction, event.oldVersion, event.newVersion);
                } catch (cause) {
                    request.transaction?.abort();
                    reject(cause);
                }
            };
            request.onsuccess = ()=>{
                request.result.onversionchange = ()=>request.result.close();
                resolve(request.result);
            };
            request.onerror = ()=>reject(storageError("storage-unavailable", "Could not open local planning storage.", undefined, request.error));
            request.onblocked = ()=>reject(storageError("storage-unavailable", "A previous app tab is blocking the storage upgrade."));
        });
        try {
            return await this.#databasePromise;
        } catch (cause) {
            this.#databasePromise = null;
            throw cause;
        }
    }
    close() {
        void this.#databasePromise?.then((database)=>database.close());
        this.#databasePromise = null;
    }
    async load() {
        const database = await this.#database();
        const transaction = database.transaction(DOCUMENTS_STORE, "readonly");
        const completion = transactionCompletion(transaction);
        const raw = await requestValue(transaction.objectStore(DOCUMENTS_STORE).get(CURRENT_DOCUMENT_KEY));
        await completion;
        if (raw === undefined) return null;
        const stored = assertStoredDocument(raw);
        const fingerprint = await sha256Hex(stored.canonicalJson);
        if (fingerprint !== stored.fingerprint) throw storageError("corrupt-storage", "Stored archive fingerprint is invalid.");
        return Object.freeze({
            archive: stored.archive,
            fingerprint
        });
    }
    async getTaxProfile(employerId) {
        const database = await this.#database();
        const transaction = database.transaction(TAX_PROFILES_STORE, "readonly");
        const result = await requestValue(transaction.objectStore(TAX_PROFILES_STORE).get(employerId));
        await transactionCompletion(transaction);
        return result === undefined ? null : assertTaxProfile(result);
    }
    async saveTaxProfile(profile) {
        const database = await this.#database();
        const transaction = database.transaction(TAX_PROFILES_STORE, "readwrite");
        const completion = transactionCompletion(transaction);
        await requestValue(transaction.objectStore(TAX_PROFILES_STORE).put(assertTaxProfile(profile)));
        await completion;
    }
    async deleteTaxProfile(employerId) {
        const database = await this.#database();
        const transaction = database.transaction(TAX_PROFILES_STORE, "readwrite");
        const completion = transactionCompletion(transaction);
        await requestValue(transaction.objectStore(TAX_PROFILES_STORE).delete(employerId));
        await completion;
    }
    async getShiftStatusModes() {
        const database = await this.#database();
        const transaction = database.transaction(SHIFT_STATUS_MODES_STORE, "readonly");
        const values = await requestValue(transaction.objectStore(SHIFT_STATUS_MODES_STORE).getAll());
        await transactionCompletion(transaction);
        return values.map((value)=>assertShiftStatusMode(value));
    }
    async saveShiftStatusModes(values) {
        const database = await this.#database();
        const transaction = database.transaction(SHIFT_STATUS_MODES_STORE, "readwrite");
        const completion = transactionCompletion(transaction);
        for (const value of values)await requestValue(transaction.objectStore(SHIFT_STATUS_MODES_STORE).put(assertShiftStatusMode(value)));
        await completion;
    }
    async getEmployerProfile(employerId) {
        const database = await this.#database();
        const transaction = database.transaction(EMPLOYER_PROFILES_STORE, "readonly");
        const value = await requestValue(transaction.objectStore(EMPLOYER_PROFILES_STORE).get(employerId));
        await transactionCompletion(transaction);
        return value === undefined ? null : assertEmployerProfile(value);
    }
    async saveEmployerProfile(value) {
        const database = await this.#database();
        const transaction = database.transaction(EMPLOYER_PROFILES_STORE, "readwrite");
        const completion = transactionCompletion(transaction);
        await requestValue(transaction.objectStore(EMPLOYER_PROFILES_STORE).put(assertEmployerProfile(value)));
        await completion;
    }
    async getEmployerStates() {
        const database = await this.#database();
        const transaction = database.transaction(EMPLOYER_STATES_STORE, "readonly");
        const values = await requestValue(transaction.objectStore(EMPLOYER_STATES_STORE).getAll());
        await transactionCompletion(transaction);
        return values.map((value)=>assertEmployerState(value));
    }
    async saveEmployerState(value) {
        const database = await this.#database();
        const transaction = database.transaction(EMPLOYER_STATES_STORE, "readwrite");
        const completion = transactionCompletion(transaction);
        await requestValue(transaction.objectStore(EMPLOYER_STATES_STORE).put(assertEmployerState(value)));
        await completion;
    }
    async deleteEmployerData(archiveValue, expectedCurrentFingerprint, employerId, shiftIds) {
        const next = await archiveFingerprint(archiveValue);
        const database = await this.#database();
        const stores = [
            DOCUMENTS_STORE,
            TAX_PROFILES_STORE,
            EMPLOYER_PROFILES_STORE,
            EMPLOYER_STATES_STORE,
            SHIFT_STATUS_MODES_STORE
        ];
        let transaction;
        try {
            transaction = database.transaction(stores, "readwrite", {
                durability: "strict"
            });
        } catch  {
            transaction = database.transaction(stores, "readwrite");
        }
        const completion = transactionCompletion(transaction);
        try {
            const documents = transaction.objectStore(DOCUMENTS_STORE);
            const raw = await requestValue(documents.get(CURRENT_DOCUMENT_KEY));
            const current = raw === undefined ? null : assertStoredDocument(raw);
            if (current?.fingerprint !== expectedCurrentFingerprint) throw storageError("storage-conflict", "Local data changed after it was read; reload before saving.");
            await requestValue(documents.put({
                key: CURRENT_DOCUMENT_KEY,
                archive: next.archive,
                canonicalJson: next.canonicalJson,
                fingerprint: next.fingerprint
            }));
            await requestValue(transaction.objectStore(TAX_PROFILES_STORE).delete(employerId));
            await requestValue(transaction.objectStore(EMPLOYER_PROFILES_STORE).delete(employerId));
            await requestValue(transaction.objectStore(EMPLOYER_STATES_STORE).delete(employerId));
            for (const shiftId of shiftIds)await requestValue(transaction.objectStore(SHIFT_STATUS_MODES_STORE).delete(shiftId));
            await completion;
            return Object.freeze({
                archive: next.archive,
                fingerprint: next.fingerprint
            });
        } catch (cause) {
            try {
                transaction.abort();
            } catch  {}
            void completion.catch(()=>undefined);
            if (cause instanceof PlanningStorageError) throw cause;
            throw storageError("transaction-failed", "Employer deletion failed; no linked data was removed.", undefined, cause);
        }
    }
    async save(archiveValue, expectedCurrentFingerprint) {
        const next = await archiveFingerprint(archiveValue);
        await this.#replaceTransaction(next.archive, next.canonicalJson, next.fingerprint, expectedCurrentFingerprint);
        return Object.freeze({
            archive: next.archive,
            fingerprint: next.fingerprint
        });
    }
    async previewImport(text) {
        const [preview, current] = await Promise.all([
            previewArchiveImport(text),
            this.load()
        ]);
        const expectedCurrentFingerprint = current?.fingerprint ?? null;
        return Object.freeze({
            ...preview,
            expectedCurrentFingerprint,
            confirmationToken: await confirmationToken(preview.fingerprint, expectedCurrentFingerprint)
        });
    }
    async replaceConfirmed(preview, suppliedToken) {
        if (suppliedToken !== preview.confirmationToken || suppliedToken !== await confirmationToken(preview.fingerprint, preview.expectedCurrentFingerprint)) {
            throw storageError("confirmation-required", "Import replacement requires confirmation of this exact preview.");
        }
        const next = await archiveFingerprint(preview.archive);
        if (next.fingerprint !== preview.fingerprint || next.canonicalJson !== preview.canonicalJson) {
            throw storageError("confirmation-required", "Import preview changed after confirmation.");
        }
        await this.#replaceTransaction(next.archive, next.canonicalJson, next.fingerprint, preview.expectedCurrentFingerprint);
        return Object.freeze({
            archive: next.archive,
            fingerprint: next.fingerprint
        });
    }
    async #replaceTransaction(archive, canonicalJson, fingerprint, expectedCurrentFingerprint) {
        const database = await this.#database();
        let transaction;
        try {
            transaction = database.transaction(DOCUMENTS_STORE, "readwrite", {
                durability: "strict"
            });
        } catch  {
            transaction = database.transaction(DOCUMENTS_STORE, "readwrite");
        }
        const completion = transactionCompletion(transaction);
        try {
            const store = transaction.objectStore(DOCUMENTS_STORE);
            const raw = await requestValue(store.get(CURRENT_DOCUMENT_KEY));
            const current = raw === undefined ? null : assertStoredDocument(raw);
            if ((current?.fingerprint ?? null) !== expectedCurrentFingerprint) {
                throw storageError("storage-conflict", "Local data changed after it was read; reload before saving.");
            }
            const record = {
                key: CURRENT_DOCUMENT_KEY,
                archive,
                canonicalJson,
                fingerprint
            };
            await requestValue(store.put(record));
            await completion;
        } catch (cause) {
            try {
                transaction.abort();
            } catch  {}
            void completion.catch(()=>undefined);
            if (cause instanceof PlanningStorageError) throw cause;
            throw storageError("transaction-failed", "Local archive replacement failed; the previous transaction was retained.", undefined, cause);
        }
    }
}


//# sourceURL=storage/indexedDbStore.ts