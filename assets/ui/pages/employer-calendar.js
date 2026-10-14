import { parseEmployerCalendar, MAX_EMPLOYER_CALENDAR_BYTES } from "../../domain/employerCalendar.js";
import { button, el, field } from "../dom.js";
import { href } from "../router.js";
import { pageHeader } from "./shared.js";
export function renderEmployerCalendarImport(ctx) {
    const sv = ctx.language === "sv";
    const tr = (s, en)=>sv ? s : en;
    const employer = el("select", {
        required: true,
        dataset: {
            testid: "roster-employer"
        }
    }, ctx.snapshot.employers.filter((e)=>!e.archived).map((e)=>el("option", {
            value: e.id,
            text: e.name
        })));
    const rate = el("select", {
        required: true,
        dataset: {
            testid: "roster-rate"
        }
    });
    const rule = el("select", {
        dataset: {
            testid: "roster-rule"
        }
    });
    const file = el("input", {
        type: "file",
        accept: ".ics,.csv,text/calendar,text/csv",
        dataset: {
            testid: "roster-file"
        }
    });
    const result = el("div", {
        className: "form-card stack",
        hidden: true,
        dataset: {
            testid: "roster-preview"
        }
    });
    const error = el("p", {
        className: "warning",
        hidden: true,
        role: "alert",
        dataset: {
            testid: "roster-error"
        }
    });
    const previewButton = button(tr("Granska import", "Preview import"), {
        type: "button",
        className: "button button-primary",
        dataset: {
            testid: "roster-preview-btn"
        }
    });
    let current = null;
    const invalidate = ()=>{
        current = null;
        result.hidden = true;
        result.replaceChildren();
        error.hidden = true;
    };
    const refreshChoices = ()=>{
        const id = employer.value;
        rate.replaceChildren(...ctx.snapshot.rates.filter((r)=>r.employerId === id).map((r)=>el("option", {
                value: r.id,
                text: `${r.hourlyRate} kr/h · ${r.validFrom}${r.validTo ? " – " + r.validTo : ""}`
            })));
        rule.replaceChildren(el("option", {
            value: "",
            text: tr("Ingen OB-regel", "No OB rule")
        }), ...ctx.snapshot.ruleSets.filter((x)=>x.employerId === id).map((x)=>el("option", {
                value: x.id,
                text: x.name
            })));
        invalidate();
    };
    employer.addEventListener("change", refreshChoices);
    rate.addEventListener("change", invalidate);
    rule.addEventListener("change", invalidate);
    file.addEventListener("change", invalidate);
    refreshChoices();
    previewButton.addEventListener("click", ()=>{
        const selected = file.files?.item(0);
        if (!selected || !rate.value) {
            error.textContent = tr("Välj arbetsgivare, timlön och fil", "Select employer, hourly rate and file");
            error.hidden = false;
            return;
        }
        void ctx.run(async ()=>{
            invalidate();
            try {
                if (selected.size > MAX_EMPLOYER_CALENDAR_BYTES) throw new Error(tr("Filen är större än 1 MB", "File exceeds 1 MB"));
                const parsed = parseEmployerCalendar(await selected.text(), selected.name);
                const input = {
                    employerId: employer.value,
                    rateVersionId: rate.value,
                    ruleSetVersionId: rule.value || undefined,
                    timeZone: "Europe/Stockholm",
                    shifts: parsed
                };
                const planned = await ctx.adapter.previewEmployerSchedule(input);
                current = input;
                result.hidden = false;
                result.append(el("h2", {
                    text: tr("Kontrollera innan import", "Review before import")
                }), el("p", {
                    text: tr("Följande pass föreslås för valda arbetsgivaren. Importen skriver inte över befintliga arbetspass.", "Proposed shifts for the selected employer. Existing shifts will never be overwritten.")
                }), el("strong", {
                    text: `${tr("Nya pass", "New shifts")}: ${planned.importedCount} · ${tr("Konflikter", "Conflicts")}: ${planned.skippedCount}`
                }), ...planned.conflictDates.length ? [
                    el("p", {
                        className: "warning",
                        text: tr("Redan registrerade datum: ", "Existing dates: ") + planned.conflictDates.join(", ")
                    })
                ] : [], el("ul", {
                    className: "entity-list",
                    dataset: {
                        testid: "roster-preview-list"
                    }
                }, parsed.map((x)=>el("li", {
                        className: "form-card",
                        text: `${x.date} ${x.startTime} – ${x.endDate} ${x.endTime}${x.breaks.length ? " · " + tr("Obetald rast", "Unpaid break") + ": " + x.breaks[0].startTime + "–" + x.breaks[0].endTime : ""} · ${x.label}`
                    }))), el("p", {
                    className: "notice",
                    text: tr("Kontrollera rast, schema och löneavtal. Ändra fel efter importen; inga anställningsavtal verifieras automatiskt.", "Verify unpaid breaks, schedule and agreement. Correct any errors after import; agreements are not auto-verified.")
                }));
                const confirm = button(tr("Bekräfta och importera", "Confirm and import"), {
                    type: "button",
                    className: "button button-primary",
                    dataset: {
                        testid: "roster-confirm"
                    }
                });
                confirm.addEventListener("click", ()=>{
                    if (!current || current !== input) return;
                    confirm.disabled = true;
                    void ctx.run(async ()=>{
                        const imported = await ctx.adapter.applyEmployerSchedule(input);
                        ctx.notify(tr(`${imported.importedCount} pass importerade, ${imported.skippedCount} konflikter utelämnade`, `${imported.importedCount} shifts imported, ${imported.skippedCount} conflicts skipped`), "success");
                        await ctx.refresh("calendar?view=month&date=" + encodeURIComponent(input.shifts[0].date));
                    });
                });
                result.append(confirm);
            } catch (e) {
                current = null;
                result.hidden = true;
                error.textContent = e instanceof Error ? e.message : String(e);
                error.hidden = false;
            }
        });
    });
    return el("div", {
        className: "page"
    }, pageHeader(ctx, tr("Importera arbetsgivarens schema", "Import employer calendar"), "settings"), el("main", {
        id: "main-content",
        tabIndex: -1,
        className: "page-content stack",
        dataset: {
            testid: "roster-screen"
        }
    }, el("p", {
        className: "notice",
        text: tr("Ladda upp en .ics- eller .csv-fil från arbetsgivaren. Allt behandlas på din enhet; automatisk åtkomst till arbetsgivarens konto ingår inte.", "Import your employer's .ics or .csv file. Everything stays on your device. This does not access your employer account.")
    }), el("section", {
        className: "form-card stack"
    }, field(ctx.t("shift.employer"), employer), field(ctx.t("shift.rate"), rate), field(ctx.t("shift.rules"), rule), field(tr("Schemafil (.ics eller .csv)", "Schedule file (.ics or .csv)"), file), el("p", {
        className: "field-hint",
        text: tr("CSV: datum,start,slut[,slutdatum,pausstart,pausend]. ICS: vanliga VEVENT utan RRULE i Europe/Stockholm eller UTC. Max 200 pass.", "CSV: date,start,end[,enddate,breakstart,breakend]. ICS: non-recurring VEVENT in Europe/Stockholm or UTC. Max 200 shifts.")
    }), previewButton, error), result, el("a", {
        href: href("calendar"),
        className: "button button-secondary",
        text: ctx.t("nav.calendar")
    })));
}


//# sourceURL=ui/pages/employer-calendar.ts