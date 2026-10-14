import { SKATTEVERKET_2026 } from "./generated/skatteverket2026.js";
export const SKATTEVERKET_2026_ONE_OFF = {
    1: [
        {
            from: 0,
            to: 25_041,
            percentage: 0
        },
        {
            from: 25_042,
            to: 82_800,
            percentage: 10
        },
        {
            from: 82_801,
            to: 192_000,
            percentage: 21
        },
        {
            from: 192_001,
            to: 477_600,
            percentage: 26
        },
        {
            from: 477_601,
            to: 660_000,
            percentage: 34
        },
        {
            from: 660_001,
            to: null,
            percentage: 54
        }
    ],
    2: [
        {
            from: 0,
            to: 65_800,
            percentage: 0
        },
        {
            from: 65_801,
            to: 477_600,
            percentage: 26
        },
        {
            from: 477_601,
            to: 660_000,
            percentage: 34
        },
        {
            from: 660_001,
            to: null,
            percentage: 55
        }
    ],
    3: [
        {
            from: 0,
            to: 25_041,
            percentage: 0
        },
        {
            from: 25_042,
            to: 331_200,
            percentage: 10
        },
        {
            from: 331_201,
            to: 477_600,
            percentage: 26
        },
        {
            from: 477_601,
            to: 660_000,
            percentage: 34
        },
        {
            from: 660_001,
            to: null,
            percentage: 55
        }
    ],
    4: [
        {
            from: 0,
            to: 25_041,
            percentage: 0
        },
        {
            from: 25_042,
            to: 54_000,
            percentage: 3
        },
        {
            from: 54_001,
            to: 192_000,
            percentage: 22
        },
        {
            from: 192_001,
            to: 660_000,
            percentage: 26
        },
        {
            from: 660_001,
            to: null,
            percentage: 46
        }
    ],
    5: [
        {
            from: 0,
            to: 25_041,
            percentage: 0
        },
        {
            from: 25_042,
            to: 32_400,
            percentage: 10
        },
        {
            from: 32_401,
            to: 160_800,
            percentage: 29
        },
        {
            from: 160_801,
            to: 184_800,
            percentage: 34
        },
        {
            from: 184_801,
            to: 660_000,
            percentage: 38
        },
        {
            from: 660_001,
            to: null,
            percentage: 54
        }
    ],
    6: [
        {
            from: 0,
            to: 25_041,
            percentage: 0
        },
        {
            from: 25_042,
            to: 160_800,
            percentage: 29
        },
        {
            from: 160_801,
            to: 184_800,
            percentage: 34
        },
        {
            from: 184_801,
            to: 660_000,
            percentage: 38
        },
        {
            from: 660_001,
            to: null,
            percentage: 54
        }
    ]
};
function wholeSek(value, name) {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${name} must be a non-negative whole SEK amount.`);
    return value;
}
function roundSek(value) {
    return Math.round(value);
}
function regularIncome(value) {
    if (!Number.isFinite(value) || value < 0) throw new Error("Regular income must be a non-negative SEK amount.");
    const ore = Math.round(value * 100);
    if (!Number.isSafeInteger(ore) || Math.abs(value * 100 - ore) > 1e-7) throw new Error("Regular income must be stated to whole öre.");
    return {
        gross: ore / 100,
        lookupSek: Math.floor(ore / 100)
    };
}
export function calculateSwedishWithholding(input, dataset = skatteverket2026()) {
    const { gross: regularGross, lookupSek: regularGrossLookupSek } = regularIncome(input.grossTaxableRegularIncome);
    const oneOffGross = wholeSek(input.oneOffGross ?? 0, "One-off income");
    if (input.incomeType !== "main") throw new Error("Secondary or unknown income needs an explicitly confirmed Skatteverket withholding rule.");
    const regular = taxValueFor(dataset, input.payrollPeriod, input.tableNumber, input.column, Math.max(1, regularGrossLookupSek));
    if (regular.kind !== "amount") throw new Error("The supplied SKV 433 material does not state the rounding rule for percentage rows; this income needs confirmation.");
    const band = SKATTEVERKET_2026_ONE_OFF[input.column].find((candidate)=>{
        const annual = wholeSek(input.annualIncomeForOneOff ?? 0, "Annual income");
        return annual >= candidate.from && (candidate.to === null || annual <= candidate.to);
    });
    if (!band) throw new Error("No official one-off interval covers the annual income.");
    let totalTax = regular.value + roundSek(oneOffGross * band.percentage / 100);
    const adjustment = input.adjustment ?? {
        kind: "none"
    };
    if (adjustment.kind === "percentage") totalTax = roundSek((regularGross + oneOffGross) * wholeSek(adjustment.value ?? 0, "Adjustment") / 100);
    if (adjustment.kind === "amount") totalTax = wholeSek(adjustment.value ?? 0, "Adjustment");
    const oneOffTax = adjustment.kind === "none" ? roundSek(oneOffGross * band.percentage / 100) : Math.max(0, totalTax - regular.value);
    const totalGross = Math.round((regularGross + oneOffGross) * 100) / 100;
    const estimatedNet = Math.round((totalGross - totalTax) * 100) / 100;
    return {
        regularGross,
        regularGrossLookupSek,
        regularTax: regular.value,
        oneOffGross,
        oneOffTax,
        totalGross,
        totalPreliminaryTax: totalTax,
        estimatedNet,
        tableNumber: input.tableNumber,
        column: input.column,
        taxYear: 2026,
        datasetVersion: dataset.sourceVersion,
        precisionStatus: "exact-table",
        provenance: `Skatteverket ${dataset.sourceVersion}; allmän tabell + SKV 433 engångstabell`
    };
}
function parseFixedInteger(value, line, field) {
    const text = value.trim();
    if (!/^\d+$/u.test(text)) throw new Error(`Skatteverket line ${line}: invalid ${field}.`);
    return Number(text);
}
function parseUpperIncome(value, line) {
    return value.trim() === "" ? null : parseFixedInteger(value, line, "upper income");
}
export function parseOfficialTaxTableText(text, expectedPeriod) {
    const expectedCode = expectedPeriod === "monthly" ? "30" : "14";
    const rows = [];
    for (const [index, raw] of text.replace(/^\uFEFF/u, "").split(/\r?\n/u).entries()){
        if (!raw) continue;
        if (raw.length < 49 || raw.slice(0, 2) !== expectedCode) throw new Error(`Skatteverket line ${index + 1}: invalid record.`);
        const marker = raw[2];
        if (marker !== "B" && marker !== "%") throw new Error(`Skatteverket line ${index + 1}: unsupported marker.`);
        const columns = Array.from({
            length: 6
        }, (_, column)=>({
                kind: marker === "B" ? "amount" : "percentage",
                value: parseFixedInteger(raw.slice(19 + column * 5, 24 + column * 5), index + 1, `column ${column + 1}`)
            }));
        rows.push({
            period: expectedPeriod,
            tableNumber: parseFixedInteger(raw.slice(3, 5), index + 1, "table number"),
            from: parseFixedInteger(raw.slice(5, 12), index + 1, "lower income"),
            to: parseUpperIncome(raw.slice(12, 19), index + 1),
            columns
        });
    }
    validateOfficialTaxRows(rows, expectedPeriod);
    return rows;
}
export function validateOfficialTaxRows(rows, period) {
    for (const table of new Set(rows.filter((row)=>row.period === period).map((row)=>row.tableNumber))){
        const tableRows = rows.filter((row)=>row.period === period && row.tableNumber === table).sort((left, right)=>left.from - right.from);
        if (!tableRows.length || tableRows[0].from !== 1) throw new Error(`Skatteverket table ${table}: missing first interval.`);
        for(let index = 0; index < tableRows.length; index += 1){
            const row = tableRows[index];
            if (row.to !== null && row.to < row.from || row.columns.length !== 6) throw new Error(`Skatteverket table ${table}: invalid interval.`);
            const next = tableRows[index + 1];
            if (next && (row.to === null || next.from !== row.to + 1)) throw new Error(`Skatteverket table ${table}: gap or overlap.`);
            if (!next && row.to !== null) throw new Error(`Skatteverket table ${table}: missing final open interval.`);
        }
    }
}
let cachedDataset;
export function skatteverket2026() {
    if (cachedDataset) return cachedDataset;
    const monthly = parseOfficialTaxTableText(SKATTEVERKET_2026.sources.monthly.text, "monthly");
    const fortnightly = parseOfficialTaxTableText(SKATTEVERKET_2026.sources.fortnightly.text, "fortnightly");
    cachedDataset = Object.freeze({
        taxYear: 2026,
        authority: "Skatteverket",
        sourceVersion: SKATTEVERKET_2026.sourceVersion,
        retrievedAt: SKATTEVERKET_2026.retrievedAt,
        verifiedAt: SKATTEVERKET_2026.verifiedAt,
        sourceHashes: {
            monthly: SKATTEVERKET_2026.sources.monthly.sha256,
            fortnightly: SKATTEVERKET_2026.sources.fortnightly.sha256
        },
        rows: Object.freeze([
            ...monthly,
            ...fortnightly
        ])
    });
    return cachedDataset;
}
export function taxValueFor(dataset, period, tableNumber, column, income) {
    if (!Number.isSafeInteger(income) || income < 1) throw new Error("Taxable income must be a positive whole SEK amount.");
    const row = dataset.rows.find((candidate)=>candidate.period === period && candidate.tableNumber === tableNumber && income >= candidate.from && (candidate.to === null || income <= candidate.to));
    if (!row) throw new Error("No official Skatteverket interval covers this income.");
    return row.columns[column - 1];
}


//# sourceURL=domain/tax.ts