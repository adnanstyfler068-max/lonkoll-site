import { button, el, field } from "../dom.js";
import { AGREEMENT_FAMILIES, AGREEMENT_PAY_COMPONENTS, agreementCoverage, agreementFamiliesFor } from "../../domain/agreementRegistry.js";
import { readWorkspaceMode, saveWorkspaceMode } from "../../domain/workspace.js";
import { formatDate, formatMoney } from "../format.js";
import { isLanguage } from "../../i18n/index.js";
import { COLLECTIVE_AGREEMENT_CANDIDATES, SWEDISH_BRANCHES, SWEDISH_UNEMPLOYMENT_FUNDS, agreementCandidates } from "../../domain/index.js";
import { href } from "../router.js";
import { readImportFile, validateImportFile } from "../import-file.js";
import { emptyState, pageHeader } from "./shared.js";
const weekdays = [
    {
        value: 2,
        key: "weekday.monday"
    },
    {
        value: 3,
        key: "weekday.tuesday"
    },
    {
        value: 4,
        key: "weekday.wednesday"
    },
    {
        value: 5,
        key: "weekday.thursday"
    },
    {
        value: 6,
        key: "weekday.friday"
    },
    {
        value: 7,
        key: "weekday.saturday"
    },
    {
        value: 1,
        key: "weekday.sunday"
    }
];
function settingsLink(path, title, description, testid) {
    return el("a", {
        href: href(path),
        className: "settings-link",
        dataset: {
            testid
        }
    }, el("span", {}, el("strong", {
        text: title
    }), description ? el("small", {
        text: description
    }) : null), el("span", {
        "aria-hidden": "true",
        text: "›"
    }));
}
export function renderSettings(ctx) {
    return el("div", {
        className: "page"
    }, pageHeader(ctx, ctx.t("settings.title")), el("main", {
        id: "main-content",
        tabIndex: -1,
        className: "page-content stack",
        dataset: {
            testid: "settings-screen"
        }
    }, el("nav", {
        className: "settings-list",
        "aria-label": ctx.t("settings.title")
    }, settingsLink("settings/profile", ctx.t("settings.profile")), settingsLink("settings/employer-calendar", ctx.language === "sv" ? "Importera arbetsgivarens schema (.ics / .csv)" : "Import employer schedule (.ics / .csv)", undefined, "settings-roster"), settingsLink("settings/agreement-catalog", ctx.language === "sv" ? "Avtalskatalog: privat/offentlig sektor" : "Agreement catalogue: private/public sector"), settingsLink("settings/employers", ctx.t("settings.employers"), `${ctx.snapshot.employers.length}`), settingsLink("settings/rates", ctx.t("settings.rates"), `${ctx.snapshot.rates.length}`), settingsLink("settings/rules", ctx.t("settings.rules"), `${ctx.snapshot.ruleSets.length}`), settingsLink("settings/recurrences", ctx.t("settings.recurrences"), `${ctx.snapshot.recurrences.length}`), settingsLink("settings/tax", ctx.t("settings.tax"), undefined, "settings-tax"), settingsLink("settings/data", ctx.t("settings.data"), undefined, "settings-data"), settingsLink("settings/install", ctx.t("settings.install"))), el("section", {
        className: "notice",
        "aria-labelledby": "about-estimate"
    }, el("h2", {
        id: "about-estimate",
        text: ctx.t("about.title")
    }), el("p", {
        text: ctx.t("about.body")
    }))));
}
export function renderTax(ctx) {
    const employer = el("select", {
        required: true,
        dataset: {
            testid: "tax-employer"
        }
    }, ctx.snapshot.employers.map((item)=>el("option", {
            value: item.id,
            text: item.name
        })));
    const known = el("input", {
        type: "checkbox",
        dataset: {
            testid: "tax-known-table"
        }
    });
    const table = el("select", {
        required: true,
        disabled: true,
        dataset: {
            testid: "tax-table"
        }
    }, el("option", {
        value: "",
        text: ctx.t("common.none")
    }), ...Array.from({
        length: 14
    }, (_, index)=>el("option", {
            value: String(index + 29),
            text: String(index + 29)
        })));
    const column = el("select", {
        required: true,
        disabled: true,
        dataset: {
            testid: "tax-column"
        }
    }, el("option", {
        value: "",
        text: ctx.t("common.none")
    }), ...Array.from({
        length: 6
    }, (_, index)=>el("option", {
            value: String(index + 1),
            text: String(index + 1)
        })));
    const income = el("select", {
        required: true,
        dataset: {
            testid: "tax-income-type"
        }
    }, el("option", {
        value: "main",
        text: ctx.t("tax.mainIncome")
    }), el("option", {
        value: "secondary",
        text: ctx.t("tax.secondaryIncome")
    }), el("option", {
        value: "unknown",
        text: ctx.t("tax.unknownIncome")
    }));
    const period = el("select", {
        required: true,
        dataset: {
            testid: "tax-period"
        }
    }, el("option", {
        value: "monthly",
        text: ctx.t("tax.monthly")
    }), el("option", {
        value: "fortnightly",
        text: ctx.t("tax.fortnightly")
    }));
    const adjustment = el("select", {
        required: true
    }, el("option", {
        value: "none",
        text: ctx.t("tax.noAdjustment")
    }), el("option", {
        value: "percentage",
        text: ctx.t("tax.percentAdjustment")
    }), el("option", {
        value: "amount",
        text: ctx.t("tax.amountAdjustment")
    }));
    const adjustmentValue = el("input", {
        type: "number",
        min: "0",
        step: "1",
        disabled: true,
        dataset: {
            testid: "tax-adjustment"
        }
    });
    const confirmed = el("input", {
        type: "checkbox",
        dataset: {
            testid: "tax-confirmed"
        }
    });
    const month = el("input", {
        type: "month",
        required: true,
        value: ctx.snapshot.today.slice(0, 7),
        dataset: {
            testid: "tax-month"
        }
    });
    const result = el("section", {
        className: "summary-card stack",
        hidden: true,
        dataset: {
            testid: "tax-result"
        },
        "aria-live": "polite"
    });
    const load = ()=>{
        const profile = ctx.snapshot.taxProfiles.find((item)=>item.employerId === employer.value);
        known.checked = Boolean(profile?.tableNumber && profile?.column);
        table.disabled = !known.checked;
        column.disabled = !known.checked;
        table.value = profile?.tableNumber ? String(profile.tableNumber) : "";
        column.value = profile?.column ? String(profile.column) : "";
        income.value = profile?.incomeType ?? "main";
        period.value = profile?.payrollPeriod ?? "monthly";
        adjustment.value = profile?.adjustmentType ?? "none";
        adjustmentValue.disabled = adjustment.value === "none";
        adjustmentValue.required = adjustment.value !== "none";
        adjustmentValue.value = profile?.adjustmentValue === null || profile?.adjustmentValue === undefined ? "" : String(profile.adjustmentValue);
        confirmed.checked = profile?.confirmedByUser ?? false;
    };
    employer.addEventListener("change", load);
    known.addEventListener("change", ()=>{
        table.disabled = !known.checked;
        column.disabled = !known.checked;
    });
    adjustment.addEventListener("change", ()=>{
        adjustmentValue.disabled = adjustment.value === "none";
        adjustmentValue.required = adjustment.value !== "none";
    });
    load();
    const form = el("form", {
        className: "stack"
    }, field(ctx.t("tax.employer"), employer), el("label", {
        className: "check-row"
    }, known, el("span", {
        text: ctx.t("tax.knowTable")
    })), el("div", {
        className: "form-grid form-grid-two"
    }, field(ctx.t("tax.table"), table), field(ctx.t("tax.column"), column)), field(ctx.t("tax.incomeType"), income), field(ctx.t("tax.payrollPeriod"), period), field(ctx.t("tax.adjustment"), adjustment), field(ctx.t("tax.adjustmentValue"), adjustmentValue), el("label", {
        className: "check-row"
    }, confirmed, el("span", {
        text: ctx.t("tax.confirm")
    })), el("button", {
        type: "submit",
        className: "button button-primary",
        text: ctx.t("common.save"),
        dataset: {
            testid: "tax-save"
        }
    }));
    form.addEventListener("submit", (event)=>{
        event.preventDefault();
        if (!form.reportValidity()) return;
        void ctx.run(async ()=>{
            const adjustmentType = adjustment.value;
            await ctx.adapter.saveTaxProfile(employer.value, {
                employerId: employer.value,
                tableNumber: known.checked && table.value ? Number(table.value) : null,
                column: known.checked && column.value ? Number(column.value) : null,
                incomeType: income.value,
                payrollPeriod: period.value,
                adjustmentType,
                adjustmentValue: adjustmentType === "none" ? null : Number(adjustmentValue.value),
                confirmedByUser: confirmed.checked
            });
            await ctx.refresh("settings/tax");
        });
    });
    const calculate = el("button", {
        type: "button",
        className: "button button-primary",
        text: ctx.t("tax.calculate"),
        dataset: {
            testid: "tax-calculate"
        }
    });
    calculate.addEventListener("click", ()=>{
        if (!month.reportValidity()) return;
        void ctx.run(async ()=>{
            const snapshot = await ctx.adapter.loadSnapshot({
                summaryKind: "month",
                anchorDate: `${month.value}-01`
            });
            const summary = snapshot.monthlyTax.find((item)=>item.employerId === employer.value);
            result.hidden = false;
            if (!summary) {
                result.replaceChildren(el("p", {
                    className: "notice",
                    text: ctx.t("tax.unavailable")
                }));
                return;
            }
            const amounts = el("dl", {
                className: "metrics-grid"
            }, el("div", {}, el("dt", {
                text: ctx.t("summary.base")
            }), el("dd", {
                text: formatMoney(summary.baseAmount, ctx.language)
            })), el("div", {}, el("dt", {
                text: ctx.t("summary.ob")
            }), el("dd", {
                text: formatMoney(summary.premiumAmount, ctx.language)
            })), el("div", {
                className: "metric-total"
            }, el("dt", {
                text: ctx.t("tax.gross")
            }), el("dd", {
                text: formatMoney(summary.gross, ctx.language),
                dataset: {
                    testid: "tax-gross"
                }
            })));
            if (!summary.calculation) {
                const message = summary.unavailableReason === "unconfigured" ? ctx.t("tax.unconfigured") : summary.unavailableReason === "unconfirmed" ? ctx.t("tax.unconfirmed") : ctx.t("tax.unavailable");
                result.replaceChildren(el("h2", {
                    text: summary.employerName
                }), amounts, el("p", {
                    className: "notice",
                    text: message,
                    dataset: {
                        testid: "tax-unavailable"
                    }
                }));
                return;
            }
            const tax = summary.calculation;
            result.replaceChildren(el("h2", {
                text: summary.employerName
            }), amounts, el("p", {
                text: `${ctx.t("tax.table")} ${tax.tableNumber} · ${ctx.t("tax.column")} ${tax.column}`
            }), el("p", {
                text: ctx.t("tax.exactTable"),
                dataset: {
                    testid: "tax-precision"
                }
            }), el("p", {
                text: `${ctx.t("tax.preliminary")}: ${formatMoney(tax.totalTax, ctx.language)}`,
                dataset: {
                    testid: "tax-preliminary"
                }
            }), el("p", {
                className: "metric-total",
                text: `${ctx.t("tax.net")}: ${formatMoney(tax.net, ctx.language)}`,
                dataset: {
                    testid: "tax-net"
                }
            }), el("p", {
                text: `${ctx.t("tax.dataset")}: ${tax.authority} ${tax.datasetVersion} · ${tax.provenance}`
            }));
        });
    });
    const calculation = el("section", {
        className: "stack"
    }, field(ctx.t("tax.monthToCalculate"), month), calculate, result);
    return el("div", {
        className: "page"
    }, pageHeader(ctx, ctx.t("tax.title"), "settings"), el("main", {
        id: "main-content",
        tabIndex: -1,
        className: "page-content stack",
        dataset: {
            testid: "tax-screen"
        }
    }, ctx.snapshot.employers.length ? [
        form,
        calculation
    ] : emptyState(ctx.t("shift.noEmployers"))));
}
export function renderProfile(ctx) {
    const name = el("input", {
        type: "text",
        required: true,
        maxLength: 100,
        value: ctx.snapshot.profile?.name ?? "",
        autoComplete: "name"
    });
    const language = el("select", {
        required: true
    }, el("option", {
        value: "sv",
        text: "Svenska",
        selected: ctx.language === "sv"
    }), el("option", {
        value: "en",
        text: "English",
        selected: ctx.language === "en"
    }));
    const form = el("form", {
        className: "stack"
    }, field(ctx.t("settings.profileName"), name), field(ctx.t("settings.language"), language), el("button", {
        type: "submit",
        className: "button button-primary",
        text: ctx.t("settings.saveProfile"),
        dataset: {
            testid: "profile-submit"
        }
    }));
    form.addEventListener("submit", (event)=>{
        event.preventDefault();
        if (!form.reportValidity() || !isLanguage(language.value)) return;
        void ctx.run(async ()=>{
            await ctx.adapter.saveProfile({
                name: name.value.trim(),
                language: language.value
            });
            await ctx.refresh("settings");
        });
    });
    return el("div", {
        className: "page"
    }, pageHeader(ctx, ctx.t("settings.profile"), "settings"), el("main", {
        id: "main-content",
        tabIndex: -1,
        className: "page-content"
    }, form));
}
export function renderEmployers(ctx) {
    const name = el("input", {
        type: "text",
        required: true,
        maxLength: 160,
        autoComplete: "organization",
        dataset: {
            testid: "employer-name"
        }
    });
    const form = el("form", {
        className: "inline-form"
    }, field(ctx.t("employers.name"), name), el("button", {
        type: "submit",
        className: "button button-primary",
        text: ctx.t("employers.add"),
        dataset: {
            testid: "employer-submit"
        }
    }));
    form.addEventListener("submit", (event)=>{
        event.preventDefault();
        if (!form.reportValidity()) return;
        void ctx.run(async ()=>{
            await ctx.adapter.saveEmployer({
                name: name.value.trim()
            });
            await ctx.refresh("settings/employers");
        });
    });
    const profileEmployer = el("select", {
        required: true,
        dataset: {
            testid: "professional-employer"
        }
    }, ctx.snapshot.employers.map((item)=>el("option", {
            value: item.id,
            text: item.name
        })));
    const branchKeys = {
        "warehouse-logistics": "branch.warehouse",
        retail: "branch.retail",
        transport: "branch.transport",
        industry: "branch.industry",
        construction: "branch.construction",
        hospitality: "branch.hospitality",
        healthcare: "branch.healthcare",
        "municipal-region": "branch.municipal",
        government: "branch.government",
        "it-technology": "branch.it",
        "office-administration": "branch.office",
        "cleaning-property": "branch.cleaning",
        other: "branch.other"
    };
    const branch = el("select", {
        required: true,
        dataset: {
            testid: "professional-branch"
        }
    }, SWEDISH_BRANCHES.map((value)=>el("option", {
            value,
            text: ctx.t(branchKeys[value])
        })));
    const employerSector = el("select", {
        required: true,
        dataset: {
            testid: "professional-employer-sector"
        }
    }, el("option", {
        value: "unknown",
        text: ctx.language === "sv" ? "Okänd – välj senare" : "Unknown – choose later"
    }), el("option", {
        value: "private",
        text: ctx.language === "sv" ? "Privat arbetsgivare" : "Private-sector employer"
    }), el("option", {
        value: "public",
        text: ctx.language === "sv" ? "Offentlig arbetsgivare" : "Public-sector employer"
    }));
    const occupation = el("input", {
        type: "text",
        required: true,
        maxLength: 160,
        dataset: {
            testid: "professional-occupation"
        }
    });
    const employmentType = el("select", {
        required: true,
        dataset: {
            testid: "professional-type"
        }
    }, el("option", {
        value: "direct",
        text: ctx.t("employment.direct")
    }), el("option", {
        value: "staffing",
        text: ctx.t("employment.staffing")
    }), el("option", {
        value: "consultant",
        text: ctx.t("employment.consultant")
    }), el("option", {
        value: "other",
        text: ctx.t("employment.other")
    }));
    const client = el("input", {
        type: "text",
        maxLength: 160,
        dataset: {
            testid: "professional-client"
        }
    });
    const agreement = el("select", {
        dataset: {
            testid: "professional-agreement"
        }
    });
    const agreementManual = el("input", {
        type: "text",
        maxLength: 200
    });
    const agreementConfirmed = el("input", {
        type: "checkbox"
    });
    const membershipOptions = ()=>[
            el("option", {
                value: "unknown",
                text: ctx.t("employment.membershipUnknown")
            }),
            el("option", {
                value: "yes",
                text: ctx.t("employment.membershipYes")
            }),
            el("option", {
                value: "no",
                text: ctx.t("employment.membershipNo")
            })
        ];
    const unionMembership = el("select", {}, membershipOptions());
    const unionName = el("input", {
        type: "text",
        maxLength: 160
    });
    const fundMembership = el("select", {}, membershipOptions());
    const fundName = el("select", {}, SWEDISH_UNEMPLOYMENT_FUNDS.map((value)=>el("option", {
            value,
            text: value
        })));
    const refillAgreements = ()=>{
        const oldSelected = agreement.value;
        const candidates = agreementCandidates(branch.value, employmentType.value);
        const additional = employerSector.value === "unknown" ? AGREEMENT_FAMILIES.filter((item)=>item.branches.includes(branch.value) || employmentType.value === "staffing" && item.id === "bemanning") : AGREEMENT_FAMILIES.filter((item)=>item.sectors.includes(employerSector.value) && (item.branches.includes(branch.value) || employmentType.value === "staffing" && item.id === "bemanning"));
        agreement.replaceChildren(el("option", {
            value: "unknown",
            text: ctx.t("employment.agreementUnknown")
        }), el("option", {
            value: "none",
            text: ctx.t("employment.agreementNone")
        }), ...candidates.map((item)=>el("option", {
                value: `catalog:${item.id}`,
                text: item.name
            })), ...additional.filter((item)=>!candidates.some((candidate)=>candidate.id === item.id)).map((item)=>el("option", {
                value: `catalog:${item.id}`,
                text: item.name + " – " + (ctx.language === "sv" ? "ej verifierat" : "unverified")
            })), el("option", {
            value: "manual",
            text: ctx.t("employment.agreementManual")
        }));
        if ([
            ...agreement.options
        ].some((option)=>option.value === oldSelected)) agreement.value = oldSelected;
    };
    const loadProfile = ()=>{
        const profile = ctx.snapshot.employerProfiles.find((item)=>item.employerId === profileEmployer.value);
        branch.value = profile?.branch ?? "other";
        employerSector.value = profile?.employerSector ?? "unknown";
        occupation.value = profile?.occupation ?? "";
        employmentType.value = profile?.employmentType ?? "direct";
        client.value = profile?.clientCompany ?? "";
        refillAgreements();
        agreement.value = profile?.agreementChoice === "catalog" ? `catalog:${profile.agreementId}` : profile?.agreementChoice ?? "unknown";
        agreementManual.value = profile?.agreementChoice === "manual" ? profile.agreementName ?? "" : "";
        agreementConfirmed.checked = profile?.agreementConfirmed ?? false;
        unionMembership.value = profile?.unionMembership ?? "unknown";
        unionName.value = profile?.unionName ?? "";
        fundMembership.value = profile?.unemploymentFundMembership ?? "unknown";
        fundName.value = profile?.unemploymentFundName ?? "Jag vet inte vilken";
        updateVisibility();
    };
    const updateVisibility = ()=>{
        client.hidden = employmentType.value !== "staffing";
        client.required = employmentType.value === "staffing";
        agreementManual.hidden = agreement.value !== "manual";
        unionName.hidden = unionMembership.value !== "yes";
        fundName.hidden = fundMembership.value !== "yes";
    };
    profileEmployer.addEventListener("change", loadProfile);
    branch.addEventListener("change", ()=>{
        refillAgreements();
        updateVisibility();
    });
    employerSector.addEventListener("change", ()=>{
        refillAgreements();
        updateVisibility();
    });
    employmentType.addEventListener("change", ()=>{
        refillAgreements();
        updateVisibility();
    });
    agreement.addEventListener("change", updateVisibility);
    unionMembership.addEventListener("change", updateVisibility);
    fundMembership.addEventListener("change", updateVisibility);
    loadProfile();
    const profileForm = el("form", {
        className: "stack",
        dataset: {
            testid: "professional-profile-form"
        }
    }, field(ctx.t("shift.employer"), profileEmployer), field(ctx.t("employment.branch"), branch), field(ctx.language === "sv" ? "Arbetsgivarens sektor" : "Employer sector", employerSector), field(ctx.t("employment.occupation"), occupation), field(ctx.t("employment.type"), employmentType), field(ctx.t("employment.client"), client), field(ctx.t("employment.agreement"), agreement), agreementManual, el("label", {
        className: "check-row"
    }, agreementConfirmed, el("span", {
        text: ctx.t("common.confirm")
    })), el("p", {
        className: "notice",
        text: ctx.t("employment.needsVerification")
    }), el("p", {
        className: "notice",
        text: ctx.t("employment.rulesUnverified")
    }), field(ctx.t("employment.union"), unionMembership), unionName, field(ctx.t("employment.akassa"), fundMembership), fundName, el("button", {
        type: "submit",
        className: "button button-primary",
        text: ctx.t("common.save"),
        dataset: {
            testid: "professional-save"
        }
    }));
    profileForm.addEventListener("submit", (event)=>{
        event.preventDefault();
        if (!profileForm.reportValidity()) return;
        void ctx.run(async ()=>{
            const catalogId = agreement.value.startsWith("catalog:") ? agreement.value.slice(8) : null;
            const catalog = COLLECTIVE_AGREEMENT_CANDIDATES.find((item)=>item.id === catalogId) ?? AGREEMENT_FAMILIES.find((item)=>item.id === catalogId);
            await ctx.adapter.saveEmployerProfile({
                employerId: profileEmployer.value,
                branch: branch.value,
                employerSector: employerSector.value,
                occupation: occupation.value.trim(),
                employmentType: employmentType.value,
                clientCompany: employmentType.value === "staffing" ? client.value.trim() : null,
                agreementChoice: catalogId ? "catalog" : agreement.value,
                agreementId: catalogId,
                agreementName: catalog?.name ?? (agreement.value === "manual" ? agreementManual.value.trim() : null),
                agreementConfirmed: agreementConfirmed.checked,
                unionMembership: unionMembership.value,
                unionName: unionMembership.value === "yes" ? unionName.value.trim() || null : null,
                unemploymentFundMembership: fundMembership.value,
                unemploymentFundName: fundMembership.value === "yes" ? fundName.value : null
            });
            await ctx.refresh("settings/employers");
        });
    });
    const employerCard = (item)=>{
        const rates = ctx.snapshot.rates.filter((value)=>value.employerId === item.id).sort((a, b)=>a.validFrom.localeCompare(b.validFrom));
        const currentRate = [
            ...rates
        ].reverse().find((value)=>value.validFrom <= ctx.snapshot.today && (!value.validTo || ctx.snapshot.today < value.validTo));
        const editPanel = el("form", {
            className: "stack",
            hidden: true
        }, field(ctx.t("employers.name"), el("input", {
            type: "text",
            required: true,
            maxLength: 160,
            value: item.name,
            dataset: {
                field: "employer-edit-name"
            }
        })), el("div", {
            className: "form-actions"
        }));
        const editInput = editPanel.querySelector("input");
        const editActions = editPanel.querySelector(".form-actions");
        editActions.append(el("button", {
            type: "submit",
            className: "button button-primary",
            text: ctx.t("common.save"),
            dataset: {
                testid: "employer-edit-save"
            }
        }), button(ctx.t("common.cancel"), {
            className: "button button-secondary",
            onclick: ()=>{
                editPanel.hidden = true;
            }
        }));
        editPanel.addEventListener("submit", (event)=>{
            event.preventDefault();
            if (!editPanel.reportValidity()) return;
            void ctx.run(async ()=>{
                await ctx.adapter.saveEmployer({
                    id: item.id,
                    name: editInput.value.trim()
                });
                await ctx.refresh("settings/employers");
            });
        });
        const rateAmount = el("input", {
            type: "text",
            required: true,
            inputMode: "decimal",
            pattern: "[0-9]+([,.][0-9]{1,2})?",
            value: currentRate?.hourlyRate ?? "",
            dataset: {
                testid: "employer-rate-amount"
            }
        });
        const rateDate = el("input", {
            type: "date",
            required: true,
            value: ctx.snapshot.today,
            dataset: {
                testid: "employer-rate-date"
            }
        });
        const rateImpact = el("div", {
            className: "notice",
            hidden: true
        });
        const ratePanel = el("form", {
            className: "stack",
            hidden: true
        }, el("p", {
            text: `${ctx.t("employers.currentRate")}: ${currentRate ? formatMoney(currentRate.hourlyRate, ctx.language) : ctx.t("common.none")}`
        }), field(ctx.t("employers.newRate"), rateAmount), field(ctx.t("employers.effectiveFrom"), rateDate), rateImpact, el("div", {
            className: "form-actions"
        }, el("button", {
            type: "submit",
            className: "button button-primary",
            text: ctx.t("common.save"),
            dataset: {
                testid: "employer-rate-save"
            }
        }), button(ctx.t("common.cancel"), {
            className: "button button-secondary",
            onclick: ()=>{
                ratePanel.hidden = true;
                rateImpact.hidden = true;
            }
        })));
        ratePanel.addEventListener("submit", (event)=>{
            event.preventDefault();
            if (!ratePanel.reportValidity()) return;
            void ctx.run(async ()=>{
                const input = {
                    employerId: item.id,
                    hourlyRate: rateAmount.value.replace(",", "."),
                    validFrom: rateDate.value
                };
                const preview = await ctx.adapter.previewRateChange(input);
                if (preview.affectedShiftIds.length && rateImpact.hidden) {
                    rateImpact.textContent = ctx.t("employers.rateImpact", {
                        count: preview.affectedShiftIds.length
                    });
                    rateImpact.hidden = false;
                    return;
                }
                await ctx.adapter.saveRate(input);
                await ctx.refresh("settings/employers");
            });
        });
        const deletePanel = el("div", {
            className: "danger-confirm stack",
            hidden: true,
            dataset: {
                testid: "employer-delete-preview"
            }
        });
        const showDelete = async ()=>{
            const preview = await ctx.adapter.previewDeleteEmployer(item.id);
            deletePanel.replaceChildren(el("p", {
                text: ctx.t("employers.deleteIntro")
            }), el("ul", {}, el("li", {
                text: item.name
            }), el("li", {
                text: `${preview.payRates} ${ctx.t("employers.payRates")}`
            }), el("li", {
                text: `${preview.shifts} ${ctx.t("employers.shifts")}`
            }), el("li", {
                text: `${preview.ruleSets} ${ctx.t("employers.rules")}`
            }), el("li", {
                text: `${preview.recurrences} ${ctx.t("employers.recurrences")}`
            }), preview.hasTaxProfile ? el("li", {
                text: ctx.t("employers.taxProfile")
            }) : null, preview.hasEmployerProfile ? el("li", {
                text: ctx.t("employers.workProfile")
            }) : null), el("div", {
                className: "form-actions"
            }, button(ctx.t("common.cancel"), {
                className: "button button-secondary",
                onclick: ()=>{
                    deletePanel.hidden = true;
                }
            }), button(ctx.t("employers.deletePermanent"), {
                className: "button button-danger",
                dataset: {
                    testid: "employer-delete-confirm"
                },
                onclick: ()=>{
                    void ctx.run(async ()=>{
                        await ctx.adapter.deleteEmployer(item.id);
                        await ctx.refresh("settings/employers");
                    });
                }
            })));
            deletePanel.hidden = false;
        };
        const rateDeletePanel = el("div", {
            className: "danger-confirm stack",
            hidden: true,
            dataset: {
                testid: "rate-delete-preview"
            }
        });
        const showRateDelete = async (rateId)=>{
            const preview = await ctx.adapter.previewDeletePayRate(rateId);
            const replacements = rates.filter((value)=>preview.replacementRateIds.includes(value.id));
            const replacement = el("select", {
                dataset: {
                    testid: "rate-delete-replacement"
                }
            }, el("option", {
                value: "",
                text: ctx.t("common.none")
            }), ...replacements.map((value)=>el("option", {
                    value: value.id,
                    text: `${formatMoney(value.hourlyRate, ctx.language)} · ${value.validFrom}`
                })));
            const blocked = preview.requiresReplacement && replacements.length === 0;
            rateDeletePanel.replaceChildren(el("h3", {
                text: ctx.t("employers.deleteRate")
            }), el("p", {
                text: ctx.t("employers.deleteRateIntro")
            }), el("p", {
                text: `${formatMoney(preview.hourlyRate, ctx.language)} · ${preview.validFrom} – ${preview.validTo ?? ctx.t("rates.openEnded")}`
            }), el("ul", {}, el("li", {
                text: `${preview.shiftCount} ${ctx.t("employers.shifts")}`
            }), el("li", {
                text: `${preview.calculationCount} ${ctx.t("employers.calculations")}`
            })), blocked ? el("p", {
                className: "notice",
                text: ctx.t("employers.lastRateRequired"),
                dataset: {
                    testid: "rate-delete-blocked"
                }
            }) : el("span", {
                hidden: true
            }), preview.requiresReplacement && !blocked ? field(ctx.t("employers.replacementRate"), replacement) : el("p", {
                className: "notice",
                text: ctx.t("employers.rateGap", {
                    from: preview.gapFrom,
                    to: preview.gapTo ?? ctx.t("rates.openEnded")
                })
            }), el("div", {
                className: "form-actions"
            }, button(ctx.t("common.cancel"), {
                className: "button button-secondary",
                onclick: ()=>{
                    rateDeletePanel.hidden = true;
                }
            }), blocked ? el("span", {
                hidden: true
            }) : button(ctx.t("employers.deletePermanent"), {
                className: "button button-danger",
                dataset: {
                    testid: "rate-delete-confirm"
                },
                onclick: ()=>{
                    if (preview.requiresReplacement && !replacement.value) {
                        replacement.focus();
                        return;
                    }
                    void ctx.run(async ()=>{
                        await ctx.adapter.deletePayRate(rateId, replacement.value || undefined);
                        await ctx.refresh("settings/employers");
                    });
                }
            })));
            rateDeletePanel.hidden = false;
        };
        const history = el("section", {
            className: "stack",
            dataset: {
                testid: "salary-history"
            }
        }, el("h3", {
            text: ctx.t("employers.salaryHistory")
        }), rates.map((value)=>el("article", {
                className: "form-card stack",
                dataset: {
                    testid: "salary-period",
                    rateId: value.id
                }
            }, el("strong", {
                text: formatMoney(value.hourlyRate, ctx.language)
            }), el("span", {
                text: `${ctx.t("employers.effectiveFrom")}: ${value.validFrom}`
            }), el("span", {
                text: `${ctx.t("common.to")}: ${value.validTo ?? ctx.t("rates.openEnded")}`
            }), value.id === currentRate?.id ? el("span", {
                className: "notice",
                text: ctx.t("employers.current")
            }) : null, el("div", {
                className: "form-actions"
            }, button(ctx.t("common.edit"), {
                className: "button button-secondary",
                dataset: {
                    testid: "rate-history-edit"
                },
                onclick: ()=>{
                    rateAmount.value = value.hourlyRate;
                    rateDate.value = value.validFrom;
                    rateImpact.hidden = true;
                    ratePanel.hidden = false;
                }
            }), button(ctx.t("common.delete"), {
                className: "button button-danger",
                dataset: {
                    testid: "rate-history-delete"
                },
                onclick: ()=>{
                    void ctx.run(()=>showRateDelete(value.id));
                }
            })))));
        return el("li", {
            className: "stack",
            dataset: {
                testid: "employer-card",
                employerId: item.id
            }
        }, el("strong", {
            text: item.name
        }), item.archived ? el("span", {
            className: "notice",
            text: ctx.t("employers.archived")
        }) : null, currentRate ? el("span", {
            text: formatMoney(currentRate.hourlyRate, ctx.language)
        }) : null, el("div", {
            className: "form-actions"
        }, button(ctx.t("common.edit"), {
            className: "button button-secondary",
            dataset: {
                testid: "employer-edit"
            },
            onclick: ()=>{
                editPanel.hidden = false;
            }
        }), button(ctx.t("employers.editRate"), {
            className: "button button-secondary",
            dataset: {
                testid: "employer-rate-edit"
            },
            onclick: ()=>{
                rateAmount.value = currentRate?.hourlyRate ?? "";
                rateDate.value = ctx.snapshot.today;
                ratePanel.hidden = false;
            }
        }), button(ctx.t(item.archived ? "employers.restore" : "employers.archive"), {
            className: "button button-secondary",
            dataset: {
                testid: "employer-archive"
            },
            onclick: ()=>{
                void ctx.run(async ()=>{
                    await ctx.adapter.archiveEmployer(item.id, !item.archived);
                    await ctx.refresh("settings/employers");
                });
            }
        }), button(ctx.t("common.delete"), {
            className: "button button-danger",
            dataset: {
                testid: "employer-delete"
            },
            onclick: ()=>{
                void ctx.run(showDelete);
            }
        })), editPanel, ratePanel, history, rateDeletePanel, deletePanel);
    };
    return el("div", {
        className: "page"
    }, pageHeader(ctx, ctx.t("employers.title"), "settings"), el("main", {
        id: "main-content",
        tabIndex: -1,
        className: "page-content stack"
    }, ctx.snapshot.employers.length ? el("ul", {
        className: "entity-list"
    }, ctx.snapshot.employers.map(employerCard)) : emptyState(ctx.t("employers.empty")), el("section", {
        className: "form-card"
    }, el("h2", {
        text: ctx.t("employers.add")
    }), form), ctx.snapshot.employers.length ? el("section", {
        className: "form-card"
    }, el("h2", {
        text: ctx.t("employment.profile")
    }), profileForm) : null));
}
export function renderRates(ctx) {
    const activeEmployers = ctx.snapshot.employers.filter((item)=>!item.archived);
    const employer = el("select", {
        required: true,
        dataset: {
            testid: "rate-employer"
        }
    }, activeEmployers.map((item)=>el("option", {
            value: item.id,
            text: item.name
        })));
    const amount = el("input", {
        type: "text",
        inputMode: "decimal",
        pattern: "[0-9]+([,.][0-9]{1,2})?",
        required: true,
        dataset: {
            testid: "rate-amount"
        }
    });
    const validFrom = el("input", {
        type: "date",
        required: true,
        value: ctx.snapshot.today,
        dataset: {
            testid: "rate-valid-from"
        }
    });
    const validTo = el("input", {
        type: "date",
        dataset: {
            testid: "rate-valid-to"
        }
    });
    const form = el("form", {
        className: "stack"
    }, field(ctx.t("rates.employer"), employer), field(ctx.t("rates.amount"), amount), el("div", {
        className: "form-grid form-grid-two"
    }, field(ctx.t("rates.validFrom"), validFrom), field(`${ctx.t("rates.validTo")} (${ctx.t("common.optional")})`, validTo)), el("p", {
        className: "field-hint",
        text: ctx.t("rates.versionNotice")
    }), el("button", {
        type: "submit",
        className: "button button-primary",
        text: ctx.t("rates.add"),
        dataset: {
            testid: "rate-submit"
        }
    }));
    form.addEventListener("submit", (event)=>{
        event.preventDefault();
        if (!form.reportValidity()) return;
        void ctx.run(async ()=>{
            await ctx.adapter.saveRate({
                employerId: employer.value,
                hourlyRate: amount.value.trim().replace(",", "."),
                validFrom: validFrom.value,
                ...validTo.value ? {
                    validTo: validTo.value
                } : {}
            });
            await ctx.refresh("settings/rates");
        });
    });
    return el("div", {
        className: "page"
    }, pageHeader(ctx, ctx.t("rates.title"), "settings"), el("main", {
        id: "main-content",
        tabIndex: -1,
        className: "page-content stack"
    }, el("ul", {
        className: "entity-list"
    }, ctx.snapshot.rates.map((item)=>el("li", {}, el("strong", {
            text: item.employerName
        }), el("span", {
            text: formatMoney(item.hourlyRate, ctx.language)
        }), el("small", {
            text: `${formatDate(item.validFrom, ctx.language, {
                weekday: undefined
            })} – ${item.validTo ? formatDate(item.validTo, ctx.language, {
                weekday: undefined
            }) : ctx.t("rates.openEnded")}`
        })))), activeEmployers.length ? el("section", {
        className: "form-card"
    }, el("h2", {
        text: ctx.t("rates.add")
    }), form) : emptyState(ctx.t("shift.noEmployers"))));
}
function weekdayChoices(ctx, name, selected = []) {
    return el("fieldset", {
        className: "weekday-choices"
    }, el("legend", {
        text: ctx.t("rules.weekdays")
    }), weekdays.map((day)=>el("label", {}, el("input", {
            type: "checkbox",
            name,
            value: String(day.value),
            checked: selected.includes(day.value)
        }), el("span", {
            text: ctx.t(day.key)
        }))));
}
function ruleRow(ctx) {
    const row = el("fieldset", {
        className: "rule-row"
    });
    const name = el("input", {
        type: "text",
        required: true,
        maxLength: 160,
        dataset: {
            field: "rule-name"
        }
    });
    const start = el("input", {
        type: "time",
        required: true,
        dataset: {
            field: "rule-start"
        }
    });
    const end = el("input", {
        type: "time",
        required: true,
        dataset: {
            field: "rule-end"
        }
    });
    const kind = el("select", {
        required: true,
        dataset: {
            field: "rule-kind"
        }
    }, el("option", {
        value: "fixed",
        text: ctx.t("rules.fixed")
    }), el("option", {
        value: "percent",
        text: ctx.t("rules.percent")
    }));
    const value = el("input", {
        type: "text",
        required: true,
        inputMode: "decimal",
        pattern: "[0-9]+([,.][0-9]+)?",
        dataset: {
            field: "rule-value"
        }
    });
    const additive = el("input", {
        type: "checkbox",
        dataset: {
            field: "rule-additive"
        }
    });
    row.append(el("legend", {
        text: ctx.t("rules.addRule")
    }), field(ctx.t("rules.ruleName"), name), weekdayChoices(ctx, `weekdays-${crypto.randomUUID()}`, [
        2,
        3,
        4,
        5,
        6
    ]), el("div", {
        className: "form-grid form-grid-two"
    }, field(ctx.t("rules.start"), start), field(ctx.t("rules.end"), end)), el("div", {
        className: "form-grid form-grid-two"
    }, field(ctx.t("rules.kind"), kind), field(ctx.t("rules.value"), value)), el("label", {
        className: "check-row"
    }, additive, el("span", {
        text: ctx.t("rules.additive")
    })), button(ctx.t("common.delete"), {
        className: "button button-danger button-small",
        onclick: ()=>row.remove()
    }));
    return row;
}
function readRules(container) {
    return [
        ...container.querySelectorAll(".rule-row")
    ].map((row)=>({
            name: row.querySelector("[data-field='rule-name']")?.value.trim() ?? "",
            weekdays: [
                ...row.querySelectorAll("input[type='checkbox'][name^='weekdays-']:checked")
            ].map((input)=>Number(input.value)),
            startTime: row.querySelector("[data-field='rule-start']")?.value ?? "",
            endTime: row.querySelector("[data-field='rule-end']")?.value ?? "",
            kind: row.querySelector("[data-field='rule-kind']")?.value === "percent" ? "percent" : "fixed",
            value: (row.querySelector("[data-field='rule-value']")?.value ?? "").replace(",", "."),
            additive: row.querySelector("[data-field='rule-additive']")?.checked ?? false
        }));
}
export function renderRules(ctx) {
    const activeEmployers = ctx.snapshot.employers.filter((item)=>!item.archived);
    const employer = el("select", {
        required: true
    }, activeEmployers.map((item)=>el("option", {
            value: item.id,
            text: item.name
        })));
    const setName = el("input", {
        type: "text",
        required: true,
        maxLength: 160
    });
    const validFrom = el("input", {
        type: "date",
        required: true,
        value: ctx.snapshot.today
    });
    const validTo = el("input", {
        type: "date"
    });
    const overlap = el("select", {
        required: true
    }, el("option", {
        value: "reject",
        text: ctx.t("rules.rejectOverlap")
    }), el("option", {
        value: "additive",
        text: ctx.t("rules.additiveOverlap")
    }));
    const rounding = el("select", {
        required: true
    }, el("option", {
        value: "halfUp",
        text: ctx.t("rules.halfUp")
    }), el("option", {
        value: "halfEven",
        text: ctx.t("rules.halfEven")
    }));
    const rows = el("div", {
        className: "stack"
    }, ruleRow(ctx));
    const form = el("form", {
        className: "stack"
    }, field(ctx.t("rules.employer"), employer), field(ctx.t("rules.setName"), setName), el("div", {
        className: "form-grid form-grid-two"
    }, field(ctx.t("rules.validFrom"), validFrom), field(`${ctx.t("rules.validTo")} (${ctx.t("common.optional")})`, validTo)), el("div", {
        className: "form-grid form-grid-two"
    }, field(ctx.t("rules.overlap"), overlap), field(ctx.t("rules.rounding"), rounding)), rows, button(ctx.t("rules.addRule"), {
        className: "button button-secondary",
        onclick: ()=>rows.append(ruleRow(ctx)),
        dataset: {
            testid: "rule-add"
        }
    }), el("button", {
        type: "submit",
        className: "button button-primary",
        text: ctx.t("rules.addSet"),
        dataset: {
            testid: "rules-submit"
        }
    }));
    form.addEventListener("submit", (event)=>{
        event.preventDefault();
        if (!form.reportValidity()) return;
        void ctx.run(async ()=>{
            await ctx.adapter.saveRuleSet({
                employerId: employer.value,
                name: setName.value.trim(),
                validFrom: validFrom.value,
                ...validTo.value ? {
                    validTo: validTo.value
                } : {},
                overlapPolicy: overlap.value === "additive" ? "additive" : "reject",
                rounding: rounding.value === "halfEven" ? "halfEven" : "halfUp",
                rules: readRules(rows)
            });
            await ctx.refresh("settings/rules");
        });
    });
    return el("div", {
        className: "page"
    }, pageHeader(ctx, ctx.t("rules.title"), "settings"), el("main", {
        id: "main-content",
        tabIndex: -1,
        className: "page-content stack"
    }, el("p", {
        className: "notice",
        text: ctx.t("rules.unverified")
    }), ctx.snapshot.ruleSets.length ? el("ul", {
        className: "entity-list"
    }, ctx.snapshot.ruleSets.map((set)=>el("li", {}, el("strong", {
            text: set.name
        }), el("span", {
            text: set.employerName
        }), el("small", {
            text: `${set.rules.length}`
        })))) : emptyState(ctx.t("rules.none")), activeEmployers.length ? el("section", {
        className: "form-card"
    }, el("h2", {
        text: ctx.t("rules.addSet")
    }), form) : emptyState(ctx.t("shift.noEmployers"))));
}
export function renderRecurrences(ctx) {
    const activeEmployers = ctx.snapshot.employers.filter((item)=>!item.archived);
    const employer = el("select", {
        required: true
    }, activeEmployers.map((item)=>el("option", {
            value: item.id,
            text: item.name
        })));
    const rate = el("select", {
        required: true
    });
    const rules = el("select");
    const refill = ()=>{
        rate.replaceChildren(...ctx.snapshot.rates.filter((item)=>item.employerId === employer.value).map((item)=>el("option", {
                value: item.id,
                text: formatMoney(item.hourlyRate, ctx.language)
            })));
        rules.replaceChildren(el("option", {
            value: "",
            text: ctx.t("common.none")
        }), ...ctx.snapshot.ruleSets.filter((item)=>item.employerId === employer.value).map((item)=>el("option", {
                value: item.id,
                text: item.name
            })));
    };
    employer.addEventListener("change", refill);
    refill();
    const startDate = el("input", {
        type: "date",
        required: true,
        value: ctx.snapshot.today
    });
    const endDate = el("input", {
        type: "date",
        required: true,
        value: ctx.snapshot.today
    });
    const startTime = el("input", {
        type: "time",
        required: true
    });
    const endTime = el("input", {
        type: "time",
        required: true
    });
    const exceptionDates = el("textarea", {
        rows: 3,
        placeholder: "2026-12-24\n2026-12-31"
    });
    const dayChoices = weekdayChoices(ctx, "recurrence-weekdays", [
        2,
        3,
        4,
        5,
        6
    ]);
    const form = el("form", {
        className: "stack"
    }, field(ctx.t("shift.employer"), employer), field(ctx.t("shift.rate"), rate), field(ctx.t("shift.rules"), rules), el("div", {
        className: "form-grid form-grid-two"
    }, field(ctx.t("recurrence.startDate"), startDate), field(ctx.t("recurrence.endDate"), endDate)), dayChoices, el("div", {
        className: "form-grid form-grid-two"
    }, field(ctx.t("recurrence.start"), startTime), field(ctx.t("recurrence.end"), endTime)), field(ctx.t("recurrence.exceptions"), exceptionDates, {
        hint: ctx.t("recurrence.exceptionsHint")
    }), el("button", {
        type: "submit",
        className: "button button-primary",
        text: ctx.t("recurrence.generate"),
        dataset: {
            testid: "recurrence-submit"
        }
    }));
    form.addEventListener("submit", (event)=>{
        event.preventDefault();
        if (!form.reportValidity()) return;
        const input = {
            employerId: employer.value,
            rateVersionId: rate.value,
            ...rules.value ? {
                ruleSetVersionId: rules.value
            } : {},
            startDate: startDate.value,
            endDate: endDate.value,
            weekdays: [
                ...dayChoices.querySelectorAll("input:checked")
            ].map((item)=>Number(item.value)),
            startTime: startTime.value,
            endTime: endTime.value,
            timeZone: "Europe/Stockholm",
            exceptions: exceptionDates.value.split(/\r?\n/).map((item)=>item.trim()).filter(Boolean)
        };
        void ctx.run(async ()=>{
            await ctx.adapter.saveRecurrence(input);
            await ctx.refresh("settings/recurrences");
        });
    });
    return el("div", {
        className: "page"
    }, pageHeader(ctx, ctx.t("recurrence.title"), "settings"), el("main", {
        id: "main-content",
        tabIndex: -1,
        className: "page-content stack"
    }, ctx.snapshot.recurrences.length ? el("ul", {
        className: "entity-list"
    }, ctx.snapshot.recurrences.map((item)=>el("li", {}, el("strong", {
            text: item.employerName
        }), el("span", {
            text: `${formatDate(item.startDate, ctx.language)} – ${formatDate(item.endDate, ctx.language)}`
        }), el("small", {
            text: `${item.startTime}–${item.endTime}`
        })))) : emptyState(ctx.t("recurrence.empty")), activeEmployers.length ? el("section", {
        className: "form-card"
    }, el("h2", {
        text: ctx.t("recurrence.add")
    }), form) : emptyState(ctx.t("shift.noEmployers"))));
}
function downloadExport(payload) {
    const blob = payload instanceof Blob ? payload : new Blob([
        payload
    ], {
        type: "application/json"
    });
    const url = URL.createObjectURL(blob);
    const anchor = el("a", {
        href: url,
        download: `lonkoll-backup-${new Date().toISOString().slice(0, 10)}.json`
    });
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(()=>URL.revokeObjectURL(url), 60_000);
}
export function renderData(ctx) {
    const file = el("input", {
        type: "file",
        accept: "application/json,.json",
        dataset: {
            testid: "import-file"
        }
    });
    const chooseFile = button(ctx.t("data.chooseFile"), {
        className: "button button-secondary",
        dataset: {
            testid: "settings-import"
        },
        onclick: ()=>file.click()
    });
    const importButton = el("button", {
        type: "button",
        className: "button button-danger",
        text: ctx.t("data.importConfirm"),
        disabled: true,
        dataset: {
            testid: "confirm-import"
        }
    });
    file.addEventListener("change", ()=>{
        const selected = file.files?.item(0);
        if (!selected) {
            importButton.disabled = true;
            return;
        }
        try {
            validateImportFile(selected);
            importButton.disabled = false;
        } catch  {
            file.value = "";
            importButton.disabled = true;
            ctx.notify(ctx.t("error.fileTooLarge"), "error");
        }
    });
    importButton.addEventListener("click", ()=>{
        const selected = file.files?.item(0);
        if (!selected) return;
        void ctx.run(async ()=>{
            await ctx.adapter.importData(await readImportFile(selected), {
                replaceExisting: true
            });
            await ctx.refresh("home");
        }, ctx.t("data.imported"));
    });
    const clearPanel = el("div", {
        className: "danger-confirm",
        hidden: true
    }, el("p", {
        text: ctx.t("data.clearConfirm")
    }));
    const clearConfirm = button(ctx.t("common.confirm"), {
        className: "button button-danger",
        dataset: {
            testid: "clear-confirm"
        }
    });
    clearConfirm.addEventListener("click", ()=>{
        void ctx.run(async ()=>{
            await ctx.adapter.clearAllData();
            await ctx.refresh("onboarding");
        }, ctx.t("data.cleared"));
    });
    clearPanel.append(clearConfirm, button(ctx.t("common.cancel"), {
        className: "button button-secondary",
        onclick: ()=>{
            clearPanel.hidden = true;
        }
    }));
    return el("div", {
        className: "page"
    }, pageHeader(ctx, ctx.t("data.title"), "settings"), el("main", {
        id: "main-content",
        tabIndex: -1,
        className: "page-content stack"
    }, el("p", {
        className: "notice",
        text: ctx.t("data.localOnly")
    }), el("section", {
        className: "form-card stack"
    }, el("h2", {
        text: ctx.t("data.export")
    }), el("p", {
        text: ctx.t("data.exportHint")
    }), button(ctx.t("data.export"), {
        className: "button button-primary",
        dataset: {
            testid: "settings-export"
        },
        onclick: ()=>{
            void ctx.run(async ()=>{
                downloadExport(await ctx.adapter.exportData());
            }, ctx.t("data.exported"));
        }
    })), el("section", {
        className: "form-card stack"
    }, el("h2", {
        text: ctx.t("data.import")
    }), el("p", {
        text: ctx.t("data.importHint")
    }), el("p", {
        className: "warning",
        text: ctx.t("data.importWarning")
    }), field(ctx.t("data.chooseFile"), file), chooseFile, importButton), el("section", {
        className: "danger-zone stack"
    }, button(ctx.t("data.clear"), {
        className: "button button-danger",
        dataset: {
            testid: "settings-clear"
        },
        onclick: ()=>{
            clearPanel.hidden = false;
            clearConfirm.focus();
        }
    }), clearPanel)));
}
export function renderInstall(ctx) {
    return el("div", {
        className: "page"
    }, pageHeader(ctx, ctx.t("install.title"), "settings"), el("main", {
        id: "main-content",
        tabIndex: -1,
        className: "page-content stack"
    }, el("p", {
        className: "lede",
        text: ctx.t("install.intro")
    }), el("ol", {
        className: "install-steps"
    }, el("li", {}, el("p", {
        text: ctx.t("install.step1")
    })), el("li", {}, el("p", {
        text: ctx.t("install.step2")
    })), el("li", {}, el("p", {
        text: ctx.t("install.step3")
    })), el("li", {}, el("p", {
        text: ctx.t("install.step4")
    }))), el("p", {
        className: "notice",
        text: ctx.t("install.offline")
    })));
}
export function renderAgreementCatalog(ctx) {
    const lang = ctx.language;
    const initial = readWorkspaceMode(localStorage);
    const mode = el("select", {
        dataset: {
            testid: "workspace-mode"
        }
    }, el("option", {
        value: "personal",
        text: lang === "sv" ? "Privat användning – mina löner" : "Personal use – my wages"
    }), el("option", {
        value: "business",
        text: lang === "sv" ? "Företagsanvändning – separat lagring" : "Business use – separate storage"
    }));
    mode.value = initial;
    const sector = el("select", {
        dataset: {
            testid: "agreement-sector"
        }
    }, el("option", {
        value: "private",
        text: lang === "sv" ? "Privat arbetsgivarsektor" : "Private-sector employer"
    }), el("option", {
        value: "public",
        text: lang === "sv" ? "Offentlig arbetsgivarsektor" : "Public-sector employer"
    }));
    const agreementList = el("ul", {
        className: "entity-list",
        dataset: {
            testid: "agreement-catalog-list"
        }
    });
    const render = ()=>{
        agreementList.replaceChildren(...agreementFamiliesFor(sector.value).map((item)=>el("li", {
                className: "form-card stack"
            }, el("strong", {
                text: item.name
            }), el("small", {
                text: lang === "sv" ? "VILLKOR EJ VERIFIERADE – inga automatiska ersättningar" : "TERMS NOT VERIFIED – no automatic pay rates"
            }))));
    };
    sector.addEventListener("change", render);
    render();
    const switchButton = el("button", {
        type: "button",
        className: "button button-secondary",
        text: lang === "sv" ? "Byt arbetsyta" : "Switch workspace",
        dataset: {
            testid: "workspace-switch"
        }
    });
    switchButton.addEventListener("click", ()=>{
        if (readWorkspaceMode(localStorage) === mode.value) return;
        if (!window.confirm(lang === "sv" ? "Byt arbetsyta? Den aktuella databasen bevaras separat." : "Switch workspace? Current records remain in a separate database.")) return;
        try {
            saveWorkspaceMode(localStorage, mode.value);
            window.location.hash = "#/home";
            window.location.reload();
        } catch  {
            ctx.notify(ctx.t("common.error"), "error");
        }
    });
    return el("div", {
        className: "page"
    }, pageHeader(ctx, lang === "sv" ? "Arbetsytor och kollektivavtal" : "Workspaces and collective agreements", "settings"), el("main", {
        id: "main-content",
        tabIndex: -1,
        className: "page-content stack"
    }, el("section", {
        className: "form-card stack"
    }, el("h2", {
        text: lang === "sv" ? "Privat eller kommersiell användning" : "Personal or commercial use"
    }), el("p", {
        text: lang === "sv" ? "Två separata lokala databaser. Privat läge bevarar all befintlig historik. Företagsläget ger inte automatiskt rätt att hantera andras personuppgifter; organisera åtkomst, sekretess och rättslig grund separat." : "Two separate local databases. Personal mode preserves all existing history. Business mode does not automatically authorize handling others' personal information."
    }), field(lang === "sv" ? "Användningsläge" : "Usage mode", mode), switchButton), el("section", {
        className: "form-card stack"
    }, el("h2", {
        text: lang === "sv" ? "Arbetsgivarens sektor" : "Employer sector"
    }), el("p", {
        text: lang === "sv" ? "Privat eller offentlig sektor är inte samma sak som privat eller kommersiellt användningsläge. Kontrollera rätt arbetsgivarorganisation, fackförbund, avtal, period och lokala tillägg." : "Public/private employment is distinct from personal/business use. Verify the exact agreement, dates and local supplements."
    }), field(lang === "sv" ? "Arbetsgivarsektor" : "Employer sector", sector), el("p", {
        className: "notice",
        text: lang === "sv" ? "Avtalsnamn är endast möjliga avtalsfamiljer. Inga OB-, övertids-, semester-, jour- eller andra nivåer antas utan kontrollerade källor." : "Agreement names are candidates only. No premium, overtime, vacation or standby amounts are assumed without verified sources."
    }), agreementList), el("section", {
        className: "form-card stack",
        dataset: {
            testid: "agreement-coverage"
        }
    }, el("h2", {
        text: lang === "sv" ? "Lönedelarnas verifieringsstatus" : "Salary component verification"
    }), el("p", {
        className: "warning",
        text: lang === "sv" ? "Samtliga avtal kräver kontroll av avtalstext, avtalsperiod och lokala villkor. Sektorsvalet fastställer aldrig OB eller andra ersättningar automatiskt." : "Every agreement requires verification of official text, effective dates and local terms. Sector alone never certifies any premium or allowance."
    }), el("ul", {}, AGREEMENT_PAY_COMPONENTS.map((component)=>el("li", {
            text: `${component}: ${agreementCoverage("handels-lager", ctx.snapshot.today)[component] === "not-verified" ? lang === "sv" ? "ej verifierat" : "not verified" : lang === "sv" ? "kontrollerat" : "verified"}`
        }))), el("a", {
        href: href("settings/rules"),
        text: lang === "sv" ? "Konfigurera kontrollerade OB-regler" : "Configure verified OB rules"
    }))));
}


//# sourceURL=ui/pages/settings.ts