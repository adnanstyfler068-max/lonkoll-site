import { ExactDecimal, decimalTimesIntegerFraction, fractionToDecimalString, fractionUnderflowsSwiftDecimal, roundFraction } from "./decimal.js";
import { fail } from "./errors.js";
import { canonicalPayrollShift, canonicalRule, epochSeconds, isoFromEpochSeconds, parseRate } from "./models.js";
import { localPartsAt, offsetSecondsAt, sameLocalDay } from "./timezone.js";
export const PAYROLL_ENGINE_VERSION = "0.1.0-web-parity";
function ruleApplies(rule, epochSecond, minute, currentWeekday) {
    if (epochSecond < epochSeconds(rule.validFrom) || epochSecond >= epochSeconds(rule.validUntil)) return false;
    let weekday;
    if (rule.startMinute < rule.endMinute) {
        if (minute < rule.startMinute || minute >= rule.endMinute) return false;
        weekday = currentWeekday;
    } else if (minute >= rule.startMinute) {
        weekday = currentWeekday;
    } else if (minute < rule.endMinute) {
        weekday = currentWeekday === 1 ? 7 : currentWeekday - 1;
    } else {
        return false;
    }
    return rule.weekdays.includes(weekday);
}
function canonicalRules(inputs) {
    if (!Array.isArray(inputs) || inputs.length > 100) fail("limitExceeded");
    const identifiers = new Set();
    const rules = inputs.map((input)=>{
        const rule = canonicalRule(input);
        if (identifiers.has(rule.id)) fail("duplicateRuleID");
        identifiers.add(rule.id);
        return rule;
    });
    return rules.sort((left, right)=>left.id.localeCompare(right.id, "en"));
}
function makeSegments(shift, rules, overlapPolicy) {
    const shiftStart = epochSeconds(shift.start);
    const shiftEnd = epochSeconds(shift.end);
    const boundaries = new Set([
        shiftStart,
        shiftEnd
    ]);
    for (const pause of shift.breaks){
        boundaries.add(epochSeconds(pause.start));
        boundaries.add(epochSeconds(pause.end));
    }
    for (const rule of rules){
        const validFrom = epochSeconds(rule.validFrom);
        const validUntil = epochSeconds(rule.validUntil);
        if (validFrom > shiftStart && validFrom < shiftEnd) boundaries.add(validFrom);
        if (validUntil > shiftStart && validUntil < shiftEnd) boundaries.add(validUntil);
    }
    const explicitBoundaries = new Set(boundaries);
    let cursor = shiftStart;
    while(cursor < shiftEnd){
        if (offsetSecondsAt(cursor, shift.timeZoneID) % 60 !== 0) fail("invalidTimeZone");
        const next = Math.floor(cursor / 60) * 60 + 60;
        if (next <= cursor) fail("invalidTimeZone");
        if (next < shiftEnd) boundaries.add(next);
        cursor = next;
    }
    const sorted = [
        ...boundaries
    ].sort((left, right)=>left - right);
    const result = [];
    for(let index = 0; index + 1 < sorted.length; index += 1){
        const start = sorted[index];
        const end = sorted[index + 1];
        const pause = shift.breaks.find((candidate)=>{
            const pauseStart = epochSeconds(candidate.start);
            return start >= pauseStart && start < epochSeconds(candidate.end);
        });
        const paid = pause?.isPaid ?? true;
        const eligible = paid && (pause?.eligibleForOB ?? true);
        const civil = localPartsAt(start, shift.timeZoneID);
        const minute = civil.hour * 60 + civil.minute;
        const ids = eligible ? rules.filter((rule)=>ruleApplies(rule, start, minute, civil.weekday)).map((rule)=>rule.id) : [];
        if (overlapPolicy === "reject" && ids.length > 1) fail("overlappingRules");
        const previous = result.at(-1);
        if (previous && previous.end === start && previous.isPaid === paid && previous.eligibleForOB === eligible && previous.ruleIDs.length === ids.length && previous.ruleIDs.every((id, ruleIndex)=>id === ids[ruleIndex]) && !explicitBoundaries.has(start) && sameLocalDay(previous.start, start, shift.timeZoneID) && offsetSecondsAt(previous.start, shift.timeZoneID) === offsetSecondsAt(start, shift.timeZoneID)) {
            previous.end = end;
        } else {
            result.push({
                start,
                end,
                isPaid: paid,
                eligibleForOB: eligible,
                ruleIDs: ids
            });
        }
    }
    return result.map((segment)=>({
            start: isoFromEpochSeconds(segment.start),
            end: isoFromEpochSeconds(segment.end),
            isPaid: segment.isPaid,
            eligibleForOB: segment.eligibleForOB,
            ruleIDs: [
                ...segment.ruleIDs
            ],
            seconds: segment.end - segment.start
        }));
}
function makeLine(rule, seconds, rate, rounding) {
    const exact = decimalTimesIntegerFraction(rate, seconds, 3_600);
    if (fractionUnderflowsSwiftDecimal(exact)) fail("arithmeticFailure");
    const amount = roundFraction(exact, 2, rounding);
    return {
        rule,
        seconds,
        hourlyRate: rate.toString(),
        unroundedAmount: fractionToDecimalString(exact),
        amount: amount.toString()
    };
}
export function calculatePayroll(inputShift, inputRules = [], overlapPolicy = "reject", rounding = "halfUp") {
    if (overlapPolicy !== "reject" && overlapPolicy !== "additive") fail("invalidRule");
    if (rounding !== "halfUp" && rounding !== "halfEven") fail("invalidRule");
    const shift = canonicalPayrollShift(inputShift);
    const rules = canonicalRules(inputRules);
    const segments = makeSegments(shift, rules, overlapPolicy);
    const paidSeconds = segments.filter((segment)=>segment.isPaid).reduce((total, segment)=>total + segment.seconds, 0);
    const unpaidSeconds = segments.filter((segment)=>!segment.isPaid).reduce((total, segment)=>total + segment.seconds, 0);
    const baseRate = parseRate(shift.hourlyRate, "1000000");
    const base = makeLine(null, paidSeconds, baseRate, rounding);
    const premiums = [];
    for (const rule of rules){
        const seconds = segments.filter((segment)=>segment.ruleIDs.includes(rule.id)).reduce((total, segment)=>total + segment.seconds, 0);
        if (seconds === 0) continue;
        const premiumValue = ExactDecimal.parse(rule.premium.value);
        const rate = rule.premium.kind === "fixedHourly" ? premiumValue : baseRate.multiply(premiumValue).divideByInteger(100n);
        premiums.push(makeLine(rule, seconds, rate, rounding));
    }
    const subtotal = premiums.reduce((total, line)=>total.add(ExactDecimal.parse(line.amount)), ExactDecimal.parse(base.amount));
    const notices = [
        "estimateOnly",
        "baseAndConfiguredOBOnly"
    ];
    if (rules.length === 0) notices.push("noOBRulesConfigured");
    return {
        paidSeconds,
        unpaidSeconds,
        base,
        premiums,
        subtotal: subtotal.toString(),
        segments,
        unavailableComponents: [
            "overtime",
            "tax",
            "net"
        ],
        notices,
        snapshot: {
            shift: {
                ...shift,
                breaks: shift.breaks.map((pause)=>({
                        ...pause
                    }))
            },
            rules: rules.map((rule)=>({
                    ...rule,
                    weekdays: [
                        ...rule.weekdays
                    ],
                    premium: {
                        ...rule.premium
                    }
                })),
            overlapPolicy,
            rounding
        },
        engineVersion: PAYROLL_ENGINE_VERSION
    };
}


//# sourceURL=domain/payroll.ts