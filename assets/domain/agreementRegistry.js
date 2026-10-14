import { canonicalRule } from "./models.js";
const family = (id, name, branches, sectors)=>({
        id,
        name,
        branches,
        sectors,
        status: "unverified"
    });
export const AGREEMENT_FAMILIES = [
    family("handels-lager", "Handels Lager och e-handel", [
        "warehouse-logistics"
    ], [
        "private"
    ]),
    family("handels-butik", "Handels Butik", [
        "retail"
    ], [
        "private"
    ]),
    family("transport", "Transportavtalet", [
        "transport"
    ], [
        "private"
    ]),
    family("bemanning", "Bemanningsavtalet", [
        "warehouse-logistics",
        "industry",
        "other"
    ], [
        "private",
        "public"
    ]),
    family("if-metall", "Teknikavtalet IF Metall", [
        "industry"
    ], [
        "private"
    ]),
    family("unionen", "Tjänstemannaavtal (välj exakt avtal)", [
        "office-administration",
        "it-technology"
    ], [
        "private"
    ]),
    family("bygg", "Byggavtalet", [
        "construction"
    ], [
        "private"
    ]),
    family("elektriker", "Installationsavtalet", [
        "construction"
    ], [
        "private"
    ]),
    family("hrf", "Hotell- och restaurangavtalet", [
        "hospitality"
    ], [
        "private"
    ]),
    family("privat-vard", "Privat vård (välj exakt avtal)", [
        "healthcare"
    ], [
        "private"
    ]),
    family("privat-skola", "Friskolor (välj exakt avtal)", [
        "other"
    ], [
        "private"
    ]),
    family("stadd", "Serviceentreprenad", [
        "cleaning-property"
    ], [
        "private"
    ]),
    family("fastighet", "Fastighetsavtal (välj exakt avtal)", [
        "cleaning-property"
    ], [
        "private"
    ]),
    family("livs", "Livsmedelsindustrin", [
        "industry"
    ], [
        "private"
    ]),
    family("apoteken", "Apoteksavtal (välj exakt avtal)", [
        "retail"
    ], [
        "private"
    ]),
    family("finans", "Bank och finans (välj exakt avtal)", [
        "office-administration"
    ], [
        "private"
    ]),
    family("skr-ab", "Kommuner och regioner AB / HÖK", [
        "municipal-region",
        "healthcare"
    ], [
        "public"
    ]),
    family("sobona", "Sobona (välj exakt avtal)", [
        "municipal-region",
        "other"
    ], [
        "public",
        "private"
    ]),
    family("larare", "Kommunala skolavtal", [
        "municipal-region",
        "other"
    ], [
        "public"
    ]),
    family("lakare", "Läkaravtal", [
        "healthcare",
        "municipal-region"
    ], [
        "public"
    ]),
    family("staten-ofr", "Statligt Villkorsavtal OFR", [
        "government"
    ], [
        "public"
    ]),
    family("staten-saco", "Statligt Villkorsavtal-T Saco", [
        "government"
    ], [
        "public"
    ]),
    family("staten-seko", "Statligt Villkorsavtal Seko", [
        "government"
    ], [
        "public"
    ])
];
export function agreementFamiliesFor(sector, branch) {
    return AGREEMENT_FAMILIES.filter((x)=>x.sectors.includes(sector) && (!branch || x.branches.includes(branch)));
}
function dateValid(s) {
    return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) && new Date(s + "T00:00:00Z").toISOString().slice(0, 10) === s;
}
export function resolveVerifiedObRules(id, date, versions = []) {
    if (!AGREEMENT_FAMILIES.some((x)=>x.id === id)) return {
        status: "unavailable",
        reason: "unknown",
        rules: []
    };
    if (!dateValid(date)) return {
        status: "unavailable",
        reason: "invalid-date",
        rules: []
    };
    const matches = versions.filter((x)=>x.agreementId === id && x.effectiveFrom <= date && date < x.effectiveUntil);
    if (matches.length !== 1) return {
        status: "unavailable",
        reason: matches.length ? "ambiguous" : "unverified-or-out-of-period",
        rules: []
    };
    const v = matches[0];
    if (!dateValid(v.effectiveFrom) || !dateValid(v.effectiveUntil) || !dateValid(v.verifiedAt) || !v.sourceDocument.trim() || !v.verifiedBy.trim() || !v.version.trim() || !v.localAgreementChecked || !v.userConfirmed || !v.rules.length || v.rules.length > 100) return {
        status: "unavailable",
        reason: "unverified-metadata",
        rules: []
    };
    try {
        const rules = v.rules.map((x)=>canonicalRule(x));
        if (new Set(rules.map((x)=>x.id)).size !== rules.length || rules.some((x)=>x.validFrom.slice(0, 10) < v.effectiveFrom || x.validUntil.slice(0, 10) > v.effectiveUntil)) return {
            status: "unavailable",
            reason: "invalid-rules",
            rules: []
        };
        return {
            status: "verified",
            rules,
            version: v.version
        };
    } catch  {
        return {
            status: "unavailable",
            reason: "invalid-rules",
            rules: []
        };
    }
}
export const AGREEMENT_PAY_COMPONENTS = Object.freeze([
    "base",
    "ob",
    "overtime",
    "mertid",
    "holidays",
    "vacation",
    "sick-pay",
    "standby",
    "oncall",
    "travel",
    "allowances",
    "pension"
]);
export function agreementCoverage(agreementId, date, versions = []) {
    const ob = resolveVerifiedObRules(agreementId, date, versions).status === "verified" ? "verified-ob-only" : "not-verified";
    return Object.freeze(Object.fromEntries(AGREEMENT_PAY_COMPONENTS.map((c)=>[
            c,
            c === "ob" ? ob : "not-verified"
        ])));
}


//# sourceURL=domain/agreementRegistry.ts