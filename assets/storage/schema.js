import { storageError } from "./errors.js";
export const ARCHIVE_KIND = "lonkoll-planning-archive";
export const ARCHIVE_SCHEMA_VERSION = 1;
export const MAX_ARCHIVE_BYTES = 32 * 1024 * 1024;
const LIMITS = Object.freeze({
    employers: 1_000,
    employments: 5_000,
    payRates: 10_000,
    ruleSets: 5_000,
    rulesPerSet: 100,
    shifts: 100_000,
    breaksPerShift: 100,
    calculationHistory: 200_000,
    premiumsPerCalculation: 100,
    segmentsPerCalculation: 1_000,
    recurrences: 10_000,
    recurrenceExceptions: 10_000,
    stringList: 1_000
});
function invalid(path, message) {
    throw storageError("invalid-archive", message, path);
}
function record(value, path) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) invalid(path, "Expected an object.");
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) invalid(path, "Expected a plain object.");
    return value;
}
function exact(value, keys, path) {
    const result = record(value, path);
    const actual = Object.keys(result).sort();
    const expected = [
        ...keys
    ].sort();
    if (actual.length !== expected.length || actual.some((key, index)=>key !== expected[index])) {
        invalid(path, "Object members do not match this schema version.");
    }
    return result;
}
function array(value, maximum, path) {
    if (!Array.isArray(value)) invalid(path, "Expected an array.");
    if (value.length > maximum) invalid(path, `Collection limit of ${maximum} exceeded.`);
    return value;
}
function string(value, path, maximumBytes = 4_096, allowEmpty = false) {
    if (typeof value !== "string" || new TextEncoder().encode(value).byteLength > maximumBytes) {
        invalid(path, "Expected a string within the permitted length.");
    }
    if (!allowEmpty && value.trim().length === 0) invalid(path, "Expected a non-empty string.");
    return value;
}
function enumValue(value, accepted, path) {
    if (typeof value !== "string" || !accepted.includes(value)) invalid(path, "Unsupported value.");
    return value;
}
function integer(value, minimum, maximum, path) {
    if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
        invalid(path, `Expected an integer from ${minimum} through ${maximum}.`);
    }
    return value;
}
function boolean(value, path) {
    if (typeof value !== "boolean") invalid(path, "Expected a boolean.");
    return value;
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
function uuid(value, path) {
    if (typeof value !== "string" || !UUID.test(value)) invalid(path, "Expected a canonical lower-case UUID.");
    return value;
}
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u;
const MIN_INSTANT = Date.UTC(2000, 0, 1);
const MAX_INSTANT = Date.UTC(2100, 0, 1);
function instant(value, path) {
    if (typeof value !== "string" || !INSTANT.test(value)) invalid(path, "Expected a canonical UTC ISO instant.");
    const milliseconds = Date.parse(value);
    if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString().replace(".000Z", "Z") !== value || milliseconds < MIN_INSTANT || milliseconds >= MAX_INSTANT) {
        invalid(path, "Instant is invalid or outside 2000-01-01 through 2099-12-31.");
    }
    return value;
}
const CIVIL_DATE = /^(\d{4})-(\d{2})-(\d{2})$/u;
function civilDate(value, path) {
    if (typeof value !== "string") invalid(path, "Expected a civil date.");
    const match = CIVIL_DATE.exec(value);
    if (!match) invalid(path, "Expected a YYYY-MM-DD civil date.");
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (year < 2000 || year >= 2100 || date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) invalid(path, "Civil date is invalid.");
    return value;
}
function timeZone(value, path) {
    const zone = string(value, path, 128);
    try {
        new Intl.DateTimeFormat("en", {
            timeZone: zone
        }).format(0);
    } catch  {
        invalid(path, "Unknown IANA time zone.");
    }
    return zone;
}
const DECIMAL = /^(?:0|[1-9]\d*)(?:\.\d*[1-9])?$/u;
function decimal(value, path, maximum = "1000000000000000000") {
    if (typeof value !== "string" || value.length > 128 || !DECIMAL.test(value)) {
        invalid(path, "Expected a canonical non-negative decimal string.");
    }
    const [integerPart, fractionPart = ""] = value.split(".");
    const [maximumInteger, maximumFraction = ""] = maximum.split(".");
    const scale = Math.max(fractionPart.length, maximumFraction.length);
    const scaled = BigInt(integerPart + fractionPart.padEnd(scale, "0"));
    const scaledMaximum = BigInt(maximumInteger + maximumFraction.padEnd(scale, "0"));
    if (scaled > scaledMaximum) invalid(path, `Decimal exceeds ${maximum}.`);
    return value;
}
function nullableInstant(value, path) {
    return value === null ? null : instant(value, path);
}
function nullableText(value, path) {
    return value === null ? null : string(value, path);
}
function nullableUuid(value, path) {
    return value === null ? null : uuid(value, path);
}
function interval(from, until, path) {
    if (until !== null && until <= from) invalid(path, "Interval end must be later than its start.");
}
function unique(values, key, path) {
    const identifiers = new Set();
    for (const value of values)if (!identifiers.add(key(value))) invalid(path, "Duplicate identifier or value.");
}
function validateProfile(value, path) {
    const input = exact(value, [
        "id",
        "name",
        "language",
        "timeZoneId"
    ], path);
    return {
        id: uuid(input.id, `${path}.id`),
        name: string(input.name, `${path}.name`),
        language: enumValue(input.language, [
            "sv",
            "en"
        ], `${path}.language`),
        timeZoneId: timeZone(input.timeZoneId, `${path}.timeZoneId`)
    };
}
function validateEmployer(value, path) {
    const input = exact(value, [
        "id",
        "name"
    ], path);
    return {
        id: uuid(input.id, `${path}.id`),
        name: string(input.name, `${path}.name`)
    };
}
function validateEmployment(value, path) {
    const input = exact(value, [
        "id",
        "employerId",
        "validFrom",
        "validUntil",
        "contractLabel"
    ], path);
    const result = {
        id: uuid(input.id, `${path}.id`),
        employerId: uuid(input.employerId, `${path}.employerId`),
        validFrom: instant(input.validFrom, `${path}.validFrom`),
        validUntil: nullableInstant(input.validUntil, `${path}.validUntil`),
        contractLabel: nullableText(input.contractLabel, `${path}.contractLabel`)
    };
    interval(result.validFrom, result.validUntil, path);
    return result;
}
function validatePayRate(value, path) {
    const input = exact(value, [
        "id",
        "employmentId",
        "validFrom",
        "validUntil",
        "hourlyRate",
        "currency"
    ], path);
    const result = {
        id: uuid(input.id, `${path}.id`),
        employmentId: uuid(input.employmentId, `${path}.employmentId`),
        validFrom: instant(input.validFrom, `${path}.validFrom`),
        validUntil: nullableInstant(input.validUntil, `${path}.validUntil`),
        hourlyRate: decimal(input.hourlyRate, `${path}.hourlyRate`, "1000000"),
        currency: enumValue(input.currency, [
            "SEK"
        ], `${path}.currency`)
    };
    interval(result.validFrom, result.validUntil, path);
    return result;
}
function validateRule(value, path) {
    const input = exact(value, [
        "id",
        "version",
        "source",
        "note",
        "validFrom",
        "validUntil",
        "weekdays",
        "startMinute",
        "endMinute",
        "premium"
    ], path);
    const premium = exact(input.premium, [
        "kind",
        "amount"
    ], `${path}.premium`);
    const weekdays = array(input.weekdays, 7, `${path}.weekdays`).map((day, index)=>integer(day, 1, 7, `${path}.weekdays[${index}]`));
    unique(weekdays, String, `${path}.weekdays`);
    const result = {
        id: string(input.id, `${path}.id`),
        version: string(input.version, `${path}.version`),
        source: string(input.source, `${path}.source`),
        note: string(input.note, `${path}.note`),
        validFrom: instant(input.validFrom, `${path}.validFrom`),
        validUntil: instant(input.validUntil, `${path}.validUntil`),
        weekdays: weekdays.sort((left, right)=>left - right),
        startMinute: integer(input.startMinute, 0, 1_439, `${path}.startMinute`),
        endMinute: integer(input.endMinute, 0, 1_440, `${path}.endMinute`),
        premium: {
            kind: enumValue(premium.kind, [
                "fixedHourly",
                "percentageOfBase"
            ], `${path}.premium.kind`),
            amount: "0"
        }
    };
    if (result.weekdays.length === 0 || result.startMinute === result.endMinute) invalid(path, "Rule window is empty.");
    interval(result.validFrom, result.validUntil, path);
    result.premium.amount = decimal(premium.amount, `${path}.premium.amount`, result.premium.kind === "fixedHourly" ? "1000000" : "10000");
    return result;
}
function validateRuleSet(value, path) {
    const input = exact(value, [
        "id",
        "employmentId",
        "version",
        "validFrom",
        "validUntil",
        "rules",
        "overlapPolicy",
        "rounding"
    ], path);
    const rules = array(input.rules, LIMITS.rulesPerSet, `${path}.rules`).map((rule, index)=>validateRule(rule, `${path}.rules[${index}]`));
    unique(rules, (rule)=>rule.id, `${path}.rules`);
    const result = {
        id: uuid(input.id, `${path}.id`),
        employmentId: uuid(input.employmentId, `${path}.employmentId`),
        version: string(input.version, `${path}.version`),
        validFrom: instant(input.validFrom, `${path}.validFrom`),
        validUntil: nullableInstant(input.validUntil, `${path}.validUntil`),
        rules: rules.sort((left, right)=>left.id.localeCompare(right.id)),
        overlapPolicy: enumValue(input.overlapPolicy, [
            "reject",
            "additive"
        ], `${path}.overlapPolicy`),
        rounding: enumValue(input.rounding, [
            "halfUp",
            "halfEven"
        ], `${path}.rounding`)
    };
    interval(result.validFrom, result.validUntil, path);
    for (const rule of result.rules){
        if (rule.validFrom < result.validFrom || result.validUntil !== null && rule.validUntil > result.validUntil) {
            invalid(`${path}.rules`, "Rule validity lies outside its rule set.");
        }
    }
    return result;
}
function validateBreak(value, path) {
    const input = exact(value, [
        "start",
        "end",
        "isPaid",
        "eligibleForOb"
    ], path);
    const result = {
        start: instant(input.start, `${path}.start`),
        end: instant(input.end, `${path}.end`),
        isPaid: boolean(input.isPaid, `${path}.isPaid`),
        eligibleForOb: boolean(input.eligibleForOb, `${path}.eligibleForOb`)
    };
    if (result.end <= result.start || !result.isPaid && result.eligibleForOb) invalid(path, "Break interval or OB eligibility is invalid.");
    return result;
}
function validateShift(value, path) {
    const input = exact(value, [
        "id",
        "employmentId",
        "payRateVersionId",
        "ruleSetVersionId",
        "start",
        "end",
        "timeZoneId",
        "breaks",
        "status",
        "revision"
    ], path);
    const breaks = array(input.breaks, LIMITS.breaksPerShift, `${path}.breaks`).map((pause, index)=>validateBreak(pause, `${path}.breaks[${index}]`));
    breaks.sort((left, right)=>left.start.localeCompare(right.start));
    const result = {
        id: uuid(input.id, `${path}.id`),
        employmentId: uuid(input.employmentId, `${path}.employmentId`),
        payRateVersionId: uuid(input.payRateVersionId, `${path}.payRateVersionId`),
        ruleSetVersionId: nullableUuid(input.ruleSetVersionId, `${path}.ruleSetVersionId`),
        start: instant(input.start, `${path}.start`),
        end: instant(input.end, `${path}.end`),
        timeZoneId: timeZone(input.timeZoneId, `${path}.timeZoneId`),
        breaks,
        status: enumValue(input.status, [
            "planned",
            "worked"
        ], `${path}.status`),
        revision: integer(input.revision, 1, Number.MAX_SAFE_INTEGER, `${path}.revision`)
    };
    const duration = Date.parse(result.end) - Date.parse(result.start);
    if (duration <= 0 || duration > 31 * 86_400_000) invalid(path, "Shift duration must be greater than zero and at most 31 days.");
    let previousEnd = null;
    for (const pause of breaks){
        if (pause.start < result.start || pause.end > result.end || previousEnd !== null && pause.start < previousEnd) {
            invalid(`${path}.breaks`, "Breaks must be inside the shift and must not overlap.");
        }
        previousEnd = pause.end;
    }
    return result;
}
function validateLine(value, path) {
    const input = exact(value, [
        "ruleId",
        "seconds",
        "hourlyRate",
        "unroundedAmount",
        "amount"
    ], path);
    return {
        ruleId: input.ruleId === null ? null : string(input.ruleId, `${path}.ruleId`),
        seconds: integer(input.seconds, 0, 31 * 86_400, `${path}.seconds`),
        hourlyRate: decimal(input.hourlyRate, `${path}.hourlyRate`, "1000000"),
        unroundedAmount: decimal(input.unroundedAmount, `${path}.unroundedAmount`),
        amount: decimal(input.amount, `${path}.amount`)
    };
}
function validateSegment(value, path) {
    const input = exact(value, [
        "start",
        "end",
        "isPaid",
        "eligibleForOb",
        "ruleIds"
    ], path);
    const ruleIds = array(input.ruleIds, LIMITS.rulesPerSet, `${path}.ruleIds`).map((id, index)=>string(id, `${path}.ruleIds[${index}]`));
    unique(ruleIds, String, `${path}.ruleIds`);
    const result = {
        start: instant(input.start, `${path}.start`),
        end: instant(input.end, `${path}.end`),
        isPaid: boolean(input.isPaid, `${path}.isPaid`),
        eligibleForOb: boolean(input.eligibleForOb, `${path}.eligibleForOb`),
        ruleIds
    };
    if (result.end <= result.start || !result.isPaid && result.eligibleForOb) invalid(path, "Pay segment is invalid.");
    return result;
}
function validateStringList(value, path) {
    return array(value, LIMITS.stringList, path).map((item, index)=>string(item, `${path}[${index}]`));
}
function validateCalculation(value, path) {
    const input = exact(value, [
        "engineVersion",
        "paidSeconds",
        "unpaidSeconds",
        "base",
        "premiums",
        "subtotal",
        "segments",
        "unavailableComponents",
        "notices"
    ], path);
    return {
        engineVersion: string(input.engineVersion, `${path}.engineVersion`, 128),
        paidSeconds: integer(input.paidSeconds, 0, 31 * 86_400, `${path}.paidSeconds`),
        unpaidSeconds: integer(input.unpaidSeconds, 0, 31 * 86_400, `${path}.unpaidSeconds`),
        base: validateLine(input.base, `${path}.base`),
        premiums: array(input.premiums, LIMITS.premiumsPerCalculation, `${path}.premiums`).map((line, index)=>validateLine(line, `${path}.premiums[${index}]`)),
        subtotal: decimal(input.subtotal, `${path}.subtotal`),
        segments: array(input.segments, LIMITS.segmentsPerCalculation, `${path}.segments`).map((segment, index)=>validateSegment(segment, `${path}.segments[${index}]`)),
        unavailableComponents: validateStringList(input.unavailableComponents, `${path}.unavailableComponents`),
        notices: validateStringList(input.notices, `${path}.notices`)
    };
}
function validateHistory(value, path) {
    const input = exact(value, [
        "id",
        "shiftId",
        "shiftRevision",
        "calculatedAt",
        "shiftSnapshot",
        "employerSnapshot",
        "employmentSnapshot",
        "payRateSnapshot",
        "ruleSetSnapshot",
        "result"
    ], path);
    const result = {
        id: uuid(input.id, `${path}.id`),
        shiftId: uuid(input.shiftId, `${path}.shiftId`),
        shiftRevision: integer(input.shiftRevision, 1, Number.MAX_SAFE_INTEGER, `${path}.shiftRevision`),
        calculatedAt: instant(input.calculatedAt, `${path}.calculatedAt`),
        shiftSnapshot: validateShift(input.shiftSnapshot, `${path}.shiftSnapshot`),
        employerSnapshot: validateEmployer(input.employerSnapshot, `${path}.employerSnapshot`),
        employmentSnapshot: validateEmployment(input.employmentSnapshot, `${path}.employmentSnapshot`),
        payRateSnapshot: validatePayRate(input.payRateSnapshot, `${path}.payRateSnapshot`),
        ruleSetSnapshot: input.ruleSetSnapshot === null ? null : validateRuleSet(input.ruleSetSnapshot, `${path}.ruleSetSnapshot`),
        result: validateCalculation(input.result, `${path}.result`)
    };
    if (result.shiftId !== result.shiftSnapshot.id || result.shiftRevision !== result.shiftSnapshot.revision || result.shiftSnapshot.employmentId !== result.employmentSnapshot.id || result.employmentSnapshot.employerId !== result.employerSnapshot.id || result.shiftSnapshot.payRateVersionId !== result.payRateSnapshot.id || result.payRateSnapshot.employmentId !== result.employmentSnapshot.id || result.shiftSnapshot.ruleSetVersionId !== result.ruleSetSnapshot?.id && result.shiftSnapshot.ruleSetVersionId !== null) {
        invalid(path, "Calculation snapshots contain inconsistent references.");
    }
    if (result.shiftSnapshot.ruleSetVersionId === null && result.ruleSetSnapshot !== null) invalid(path, "Unexpected rule set snapshot.");
    return result;
}
function validateRecurrence(value, path) {
    const input = exact(value, [
        "id",
        "employmentId",
        "payRateVersionId",
        "ruleSetVersionId",
        "startDate",
        "endDate",
        "weekdays",
        "startMinute",
        "endMinute",
        "timeZoneId",
        "exceptions"
    ], path);
    const weekdays = array(input.weekdays, 7, `${path}.weekdays`).map((day, index)=>integer(day, 1, 7, `${path}.weekdays[${index}]`));
    unique(weekdays, String, `${path}.weekdays`);
    const exceptions = array(input.exceptions, LIMITS.recurrenceExceptions, `${path}.exceptions`).map((date, index)=>civilDate(date, `${path}.exceptions[${index}]`));
    unique(exceptions, String, `${path}.exceptions`);
    const result = {
        id: uuid(input.id, `${path}.id`),
        employmentId: uuid(input.employmentId, `${path}.employmentId`),
        payRateVersionId: uuid(input.payRateVersionId, `${path}.payRateVersionId`),
        ruleSetVersionId: nullableUuid(input.ruleSetVersionId, `${path}.ruleSetVersionId`),
        startDate: civilDate(input.startDate, `${path}.startDate`),
        endDate: civilDate(input.endDate, `${path}.endDate`),
        weekdays: weekdays.sort((left, right)=>left - right),
        startMinute: integer(input.startMinute, 0, 1_439, `${path}.startMinute`),
        endMinute: integer(input.endMinute, 0, 1_439, `${path}.endMinute`),
        timeZoneId: timeZone(input.timeZoneId, `${path}.timeZoneId`),
        exceptions: exceptions.sort()
    };
    if (result.startDate > result.endDate || result.weekdays.length === 0 || result.startMinute === result.endMinute || result.exceptions.some((date)=>date < result.startDate || date > result.endDate)) invalid(path, "Recurrence definition is invalid.");
    return result;
}
function validatePreferences(value, path) {
    const input = exact(value, [
        "language",
        "timeZoneId",
        "weekStartsOn",
        "theme"
    ], path);
    if (input.weekStartsOn !== 1 && input.weekStartsOn !== 7) invalid(`${path}.weekStartsOn`, "Week must start on Monday or Sunday.");
    return {
        language: enumValue(input.language, [
            "sv",
            "en"
        ], `${path}.language`),
        timeZoneId: timeZone(input.timeZoneId, `${path}.timeZoneId`),
        weekStartsOn: input.weekStartsOn,
        theme: enumValue(input.theme, [
            "system",
            "light",
            "dark"
        ], `${path}.theme`)
    };
}
function contains(childFrom, childUntil, parentFrom, parentUntil) {
    if (childFrom < parentFrom) return false;
    if (parentUntil === null) return true;
    return childUntil !== null && childUntil <= parentUntil;
}
function activeAt(start, end, validFrom, validUntil) {
    return start >= validFrom && (validUntil === null || end <= validUntil);
}
export function validateArchive(value) {
    const input = exact(value, [
        "kind",
        "schemaVersion",
        "createdAt",
        "appVersion",
        "profile",
        "employers",
        "employments",
        "payRates",
        "ruleSets",
        "shifts",
        "calculationHistory",
        "recurrences",
        "preferences"
    ], "$archive");
    if (input.kind !== ARCHIVE_KIND) invalid("$archive.kind", "This file is not a LönKoll planning archive.");
    if (input.schemaVersion !== ARCHIVE_SCHEMA_VERSION) {
        throw storageError("unsupported-schema", "The archive schema version is not supported.", "$archive.schemaVersion");
    }
    const employers = array(input.employers, LIMITS.employers, "$archive.employers").map((item, index)=>validateEmployer(item, `$archive.employers[${index}]`));
    const employments = array(input.employments, LIMITS.employments, "$archive.employments").map((item, index)=>validateEmployment(item, `$archive.employments[${index}]`));
    const payRates = array(input.payRates, LIMITS.payRates, "$archive.payRates").map((item, index)=>validatePayRate(item, `$archive.payRates[${index}]`));
    const ruleSets = array(input.ruleSets, LIMITS.ruleSets, "$archive.ruleSets").map((item, index)=>validateRuleSet(item, `$archive.ruleSets[${index}]`));
    const shifts = array(input.shifts, LIMITS.shifts, "$archive.shifts").map((item, index)=>validateShift(item, `$archive.shifts[${index}]`));
    const calculationHistory = array(input.calculationHistory, LIMITS.calculationHistory, "$archive.calculationHistory").map((item, index)=>validateHistory(item, `$archive.calculationHistory[${index}]`));
    const recurrences = array(input.recurrences, LIMITS.recurrences, "$archive.recurrences").map((item, index)=>validateRecurrence(item, `$archive.recurrences[${index}]`));
    unique(employers, (item)=>item.id, "$archive.employers");
    unique(employments, (item)=>item.id, "$archive.employments");
    unique(payRates, (item)=>item.id, "$archive.payRates");
    unique(ruleSets, (item)=>item.id, "$archive.ruleSets");
    unique(shifts, (item)=>item.id, "$archive.shifts");
    unique(calculationHistory, (item)=>item.id, "$archive.calculationHistory");
    unique(recurrences, (item)=>item.id, "$archive.recurrences");
    const employerById = new Map(employers.map((item)=>[
            item.id,
            item
        ]));
    const employmentById = new Map(employments.map((item)=>[
            item.id,
            item
        ]));
    const payRateById = new Map(payRates.map((item)=>[
            item.id,
            item
        ]));
    const ruleSetById = new Map(ruleSets.map((item)=>[
            item.id,
            item
        ]));
    for (const employment of employments)if (!employerById.has(employment.employerId)) invalid("$archive.employments", "Employment references a missing employer.");
    for (const rate of payRates){
        const employment = employmentById.get(rate.employmentId);
        if (!employment || !contains(rate.validFrom, rate.validUntil, employment.validFrom, employment.validUntil)) invalid("$archive.payRates", "Pay rate references a missing employment or lies outside its validity.");
    }
    for (const rules of ruleSets){
        const employment = employmentById.get(rules.employmentId);
        if (!employment || !contains(rules.validFrom, rules.validUntil, employment.validFrom, employment.validUntil)) invalid("$archive.ruleSets", "Rule set references a missing employment or lies outside its validity.");
    }
    function checkPlanningReferences(item, start, end, path) {
        const employment = employmentById.get(item.employmentId);
        const rate = payRateById.get(item.payRateVersionId);
        const rules = item.ruleSetVersionId === null ? null : ruleSetById.get(item.ruleSetVersionId);
        if (!employment || !rate || rate.employmentId !== employment.id || item.ruleSetVersionId !== null && (!rules || rules.employmentId !== employment.id)) {
            invalid(path, "Planning item contains a missing or cross-employment reference.");
        }
        if (!activeAt(start, end, employment.validFrom, employment.validUntil) || !activeAt(start, end, rate.validFrom, rate.validUntil) || rules && !activeAt(start, end, rules.validFrom, rules.validUntil)) invalid(path, "Configuration is not valid for the planning interval.");
    }
    for (const shift of shifts)checkPlanningReferences(shift, shift.start, shift.end, "$archive.shifts");
    for (const recurrence of recurrences){
        const employment = employmentById.get(recurrence.employmentId);
        const rate = payRateById.get(recurrence.payRateVersionId);
        const rules = recurrence.ruleSetVersionId === null ? null : ruleSetById.get(recurrence.ruleSetVersionId);
        if (!employment || !rate || rate.employmentId !== employment.id || recurrence.ruleSetVersionId !== null && (!rules || rules.employmentId !== employment.id)) {
            invalid("$archive.recurrences", "Recurrence contains a missing or cross-employment reference.");
        }
    }
    const preferences = validatePreferences(input.preferences, "$archive.preferences");
    const profile = input.profile === null ? null : validateProfile(input.profile, "$archive.profile");
    if (profile !== null && (profile.language !== preferences.language || profile.timeZoneId !== preferences.timeZoneId)) {
        invalid("$archive.preferences", "Profile and preferences disagree on language or time zone.");
    }
    return {
        kind: ARCHIVE_KIND,
        schemaVersion: ARCHIVE_SCHEMA_VERSION,
        createdAt: instant(input.createdAt, "$archive.createdAt"),
        appVersion: string(input.appVersion, "$archive.appVersion", 128),
        profile,
        employers: employers.sort((left, right)=>left.id.localeCompare(right.id)),
        employments: employments.sort((left, right)=>left.id.localeCompare(right.id)),
        payRates: payRates.sort((left, right)=>left.id.localeCompare(right.id)),
        ruleSets: ruleSets.sort((left, right)=>left.id.localeCompare(right.id)),
        shifts: shifts.sort((left, right)=>left.id.localeCompare(right.id)),
        calculationHistory,
        recurrences: recurrences.sort((left, right)=>left.id.localeCompare(right.id)),
        preferences
    };
}
export function emptyArchive(createdAt, appVersion) {
    return validateArchive({
        kind: ARCHIVE_KIND,
        schemaVersion: ARCHIVE_SCHEMA_VERSION,
        createdAt,
        appVersion,
        profile: null,
        employers: [],
        employments: [],
        payRates: [],
        ruleSets: [],
        shifts: [],
        calculationHistory: [],
        recurrences: [],
        preferences: {
            language: "sv",
            timeZoneId: "Europe/Stockholm",
            weekStartsOn: 1,
            theme: "system"
        }
    });
}


//# sourceURL=storage/schema.ts