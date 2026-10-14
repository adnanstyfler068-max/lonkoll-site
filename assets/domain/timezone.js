import { DomainError, fail } from "./errors.js";
import { addCivilDays, civilWeekday, isoFromEpochSeconds, validateCivilDate, validateTimeZone } from "./models.js";
const formatters = new Map();
function formatter(timeZoneID) {
    let value = formatters.get(timeZoneID);
    if (!value) {
        validateTimeZone(timeZoneID);
        value = new Intl.DateTimeFormat("en-CA-u-ca-gregory-nu-latn", {
            timeZone: timeZoneID,
            calendar: "gregory",
            numberingSystem: "latn",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hourCycle: "h23"
        });
        formatters.set(timeZoneID, value);
    }
    return value;
}
export function localPartsAt(epochSecond, timeZoneID) {
    if (!Number.isSafeInteger(epochSecond)) fail("invalidInstant");
    let rawParts;
    try {
        rawParts = formatter(timeZoneID).formatToParts(new Date(epochSecond * 1_000));
    } catch (error) {
        throw new DomainError("invalidTimeZone", error);
    }
    const values = {};
    for (const part of rawParts){
        if (part.type !== "literal") values[part.type] = part.value;
    }
    const result = {
        year: Number(values.year),
        month: Number(values.month),
        day: Number(values.day),
        hour: Number(values.hour),
        minute: Number(values.minute),
        second: Number(values.second),
        weekday: 0
    };
    validateCivilDate(result);
    if (![
        result.hour,
        result.minute,
        result.second
    ].every(Number.isSafeInteger) || result.hour < 0 || result.hour > 23 || result.minute < 0 || result.minute > 59 || result.second < 0 || result.second > 59) {
        fail("invalidInstant");
    }
    result.weekday = civilWeekday(result);
    return result;
}
export function offsetSecondsAt(epochSecond, timeZoneID) {
    const local = localPartsAt(epochSecond, timeZoneID);
    const representedAsUTC = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second) / 1_000;
    return representedAsUTC - epochSecond;
}
function sameLocalDateTime(parts, date, minute, second) {
    return parts.year === date.year && parts.month === date.month && parts.day === date.day && parts.hour === Math.floor(minute / 60) && parts.minute === minute % 60 && parts.second === second;
}
export function resolveLocalTime(dateInput, minute, second = 0, timeZoneID = "Europe/Stockholm") {
    const date = validateCivilDate(dateInput);
    validateTimeZone(timeZoneID);
    if (!Number.isSafeInteger(minute) || minute < 0 || minute >= 1_440 || !Number.isSafeInteger(second) || second < 0 || second >= 60) {
        fail("invalidLocalTime");
    }
    const naive = Date.UTC(date.year, date.month - 1, date.day, Math.floor(minute / 60), minute % 60, second) / 1_000;
    const offsets = new Set();
    for (const delta of [
        -172_800,
        -86_400,
        -21_600,
        0,
        21_600,
        86_400,
        172_800
    ]){
        offsets.add(offsetSecondsAt(naive + delta, timeZoneID));
    }
    const matches = [];
    for (const offset of offsets){
        const candidate = naive - offset;
        if (sameLocalDateTime(localPartsAt(candidate, timeZoneID), date, minute, second)) {
            matches.push(candidate);
        }
    }
    if (matches.length === 0) fail("invalidLocalTime");
    return isoFromEpochSeconds(Math.min(...matches));
}
export function localCivilDateAt(epochSecond, timeZoneID) {
    const { year, month, day } = localPartsAt(epochSecond, timeZoneID);
    return {
        year,
        month,
        day
    };
}
export function sameLocalDay(left, right, timeZoneID) {
    const a = localPartsAt(left, timeZoneID);
    const b = localPartsAt(right, timeZoneID);
    return a.year === b.year && a.month === b.month && a.day === b.day;
}
export function nextLocalDayBoundary(epochSecond, timeZoneID) {
    const date = localCivilDateAt(epochSecond, timeZoneID);
    const next = addCivilDays(date, 1);
    return Date.parse(resolveLocalTime(next, 0, 0, timeZoneID)) / 1_000;
}
export function translateLocalInstantByDays(epochSecond, days, timeZoneID) {
    const parts = localPartsAt(epochSecond, timeZoneID);
    const targetDate = addCivilDays(parts, days);
    return resolveLocalTime(targetDate, parts.hour * 60 + parts.minute, parts.second, timeZoneID);
}


//# sourceURL=domain/timezone.ts