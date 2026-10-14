export class DomainError extends Error {
    code;
    constructor(code, cause){
        super(code, cause === undefined ? undefined : {
            cause
        });
        this.name = "DomainError";
        this.code = code;
    }
}
export function fail(code, cause) {
    throw new DomainError(code, cause);
}
export function isDomainError(error, code) {
    return error instanceof DomainError && (code === undefined || error.code === code);
}


//# sourceURL=domain/errors.ts