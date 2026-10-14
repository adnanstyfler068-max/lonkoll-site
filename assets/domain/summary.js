import { ExactDecimal } from "./decimal.js";
import { DomainError, fail } from "./errors.js";
import { addCivilDays, civilDateKey, civilWeekday, compareCivilDates, epochSeconds, validateCivilDate, validateTimeZone } from "./models.js";
import "./planning.js";
import { localCivilDateAt, nextLocalDayBoundary } from "./timezone.js";
export function createSummaryPeriod(kind, startInput, timeZoneID = "Europe/Stockholm") {
    const start = validateCivilDate(startInput);
    try {
        validateTimeZone(timeZoneID);
    } catch (error) {
        throw new DomainError("invalidSummaryPeriod", error);
    }
    if (kind !== "week" && kind !== "month" || (kind === "week" ? civilWeekday(start) !== 2 : start.day !== 1)) {
        fail("invalidSummaryPeriod");
    }
    const exclusiveEnd = kind === "week" ? addCivilDays(start, 7) : validateCivilDate({
        year: start.month === 12 ? start.year + 1 : start.year,
        month: start.month === 12 ? 1 : start.month + 1,
        day: 1
    });
    return {
        kind,
        start,
        exclusiveEnd,
        timeZoneID
    };
}
export function summaryPeriodContains(period, date) {
    return compareCivilDates(date, period.start) >= 0 && compareCivilDates(date, period.exclusiveEnd) < 0;
}
function sameValue(left, right) {
    return JSON.stringify(left) === JSON.stringify(right);
}
function checkedAdd(left, right) {
    const value = left + right;
    if (!Number.isSafeInteger(value)) fail("summaryOverflow");
    return value;
}
function premiumOrder(left, right) {
    return left.key.ruleSetID.localeCompare(right.key.ruleSetID, "en") || left.key.ruleID.localeCompare(right.key.ruleID, "en");
}
const MAX_INT64 = 9_223_372_036_854_775_807n;
function distributeLine(line, weights, selector) {
    const positive = [
        ...weights.entries()
    ].filter(([, value])=>selector(value) > 0).sort(([left], [right])=>left.localeCompare(right, "en"));
    const seconds = positive.reduce((total, [, value])=>checkedAdd(total, selector(value)), 0);
    const amount = ExactDecimal.parse(line.amount);
    if (amount.compare("0") < 0) fail("invalidSummaryInput");
    let cents;
    try {
        cents = amount.toScaledIntegerExact(2);
    } catch (error) {
        throw new DomainError("invalidSummaryInput", error);
    }
    if (cents > MAX_INT64) fail("summaryOverflow");
    if (seconds !== line.seconds) fail("invalidSummaryInput");
    if (seconds === 0) {
        if (cents !== 0n) fail("invalidSummaryInput");
        return new Map();
    }
    const totalSeconds = BigInt(seconds);
    const shares = positive.map(([key, value])=>{
        const product = cents * BigInt(selector(value));
        if (product > MAX_INT64) fail("summaryOverflow");
        return {
            key,
            quotient: product / totalSeconds,
            residue: product % totalSeconds
        };
    });
    const used = shares.reduce((sum, share)=>sum + share.quotient, 0n);
    const remainder = cents - used;
    if (remainder < 0n || remainder >= BigInt(positive.length)) fail("invalidSummaryInput");
    const residueOrder = shares.map((_, index)=>index).sort((left, right)=>{
        const a = shares[left];
        const b = shares[right];
        return a.residue === b.residue ? a.key.localeCompare(b.key, "en") : a.residue > b.residue ? -1 : 1;
    });
    for (const index of residueOrder.slice(0, Number(remainder)))shares[index].quotient += 1n;
    return new Map(shares.map((share)=>[
            share.key,
            ExactDecimal.fromScaledInteger(share.quotient, 2).toString()
        ]));
}
export function allocateCalculationByDay(record, timeZoneID) {
    try {
        validateTimeZone(timeZoneID);
    } catch (error) {
        throw new DomainError("invalidSummaryPeriod", error);
    }
    const calculation = record.calculation;
    const shift = record.context.shift;
    const expectedSnapshot = {
        shift: {
            start: shift.start,
            end: shift.end,
            timeZoneID: shift.timeZoneID,
            hourlyRate: record.context.payRate.hourlyRate,
            breaks: shift.breaks
        },
        rules: record.context.ruleSet?.rules ?? [],
        overlapPolicy: record.context.ruleSet?.overlapPolicy ?? "reject",
        rounding: record.context.ruleSet?.rounding ?? "halfUp"
    };
    if (!sameValue(calculation.snapshot, expectedSnapshot)) fail("invalidSummaryInput");
    const weights = new Map();
    let previousEnd = epochSeconds(shift.start);
    const shiftEnd = epochSeconds(shift.end);
    for (const segment of calculation.segments){
        const segmentStart = epochSeconds(segment.start);
        const segmentEnd = epochSeconds(segment.end);
        if (segmentStart !== previousEnd || segmentEnd <= segmentStart || segmentEnd > shiftEnd || segment.seconds !== segmentEnd - segmentStart) {
            fail("invalidSummaryInput");
        }
        let cursor = segmentStart;
        while(cursor < segmentEnd){
            const boundary = nextLocalDayBoundary(cursor, timeZoneID);
            if (boundary <= cursor) fail("invalidSummaryInput");
            const end = Math.min(segmentEnd, boundary);
            const seconds = end - cursor;
            if (!Number.isSafeInteger(seconds) || seconds <= 0 || seconds > 31 * 86_400) fail("invalidSummaryInput");
            const date = localCivilDateAt(cursor, timeZoneID);
            const key = civilDateKey(date);
            const day = weights.get(key) ?? {
                date,
                paid: 0,
                unpaid: 0,
                ob: new Map()
            };
            if (segment.isPaid) day.paid = checkedAdd(day.paid, seconds);
            else day.unpaid = checkedAdd(day.unpaid, seconds);
            for (const ruleID of segment.ruleIDs){
                day.ob.set(ruleID, checkedAdd(day.ob.get(ruleID) ?? 0, seconds));
            }
            weights.set(key, day);
            cursor = end;
        }
        previousEnd = segmentEnd;
    }
    const paid = [
        ...weights.values()
    ].reduce((sum, value)=>checkedAdd(sum, value.paid), 0);
    const unpaid = [
        ...weights.values()
    ].reduce((sum, value)=>checkedAdd(sum, value.unpaid), 0);
    if (previousEnd !== shiftEnd || paid !== calculation.paidSeconds || unpaid !== calculation.unpaidSeconds) {
        fail("invalidSummaryInput");
    }
    const base = distributeLine(calculation.base, weights, (value)=>value.paid);
    const premiumMap = new Map();
    for (const line of calculation.premiums){
        const ruleID = line.rule?.id;
        const ruleSetID = record.context.ruleSet?.id;
        if (!ruleID || !ruleSetID) fail("invalidSummaryInput");
        const amounts = distributeLine(line, weights, (value)=>value.ob.get(ruleID) ?? 0);
        for (const [dateKey, amount] of amounts){
            const list = premiumMap.get(dateKey) ?? [];
            list.push({
                key: {
                    ruleSetID,
                    ruleID
                },
                amount
            });
            premiumMap.set(dateKey, list);
        }
    }
    const result = [
        ...weights.entries()
    ].sort(([left], [right])=>left.localeCompare(right, "en")).map(([key, value])=>{
        const premiums = (premiumMap.get(key) ?? []).sort(premiumOrder);
        const subtotal = premiums.reduce((sum, premium)=>sum.add(premium.amount), ExactDecimal.parse(base.get(key) ?? "0"));
        return {
            date: value.date,
            paidSeconds: value.paid,
            unpaidSeconds: value.unpaid,
            baseAmount: base.get(key) ?? "0",
            premiums,
            subtotal: subtotal.toString()
        };
    });
    const allocatedSubtotal = result.reduce((sum, day)=>sum.add(day.subtotal), ExactDecimal.parse("0"));
    if (allocatedSubtotal.compare(calculation.subtotal) !== 0) fail("invalidSummaryInput");
    return result;
}
function emptyBuilder() {
    return {
        shifts: 0,
        paid: 0,
        unpaid: 0,
        base: ExactDecimal.parse("0"),
        premiums: new Map()
    };
}
function addDays(builder, days) {
    builder.shifts = checkedAdd(builder.shifts, 1);
    for (const day of days){
        builder.paid = checkedAdd(builder.paid, day.paidSeconds);
        builder.unpaid = checkedAdd(builder.unpaid, day.unpaidSeconds);
        builder.base = builder.base.add(day.baseAmount);
        for (const premium of day.premiums){
            const key = `${premium.key.ruleSetID}\u0000${premium.key.ruleID}`;
            const current = builder.premiums.get(key);
            builder.premiums.set(key, {
                key: premium.key,
                amount: ExactDecimal.parse(current?.amount ?? "0").add(premium.amount).toString()
            });
        }
    }
}
function finish(builder) {
    const premiums = [
        ...builder.premiums.values()
    ].sort(premiumOrder);
    const subtotal = premiums.reduce((sum, premium)=>sum.add(premium.amount), builder.base);
    return {
        shiftCount: builder.shifts,
        paidSeconds: builder.paid,
        unpaidSeconds: builder.unpaid,
        baseAmount: builder.base.toString(),
        premiums,
        subtotal: subtotal.toString()
    };
}
export function summarizePlanningArchive(input, period) {
    const canonicalPeriod = createSummaryPeriod(period.kind, period.start, period.timeZoneID);
    if (!sameValue(canonicalPeriod.exclusiveEnd, period.exclusiveEnd)) fail("invalidSummaryPeriod");
    const activeIDs = new Set(input.activeIDs);
    const planned = emptyBuilder();
    const worked = emptyBuilder();
    for (const history of input.histories){
        if (!activeIDs.has(history.shiftID)) continue;
        const record = history.records.at(-1);
        if (!record) fail("invalidSummaryInput");
        const days = allocateCalculationByDay(record, period.timeZoneID).filter((day)=>summaryPeriodContains(period, day.date));
        if (days.length === 0) continue;
        addDays(record.context.shift.status === "planned" ? planned : worked, days);
    }
    return {
        period: canonicalPeriod,
        planned: finish(planned),
        worked: finish(worked),
        unavailableComponents: [
            "overtime",
            "tax",
            "net"
        ],
        notices: [
            "estimateOnly",
            "baseAndConfiguredOBOnly"
        ]
    };
}


//# sourceURL=domain/summary.ts