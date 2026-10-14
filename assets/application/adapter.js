import * as Domain from "../domain/index.js";
import * as Storage from "../storage/index.js";
export const WEB_APP_VERSION = "0.1.0";
function nowInstant() {
    return Domain.isoFromEpochSeconds(Math.floor(Date.now() / 1_000));
}
function storageRuleToDomain(rule) {
    return {
        id: rule.id,
        version: rule.version,
        source: rule.source,
        note: rule.note,
        validFrom: rule.validFrom,
        validUntil: rule.validUntil,
        weekdays: [
            ...rule.weekdays
        ],
        startMinute: rule.startMinute,
        endMinute: rule.endMinute,
        premium: {
            kind: rule.premium.kind,
            value: rule.premium.amount
        }
    };
}
function storageRuleSetToDomain(ruleSet) {
    return {
        id: ruleSet.id,
        employmentID: ruleSet.employmentId,
        version: ruleSet.version,
        validFrom: ruleSet.validFrom,
        validUntil: ruleSet.validUntil,
        rules: ruleSet.rules.map(storageRuleToDomain),
        overlapPolicy: ruleSet.overlapPolicy,
        rounding: ruleSet.rounding
    };
}
function storageShiftToDomain(shift) {
    return {
        id: shift.id,
        employmentID: shift.employmentId,
        payRateVersionID: shift.payRateVersionId,
        ruleSetVersionID: shift.ruleSetVersionId,
        start: shift.start,
        end: shift.end,
        timeZoneID: shift.timeZoneId,
        breaks: shift.breaks.map((pause)=>({
                start: pause.start,
                end: pause.end,
                isPaid: pause.isPaid,
                eligibleForOB: pause.eligibleForOb
            })),
        status: shift.status
    };
}
function storageCatalogToDomain(archive) {
    return {
        employers: archive.employers.map((employer)=>({
                ...employer
            })),
        employments: archive.employments.map((employment)=>({
                id: employment.id,
                employerID: employment.employerId,
                validFrom: employment.validFrom,
                validUntil: employment.validUntil,
                contractLabel: employment.contractLabel
            })),
        payRates: archive.payRates.map((rate)=>({
                id: rate.id,
                employmentID: rate.employmentId,
                validFrom: rate.validFrom,
                validUntil: rate.validUntil,
                hourlyRate: rate.hourlyRate,
                currency: "SEK"
            })),
        ruleSets: archive.ruleSets.map(storageRuleSetToDomain)
    };
}
function historyEntryToDomain(entry) {
    const shift = storageShiftToDomain(entry.shiftSnapshot);
    const ruleSet = entry.ruleSetSnapshot === null ? null : storageRuleSetToDomain(entry.ruleSetSnapshot);
    const rules = ruleSet?.rules ?? [];
    const ruleByID = new Map(rules.map((rule)=>[
            rule.id,
            rule
        ]));
    const mapLine = (line, isBase)=>{
        const rule = line.ruleId === null ? null : ruleByID.get(line.ruleId) ?? null;
        if (!isBase && rule === null || isBase && line.ruleId !== null) {
            throw new Domain.DomainError("invalidArchive");
        }
        return {
            rule,
            seconds: line.seconds,
            hourlyRate: line.hourlyRate,
            unroundedAmount: line.unroundedAmount,
            amount: line.amount
        };
    };
    const calculation = {
        paidSeconds: entry.result.paidSeconds,
        unpaidSeconds: entry.result.unpaidSeconds,
        base: mapLine(entry.result.base, true),
        premiums: entry.result.premiums.map((line)=>mapLine(line, false)),
        subtotal: entry.result.subtotal,
        segments: entry.result.segments.map((segment)=>({
                start: segment.start,
                end: segment.end,
                isPaid: segment.isPaid,
                eligibleForOB: segment.eligibleForOb,
                ruleIDs: [
                    ...segment.ruleIds
                ],
                seconds: Domain.epochSeconds(segment.end) - Domain.epochSeconds(segment.start)
            })),
        unavailableComponents: [
            "overtime",
            "tax",
            "net"
        ],
        notices: entry.result.notices,
        snapshot: {
            shift: {
                start: shift.start,
                end: shift.end,
                timeZoneID: shift.timeZoneID,
                hourlyRate: entry.payRateSnapshot.hourlyRate,
                breaks: shift.breaks
            },
            rules,
            overlapPolicy: ruleSet?.overlapPolicy ?? "reject",
            rounding: ruleSet?.rounding ?? "halfUp"
        },
        engineVersion: entry.result.engineVersion
    };
    return {
        id: entry.id,
        shiftRevision: entry.shiftRevision,
        calculatedAt: entry.calculatedAt,
        context: {
            shift,
            employer: {
                ...entry.employerSnapshot
            },
            employment: {
                id: entry.employmentSnapshot.id,
                employerID: entry.employmentSnapshot.employerId,
                validFrom: entry.employmentSnapshot.validFrom,
                validUntil: entry.employmentSnapshot.validUntil,
                contractLabel: entry.employmentSnapshot.contractLabel
            },
            payRate: {
                id: entry.payRateSnapshot.id,
                employmentID: entry.payRateSnapshot.employmentId,
                validFrom: entry.payRateSnapshot.validFrom,
                validUntil: entry.payRateSnapshot.validUntil,
                hourlyRate: entry.payRateSnapshot.hourlyRate,
                currency: "SEK"
            },
            ruleSet
        },
        calculation
    };
}
export function storageArchiveToDomain(archive) {
    const grouped = new Map();
    for (const entry of archive.calculationHistory){
        const records = grouped.get(entry.shiftId) ?? [];
        records.push(historyEntryToDomain(entry));
        grouped.set(entry.shiftId, records);
    }
    const histories = [
        ...grouped
    ].map(([shiftID, records])=>({
            shiftID,
            records
        }));
    return Domain.validatePlanningArchive({
        catalog: storageCatalogToDomain(archive),
        activeIDs: archive.shifts.map((shift)=>shift.id),
        histories
    });
}
function domainRuleToStorage(rule) {
    return {
        id: rule.id,
        version: rule.version,
        source: rule.source,
        note: rule.note,
        validFrom: rule.validFrom,
        validUntil: rule.validUntil,
        weekdays: [
            ...rule.weekdays
        ],
        startMinute: rule.startMinute,
        endMinute: rule.endMinute,
        premium: {
            kind: rule.premium.kind,
            amount: rule.premium.value
        }
    };
}
function domainRuleSetToStorage(ruleSet) {
    return {
        id: ruleSet.id,
        employmentId: ruleSet.employmentID,
        version: ruleSet.version,
        validFrom: ruleSet.validFrom,
        validUntil: ruleSet.validUntil,
        rules: ruleSet.rules.map(domainRuleToStorage),
        overlapPolicy: ruleSet.overlapPolicy,
        rounding: ruleSet.rounding
    };
}
function domainShiftToStorage(shift, revision) {
    return {
        id: shift.id,
        employmentId: shift.employmentID,
        payRateVersionId: shift.payRateVersionID,
        ruleSetVersionId: shift.ruleSetVersionID,
        start: shift.start,
        end: shift.end,
        timeZoneId: shift.timeZoneID,
        breaks: shift.breaks.map((pause)=>({
                start: pause.start,
                end: pause.end,
                isPaid: pause.isPaid,
                eligibleForOb: pause.eligibleForOB
            })),
        status: shift.status,
        revision
    };
}
function domainRecordToStorage(record) {
    const { context, calculation } = record;
    const line = (value)=>({
            ruleId: value.rule?.id ?? null,
            seconds: value.seconds,
            hourlyRate: value.hourlyRate,
            unroundedAmount: value.unroundedAmount,
            amount: value.amount
        });
    return {
        id: record.id,
        shiftId: context.shift.id,
        shiftRevision: record.shiftRevision,
        calculatedAt: record.calculatedAt,
        shiftSnapshot: domainShiftToStorage(context.shift, record.shiftRevision),
        employerSnapshot: {
            ...context.employer
        },
        employmentSnapshot: {
            id: context.employment.id,
            employerId: context.employment.employerID,
            validFrom: context.employment.validFrom,
            validUntil: context.employment.validUntil,
            contractLabel: context.employment.contractLabel
        },
        payRateSnapshot: {
            id: context.payRate.id,
            employmentId: context.payRate.employmentID,
            validFrom: context.payRate.validFrom,
            validUntil: context.payRate.validUntil,
            hourlyRate: context.payRate.hourlyRate,
            currency: "SEK"
        },
        ruleSetSnapshot: context.ruleSet === null ? null : domainRuleSetToStorage(context.ruleSet),
        result: {
            engineVersion: calculation.engineVersion,
            paidSeconds: calculation.paidSeconds,
            unpaidSeconds: calculation.unpaidSeconds,
            base: line(calculation.base),
            premiums: calculation.premiums.map(line),
            subtotal: calculation.subtotal,
            segments: calculation.segments.map((segment)=>({
                    start: segment.start,
                    end: segment.end,
                    isPaid: segment.isPaid,
                    eligibleForOb: segment.eligibleForOB,
                    ruleIds: [
                        ...segment.ruleIDs
                    ]
                })),
            unavailableComponents: [
                ...calculation.unavailableComponents
            ],
            notices: [
                ...calculation.notices
            ]
        }
    };
}
function archiveWithDomain(previous, domain, recurrences = previous.recurrences) {
    const latestByID = new Map(domain.histories.map((history)=>[
            history.shiftID,
            history.records.at(-1)
        ]));
    return Storage.validateArchive({
        ...previous,
        appVersion: WEB_APP_VERSION,
        employers: domain.catalog.employers.map((employer)=>({
                ...employer
            })),
        employments: domain.catalog.employments.map((employment)=>({
                id: employment.id,
                employerId: employment.employerID,
                validFrom: employment.validFrom,
                validUntil: employment.validUntil,
                contractLabel: employment.contractLabel
            })),
        payRates: domain.catalog.payRates.map((rate)=>({
                id: rate.id,
                employmentId: rate.employmentID,
                validFrom: rate.validFrom,
                validUntil: rate.validUntil,
                hourlyRate: rate.hourlyRate,
                currency: "SEK"
            })),
        ruleSets: domain.catalog.ruleSets.map(domainRuleSetToStorage),
        shifts: domain.activeIDs.map((id)=>{
            const record = latestByID.get(id);
            if (!record) throw new Domain.DomainError("invalidArchive");
            return domainShiftToStorage(record.context.shift, record.shiftRevision);
        }),
        calculationHistory: domain.histories.flatMap((history)=>history.records.map(domainRecordToStorage)),
        recurrences
    });
}
function parseDate(value) {
    return Domain.parseCivilDate(value);
}
function dateKey(value) {
    return Domain.civilDateKey(value);
}
function timeText(hour, minute) {
    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}
