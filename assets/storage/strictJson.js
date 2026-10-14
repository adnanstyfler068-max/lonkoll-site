import { storageError } from "./errors.js";
const MAX_JSON_DEPTH = 64;
export function parseJsonWithoutDuplicateKeys(text) {
    let cursor = 0;
    function fail(message) {
        throw storageError("invalid-json", `${message} at byte ${cursor}.`);
    }
    function whitespace() {
        while(cursor < text.length && /[\u0020\u000a\u000d\u0009]/u.test(text[cursor]))cursor += 1;
    }
    function stringValue() {
        const start = cursor;
        if (text[cursor] !== '"') fail("Expected a string");
        cursor += 1;
        while(cursor < text.length){
            const character = text[cursor];
            if (character === '"') {
                cursor += 1;
                try {
                    return JSON.parse(text.slice(start, cursor));
                } catch (cause) {
                    throw storageError("invalid-json", `Invalid string at byte ${start}.`, undefined, cause);
                }
            }
            if (character === "\\") {
                cursor += 1;
                if (cursor >= text.length) fail("Unterminated escape");
                if (text[cursor] === "u") {
                    if (!/^[0-9a-fA-F]{4}$/u.test(text.slice(cursor + 1, cursor + 5))) fail("Invalid Unicode escape");
                    cursor += 5;
                } else {
                    if (!'"\\/bfnrt'.includes(text[cursor])) fail("Invalid escape");
                    cursor += 1;
                }
            } else {
                if (character.charCodeAt(0) < 0x20) fail("Control character in string");
                cursor += 1;
            }
        }
        fail("Unterminated string");
    }
    function numberValue() {
        const match = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/u.exec(text.slice(cursor));
        if (!match) fail("Invalid number");
        cursor += match[0].length;
        const result = Number(match[0]);
        if (!Number.isFinite(result)) fail("Number is outside the supported range");
        return result;
    }
    function value(depth) {
        if (depth > MAX_JSON_DEPTH) fail("JSON nesting limit exceeded");
        whitespace();
        const character = text[cursor];
        if (character === '"') return stringValue();
        if (character === "{") return objectValue(depth + 1);
        if (character === "[") return arrayValue(depth + 1);
        if (text.startsWith("true", cursor)) {
            cursor += 4;
            return true;
        }
        if (text.startsWith("false", cursor)) {
            cursor += 5;
            return false;
        }
        if (text.startsWith("null", cursor)) {
            cursor += 4;
            return null;
        }
        if (character === "-" || character !== undefined && character >= "0" && character <= "9") return numberValue();
        fail("Unexpected token");
    }
    function arrayValue(depth) {
        cursor += 1;
        whitespace();
        const result = [];
        if (text[cursor] === "]") {
            cursor += 1;
            return result;
        }
        while(true){
            result.push(value(depth));
            whitespace();
            if (text[cursor] === "]") {
                cursor += 1;
                return result;
            }
            if (text[cursor] !== ",") fail("Expected ',' or ']'");
            cursor += 1;
        }
    }
    function objectValue(depth) {
        cursor += 1;
        whitespace();
        const result = Object.create(null);
        if (text[cursor] === "}") {
            cursor += 1;
            return result;
        }
        while(true){
            whitespace();
            const key = stringValue();
            if (Object.hasOwn(result, key)) fail(`Duplicate object member ${JSON.stringify(key)}`);
            whitespace();
            if (text[cursor] !== ":") fail("Expected ':'");
            cursor += 1;
            result[key] = value(depth);
            whitespace();
            if (text[cursor] === "}") {
                cursor += 1;
                return result;
            }
            if (text[cursor] !== ",") fail("Expected ',' or '}'");
            cursor += 1;
        }
    }
    if (text.charCodeAt(0) === 0xfeff) fail("A byte-order mark is not permitted");
    const result = value(0);
    whitespace();
    if (cursor !== text.length) fail("Trailing content");
    return result;
}
export function stableJson(value, indentation = 0) {
    const seen = new Set();
    function normalize(current) {
        if (current === null || typeof current === "string" || typeof current === "boolean") return current;
        if (typeof current === "number") {
            if (!Number.isFinite(current)) throw storageError("invalid-archive", "The archive contains a non-finite number.");
            return current;
        }
        if (typeof current !== "object") throw storageError("invalid-archive", "The archive contains a non-JSON value.");
        if (seen.has(current)) throw storageError("invalid-archive", "The archive contains a reference cycle.");
        seen.add(current);
        if (Array.isArray(current)) {
            const output = current.map(normalize);
            seen.delete(current);
            return output;
        }
        const output = Object.create(null);
        for (const key of Object.keys(current).sort()){
            const member = current[key];
            if (member === undefined) throw storageError("invalid-archive", "The archive contains an undefined value.", key);
            output[key] = normalize(member);
        }
        seen.delete(current);
        return output;
    }
    return JSON.stringify(normalize(value), null, indentation);
}


//# sourceURL=storage/strictJson.ts