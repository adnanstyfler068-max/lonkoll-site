import { ExactDecimal } from "./decimal.js";
import { DomainError, fail } from "./errors.js";
import { addCivilDays, canonicalRule, canonicalShiftRecord, civilDateKey, civilWeekday, compareCivilDates, containsInterval, epochSeconds, isoFromEpochSeconds, makeID, parseRate, validateCivilDate, validateID, validateText, validateTimeZone } from "./models.js";
import { calculatePayroll } from "./payroll.js";
import { localPartsAt, resolveLocalTime, translateLocalInstantByDays } from "./timezone.js";
function canonicalOptionalEnd(start, end) {
    const from = epochSeconds(start);
    if (end === null) return {
        validFrom: isoFromEpochSeconds(from),
        validUntil: null
    };
    const until = epochSeconds(end);
    if (until <= from) fail("invalidInterval");
    return {
        validFrom: isoFromEpochSeconds(from),
        validUntil: isoFromEpochSeconds(until)
    };
}
export function canonicalProfile(input) {
    validateID(input.id);
    validateTimeZone(input.timeZoneID);
    if (input.language !== "sv" && input.language !== "en") fail("invalidText");
    return {
        id: input.id.toLowerCase(),
        language: input.language,
        timeZoneID: input.timeZoneID
    };
}
export function canonicalEmployer(input) {
    validateID(input.id);
    validateText(input.name);
    return {
        id: input.id.toLowerCase(),
        name: input.name
    };
}
export function canonicalEmployment(input) {
    validateID(input.id);
    validateID(input.employerID);
    const interval = canonicalOptionalEnd(input.validFrom, input.validUntil);
    if (input.contractLabel !== null) validateText(input.contractLabel);
    return {
        id: input.id.toLowerCase(),
        employerID: input.employerID.toLowerCase(),
        ...interval,
        contractLabel: input.contractLabel
    };
}
export function canonicalPayRate(input) {
    validateID(input.id);
    validateID(input.employmentID);
    const interval = canonicalOptionalEnd(input.validFrom, input.validUntil);
    const rate = parseRate(input.hourlyRate, "1000000");
    return {
        id: input.id.toLowerCase(),
        employmentID: input.employmentID.toLowerCase(),
        ...interval,
        hourlyRate: rate.toString(),
        currency: "SEK"
    };
}
export function canonicalRuleSet(input) {
    validateID(input.id);
    validateID(input.employmentID);
    validateText(input.version);
    const interval = canonicalOptionalEnd(input.validFrom, input.validUntil);
    if (!Array.isArray(input.rules) || input.rules.length > 100) fail("limitExceeded");
    if (input.overlapPolicy !== "reject" && input.overlapPolicy !== "additive") fail("invalidRuleSet");
    if (input.rounding !== "halfUp" && input.rounding !== "halfEven") fail("invalidRuleSet");
    const ids = new Set();
    const rules = input.rules.map((source)=>{
        if (source.premium?.kind === "fixedHourly") parseRate(source.premium.value, "1000000");
        else if (source.premium?.kind === "percentageOfBase") parseRate(source.premium.value, "10000");
        const rule = canonicalRule(source, "invalidRuleSet");
        if (ids.has(rule.id) || epochSeconds(rule.validFrom) < epochSeconds(interval.validFrom) || interval.validUntil !== null && epochSeconds(rule.validUntil) > epochSeconds(interval.validUntil)) {
            fail("invalidRuleSet");
        }
        ids.add(rule.id);
        return rule;
    }).sort((left, right)=>left.id.localeCompare(right.id, "en"));
    return {
        id: input.id.toLowerCase(),
        employmentID: input.employmentID.toLowerCase(),
        version: input.version,
        ...interval,
        rules,
        overlapPolicy: input.overlapPolicy,
        rounding: input.rounding
    };
}
function uniqueIndex(values, duplicateCode) {
    const result = new Map();
    for (const value of values){
        if (result.has(value.id)) fail(duplicateCode);
        result.set(value.id, value);
    }
    return result;
}
export function createCatalog(input) {
    const employers = input.employers.map(canonicalEmployer);
    const employments = input.employments.map(canonicalEmployment);
    const payRates = input.payRates.map(canonicalPayRate);
    const ruleSets = input.ruleSets.map(canonicalRuleSet);
    const employerIndex = uniqueIndex(employers, "duplicateEmployer");
    const employmentIndex = uniqueIndex(employments, "duplicateEmployment");
    uniqueIndex(payRates, "duplicatePayRateVersion");
    uniqueIndex(ruleSets, "duplicateRuleSetVersion");
    for (const employment of employments){
        if (!employerIndex.has(employment.employerID)) fail("missingEmployer");
    }
    for (const configuration of [
        ...payRates,
        ...ruleSets
    ]){
        const employment = employmentIndex.get(configuration.employmentID);
        if (!employment) fail("missingEmployment");
        if (!containsInterval(configuration.validFrom, configuration.validUntil, employment.validFrom, employment.validUntil)) fail("configurationOutsideEmploymentValidity");
    }
    return {
        employers: [
            ...employers
        ],
        employments: [
            ...employments
        ],
        payRates: [
            ...payRates
        ],
        ruleSets: [
            ...ruleSets
        ]
    };
}
export function resolveShift(inputShift, inputCatalog) {
    const shift = canonicalShiftRecord(inputShift);
    const catalog = createCatalog(inputCatalog);
    const employment = catalog.employments.find((value)=>value.id === shift.employmentID);
    if (!employment) fail("missingEmployment");
    const employer = catalog.employers.find((value)=>value.id === employment.employerID);
    if (!employer) fail("missingEmployer");
    const payRate = catalog.payRates.find((value)=>value.id === shift.payRateVersionID);
    if (!payRate) fail("missingPayRateVersion");
    if (payRate.employmentID !== employment.id) fail("employmentMismatch");
    if (!containsInterval(shift.start, shift.end, employment.validFrom, employment.validUntil)) {
        fail("outsideEmploymentValidity");
    }
    if (!containsInterval(shift.start, shift.end, payRate.validFrom, payRate.validUntil)) {
        fail("outsidePayRateValidity");
    }
    let ruleSet = null;
    if (shift.ruleSetVersionID !== null) {
        ruleSet = catalog.ruleSets.find((value)=>value.id === shift.ruleSetVersionID) ?? null;
        if (!ruleSet) fail("missingRuleSetVersion");
        if (ruleSet.employmentID !== employment.id) fail("employmentMismatch");
        if (!containsInterval(shift.start, shift.end, ruleSet.validFrom, ruleSet.validUntil)) {
            fail("outsideRuleSetValidity");
        }
    }
    return {
        shift,
        employer,
        employment,
        payRate,
        ruleSet
    };
}
export function calculateShift(shift, catalog, revision, calculatedAt, recordID = makeID()) {
    if (!Number.isSafeInteger(revision) || revision <= 0) fail("invalidRevision");
    validateID(recordID);
    let canonicalCalculatedAt;
    try {
        canonicalCalculatedAt = isoFromEpochSeconds(epochSeconds(calculatedAt));
    } catch (error) {
        throw new DomainError("invalidCalculationDate", error);
    }
    const context = resolveShift(shift, catalog);
    const calculation = calculatePayroll({
        start: context.shift.start,
        end: context.shift.end,
        timeZoneID: context.shift.timeZoneID,
        hourlyRate: context.payRate.hourlyRate,
        breaks: context.shift.breaks
    }, context.ruleSet?.rules ?? [], context.ruleSet?.overlapPolicy ?? "reject", context.ruleSet?.rounding ?? "halfUp");
    return {
        id: recordID.toLowerCase(),
        shiftRevision: revision,
        calculatedAt: canonicalCalculatedAt,
        context,
        calculation
    };
}
function canonicalRecurrence(input) {
    validateID(input.id);
    validateID(input.employmentID);
    validateID(input.payRateVersionID);
    if (input.ruleSetVersionID !== null) validateID(input.ruleSetVersionID);
    validateTimeZone(input.timeZoneID);
    const startDate = validateCivilDate(input.startDate);
    const endDate = validateCivilDate(input.endDate);
    const weekdays = [
        ...input.weekdays
    ];
    const exceptions = input.exceptions.map(validateCivilDate);
    if (compareCivilDates(startDate, endDate) > 0 || weekdays.length === 0 || new Set(weekdays).size !== weekdays.length || weekdays.some((day)=>!Number.isSafeInteger(day) || day < 1 || day > 7) || !Number.isSafeInteger(input.startMinute) || input.startMinute < 0 || input.startMinute >= 1_440 || !Number.isSafeInteger(input.endMinute) || input.endMinute < 0 || input.endMinute >= 1_440 || input.startMinute === input.endMinute || exceptions.some((date)=>compareCivilDates(date, startDate) < 0 || compareCivilDates(date, endDate) > 0)) {
        fail("invalidRecurrence");
    }
    return {
        ...input,
        id: input.id.toLowerCase(),
        employmentID: input.employmentID.toLowerCase(),
        payRateVersionID: input.payRateVersionID.toLowerCase(),
        ruleSetVersionID: input.ruleSetVersionID?.toLowerCase() ?? null,
        startDate,
        endDate,
        weekdays: weekdays.sort((a, b)=>a - b),
        exceptions: exceptions.sort((a, b)=>compareCivilDates(a, b))
    };
}
export function planWeeklyRecurrence(input) {
    const definition = canonicalRecurrence(input);
    const exceptionKeys = new Set(definition.exceptions.map(civilDateKey));
    const shifts = [];
    let date = definition.startDate;
    let count = 0;
    while(compareCivilDates(date, definition.endDate) <= 0){
        count += 1;
        if (count > 3_660) fail("batchLimitExceeded");
        if (definition.weekdays.includes(civilWeekday(date)) && !exceptionKeys.has(civilDateKey(date))) {
            const endDate = definition.endMinute < definition.startMinute ? addCivilDays(date, 1) : date;
            shifts.push(canonicalShiftRecord({
                id: makeID(),
                employmentID: definition.employmentID,
                payRateVersionID: definition.payRateVersionID,
                ruleSetVersionID: definition.ruleSetVersionID,
                start: resolveLocalTime(date, definition.startMinute, 0, definition.timeZoneID),
                end: resolveLocalTime(endDate, definition.endMinute, 0, definition.timeZoneID),
                timeZoneID: definition.timeZoneID,
                breaks: [],
                status: "planned"
            }));
        }
        if (compareCivilDates(date, definition.endDate) === 0) break;
        date = addCivilDays(date, 1);
    }
    return shifts;
}
function civilDayDistance(from, to) {
    const left = Date.UTC(from.year, from.month - 1, from.day, 12);
    const right = Date.UTC(to.year, to.month - 1, to.day, 12);
    return (right - left) / 86_400_000;
}
export function planWeekCopy(inputShifts, fromInput, toInput, timeZoneID = "Europe/Stockholm") {
    const from = validateCivilDate(fromInput);
    const to = validateCivilDate(toInput);
    try {
        validateTimeZone(timeZoneID);
    } catch (error) {
        throw new DomainError("invalidWeekCopy", error);
    }
    if (compareCivilDates(from, to) === 0 || civilWeekday(from) !== 2 || civilWeekday(to) !== 2) {
        fail("invalidWeekCopy");
    }
    const sourceStart = epochSeconds(resolveLocalTime(from, 0, 0, timeZoneID));
    const sourceEnd = epochSeconds(resolveLocalTime(addCivilDays(from, 7), 0, 0, timeZoneID));
    const days = civilDayDistance(from, to);
    return inputShifts.map(canonicalShiftRecord).filter((shift)=>epochSeconds(shift.start) >= sourceStart && epochSeconds(shift.start) < sourceEnd).sort((left, right)=>epochSeconds(left.start) - epochSeconds(right.start) || left.id.localeCompare(right.id, "en")).map((shift)=>{
        if (shift.timeZoneID !== timeZoneID) fail("timeZoneMismatch");
        const translate = (instant)=>translateLocalInstantByDays(epochSeconds(instant), days, timeZoneID);
        const breaks = shift.breaks.map((pause)=>({
                start: translate(pause.start),
                end: translate(pause.end),
                isPaid: pause.isPaid,
                eligibleForOB: pause.eligibleForOB
            }));
        return canonicalShiftRecord({
            ...shift,
            id: makeID(),
            start: translate(shift.start),
            end: translate(shift.end),
            breaks,
            status: "planned"
        });
    });
}
function occurrenceKey(shift) {
    return `${shift.employmentID}\u0000${shift.start}\u0000${shift.end}`;
}
function nowAtWholeSecond() {
    return isoFromEpochSeconds(Math.floor(Date.now() / 1_000));
}
export class InMemoryPlanningRepository {
    catalog;
    #clock;
    #active = new Map();
    #calculations = new Map();
    constructor(catalog, clock = nowAtWholeSecond){
        this.catalog = createCatalog(catalog);
        this.#clock = clock;
    }
    static fromArchive(archive, clock = nowAtWholeSecond) {
        const validated = validatePlanningArchive(archive);
        const repository = new InMemoryPlanningRepository(validated.catalog, clock);
        for (const history of validated.histories){
            repository.#calculations.set(history.shiftID, [
                ...history.records
            ]);
            if (validated.activeIDs.includes(history.shiftID)) {
                const last = history.records.at(-1);
                repository.#active.set(history.shiftID, {
                    shift: last.context.shift,
                    revision: last.shiftRevision,
                    currentCalculation: last
                });
            }
        }
        return repository;
    }
    activeStates() {
        return [
            ...this.#active.values()
        ];
    }
    archive() {
        return validatePlanningArchive({
            catalog: this.catalog,
            activeIDs: [
                ...this.#active.keys()
            ],
            histories: [
                ...this.#calculations
            ].map(([shiftID, records])=>({
                    shiftID,
                    records: [
                        ...records
                    ]
                }))
        });
    }
    createBatch(inputShifts) {
        if (inputShifts.length > 10_000) fail("batchLimitExceeded");
        const ids = new Set(this.#calculations.keys());
        const keys = new Set([
            ...this.#active.values()
        ].map((state)=>occurrenceKey(state.shift)));
        const staged = [];
        for (const input of inputShifts){
            const shift = canonicalShiftRecord(input);
            if (ids.has(shift.id)) fail("duplicateShift");
            ids.add(shift.id);
            const key = occurrenceKey(shift);
            if (keys.has(key)) fail("duplicateOccurrence");
            keys.add(key);
            staged.push({
                shift,
                calculation: calculateShift(shift, this.catalog, 1, this.#clock())
            });
        }
        return staged.map(({ shift, calculation })=>this.#commit(shift, 1, calculation));
    }
    create(input) {
        const shift = canonicalShiftRecord(input);
        if (this.#active.has(shift.id) || this.#calculations.has(shift.id)) fail("duplicateShift");
        const calculation = calculateShift(shift, this.catalog, 1, this.#clock());
        return this.#commit(shift, 1, calculation);
    }
    update(id, replacementInput, expectedRevision) {
        const current = this.#checked(id, expectedRevision);
        const replacement = canonicalShiftRecord(replacementInput);
        if (replacement.id !== current.shift.id) fail("shiftIdentityMismatch");
        if (current.revision >= Number.MAX_SAFE_INTEGER) fail("revisionOverflow");
        const revision = current.revision + 1;
        const calculation = calculateShift(replacement, this.catalog, revision, this.#clock());
        return this.#commit(replacement, revision, calculation);
    }
    duplicate(id, newID, start, end, breaks) {
        const source = this.shift(id).shift;
        return this.create(canonicalShiftRecord({
            ...source,
            id: newID,
            start,
            end,
            breaks,
            status: "planned"
        }));
    }
    delete(id, expectedRevision) {
        this.#checked(id, expectedRevision);
        this.#active.delete(id.toLowerCase());
    }
    recalculate(id, expectedRevision) {
        const current = this.#checked(id, expectedRevision);
        const calculation = calculateShift(current.shift, this.catalog, current.revision, this.#clock());
        return this.#commit(current.shift, current.revision, calculation);
    }
    shift(id) {
        const value = this.#active.get(id.toLowerCase());
        if (!value) fail("shiftNotFound");
        return value;
    }
    history(id) {
        return [
            ...this.#calculations.get(id.toLowerCase()) ?? []
        ];
    }
    createRecurrence(definition) {
        return this.createBatch(planWeeklyRecurrence(definition));
    }
    copyWeek(from, to, timeZoneID = "Europe/Stockholm") {
        return this.createBatch(planWeekCopy([
            ...this.#active.values()
        ].map((state)=>state.shift), from, to, timeZoneID));
    }
    #checked(id, expectedRevision) {
        const value = this.shift(id);
        if (value.revision !== expectedRevision) fail("staleRevision");
        return value;
    }
    #commit(shift, revision, calculation) {
        const state = {
            shift,
            revision,
            currentCalculation: calculation
        };
        const history = this.#calculations.get(shift.id) ?? [];
        history.push(calculation);
        this.#calculations.set(shift.id, history);
        this.#active.set(shift.id, state);
        return state;
    }
}
function sameValue(left, right) {
    return JSON.stringify(left) === JSON.stringify(right);
}
export function validatePlanningArchive(input) {
    const catalog = createCatalog(input.catalog);
    const shiftIDs = new Set();
    const recordIDs = new Set();
    const histories = [];
    for (const inputHistory of input.histories){
        const shiftID = validateID(inputHistory.shiftID);
        if (shiftIDs.has(shiftID) || inputHistory.records.length === 0) fail("invalidArchive");
        shiftIDs.add(shiftID);
        let revision = 0;
        let previous = null;
        const records = [];
        for (const record of inputHistory.records){
            try {
                validateID(record.id);
                epochSeconds(record.calculatedAt);
                if (record.context.shift.id !== shiftID || recordIDs.has(record.id) || !Number.isSafeInteger(record.shiftRevision) || record.shiftRevision <= 0 || record.shiftRevision !== revision && record.shiftRevision !== revision + 1 || record.shiftRevision === revision && previous !== null && !sameValue(record.context.shift, previous.context.shift)) {
                    fail("invalidArchive");
                }
                recordIDs.add(record.id);
                const historicalCatalog = {
                    employers: [
                        ...catalog.employers.filter((value)=>value.id !== record.context.employer.id),
                        record.context.employer
                    ],
                    employments: [
                        ...catalog.employments.filter((value)=>value.id !== record.context.employment.id),
                        record.context.employment
                    ],
                    payRates: [
                        ...catalog.payRates.filter((value)=>value.id !== record.context.payRate.id),
                        record.context.payRate
                    ],
                    ruleSets: record.context.ruleSet === null ? catalog.ruleSets : [
                        ...catalog.ruleSets.filter((value)=>value.id !== record.context.ruleSet.id),
                        record.context.ruleSet
                    ]
                };
                const replay = calculateShift(record.context.shift, historicalCatalog, record.shiftRevision, record.calculatedAt, record.id);
                if (!sameValue(replay.context, record.context) || !sameValue(replay.calculation, record.calculation)) {
                    fail("invalidArchive");
                }
            } catch (error) {
                if (error instanceof DomainError && error.code === "invalidArchive") throw error;
                throw new DomainError("invalidArchive", error);
            }
            records.push(record);
            revision = record.shiftRevision;
            previous = record;
        }
        histories.push({
            shiftID,
            records
        });
    }
    const activeIDs = input.activeIDs.map(validateID);
    if (new Set(activeIDs).size !== activeIDs.length || activeIDs.some((id)=>!shiftIDs.has(id))) {
        fail("invalidArchive");
    }
    histories.sort((left, right)=>left.shiftID.localeCompare(right.shiftID, "en"));
    activeIDs.sort((left, right)=>left.localeCompare(right, "en"));
    return {
        catalog,
        activeIDs,
        histories
    };
}
export function localFields(instant, timeZoneID) {
    return localPartsAt(epochSeconds(instant), timeZoneID);
}
export function moneyEquals(left, right) {
    return ExactDecimal.parse(left).compare(ExactDecimal.parse(right)) === 0;
}


//# sourceURL=domain/planning.ts