function partsFor(instant, timeZoneID) {
    return Domain.localFields(instant, timeZoneID);
}
function minuteFromText(value) {
    const match = /^(\d{2}):(\d{2})$/.exec(value);
    if (!match) throw new Domain.DomainError("invalidLocalTime");
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    if (hour > 23 || minute > 59) throw new Domain.DomainError("invalidLocalTime");
    return hour * 60 + minute;
}
function premiumTotal(lines) {
    return lines.reduce((total, line)=>total.add(line.amount), Domain.ExactDecimal.parse("0")).toString();
}
function shiftView(shift, history, archive) {
    const latest = history.at(-1);
    if (!latest) throw new Domain.DomainError("invalidArchive");
    const employer = archive.employers.find((value)=>value.id === latest.employerSnapshot.id);
    if (!employer) throw new Domain.DomainError("invalidArchive");
    const start = partsFor(shift.start, shift.timeZoneId);
    const end = partsFor(shift.end, shift.timeZoneId);
    const breaks = shift.breaks.map((pause)=>{
        const pauseStart = partsFor(pause.start, shift.timeZoneId);
        const pauseEnd = partsFor(pause.end, shift.timeZoneId);
        return {
            startDate: dateKey(pauseStart),
            startTime: timeText(pauseStart.hour, pauseStart.minute),
            endDate: dateKey(pauseEnd),
            endTime: timeText(pauseEnd.hour, pauseEnd.minute),
            isPaid: pause.isPaid,
            eligibleForPremium: pause.eligibleForOb
        };
    });
    const calculationHistory = history.map((entry)=>({
            id: entry.id,
            revision: entry.shiftRevision,
            calculatedAt: entry.calculatedAt,
            total: entry.result.subtotal
        }));
    return {
        id: shift.id,
        revision: shift.revision,
        employerId: employer.id,
        employerName: employer.name,
        rateVersionId: shift.payRateVersionId,
        ruleSetVersionId: shift.ruleSetVersionId ?? undefined,
        date: dateKey(start),
        startTime: timeText(start.hour, start.minute),
        endDate: dateKey(end),
        endTime: timeText(end.hour, end.minute),
        timeZone: shift.timeZoneId,
        status: shift.status,
        statusMode: "manual",
        breaks,
        grossSeconds: Domain.epochSeconds(shift.end) - Domain.epochSeconds(shift.start),
        paidSeconds: latest.result.paidSeconds,
        unpaidSeconds: latest.result.unpaidSeconds,
        baseAmount: latest.result.base.amount,
        premiumAmount: premiumTotal(latest.result.premiums),
        totalAmount: latest.result.subtotal,
        premiumLines: latest.result.premiums.map((line)=>({
                ruleName: latest.ruleSetSnapshot?.rules.find((rule)=>rule.id === line.ruleId)?.note ?? line.ruleId ?? "OB",
                seconds: line.seconds,
                hourlyRate: line.hourlyRate,
                amount: line.amount
            })),
        history: calculationHistory
    };
}
function mondayFor(date) {
    const weekday = Domain.civilWeekday(date);
    return Domain.addCivilDays(date, weekday === 1 ? -6 : 2 - weekday);
}
function summaryPeriod(kind, anchor, zone) {
    const start = kind === "week" ? mondayFor(anchor) : {
        year: anchor.year,
        month: anchor.month,
        day: 1
    };
    return Domain.createSummaryPeriod(kind, start, zone);
}
function bucketView(value) {
    return {
        seconds: value.paidSeconds,
        baseAmount: value.baseAmount,
        premiumAmount: premiumTotal(value.premiums),
        totalAmount: value.subtotal
    };
}
function viewSummary(domain, period) {
    const result = Domain.summarizePlanningArchive(domain, period);
    return {
        periodKind: period.kind,
        periodStart: dateKey(period.start),
        periodEnd: dateKey(period.exclusiveEnd),
        planned: bucketView(result.planned),
        worked: bucketView(result.worked)
    };
}
function civilDistance(from, to) {
    const left = Date.UTC(from.year, from.month - 1, from.day, 12);
    const right = Date.UTC(to.year, to.month - 1, to.day, 12);
    return (right - left) / 86_400_000;
}
function farRuleEnd() {
    return "2099-12-31T23:59:59Z";
}
export class BrowserPlanningAdapter {
    #store;
    #listeners = new Set();
    #queue = Promise.resolve();
    constructor(store = new Storage.PlanningStore()){
        this.#store = store;
    }
    subscribe(listener) {
        this.#listeners.add(listener);
        return ()=>this.#listeners.delete(listener);
    }
    async #current() {
        const current = await this.#store.load();
        if (current) return current;
        return {
            archive: Storage.emptyArchive(nowInstant(), WEB_APP_VERSION),
            fingerprint: ""
        };
    }
    async #mutate(operation) {
        const run = this.#queue.then(async ()=>{
            const current = await this.#store.load();
            const archive = current?.archive ?? Storage.emptyArchive(nowInstant(), WEB_APP_VERSION);
            const next = await operation(structuredClone(archive));
            const saved = await this.#store.save(next, current?.fingerprint ?? null);
            for (const listener of this.#listeners)listener();
            return saved;
        });
        this.#queue = run.then(()=>undefined, ()=>undefined);
        return run;
    }
    async loadSnapshot(options = {}) {
        const stored = await this.#current();
        const archive = stored.archive;
        const zone = archive.preferences.timeZoneId;
        const todayParts = Domain.localCivilDateAt(Math.floor(Date.now() / 1_000), zone);
        const today = dateKey(todayParts);
        const domain = storageArchiveToDomain(archive);
        const historyByShift = new Map();
        for (const entry of archive.calculationHistory){
            const values = historyByShift.get(entry.shiftId) ?? [];
            values.push(entry);
            historyByShift.set(entry.shiftId, values);
        }
        const statusModes = this.#store.getShiftStatusModes ? await this.#store.getShiftStatusModes() : [];
        const statusModeById = new Map(statusModes.map((value)=>[
                value.shiftId,
                value.mode
            ]));
        const shifts = archive.shifts.map((shift)=>({
                ...shiftView(shift, historyByShift.get(shift.id) ?? [], archive),
                statusMode: statusModeById.get(shift.id) ?? (shift.status === "planned" ? "automatic" : "manual")
            })).sort((left, right)=>left.date.localeCompare(right.date) || left.startTime.localeCompare(right.startTime) || left.id.localeCompare(right.id));
        const requestedKind = options.summaryKind ?? "week";
        const requestedAnchor = options.anchorDate ? parseDate(options.anchorDate) : todayParts;
        const requestedPeriod = summaryPeriod(requestedKind, requestedAnchor, zone);
        const currentWeek = summaryPeriod("week", todayParts, zone);
        const currentSummary = Domain.summarizePlanningArchive(domain, currentWeek);
        const combined = (field)=>Domain.ExactDecimal.parse(currentSummary.planned[field]).add(currentSummary.worked[field]).toString();
        const allPremiums = [
            ...currentSummary.planned.premiums,
            ...currentSummary.worked.premiums
        ];
        const future = archive.shifts.filter((shift)=>Domain.epochSeconds(shift.start) >= Math.floor(Date.now() / 1_000)).sort((left, right)=>left.start.localeCompare(right.start));
        const home = {
            plannedSeconds: currentSummary.planned.paidSeconds,
            workedSeconds: currentSummary.worked.paidSeconds,
            baseAmount: combined("baseAmount"),
            premiumAmount: premiumTotal(allPremiums),
            totalAmount: combined("subtotal"),
            nextShiftId: future[0]?.id
        };
        const taxProfiles = this.#store.getTaxProfile ? await Promise.all(archive.employers.map(async (employer)=>{
            const profile = await this.#store.getTaxProfile(employer.id);
            return profile === null ? null : this.#taxProfileView(profile);
        })) : [];
        const profileByEmployer = new Map(taxProfiles.filter((profile)=>profile !== null).map((profile)=>[
                profile.employerId,
                profile
            ]));
        const employerStates = new Map((await this.#store.getEmployerStates?.() ?? []).map((value)=>[
                value.employerId,
                value.archived
            ]));
        const monthlyTax = requestedKind !== "month" ? [] : archive.employers.map((employer)=>{
            const periodShifts = shifts.filter((shift)=>shift.employerId === employer.id && shift.date >= dateKey(requestedPeriod.start) && shift.date < dateKey(requestedPeriod.exclusiveEnd));
            const baseAmount = periodShifts.reduce((total, shift)=>total.add(shift.baseAmount), Domain.ExactDecimal.parse("0")).toString();
            const premiumAmount = periodShifts.reduce((total, shift)=>total.add(shift.premiumAmount), Domain.ExactDecimal.parse("0")).toString();
            const gross = Domain.ExactDecimal.parse(baseAmount).add(premiumAmount).toString();
            const profile = profileByEmployer.get(employer.id);
            if (!profile) return {
                employerId: employer.id,
                employerName: employer.name,
                baseAmount,
                premiumAmount,
                gross,
                calculation: null,
                unavailableReason: "unconfigured"
            };
            if (!profile.confirmedByUser || profile.tableNumber === null || profile.column === null) return {
                employerId: employer.id,
                employerName: employer.name,
                baseAmount,
                premiumAmount,
                gross,
                calculation: null,
                unavailableReason: "unconfirmed"
            };
            try {
                const value = Domain.calculateSwedishWithholding({
                    grossTaxableRegularIncome: Number(gross),
                    taxYear: 2026,
                    tableNumber: profile.tableNumber,
                    column: profile.column,
                    payrollPeriod: profile.payrollPeriod,
                    incomeType: profile.incomeType,
                    adjustment: {
                        kind: profile.adjustmentType,
                        ...profile.adjustmentValue === null ? {} : {
                            value: profile.adjustmentValue
                        }
                    }
                });
                return {
                    employerId: employer.id,
                    employerName: employer.name,
                    baseAmount,
                    premiumAmount,
                    gross,
                    calculation: {
                        employerId: employer.id,
                        gross,
                        regularTax: String(value.regularTax),
                        oneOffGross: "0",
                        oneOffTax: "0",
                        totalTax: String(value.totalPreliminaryTax),
                        net: String(value.estimatedNet),
                        tableNumber: value.tableNumber,
                        column: value.column,
                        taxYear: value.taxYear,
                        datasetVersion: value.datasetVersion,
                        authority: "Skatteverket",
                        provenance: value.provenance,
                        adjustmentType: profile.adjustmentType,
                        adjustmentValue: profile.adjustmentValue
                    },
                    unavailableReason: null
                };
            } catch  {
                return {
                    employerId: employer.id,
                    employerName: employer.name,
                    baseAmount,
                    premiumAmount,
                    gross,
                    calculation: null,
                    unavailableReason: "unavailable"
                };
            }
        });
        return {
            profile: archive.profile === null ? null : {
                name: archive.profile.name,
                language: archive.profile.language,
                onboardingComplete: true
            },
            employers: archive.employers.map((employer)=>({
                    ...employer,
                    archived: employerStates.get(employer.id) ?? false
                })),
            employerProfiles: this.#store.getEmployerProfile ? (await Promise.all(archive.employers.map((employer)=>this.#store.getEmployerProfile(employer.id)))).filter((value)=>value !== null).map((value)=>({
                    ...value
                })) : [],
            rates: archive.payRates.map((rate)=>{
                const employment = archive.employments.find((value)=>value.id === rate.employmentId);
                const employer = archive.employers.find((value)=>value.id === employment.employerId);
                return {
                    id: rate.id,
                    employerId: employer.id,
                    employerName: employer.name,
                    hourlyRate: rate.hourlyRate,
                    validFrom: dateKey(partsFor(rate.validFrom, zone)),
                    validTo: rate.validUntil ? dateKey(partsFor(rate.validUntil, zone)) : undefined
                };
            }),
            ruleSets: archive.ruleSets.map((ruleSet)=>{
                const employment = archive.employments.find((value)=>value.id === ruleSet.employmentId);
                const employer = archive.employers.find((value)=>value.id === employment.employerId);
                return {
                    id: ruleSet.id,
                    employerId: employer.id,
                    employerName: employer.name,
                    name: ruleSet.version,
                    rules: ruleSet.rules.map((rule)=>({
                            id: rule.id,
                            name: rule.note,
                            weekdays: rule.weekdays,
                            startTime: timeText(Math.floor(rule.startMinute / 60), rule.startMinute % 60),
                            endTime: rule.endMinute === 1_440 ? "24:00" : timeText(Math.floor(rule.endMinute / 60), rule.endMinute % 60),
                            kind: rule.premium.kind === "fixedHourly" ? "fixed" : "percent",
                            value: rule.premium.amount,
                            additive: ruleSet.overlapPolicy === "additive"
                        }))
                };
            }),
            shifts,
            recurrences: archive.recurrences.map((value)=>{
                const employment = archive.employments.find((item)=>item.id === value.employmentId);
                const employer = archive.employers.find((item)=>item.id === employment.employerId);
                return {
                    id: value.id,
                    employerId: employer.id,
                    employerName: employer.name,
                    startDate: value.startDate,
                    endDate: value.endDate,
                    weekdays: value.weekdays,
                    startTime: timeText(Math.floor(value.startMinute / 60), value.startMinute % 60),
                    endTime: timeText(Math.floor(value.endMinute / 60), value.endMinute % 60),
                    exceptions: [
                        ...value.exceptions
                    ]
                };
            }),
            home,
            summary: viewSummary(domain, requestedPeriod),
            taxProfiles: taxProfiles.filter((profile)=>profile !== null),
            monthlyTax,
            today
        };
    }
    #taxProfileView(profile) {
        return {
            employerId: profile.employerId,
            taxYear: profile.taxYear,
            tableNumber: profile.tableNumber,
            column: profile.column,
            incomeType: profile.incomeType,
            payrollPeriod: profile.payrollPeriod,
            adjustmentType: profile.adjustmentType,
            adjustmentValue: profile.adjustmentValue,
            confirmedByUser: profile.confirmedByUser,
            datasetVersion: profile.datasetVersion
        };
    }
    async getTaxProfile(employerId) {
        const archive = (await this.#current()).archive;
        if (!archive.employers.some((employer)=>employer.id === employerId)) throw new Domain.DomainError("missingEmployment");
        if (!this.#store.getTaxProfile) throw new Error("Tax profile storage is unavailable.");
        const profile = await this.#store.getTaxProfile(employerId);
        return profile === null ? null : this.#taxProfileView(profile);
    }
    async saveTaxProfile(employerId, input) {
        if (input.employerId !== employerId) throw new Domain.DomainError("invalidText");
        const archive = (await this.#current()).archive;
        if (!archive.employers.some((employer)=>employer.id === employerId)) throw new Domain.DomainError("missingEmployment");
        if (!this.#store.saveTaxProfile) throw new Error("Tax profile storage is unavailable.");
        if (input.tableNumber !== null && (!Number.isInteger(input.tableNumber) || input.tableNumber < 29 || input.tableNumber > 42)) throw new Domain.DomainError("invalidText");
        if (input.column !== null && (!Number.isInteger(input.column) || input.column < 1 || input.column > 6)) throw new Domain.DomainError("invalidText");
        if (input.adjustmentType === "none" ? input.adjustmentValue !== null : input.adjustmentValue === null || !Number.isSafeInteger(input.adjustmentValue) || input.adjustmentValue < 0) throw new Domain.DomainError("invalidText");
        const existing = this.#store.getTaxProfile ? await this.#store.getTaxProfile(employerId) : null;
        const instant = nowInstant();
        await this.#store.saveTaxProfile({
            employerId,
            taxYear: 2026,
            tableMode: input.tableNumber === null ? "automatic" : "manual",
            tableNumber: input.tableNumber,
            columnMode: input.column === null ? "automatic" : "manual",
            column: input.column,
            incomeType: input.incomeType,
            payrollPeriod: input.payrollPeriod,
            adjustmentType: input.adjustmentType,
            adjustmentValue: input.adjustmentValue,
            confirmedByUser: input.confirmedByUser,
            datasetVersion: Domain.skatteverket2026().sourceVersion,
            sourceMetadata: "Skatteverket 2026 official offline dataset",
            createdAt: existing?.createdAt ?? instant,
            updatedAt: instant
        });
        for (const listener of this.#listeners)listener();
    }
    async deleteTaxProfile(employerId) {
        const archive = (await this.#current()).archive;
        if (!archive.employers.some((employer)=>employer.id === employerId)) throw new Domain.DomainError("missingEmployment");
        if (!this.#store.deleteTaxProfile) throw new Error("Tax profile storage is unavailable.");
        await this.#store.deleteTaxProfile(employerId);
        for (const listener of this.#listeners)listener();
    }
    async calculateMonthlyTaxForEmployer(employerId, gross) {
        const profile = await this.getTaxProfile(employerId);
        if (!profile) throw new Error("Skatteprofil inte konfigurerad.");
        if (!profile.confirmedByUser || profile.tableNumber === null || profile.column === null) throw new Error("Skattetabell och kolumn behöver bekräftas.");
        const grossSek = Number(gross);
        const result = Domain.calculateSwedishWithholding({
            grossTaxableRegularIncome: grossSek,
            taxYear: profile.taxYear,
            tableNumber: profile.tableNumber,
            column: profile.column,
            payrollPeriod: profile.payrollPeriod,
            incomeType: profile.incomeType,
            adjustment: {
                kind: profile.adjustmentType,
                ...profile.adjustmentValue === null ? {} : {
                    value: profile.adjustmentValue
                }
            }
        });
        return {
            employerId,
            gross,
            regularTax: String(result.regularTax),
            oneOffGross: String(result.oneOffGross),
            oneOffTax: String(result.oneOffTax),
            totalTax: String(result.totalPreliminaryTax),
            net: String(result.estimatedNet),
            tableNumber: result.tableNumber,
            column: result.column,
            taxYear: result.taxYear,
            datasetVersion: result.datasetVersion,
            authority: "Skatteverket",
            provenance: result.provenance,
            adjustmentType: profile.adjustmentType,
            adjustmentValue: profile.adjustmentValue
        };
    }
    async completeOnboarding(input) {
        await this.#mutate((archive)=>{
            if (archive.profile !== null) throw new Domain.DomainError("invalidArchive");
            Domain.validateText(input.name);
            Domain.validateText(input.employerName);
            const rate = Domain.parseRate(input.hourlyRate, "1000000").toString();
            const profileID = Domain.makeID();
            const employerID = Domain.makeID();
            const employmentID = Domain.makeID();
            archive.profile = {
                id: profileID,
                name: input.name,
                language: input.language,
                timeZoneId: "Europe/Stockholm"
            };
            archive.preferences = {
                ...archive.preferences,
                language: input.language,
                timeZoneId: "Europe/Stockholm"
            };
            archive.employers.push({
                id: employerID,
                name: input.employerName
            });
            archive.employments.push({
                id: employmentID,
                employerId: employerID,
                validFrom: "2000-01-01T00:00:00Z",
                validUntil: null,
                contractLabel: null
            });
            archive.payRates.push({
                id: Domain.makeID(),
                employmentId: employmentID,
                validFrom: "2000-01-01T00:00:00Z",
                validUntil: null,
                hourlyRate: rate,
                currency: "SEK"
            });
            return Storage.validateArchive(archive);
        });
    }
    async saveProfile(input) {
        await this.#mutate((archive)=>{
            if (!archive.profile) throw new Domain.DomainError("invalidArchive");
            Domain.validateText(input.name);
            archive.profile = {
                ...archive.profile,
                name: input.name,
                language: input.language
            };
            archive.preferences = {
                ...archive.preferences,
                language: input.language
            };
            return Storage.validateArchive(archive);
        });
    }
    async saveEmployer(input) {
        await this.#mutate((archive)=>{
            Domain.validateText(input.name);
            if (input.id) {
                const index = archive.employers.findIndex((value)=>value.id === input.id);
                if (index < 0) throw new Domain.DomainError("missingEmployment");
                archive.employers[index] = {
                    ...archive.employers[index],
                    name: input.name
                };
                return Storage.validateArchive(archive);
            }
            const employerID = Domain.makeID();
            archive.employers.push({
                id: employerID,
                name: input.name
            });
            archive.employments.push({
                id: Domain.makeID(),
                employerId: employerID,
                validFrom: "2000-01-01T00:00:00Z",
                validUntil: null,
                contractLabel: null
            });
            return Storage.validateArchive(archive);
        });
    }
    async archiveEmployer(employerId, archived) {
        const archive = (await this.#current()).archive;
        if (!archive.employers.some((value)=>value.id === employerId)) throw new Domain.DomainError("missingEmployment");
        if (!this.#store.saveEmployerState) throw new Error("Employer state storage is unavailable.");
        await this.#store.saveEmployerState({
            employerId,
            archived,
            updatedAt: nowInstant()
        });
        for (const listener of this.#listeners)listener();
    }
    async previewDeleteEmployer(employerId) {
        const archive = (await this.#current()).archive;
        if (!archive.employers.some((value)=>value.id === employerId)) throw new Domain.DomainError("missingEmployment");
        const employmentIds = new Set(archive.employments.filter((value)=>value.employerId === employerId).map((value)=>value.id));
        return {
            employerId,
            payRates: archive.payRates.filter((value)=>employmentIds.has(value.employmentId)).length,
            shifts: archive.shifts.filter((value)=>employmentIds.has(value.employmentId)).length,
            ruleSets: archive.ruleSets.filter((value)=>employmentIds.has(value.employmentId)).length,
            recurrences: archive.recurrences.filter((value)=>employmentIds.has(value.employmentId)).length,
            hasTaxProfile: Boolean(await this.#store.getTaxProfile?.(employerId)),
            hasEmployerProfile: Boolean(await this.#store.getEmployerProfile?.(employerId))
        };
    }
    async deleteEmployer(employerId) {
        if (!this.#store.deleteEmployerData) throw new Error("Transactional employer deletion is unavailable.");
        const current = await this.#current();
        const archive = structuredClone(current.archive);
        if (!archive.employers.some((value)=>value.id === employerId)) throw new Domain.DomainError("missingEmployment");
        const employmentIds = new Set(archive.employments.filter((value)=>value.employerId === employerId).map((value)=>value.id));
        const shiftIds = archive.shifts.filter((value)=>employmentIds.has(value.employmentId)).map((value)=>value.id);
        const shiftSet = new Set(shiftIds);
        archive.employers = archive.employers.filter((value)=>value.id !== employerId);
        archive.employments = archive.employments.filter((value)=>!employmentIds.has(value.id));
        archive.payRates = archive.payRates.filter((value)=>!employmentIds.has(value.employmentId));
        archive.ruleSets = archive.ruleSets.filter((value)=>!employmentIds.has(value.employmentId));
        archive.shifts = archive.shifts.filter((value)=>!employmentIds.has(value.employmentId));
        archive.recurrences = archive.recurrences.filter((value)=>!employmentIds.has(value.employmentId));
        archive.calculationHistory = archive.calculationHistory.filter((value)=>!shiftSet.has(value.shiftId) && value.employerSnapshot.id !== employerId);
        await this.#store.deleteEmployerData(Storage.validateArchive(archive), current.fingerprint, employerId, shiftIds);
        for (const listener of this.#listeners)listener();
    }
    async previewRateChange(input) {
        const archive = (await this.#current()).archive;
        const employment = archive.employments.find((value)=>value.employerId === input.employerId);
        if (!employment) throw new Domain.DomainError("missingEmployment");
        const existingOnDate = archive.payRates.find((value)=>value.employmentId === employment.id && dateKey(partsFor(value.validFrom, archive.preferences.timeZoneId)) === input.validFrom);
        const instant = existingOnDate?.validFrom ?? Domain.resolveLocalTime(parseDate(input.validFrom), 0, 0, archive.preferences.timeZoneId);
        const existing = archive.payRates.find((value)=>value.employmentId === employment.id && value.validFrom === instant);
        const previous = existing ?? archive.payRates.find((value)=>value.employmentId === employment.id && value.validFrom < instant && (value.validUntil === null || value.validUntil > instant));
        return {
            previousRate: previous?.hourlyRate ?? null,
            affectedShiftIds: previous ? archive.shifts.filter((value)=>value.payRateVersionId === previous.id && (existing !== undefined || value.start >= instant)).map((value)=>value.id) : []
        };
    }
    async previewDeletePayRate(rateId) {
        const archive = (await this.#current()).archive;
        const rate = archive.payRates.find((value)=>value.id === rateId);
        if (!rate) throw new Domain.DomainError("missingPayRateVersion");
        const employment = archive.employments.find((value)=>value.id === rate.employmentId);
        const ordered = archive.payRates.filter((value)=>value.employmentId === rate.employmentId).sort((a, b)=>a.validFrom.localeCompare(b.validFrom));
        const index = ordered.findIndex((value)=>value.id === rate.id);
        const replacementRateIds = [
            ordered[index - 1]?.id,
            ordered[index + 1]?.id
        ].filter((value)=>Boolean(value));
        const shiftCount = archive.shifts.filter((value)=>value.payRateVersionId === rate.id).length;
        const now = nowInstant();
        const isCurrent = rate.validFrom <= now && (rate.validUntil === null || now < rate.validUntil);
        return {
            rateId,
            employerId: employment.employerId,
            hourlyRate: rate.hourlyRate,
            validFrom: dateKey(partsFor(rate.validFrom, archive.preferences.timeZoneId)),
            validTo: rate.validUntil ? dateKey(partsFor(rate.validUntil, archive.preferences.timeZoneId)) : null,
            shiftCount,
            calculationCount: archive.calculationHistory.filter((value)=>value.payRateSnapshot.id === rate.id).length,
            requiresReplacement: shiftCount > 0 || isCurrent,
            isCurrent,
            replacementRateIds,
            gapFrom: dateKey(partsFor(rate.validFrom, archive.preferences.timeZoneId)),
            gapTo: rate.validUntil ? dateKey(partsFor(rate.validUntil, archive.preferences.timeZoneId)) : null
        };
    }
    async deletePayRate(rateId, replacementRateId) {
        await this.#mutate((archive)=>{
            const rate = archive.payRates.find((value)=>value.id === rateId);
            if (!rate) throw new Domain.DomainError("missingPayRateVersion");
            const relatedShifts = archive.shifts.filter((value)=>value.payRateVersionId === rate.id);
            const now = nowInstant();
            const isCurrent = rate.validFrom <= now && (rate.validUntil === null || now < rate.validUntil);
            const ordered = archive.payRates.filter((value)=>value.employmentId === rate.employmentId).sort((a, b)=>a.validFrom.localeCompare(b.validFrom));
            const index = ordered.findIndex((value)=>value.id === rate.id);
            const allowed = new Set([
                ordered[index - 1]?.id,
                ordered[index + 1]?.id
            ].filter(Boolean));
            const replacement = replacementRateId && allowed.has(replacementRateId) ? archive.payRates.find((value)=>value.id === replacementRateId) : undefined;
            if ((relatedShifts.length > 0 || isCurrent) && !replacement) throw new Domain.DomainError("missingPayRateVersion");
            if (replacementRateId && !replacement) throw new Domain.DomainError("missingPayRateVersion");
            if (replacement) {
                if (replacement.validFrom < rate.validFrom) replacement.validUntil = rate.validUntil;
                else if (replacement.validFrom > rate.validFrom) replacement.validFrom = rate.validFrom;
                else throw new Domain.DomainError("invalidText");
                const repository = Domain.InMemoryPlanningRepository.fromArchive(storageArchiveToDomain(Storage.validateArchive(archive)));
                for (const state of repository.activeStates())if (state.shift.payRateVersionID === rate.id) repository.update(state.shift.id, {
                    ...state.shift,
                    payRateVersionID: replacement.id
                }, state.revision);
                archive = archiveWithDomain(archive, repository.archive());
            }
            archive.payRates = archive.payRates.filter((value)=>value.id !== rate.id);
            return Storage.validateArchive(archive);
        });
    }
    async saveEmployerProfile(input) {
        const archive = (await this.#current()).archive;
        if (!archive.employers.some((employer)=>employer.id === input.employerId)) throw new Domain.DomainError("missingEmployment");
        if (!this.#store.saveEmployerProfile) throw new Error("Employer profile storage is unavailable.");
        const existing = await this.#store.getEmployerProfile?.(input.employerId);
        const instant = nowInstant();
        await this.#store.saveEmployerProfile({
            ...input,
            createdAt: existing?.createdAt ?? instant,
            updatedAt: instant
        });
        for (const listener of this.#listeners)listener();
    }
    async saveRate(input) {
        await this.#mutate((archive)=>{
            const employment = archive.employments.find((value)=>value.employerId === input.employerId);
            if (!employment) throw new Domain.DomainError("missingEmployment");
            const zone = archive.preferences.timeZoneId;
            const existingOnDate = archive.payRates.find((value)=>value.employmentId === employment.id && dateKey(partsFor(value.validFrom, zone)) === input.validFrom);
            const validFrom = existingOnDate?.validFrom ?? Domain.resolveLocalTime(parseDate(input.validFrom), 0, 0, zone);
            const requestedUntil = input.validTo ? Domain.resolveLocalTime(parseDate(input.validTo), 0, 0, zone) : null;
            const hourlyRate = Domain.parseRate(input.hourlyRate, "1000000").toString();
            const correction = archive.payRates.find((value)=>value.employmentId === employment.id && value.validFrom === validFrom);
            if (correction) {
                correction.hourlyRate = hourlyRate;
                correction.validUntil = requestedUntil ?? correction.validUntil;
                const validated = Storage.validateArchive(archive);
                const repository = Domain.InMemoryPlanningRepository.fromArchive(storageArchiveToDomain(validated));
                for (const state of repository.activeStates())if (state.shift.payRateVersionID === correction.id) repository.recalculate(state.shift.id, state.revision);
                return archiveWithDomain(validated, repository.archive());
            }
            const next = archive.payRates.filter((value)=>value.employmentId === employment.id && value.validFrom > validFrom).sort((a, b)=>a.validFrom.localeCompare(b.validFrom))[0];
            if (requestedUntil !== null && next && requestedUntil > next.validFrom) throw new Domain.DomainError("invalidText");
            const validUntil = requestedUntil ?? next?.validFrom ?? null;
            const previous = archive.payRates.find((value)=>value.employmentId === employment.id && value.validFrom < validFrom && (value.validUntil === null || value.validUntil > validFrom));
            const newRate = {
                id: Domain.makeID(),
                employmentId: employment.id,
                validFrom,
                validUntil,
                hourlyRate,
                currency: "SEK"
            };
            archive.payRates.push(newRate);
            const repository = Domain.InMemoryPlanningRepository.fromArchive(storageArchiveToDomain(Storage.validateArchive(archive)));
            if (previous) {
                for (const state of repository.activeStates())if (state.shift.payRateVersionID === previous.id && state.shift.start >= validFrom) repository.update(state.shift.id, {
                    ...state.shift,
                    payRateVersionID: newRate.id
                }, state.revision);
            }
            const updated = archiveWithDomain(archive, repository.archive());
            const previousInUpdated = previous ? updated.payRates.find((value)=>value.id === previous.id) : null;
            if (previousInUpdated) previousInUpdated.validUntil = validFrom;
            return Storage.validateArchive(updated);
        });
    }
    async saveRuleSet(input) {
        await this.#mutate((archive)=>{
            const employment = archive.employments.find((value)=>value.employerId === input.employerId);
            if (!employment) throw new Domain.DomainError("missingEmployment");
            Domain.validateText(input.name);
            const zone = archive.preferences.timeZoneId;
            const validFrom = Domain.resolveLocalTime(parseDate(input.validFrom), 0, 0, zone);
            const validUntil = input.validTo ? Domain.resolveLocalTime(parseDate(input.validTo), 0, 0, zone) : null;
            const ruleUntil = validUntil ?? farRuleEnd();
            const rules = input.rules.map((rule, index)=>({
                    id: `user-rule-${index + 1}-${Domain.makeID().slice(0, 8)}`,
                    version: input.name,
                    source: "User-defined in LönKoll; not a verified collective agreement",
                    note: rule.name,
                    validFrom,
                    validUntil: ruleUntil,
                    weekdays: [
                        ...rule.weekdays
                    ],
                    startMinute: minuteFromText(rule.startTime),
                    endMinute: minuteFromText(rule.endTime),
                    premium: {
                        kind: rule.kind === "fixed" ? "fixedHourly" : "percentageOfBase",
                        amount: Domain.parseRate(rule.value, rule.kind === "fixed" ? "1000000" : "10000").toString()
                    }
                }));
            archive.ruleSets.push({
                id: Domain.makeID(),
                employmentId: employment.id,
                version: input.name,
                validFrom,
                validUntil,
                rules,
                overlapPolicy: input.overlapPolicy,
                rounding: input.rounding
            });
            return Storage.validateArchive(archive);
        });
    }
    #breaksFromInput(input, start, end) {
        const startDate = parseDate(input.date);
        const startMinute = minuteFromText(input.startTime);
        const endDate = parseDate(input.endDate);
        const result = input.breaks.map((pause)=>{
            const pauseStartMinute = minuteFromText(pause.startTime);
            const pauseEndMinute = minuteFromText(pause.endTime);
            const inferredStartDate = Domain.compareCivilDates(startDate, endDate) < 0 && pauseStartMinute < startMinute ? endDate : startDate;
            const pauseStartDate = pause.startDate ? parseDate(pause.startDate) : inferredStartDate;
            const pauseEndDate = pause.endDate ? parseDate(pause.endDate) : pauseEndMinute <= pauseStartMinute ? Domain.addCivilDays(pauseStartDate, 1) : pauseStartDate;
            return {
                start: Domain.resolveLocalTime(pauseStartDate, pauseStartMinute, 0, input.timeZone),
                end: Domain.resolveLocalTime(pauseEndDate, pauseEndMinute, 0, input.timeZone),
                isPaid: pause.isPaid,
                eligibleForOB: pause.eligibleForPremium
            };
        });
        Domain.canonicalPayrollShift({
            start,
            end,
            timeZoneID: input.timeZone,
            hourlyRate: "0",
            breaks: result
        });
        return result;
    }
    #bulkPlan(archive, input) {
        const dates = [
            ...new Set(input.dates)
        ].sort();
        if (!dates.length) throw new Domain.DomainError("invalidText");
        const employment = archive.employments.find((value)=>value.employerId === input.employerId);
        if (!employment) throw new Domain.DomainError("missingEmployment");
        const repository = Domain.InMemoryPlanningRepository.fromArchive(storageArchiveToDomain(archive));
        const byDate = new Map();
        for (const state of repository.activeStates()){
            const parts = partsFor(state.shift.start, state.shift.timeZoneID);
            const date = `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
            const states = byDate.get(date) ?? [];
            states.push(state);
            byDate.set(date, states);
        }
        const createDates = [];
        const updateDates = [];
        const conflictDates = [];
        const creations = [];
        const updates = [];
        for (const date of dates){
            const existing = byDate.get(date) ?? [];
            if (input.mode === "create" && existing.length) {
                conflictDates.push(date);
                continue;
            }
            if (input.mode === "replace" && existing.length > 1) {
                conflictDates.push(date);
                continue;
            }
            const startDate = parseDate(date);
            const startMinute = minuteFromText(input.startTime);
            const endMinute = minuteFromText(input.endTime);
            const endDate = endMinute <= startMinute ? Domain.addCivilDays(startDate, 1) : startDate;
            const start = Domain.resolveLocalTime(startDate, startMinute, 0, input.timeZone);
            const end = Domain.resolveLocalTime(endDate, endMinute, 0, input.timeZone);
            const shiftInput = {
                employerId: input.employerId,
                rateVersionId: input.rateVersionId,
                ...input.ruleSetVersionId ? {
                    ruleSetVersionId: input.ruleSetVersionId
                } : {},
                date,
                startTime: input.startTime,
                endDate: `${String(endDate.year).padStart(4, "0")}-${String(endDate.month).padStart(2, "0")}-${String(endDate.day).padStart(2, "0")}`,
                endTime: input.endTime,
                timeZone: input.timeZone,
                status: input.status,
                breaks: input.breaks
            };
            const shift = {
                id: existing[0]?.shift.id ?? Domain.makeID(),
                employmentID: employment.id,
                payRateVersionID: input.rateVersionId,
                ruleSetVersionID: input.ruleSetVersionId ?? null,
                start,
                end,
                timeZoneID: input.timeZone,
                breaks: this.#breaksFromInput(shiftInput, start, end),
                status: input.status
            };
            if (existing.length === 1) {
                updates.push({
                    state: existing[0],
                    shift
                });
                updateDates.push(date);
            } else {
                creations.push(shift);
                createDates.push(date);
            }
        }
        repository.createBatch(creations);
        for (const { state, shift } of updates)repository.update(state.shift.id, shift, state.revision);
        return {
            result: {
                createDates,
                updateDates,
                conflictDates
            },
            archive: archiveWithDomain(archive, repository.archive())
        };
    }
    async previewBulkShifts(input) {
        const current = await this.#store.load();
        const archive = current?.archive ?? Storage.emptyArchive(nowInstant(), WEB_APP_VERSION);
        return this.#bulkPlan(structuredClone(archive), input).result;
    }
    async applyBulkShifts(input) {
        let result = {
            createDates: [],
            updateDates: [],
            conflictDates: []
        };
        let createdIDs = [];
        await this.#mutate((archive)=>{
            const before = new Set(archive.shifts.map((shift)=>shift.id));
            const planned = this.#bulkPlan(archive, input);
            result = planned.result;
            createdIDs = planned.archive.shifts.filter((shift)=>!before.has(shift.id)).map((shift)=>shift.id);
            return planned.archive;
        });
        await this.#store.saveShiftStatusModes?.(createdIDs.map((shiftId)=>({
                shiftId,
                mode: input.status === "planned" ? "automatic" : "manual",
                updatedAt: nowInstant()
            })));
        return result;
    }
    async previewDeleteShifts(ids) {
        const unique = [
            ...new Set(ids)
        ];
        const archive = (await this.#current()).archive;
        const known = new Set(archive.shifts.map((shift)=>shift.id));
        return {
            affectedIds: unique.filter((id)=>known.has(id)),
            conflictIds: unique.filter((id)=>!known.has(id))
        };
    }
    async deleteShifts(ids) {
        const unique = [
            ...new Set(ids)
        ];
        if (!unique.length) throw new Domain.DomainError("invalidText");
        await this.#mutate((archive)=>{
            const repository = Domain.InMemoryPlanningRepository.fromArchive(storageArchiveToDomain(archive));
            const states = unique.map((id)=>repository.activeStates().find((state)=>state.shift.id === id));
            if (states.some((state)=>!state)) throw new Domain.DomainError("shiftNotFound");
            for (const state of states)repository.delete(state.shift.id, state.revision);
            return archiveWithDomain(archive, repository.archive());
        });
    }
    async setShiftStatuses(ids, status) {
        const unique = [
            ...new Set(ids)
        ];
        if (!unique.length) throw new Domain.DomainError("invalidText");
        await this.#mutate((archive)=>{
            const repository = Domain.InMemoryPlanningRepository.fromArchive(storageArchiveToDomain(archive));
            const states = unique.map((id)=>repository.activeStates().find((state)=>state.shift.id === id));
            if (states.some((state)=>!state)) throw new Domain.DomainError("shiftNotFound");
            for (const state of states)repository.update(state.shift.id, {
                ...state.shift,
                status
            }, state.revision);
            return archiveWithDomain(archive, repository.archive());
        });
        await this.#store.saveShiftStatusModes?.([
            ...new Set(ids)
        ].map((shiftId)=>({
                shiftId,
                mode: "manual",
                updatedAt: nowInstant()
            })));
    }
    async reconcileAutomaticStatuses(nowEpochSeconds = Math.floor(Date.now() / 1_000)) {
        if (!Number.isSafeInteger(nowEpochSeconds)) throw new Domain.DomainError("invalidText");
        const current = await this.#current();
        const storedModes = await this.#store.getShiftStatusModes?.() ?? [];
        const modeById = new Map(storedModes.map((value)=>[
                value.shiftId,
                value.mode
            ]));
        const missingPlanned = current.archive.shifts.filter((shift)=>shift.status === "planned" && !modeById.has(shift.id));
        if (missingPlanned.length) {
            const updatedAt = nowInstant();
            await this.#store.saveShiftStatusModes?.(missingPlanned.map((shift)=>({
                    shiftId: shift.id,
                    mode: "automatic",
                    updatedAt
                })));
            for (const shift of missingPlanned)modeById.set(shift.id, "automatic");
        }
        const automatic = new Set([
            ...modeById
        ].filter(([, mode])=>mode === "automatic").map(([shiftId])=>shiftId));
        if (!automatic.size) return 0;
        if (!current.archive.shifts.some((shift)=>automatic.has(shift.id) && shift.status === "planned" && Domain.epochSeconds(shift.end) <= nowEpochSeconds)) return 0;
        let changed = 0;
        await this.#mutate((archive)=>{
            const repository = Domain.InMemoryPlanningRepository.fromArchive(storageArchiveToDomain(archive));
            for (const state of repository.activeStates())if (automatic.has(state.shift.id) && state.shift.status === "planned" && Domain.epochSeconds(state.shift.end) <= nowEpochSeconds) {
                repository.update(state.shift.id, {
                    ...state.shift,
                    status: "worked"
                }, state.revision);
                changed += 1;
            }
            return changed ? archiveWithDomain(archive, repository.archive()) : archive;
        });
        return changed;
    }
    #patchExistingPlan(archive, ids, patch) {
        const unique = [
            ...new Set(ids)
        ];
        const changedFields = Object.keys(patch).filter((key)=>patch[key] !== undefined);
        if (!unique.length || !changedFields.length) throw new Domain.DomainError("invalidText");
        const repository = Domain.InMemoryPlanningRepository.fromArchive(storageArchiveToDomain(archive));
        const states = unique.map((id)=>repository.activeStates().find((state)=>state.shift.id === id));
        const conflictIds = unique.filter((_, index)=>!states[index]);
        if (conflictIds.length) return {
            archive,
            preview: {
                affectedIds: [],
                conflictIds,
                changedFields
            }
        };
        for (const state of states){
            const current = state.shift;
            const startParts = partsFor(current.start, current.timeZoneID);
            const date = dateKey(startParts);
            const startTime = patch.startTime ?? timeText(startParts.hour, startParts.minute);
            const endParts = partsFor(current.end, current.timeZoneID);
            const endTime = patch.endTime ?? timeText(endParts.hour, endParts.minute);
            const startMinute = minuteFromText(startTime);
            const endMinute = minuteFromText(endTime);
            const endDate = endMinute <= startMinute ? Domain.addCivilDays(parseDate(date), 1) : parseDate(date);
            const employment = patch.employerId ? archive.employments.find((value)=>value.employerId === patch.employerId) : null;
            if (patch.employerId && !employment) throw new Domain.DomainError("missingEmployment");
            const shiftInput = {
                employerId: patch.employerId ?? archive.employments.find((value)=>value.id === current.employmentID).employerId,
                rateVersionId: patch.rateVersionId ?? current.payRateVersionID,
                ...patch.ruleSetVersionId === null ? {} : {
                    ruleSetVersionId: patch.ruleSetVersionId ?? current.ruleSetVersionID ?? undefined
                },
                date,
                startTime,
                endDate: dateKey(endDate),
                endTime,
                timeZone: current.timeZoneID,
                status: patch.status ?? current.status,
                breaks: patch.breaks ?? current.breaks.map((pause)=>{
                    const start = partsFor(pause.start, current.timeZoneID);
                    const end = partsFor(pause.end, current.timeZoneID);
                    return {
                        startDate: dateKey(start),
                        startTime: timeText(start.hour, start.minute),
                        endDate: dateKey(end),
                        endTime: timeText(end.hour, end.minute),
                        isPaid: pause.isPaid,
                        eligibleForPremium: pause.eligibleForOB
                    };
                })
            };
            const start = Domain.resolveLocalTime(parseDate(date), startMinute, 0, current.timeZoneID);
            const end = Domain.resolveLocalTime(endDate, endMinute, 0, current.timeZoneID);
            repository.update(current.id, {
                ...current,
                employmentID: employment?.id ?? current.employmentID,
                payRateVersionID: patch.rateVersionId ?? current.payRateVersionID,
                ruleSetVersionID: patch.ruleSetVersionId === undefined ? current.ruleSetVersionID : patch.ruleSetVersionId,
                start,
                end,
                breaks: patch.breaks ? this.#breaksFromInput(shiftInput, start, end) : current.breaks,
                status: patch.status ?? current.status
            }, state.revision);
        }
        return {
            archive: archiveWithDomain(archive, repository.archive()),
            preview: {
                affectedIds: unique,
                conflictIds: [],
                changedFields
            }
        };
    }
    async previewPatchShifts(ids, patch) {
        return this.#patchExistingPlan(structuredClone((await this.#current()).archive), ids, patch).preview;
    }
    async patchShifts(ids, patch) {
        let preview;
        await this.#mutate((archive)=>{
            const plan = this.#patchExistingPlan(archive, ids, patch);
            if (plan.preview.conflictIds.length) throw new Domain.DomainError("shiftNotFound");
            preview = plan.preview;
            return plan.archive;
        });
        if (patch.status !== undefined) await this.#store.saveShiftStatusModes?.(preview.affectedIds.map((shiftId)=>({
                shiftId,
                mode: "manual",
                updatedAt: nowInstant()
            })));
        return preview;
    }
    #duplicateExistingPlan(archive, input) {
        const dates = [
            ...new Set(input.dates)
        ].sort();
        if (!dates.length) throw new Domain.DomainError("invalidText");
        const repository = Domain.InMemoryPlanningRepository.fromArchive(storageArchiveToDomain(archive));
        const source = repository.activeStates().find((state)=>state.shift.id === input.sourceId);
        if (!source) throw new Domain.DomainError("shiftNotFound");
        const byDate = new Map();
        for (const state of repository.activeStates()){
            const key = dateKey(partsFor(state.shift.start, state.shift.timeZoneID));
            byDate.set(key, [
                ...byDate.get(key) ?? [],
                state
            ]);
        }
        const createDates = [];
        const replaceDates = [];
        const conflictDates = [];
        for (const date of dates){
            const existing = byDate.get(date) ?? [];
            if (existing.length && input.conflictMode === "ignore") {
                conflictDates.push(date);
                continue;
            }
            if (existing.length) {
                for (const state of existing)repository.delete(state.shift.id, state.revision);
                replaceDates.push(date);
            } else createDates.push(date);
            const startParts = partsFor(source.shift.start, source.shift.timeZoneID);
            const endParts = partsFor(source.shift.end, source.shift.timeZoneID);
            const startDate = parseDate(date);
            const endDate = Domain.addCivilDays(startDate, endParts.hour * 60 + endParts.minute <= startParts.hour * 60 + startParts.minute ? 1 : 0);
            const start = Domain.resolveLocalTime(startDate, startParts.hour * 60 + startParts.minute, 0, source.shift.timeZoneID);
            const end = Domain.resolveLocalTime(endDate, endParts.hour * 60 + endParts.minute, 0, source.shift.timeZoneID);
            const dayOffset = civilDistance({
                year: startParts.year,
                month: startParts.month,
                day: startParts.day
            }, startDate);
            const breaks = source.shift.breaks.map((pause)=>({
                    ...pause,
                    start: Domain.translateLocalInstantByDays(Domain.epochSeconds(pause.start), dayOffset, source.shift.timeZoneID),
                    end: Domain.translateLocalInstantByDays(Domain.epochSeconds(pause.end), dayOffset, source.shift.timeZoneID)
                }));
            repository.create({
                ...source.shift,
                id: Domain.makeID(),
                start,
                end,
                breaks,
                status: "planned"
            });
        }
        return {
            archive: archiveWithDomain(archive, repository.archive()),
            preview: {
                createDates,
                replaceDates,
                conflictDates
            }
        };
    }
    async previewDuplicateShifts(input) {
        return this.#duplicateExistingPlan(structuredClone((await this.#current()).archive), input).preview;
    }
    async duplicateShifts(input) {
        let preview;
        let createdIDs = [];
        await this.#mutate((archive)=>{
            const before = new Set(archive.shifts.map((shift)=>shift.id));
            const plan = this.#duplicateExistingPlan(archive, input);
            preview = plan.preview;
            createdIDs = plan.archive.shifts.filter((shift)=>!before.has(shift.id)).map((shift)=>shift.id);
            return plan.archive;
        });
        await this.#store.saveShiftStatusModes?.(createdIDs.map((shiftId)=>({
                shiftId,
                mode: "automatic",
                updatedAt: nowInstant()
            })));
        return preview;
    }
    #planEmployerSchedule(archive, input) {
        if (input.timeZone !== "Europe/Stockholm" || !Array.isArray(input.shifts) || input.shifts.length === 0 || input.shifts.length > 200) throw new Domain.DomainError("invalidText");
        const employment = archive.employments.find((item)=>item.employerId === input.employerId);
        if (!employment) throw new Domain.DomainError("missingEmployment");
        const repository = Domain.InMemoryPlanningRepository.fromArchive(storageArchiveToDomain(archive));
        const createDates = [];
        const conflictDates = [];
        const createdIDs = [];
        const shifts = [
            ...input.shifts
        ].sort((a, b)=>(a.date + a.startTime).localeCompare(b.date + b.startTime));
        for (const imported of shifts){
            const start = Domain.resolveLocalTime(parseDate(imported.date), minuteFromText(imported.startTime), 0, input.timeZone);
            const end = Domain.resolveLocalTime(parseDate(imported.endDate), minuteFromText(imported.endTime), 0, input.timeZone);
            const existing = repository.activeStates().some((item)=>item.shift.employmentID === employment.id && Domain.epochSeconds(item.shift.start) < Domain.epochSeconds(end) && Domain.epochSeconds(item.shift.end) > Domain.epochSeconds(start));
            if (existing) {
                conflictDates.push(imported.date);
                continue;
            }
            const inputShift = {
                employerId: input.employerId,
                rateVersionId: input.rateVersionId,
                ruleSetVersionId: input.ruleSetVersionId,
                date: imported.date,
                startTime: imported.startTime,
                endDate: imported.endDate,
                endTime: imported.endTime,
                timeZone: input.timeZone,
                status: "planned",
                breaks: [
                    ...imported.breaks
                ]
            };
            const id = Domain.makeID();
            const shift = {
                id,
                employmentID: employment.id,
                payRateVersionID: input.rateVersionId,
                ruleSetVersionID: input.ruleSetVersionId ?? null,
                start,
                end,
                timeZoneID: input.timeZone,
                breaks: this.#breaksFromInput(inputShift, start, end),
                status: "planned"
            };
            repository.create(shift);
            createdIDs.push(id);
            createDates.push(imported.date);
        }
        return {
            archive: archiveWithDomain(archive, repository.archive()),
            preview: {
                createDates,
                conflictDates,
                importedCount: createDates.length,
                skippedCount: conflictDates.length
            },
            createdIDs
        };
    }
    async previewEmployerSchedule(input) {
        return this.#planEmployerSchedule(structuredClone((await this.#current()).archive), input).preview;
    }
    async applyEmployerSchedule(input) {
        let result = {
            createDates: [],
            conflictDates: [],
            importedCount: 0,
            skippedCount: 0
        };
        let ids = [];
        await this.#mutate((archive)=>{
            const planned = this.#planEmployerSchedule(archive, input);
            result = planned.preview;
            ids = planned.createdIDs;
            return planned.archive;
        });
        if (ids.length) await this.#store.saveShiftStatusModes?.(ids.map((shiftId)=>({
                shiftId,
                mode: "automatic",
                updatedAt: nowInstant()
            })));
        return result;
    }
    async saveShift(input) {
        let savedID = "";
        await this.#mutate((archive)=>{
            const domainArchive = storageArchiveToDomain(archive);
            const repository = Domain.InMemoryPlanningRepository.fromArchive(domainArchive);
            const employment = archive.employments.find((value)=>value.employerId === input.employerId);
            if (!employment) throw new Domain.DomainError("missingEmployment");
            const start = Domain.resolveLocalTime(parseDate(input.date), minuteFromText(input.startTime), 0, input.timeZone);
            const end = Domain.resolveLocalTime(parseDate(input.endDate), minuteFromText(input.endTime), 0, input.timeZone);
            const shift = {
                id: input.id ?? Domain.makeID(),
                employmentID: employment.id,
                payRateVersionID: input.rateVersionId,
                ruleSetVersionID: input.ruleSetVersionId ?? null,
                start,
                end,
                timeZoneID: input.timeZone,
                breaks: this.#breaksFromInput(input, start, end),
                status: input.status
            };
            const state = input.id ? repository.update(input.id, shift, input.expectedRevision ?? 0) : repository.create(shift);
            savedID = state.shift.id;
            return archiveWithDomain(archive, repository.archive());
        });
        await this.#store.saveShiftStatusModes?.([
            {
                shiftId: savedID,
                mode: input.statusMode ?? (input.id || input.status === "worked" ? "manual" : "automatic"),
                updatedAt: nowInstant()
            }
        ]);
        return savedID;
    }
    async deleteShift(id, expectedRevision) {
        await this.#mutate((archive)=>{
            const repository = Domain.InMemoryPlanningRepository.fromArchive(storageArchiveToDomain(archive));
            repository.delete(id, expectedRevision);
            return archiveWithDomain(archive, repository.archive());
        });
    }
    async duplicateShift(id, times) {
        let duplicateID = "";
        await this.#mutate((archive)=>{
            const repository = Domain.InMemoryPlanningRepository.fromArchive(storageArchiveToDomain(archive));
            const source = repository.shift(id).shift;
            const sourceStart = partsFor(source.start, source.timeZoneID);
            const targetDate = times ? parseDate(times.date) : Domain.addCivilDays(sourceStart, 7);
            const targetEndDate = times ? parseDate(times.endDate) : Domain.addCivilDays(partsFor(source.end, source.timeZoneID), 7);
            const start = Domain.resolveLocalTime(targetDate, times ? minuteFromText(times.startTime) : sourceStart.hour * 60 + sourceStart.minute, sourceStart.second, source.timeZoneID);
            const sourceEnd = partsFor(source.end, source.timeZoneID);
            const end = Domain.resolveLocalTime(targetEndDate, times ? minuteFromText(times.endTime) : sourceEnd.hour * 60 + sourceEnd.minute, sourceEnd.second, source.timeZoneID);
            const dayShift = civilDistance(sourceStart, targetDate);
            const breaks = source.breaks.map((pause)=>({
                    start: Domain.translateLocalInstantByDays(Domain.epochSeconds(pause.start), dayShift, source.timeZoneID),
                    end: Domain.translateLocalInstantByDays(Domain.epochSeconds(pause.end), dayShift, source.timeZoneID),
                    isPaid: pause.isPaid,
                    eligibleForOB: pause.eligibleForOB
                }));
            duplicateID = Domain.makeID();
            repository.duplicate(id, duplicateID, start, end, breaks);
            return archiveWithDomain(archive, repository.archive());
        });
        await this.#store.saveShiftStatusModes?.([
            {
                shiftId: duplicateID,
                mode: "automatic",
                updatedAt: nowInstant()
            }
        ]);
        return duplicateID;
    }
    async recalculateShift(id, expectedRevision) {
        await this.#mutate((archive)=>{
            const repository = Domain.InMemoryPlanningRepository.fromArchive(storageArchiveToDomain(archive));
            repository.recalculate(id, expectedRevision);
            return archiveWithDomain(archive, repository.archive());
        });
    }
    async copyWeek(sourceMonday, targetMonday) {
        let createdIDs = [];
        await this.#mutate((archive)=>{
            const repository = Domain.InMemoryPlanningRepository.fromArchive(storageArchiveToDomain(archive));
            const before = new Set(repository.activeStates().map((state)=>state.shift.id));
            repository.copyWeek(parseDate(sourceMonday), parseDate(targetMonday), archive.preferences.timeZoneId);
            createdIDs = repository.activeStates().map((state)=>state.shift.id).filter((id)=>!before.has(id));
            return archiveWithDomain(archive, repository.archive());
        });
        await this.#store.saveShiftStatusModes?.(createdIDs.map((shiftId)=>({
                shiftId,
                mode: "automatic",
                updatedAt: nowInstant()
            })));
    }
    async saveRecurrence(input) {
        let createdIDs = [];
        await this.#mutate((archive)=>{
            const repository = Domain.InMemoryPlanningRepository.fromArchive(storageArchiveToDomain(archive));
            const before = new Set(repository.activeStates().map((state)=>state.shift.id));
            const employment = archive.employments.find((value)=>value.employerId === input.employerId);
            if (!employment) throw new Domain.DomainError("missingEmployment");
            const id = Domain.makeID();
            const recurrence = {
                id,
                employmentID: employment.id,
                payRateVersionID: input.rateVersionId,
                ruleSetVersionID: input.ruleSetVersionId ?? null,
                startDate: parseDate(input.startDate),
                endDate: parseDate(input.endDate),
                weekdays: [
                    ...input.weekdays
                ],
                startMinute: minuteFromText(input.startTime),
                endMinute: minuteFromText(input.endTime),
                timeZoneID: input.timeZone,
                exceptions: input.exceptions.map(parseDate)
            };
            repository.createRecurrence(recurrence);
            createdIDs = repository.activeStates().map((state)=>state.shift.id).filter((shiftID)=>!before.has(shiftID));
            const storedRecurrence = {
                id,
                employmentId: employment.id,
                payRateVersionId: input.rateVersionId,
                ruleSetVersionId: input.ruleSetVersionId ?? null,
                startDate: input.startDate,
                endDate: input.endDate,
                weekdays: [
                    ...input.weekdays
                ],
                startMinute: recurrence.startMinute,
                endMinute: recurrence.endMinute,
                timeZoneId: input.timeZone,
                exceptions: [
                    ...input.exceptions
                ]
            };
            return archiveWithDomain(archive, repository.archive(), [
                ...archive.recurrences,
                storedRecurrence
            ]);
        });
        await this.#store.saveShiftStatusModes?.(createdIDs.map((shiftId)=>({
                shiftId,
                mode: "automatic",
                updatedAt: nowInstant()
            })));
    }
    async exportData() {
        const current = await this.#current();
        return Storage.exportArchiveJson(current.archive);
    }
    async importData(text, options) {
        if (options.replaceExisting !== true) throw new Storage.PlanningStorageError("confirmation-required", "Explicit replacement confirmation is required.");
        const run = this.#queue.then(async ()=>{
            const preview = await this.#store.previewImport(text);
            await this.#store.replaceConfirmed(preview, preview.confirmationToken);
            for (const listener of this.#listeners)listener();
        });
        this.#queue = run.then(()=>undefined, ()=>undefined);
        return run;
    }
    async clearAllData() {
        await this.#mutate(()=>Storage.emptyArchive(nowInstant(), WEB_APP_VERSION));
    }
}


//# sourceURL=application/adapter.ts