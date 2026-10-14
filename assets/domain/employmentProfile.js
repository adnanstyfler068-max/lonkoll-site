export const SWEDISH_BRANCHES = [
    "warehouse-logistics",
    "retail",
    "transport",
    "industry",
    "construction",
    "hospitality",
    "healthcare",
    "municipal-region",
    "government",
    "it-technology",
    "office-administration",
    "cleaning-property",
    "other"
];
const emptyCandidate = Object.freeze({
    version: 1,
    occupations: [],
    union: null,
    employerOrganisation: null,
    validFrom: null,
    validTo: null,
    confidence: "needs-verification",
    officialSource: null,
    sourceUrl: null,
    retrievedAt: null,
    verifiedAt: null,
    obRules: [],
    overtimeRules: [],
    additionalHoursRules: [],
    holidayRules: [],
    localAgreementPossible: null,
    notes: "Candidate family name only; official terms not verified."
});
export const COLLECTIVE_AGREEMENT_CANDIDATES = Object.freeze([
    {
        ...emptyCandidate,
        id: "handels-warehouse-ecommerce",
        name: "Handels Lager och e-handel",
        branches: [
            "warehouse-logistics"
        ]
    },
    {
        ...emptyCandidate,
        id: "handels-retail",
        name: "Handels Butik",
        branches: [
            "retail"
        ]
    },
    {
        ...emptyCandidate,
        id: "transportavtalet",
        name: "Transportavtalet",
        branches: [
            "transport"
        ]
    },
    {
        ...emptyCandidate,
        id: "kompetensforetagen-staffing",
        name: "Kompetensföretagen / bemanning",
        branches: []
    },
    {
        ...emptyCandidate,
        id: "if-metall",
        name: "IF Metall",
        branches: [
            "industry"
        ]
    },
    {
        ...emptyCandidate,
        id: "kommunal",
        name: "Kommunal",
        branches: [
            "healthcare",
            "municipal-region"
        ]
    }
]);
export const SWEDISH_UNEMPLOYMENT_FUNDS = Object.freeze([
    "A-kassan Handels",
    "A-kassan Vision",
    "Akademikernas a-kassa",
    "Alfa-kassan",
    "Byggnads a-kassa",
    "Elektrikernas a-kassa",
    "Fastighets a-kassa",
    "Finans- och Försäkringsbranschens a-kassa",
    "GS a-kassa",
    "Hotell- och Restauranganställdas a-kassa",
    "IF Metalls a-kassa",
    "Journalisternas a-kassa",
    "Kommunals a-kassa",
    "Ledarnas a-kassa",
    "Livsmedelsarbetarnas a-kassa",
    "Lärarnas a-kassa",
    "Pappersindustriarbetarnas a-kassa",
    "Sekos a-kassa",
    "Småföretagarnas a-kassa",
    "STs a-kassa",
    "Sveriges arbetares a-kassa",
    "Säljarnas a-kassa",
    "Transports a-kassa",
    "Unionens a-kassa",
    "Jag vet inte vilken",
    "Ingen a-kassa"
]);
export function agreementCandidates(branch, employmentType) {
    return COLLECTIVE_AGREEMENT_CANDIDATES.filter((candidate)=>candidate.branches.includes(branch) || employmentType === "staffing" && candidate.id === "kompetensforetagen-staffing");
}


//# sourceURL=domain/employmentProfile.ts