export class PlanningStorageError extends Error {
    code;
    path;
    cause;
    constructor(code, message, options = {}){
        super(message);
        this.name = "PlanningStorageError";
        this.code = code;
        this.path = options.path;
        this.cause = options.cause;
    }
}
export function storageError(code, message, path, cause) {
    return new PlanningStorageError(code, message, {
        path,
        cause
    });
}


//# sourceURL=storage/errors.ts