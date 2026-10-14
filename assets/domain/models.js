import { ExactDecimal } from "./decimal.js";
import { DomainError, fail } from "./errors.js";
export const LOWER_INSTANT = 946_684_800;
export const UPPER_INSTANT = 4_102_444_800;
export const MAX_TEXT_BYTES = 4_096;
export const MAX_SHIFT_SECONDS = 31 * 86_400;
export function utf8Length(value) {
    return new TextEncoder().encode(value).length;
}
export function validateText(value) {
    if (typeof value !== "string" || utf8Length(value) > MAX_TEXT_BYTES || value.trim().length === 0) {
        fail("invalidText");
    }
    return value;
}
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function validateID(value) {
    if (typeof value !== "string" || !UUID_PATTERN.test(value)) fail("invalidText");
    return value.toLowerCase();
}
export function makeID() {
    return crypto.randomUUID();
}
const INSTANT_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.0+)?Z$/;
export function epochSeconds(value) {
    if (typeof value !== "string" || !INSTANT_PATTERN.test(value)) fail("invalidInstant");
    const milliseconds = Date.parse(value);
    const seconds = milliseconds / 1_000;
    if (!Number.isFinite(seconds) || !Number.isSafeInteger(seconds) || seconds < LOWER_INSTANT || seconds >= UPPER_INSTANT) {
        fail("invalidInstant");
    }
    const canonical = new Date(milliseconds).toISOString();
    const match = INSTANT_PATTERN.exec(value);
    if (!match || canonical.slice(0, 19) !== value.slice(0, 19)) fail("invalidInstant");
    return seconds;
}
export function isoFromEpochSeconds(seconds) {
    if (!Number.isSafeInteger(seconds) || seconds < LOWER_INSTANT || seconds >= UPPER_INSTANT) {
        fail("invalidInstant");
    }
    return new Date(seconds * 1_000).toISOString().replace(".000Z", "Z");
}
export function canonicalInstant(value) {
    return isoFromEpochSeconds(epochSeconds(value));
}
export function validateTimeZone(timeZoneID) {
    if (typeof timeZoneID !== "string" || utf8Length(timeZoneID) > 128 || timeZoneID.length === 0) {
        fail("invalidTimeZone");
    }
    try {
        new Intl.DateTimeFormat("en", {
            timeZone: timeZoneID
        }).format(0);
    } catch (error) {
        throw new DomainError("invalidTimeZone", error);
    }
    return timeZoneID;
}
export function parseRate(value, maximum, errorCode = "invalidRate") {
    try {
        const result = ExactDecimal.parse(value);
        if (!result.isSwiftDecimalRepresentable() || result.compare("0") < 0 || result.compare(maximum) > 0) {
            fail(errorCode);
        }
        return result;
    } catch (error) {
        if (error instanceof DomainError) throw error;
        throw new DomainError(errorCode, error);
    }
}
export function validateCivilDate(input) {
    const { year, month, day } = input ?? {};
    if (!Number.isSafeInteger(year) || year < 2000 || year >= 2100 || !Number.isSafeInteger(month) || month < 1 || month > 12 || !Number.isSafeInteger(day) || day < 1 || day > 31) {
        fail("invalidCivilDate");
    }
    const instant = new Date(Date.UTC(year, month - 1, day, 12));
    if (instant.getUTCFullYear() !== year || instant.getUTCMonth() + 1 !== month || instant.getUTCDate() !== day) {
        fail("invalidCivilDate");
    }
    return {
        year,
        month,
        day
    };
}
export function civilDateKey(input) {
    const date = validateCivilDate(input);
    return `${date.year.toString().padStart(4, "0")}-${date.month.toString().padStart(2, "0")}-${date.day.toString().padStart(2, "0")}`;
}
export function parseCivilDate(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) fail("invalidCivilDate");
    return validateCivilDate({
        year: Number(match[1]),
        month: Number(match[2]),
        day: Number(match[3])
    });
}
export function compareCivilDates(left, right) {
    const a = civilDateKey(left);
    const b = civilDateKey(right);
    return a < b ? -1 : a > b ? 1 : 0;
}
export function addCivilDays(input, count) {
    const date = validateCivilDate(input);
    if (!Number.isSafeInteger(count)) fail("invalidLocalTime");
    const instant = new Date(Date.UTC(date.year, date.month - 1, date.day + count, 12));
    return validateCivilDate({
        year: instant.getUTCFullYear(),
        month: instant.getUTCMonth() + 1,
        day: instant.getUTCDate()
    });
}
export function civilWeekday(input) {
    const date = validateCivilDate(input);
    return new Date(Date.UTC(date.year, date.month - 1, date.day, 12)).getUTCDay() + 1;
}
export function canonicalBreak(input) {
    const startSeconds = epochSeconds(input.start);
    const endSeconds = epochSeconds(input.end);
    if (endSeconds <= startSeconds || !input.isPaid && input.eligibleForOB) fail("invalidBreak");
    return {
        start: isoFromEpochSeconds(startSeconds),
        end: isoFromEpochSeconds(endSeconds),
        isPaid: Boolean(input.isPaid),
        eligibleForOB: Boolean(input.eligibleForOB)
    };
}
export function canonicalRule(input, errorCode = "invalidRule") {
    try {
        validateText(input.id);
        validateText(input.version);
        validateText(input.source);
        validateText(input.note);
    } catch (error) {
        throw new DomainError(errorCode, error);
    }
    const from = epochSeconds(input.validFrom);
    const until = epochSeconds(input.validUntil);
    if (until <= from || !Array.isArray(input.weekdays) || input.weekdays.length === 0 || input.weekdays.some((day)=>!Number.isSafeInteger(day) || day < 1 || day > 7) || new Set(input.weekdays).size !== input.weekdays.length || !Number.isSafeInteger(input.startMinute) || input.startMinute < 0 || input.startMinute >= 1_440 || !Number.isSafeInteger(input.endMinute) || input.endMinute < 0 || input.endMinute > 1_440 || input.startMinute === input.endMinute || input.premium?.kind !== "fixedHourly" && input.premium?.kind !== "percentageOfBase") {
        fail(errorCode);
    }
    parseRate(input.premium.value, input.premium.kind === "fixedHourly" ? "1000000" : "10000", errorCode);
    return {
        ...input,
        validFrom: isoFromEpochSeconds(from),
        validUntil: isoFromEpochSeconds(until),
        weekdays: [
            ...input.weekdays
        ].sort((a, b)=>a - b),
        premium: {
            ...input.premium
        }
    };
}
export function canonicalPayrollShift(input) {
    const start = epochSeconds(input.start);
    const end = epochSeconds(input.end);
    if (end <= start) fail("invalidShift");
    if (end - start > MAX_SHIFT_SECONDS || !Array.isArray(input.breaks) || input.breaks.length > 100) {
        fail("limitExceeded");
    }
    validateTimeZone(input.timeZoneID);
    parseRate(input.hourlyRate, "1000000");
    const breaks = input.breaks.map(canonicalBreak).sort((a, b)=>epochSeconds(a.start) - epochSeconds(b.start));
    let previousEnd = null;
    for (const pause of breaks){
        const pauseStart = epochSeconds(pause.start);
        const pauseEnd = epochSeconds(pause.end);
        if (pauseStart < start || pauseEnd > end) fail("invalidBreak");
        if (previousEnd !== null && pauseStart < previousEnd) fail("overlappingBreaks");
        previousEnd = pauseEnd;
    }
    return {
        start: isoFromEpochSeconds(start),
        end: isoFromEpochSeconds(end),
        timeZoneID: input.timeZoneID,
        hourlyRate: ExactDecimal.parse(input.hourlyRate).toString(),
        breaks
    };
}
export function canonicalShiftRecord(input) {
    validateID(input.id);
    validateID(input.employmentID);
    validateID(input.payRateVersionID);
    if (input.ruleSetVersionID !== null) validateID(input.ruleSetVersionID);
    if (input.status !== "planned" && input.status !== "worked") fail("invalidShift");
    const payroll = canonicalPayrollShift({
        start: input.start,
        end: input.end,
        timeZoneID: input.timeZoneID,
        hourlyRate: "0",
        breaks: input.breaks
    });
    return {
        id: input.id.toLowerCase(),
        employmentID: input.employmentID.toLowerCase(),
        payRateVersionID: input.payRateVersionID.toLowerCase(),
        ruleSetVersionID: input.ruleSetVersionID?.toLowerCase() ?? null,
        start: payroll.start,
        end: payroll.end,
        timeZoneID: payroll.timeZoneID,
        breaks: payroll.breaks,
        status: input.status
    };
}
export function containsInterval(start, end, validFrom, validUntil) {
    if (epochSeconds(start) < epochSeconds(validFrom)) return false;
    if (validUntil === null) return true;
    return end !== null && epochSeconds(end) <= epochSeconds(validUntil);
}


//# sourceURL=domain/models.ts