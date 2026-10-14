import { button, el, field } from "../dom.js";
import { addDays, formatDate, formatDuration, formatMoney, formatTimestamp } from "../format.js";
import { href } from "../router.js";
import { amountOre, estimateNotice, pageHeader, shiftMetrics, statusLabel } from "./shared.js";
function option(value, text, selected = false) {
    return el("option", {
        value,
        text,
        selected
    });
}
function breakRow(ctx, shiftStartDate, value) {
    const row = el("fieldset", {
        className: "break-row"
    });
    const legend = el("legend", {
        text: ctx.t("shift.breaks")
    });
    const startDate = el("input", {
        type: "date",
        required: true,
        value: value?.startDate ?? shiftStartDate,
        dataset: {
            field: "break-start-date"
        }
    });
    const start = el("input", {
        type: "time",
        required: true,
        value: value?.startTime ?? "",
        dataset: {
            field: "break-start"
        }
    });
    const endDate = el("input", {
        type: "date",
        required: true,
        value: value?.endDate ?? value?.startDate ?? shiftStartDate,
        dataset: {
            field: "break-end-date"
        }
    });
    const end = el("input", {
        type: "time",
        required: true,
        value: value?.endTime ?? "",
        dataset: {
            field: "break-end"
        }
    });
    const paid = el("input", {
        type: "checkbox",
        checked: value?.isPaid ?? false,
        dataset: {
            field: "break-paid"
        }
    });
    const premium = el("input", {
        type: "checkbox",
        checked: value?.eligibleForPremium ?? false,
        dataset: {
            field: "break-premium"
        }
    });
    paid.addEventListener("change", ()=>{
        if (!paid.checked) {
            premium.checked = false;
            premium.disabled = true;
        } else premium.disabled = false;
    });
    if (!paid.checked) premium.disabled = true;
    const remove = button(ctx.t("shift.removeBreak"), {
        className: "button button-danger button-small",
        onclick: ()=>row.remove(),
        dataset: {
            testid: "remove-break"
        }
    });
    row.append(legend, el("div", {
        className: "form-grid form-grid-two"
    }, field(ctx.t("shift.breakStartDate"), startDate), field(ctx.t("shift.breakEndDate"), endDate)), el("div", {
        className: "form-grid form-grid-two"
    }, field(ctx.t("shift.breakStart"), start), field(ctx.t("shift.breakEnd"), end)), el("label", {
        className: "check-row"
    }, paid, el("span", {
        text: ctx.t("shift.breakPaid")
    })), el("label", {
        className: "check-row"
    }, premium, el("span", {
        text: ctx.t("shift.breakOb")
    })), remove);
    return row;
}
function readBreaks(container) {
    return [
        ...container.querySelectorAll(".break-row")
    ].map((row)=>({
            startDate: row.querySelector("[data-field='break-start-date']")?.value ?? "",
            startTime: row.querySelector("[data-field='break-start']")?.value ?? "",
            endDate: row.querySelector("[data-field='break-end-date']")?.value ?? "",
            endTime: row.querySelector("[data-field='break-end']")?.value ?? "",
            isPaid: row.querySelector("[data-field='break-paid']")?.checked ?? false,
            eligibleForPremium: row.querySelector("[data-field='break-premium']")?.checked ?? false
        }));
}
export function renderShiftForm(ctx, shift) {
    const isEditing = Boolean(shift);
    const employers = ctx.snapshot.employers.filter((item)=>!item.archived || item.id === shift?.employerId);
    if (!employers.length) {
        return el("div", {
            className: "page"
        }, pageHeader(ctx, isEditing ? ctx.t("shift.editTitle") : ctx.t("shift.newTitle"), isEditing && shift ? `shift/${shift.id}` : "home"), el("main", {
            id: "main-content",
            tabIndex: -1,
            className: "page-content stack"
        }, el("p", {
            text: ctx.t("shift.noEmployers")
        }), el("a", {
            href: href("settings/employers"),
            className: "button button-primary",
            text: ctx.t("settings.employers")
        })));
    }
    const initialEmployerId = shift?.employerId ?? employers[0].id;
    const employer = el("select", {
        required: true,
        dataset: {
            testid: "shift-employer"
        }
    }, employers.map((item)=>option(item.id, item.name, item.id === initialEmployerId)));
    const rate = el("select", {
        required: true,
        dataset: {
            testid: "shift-rate"
        }
    });
    const rules = el("select", {
        dataset: {
            testid: "shift-rules"
        }
    });
    const date = el("input", {
        type: "date",
        required: true,
        value: shift?.date ?? ctx.snapshot.today,
        dataset: {
            testid: "shift-date"
        }
    });
    const refillVersions = ()=>{
        const rates = ctx.snapshot.rates.filter((item)=>item.employerId === employer.value);
        const effective = shift?.rateVersionId ?? rates.find((item)=>item.validFrom <= date.value && (!item.validTo || date.value < item.validTo))?.id;
        rate.replaceChildren(...rates.map((item)=>option(item.id, `${formatMoney(item.hourlyRate, ctx.language)} · ${formatDate(item.validFrom, ctx.language, {
                weekday: undefined
            })}`, item.id === effective)));
        rules.replaceChildren(option("", ctx.t("common.none"), !shift?.ruleSetVersionId), ...ctx.snapshot.ruleSets.filter((item)=>item.employerId === employer.value).map((item)=>option(item.id, item.name, item.id === shift?.ruleSetVersionId)));
    };
    employer.addEventListener("change", refillVersions);
    refillVersions();
    const start = el("input", {
        type: "time",
        required: true,
        value: shift?.startTime ?? "09:00",
        dataset: {
            testid: "shift-start"
        }
    });
    const endDate = el("input", {
        type: "date",
        required: true,
        value: shift?.endDate ?? ctx.snapshot.today,
        dataset: {
            testid: "shift-end-date"
        }
    });
    const end = el("input", {
        type: "time",
        required: true,
        value: shift?.endTime ?? "17:00",
        dataset: {
            testid: "shift-end"
        }
    });
    const status = el("select", {
        required: true,
        dataset: {
            testid: "shift-status"
        }
    }, option("planned", ctx.t("shift.planned"), (shift?.status ?? "planned") === "planned"), option("worked", ctx.t("shift.worked"), shift?.status === "worked"));
    const timeZone = el("input", {
        type: "text",
        required: true,
        readOnly: true,
        value: shift?.timeZone ?? "Europe/Stockholm"
    });
    date.addEventListener("change", ()=>{
        if (!shift || endDate.value === shift.date) endDate.value = date.value;
        if (!shift) refillVersions();
    });
    const breaks = el("div", {
        className: "break-list",
        dataset: {
            testid: "break-list"
        }
    }, shift?.breaks.map((item)=>breakRow(ctx, shift.date, item)) ?? []);
    const addBreak = button(ctx.t("shift.addBreak"), {
        className: "button button-secondary",
        onclick: ()=>breaks.append(breakRow(ctx, date.value)),
        dataset: {
            testid: "add-break"
        }
    });
    const form = el("form", {
        className: "stack shift-form",
        dataset: {
            testid: "shift-form"
        }
    }, field(ctx.t("shift.employer"), employer), el("div", {
        className: "form-grid form-grid-two"
    }, field(ctx.t("shift.date"), date), field(ctx.t("shift.start"), start)), el("div", {
        className: "form-grid form-grid-two"
    }, field(ctx.t("shift.endDate"), endDate), field(ctx.t("shift.end"), end)), field(ctx.t("shift.status"), status), field(ctx.t("shift.rate"), rate), field(ctx.t("shift.rules"), rules, {
        hint: ctx.t("rules.unverified")
    }), field(ctx.t("shift.timeZone"), timeZone), el("section", {
        className: "stack",
        "aria-labelledby": "breaks-heading"
    }, el("h2", {
        id: "breaks-heading",
        text: ctx.t("shift.breaks")
    }), breaks, addBreak), el("div", {
        className: "form-actions"
    }, el("button", {
        type: "submit",
        className: "button button-primary",
        text: ctx.t("shift.save"),
        dataset: {
            testid: "shift-submit"
        }
    }), el("a", {
        href: href(shift ? `shift/${shift.id}` : "home"),
        className: "button button-secondary",
        text: ctx.t("common.cancel")
    })));
    form.addEventListener("submit", (event)=>{
        event.preventDefault();
        if (!form.reportValidity()) return;
        const input = {
            ...shift ? {
                id: shift.id,
                expectedRevision: shift.revision
            } : {},
            employerId: employer.value,
            rateVersionId: rate.value,
            ...rules.value ? {
                ruleSetVersionId: rules.value
            } : {},
            date: date.value,
            startTime: start.value,
            endDate: endDate.value,
            endTime: end.value,
            timeZone: timeZone.value,
            status: status.value === "worked" ? "worked" : "planned",
            breaks: readBreaks(breaks)
        };
        void ctx.run(async ()=>{
            const id = await ctx.adapter.saveShift(input);
            await ctx.refresh(`shift/${encodeURIComponent(id)}`);
        }, ctx.t("shift.saved"));
    });
    return el("div", {
        className: "page"
    }, pageHeader(ctx, isEditing ? ctx.t("shift.editTitle") : ctx.t("shift.newTitle"), isEditing && shift ? `shift/${shift.id}` : "home"), el("main", {
        id: "main-content",
        tabIndex: -1,
        className: "page-content"
    }, form));
}
export function renderShiftDetail(ctx, shift) {
    const deletion = el("div", {
        className: "danger-confirm",
        hidden: true
    }, el("p", {
        text: ctx.t("shift.deleteConfirm")
    }));
    const confirmDelete = button(ctx.t("common.confirm"), {
        className: "button button-danger",
        dataset: {
            testid: "shift-delete-confirm"
        }
    });
    confirmDelete.addEventListener("click", ()=>{
        void ctx.run(async ()=>{
            await ctx.adapter.deleteShift(shift.id, shift.revision);
            await ctx.refresh("calendar");
        }, ctx.t("shift.deleted"));
    });
    deletion.append(confirmDelete, button(ctx.t("common.cancel"), {
        className: "button button-secondary",
        onclick: ()=>{
            deletion.hidden = true;
        }
    }));
    const duplicatePanel = el("section", {
        className: "action-panel",
        hidden: true
    });
    const duplicateDate = el("input", {
        type: "date",
        required: true,
        value: addDays(shift.date, 7),
        dataset: {
            testid: "duplicate-date"
        }
    });
    const duplicateForm = el("form", {
        className: "stack"
    }, field(ctx.t("shift.date"), duplicateDate), el("button", {
        type: "submit",
        className: "button button-primary",
        text: ctx.t("common.duplicate"),
        dataset: {
            testid: "duplicate-confirm"
        }
    }));
    duplicateForm.addEventListener("submit", (event)=>{
        event.preventDefault();
        if (!duplicateForm.reportValidity()) return;
        void ctx.run(async ()=>{
            const durationDays = Math.max(0, Math.round((Date.parse(`${shift.endDate}T00:00:00Z`) - Date.parse(`${shift.date}T00:00:00Z`)) / 86_400_000));
            const id = await ctx.adapter.duplicateShift(shift.id, {
                date: duplicateDate.value,
                startTime: shift.startTime,
                endDate: addDays(duplicateDate.value, durationDays),
                endTime: shift.endTime
            });
            await ctx.refresh(`shift/${encodeURIComponent(id)}`);
        });
    });
    duplicatePanel.append(duplicateForm);
    return el("div", {
        className: "page"
    }, pageHeader(ctx, ctx.t("shift.detailTitle"), "calendar"), el("main", {
        id: "main-content",
        tabIndex: -1,
        className: "page-content stack"
    }, el("section", {
        className: `shift-detail-hero status-${shift.status}`
    }, el("div", {}, el("p", {
        className: "eyebrow",
        text: shift.employerName
    }), el("h2", {
        text: formatDate(shift.date, ctx.language)
    })), el("span", {
        className: `status-badge status-${shift.status}`,
        text: statusLabel(ctx, shift.status)
    }), el("p", {
        className: "shift-time",
        text: `${shift.startTime} – ${shift.endTime}`
    })), shiftMetrics(ctx, shift), el("output", {
        className: "visually-hidden",
        dataset: {
            testid: "shift-total",
            ore: amountOre(shift.totalAmount)
        },
        text: formatMoney(shift.totalAmount, ctx.language)
    }), estimateNotice(ctx), el("section", {
        className: "stack",
        "aria-labelledby": "calculation-heading"
    }, el("h2", {
        id: "calculation-heading",
        text: ctx.t("shift.calculation")
    }), el("dl", {
        className: "calculation-lines"
    }, el("div", {}, el("dt", {
        text: ctx.t("shift.base")
    }), el("dd", {
        text: `${formatDuration(shift.paidSeconds, ctx.language)} · ${formatMoney(shift.baseAmount, ctx.language)}`
    })), shift.premiumLines.map((line)=>el("div", {}, el("dt", {
            text: line.ruleName
        }), el("dd", {
            text: `${formatDuration(line.seconds, ctx.language)} · ${formatMoney(line.amount, ctx.language)}`
        }))), [
        "shift.overtime",
        "shift.tax",
        "shift.net"
    ].map((key)=>el("div", {
            className: "calculation-unavailable"
        }, el("dt", {
            text: ctx.t(key)
        }), el("dd", {}, el("strong", {
            text: ctx.t("common.notAvailable")
        }), el("small", {
            text: ctx.t("shift.unavailableHint")
        })))))), el("section", {
        className: "stack",
        "aria-labelledby": "history-heading"
    }, el("h2", {
        id: "history-heading",
        text: ctx.t("shift.history")
    }), shift.history.length ? el("ol", {
        className: "history-list"
    }, shift.history.slice().reverse().map((item)=>el("li", {
            dataset: {
                testid: "history-entry",
                calculationId: item.id,
                totalOre: amountOre(item.total)
            }
        }, el("span", {
            text: formatTimestamp(item.calculatedAt, ctx.language)
        }), el("strong", {
            text: formatMoney(item.total, ctx.language)
        }), el("small", {
            text: `#${item.revision}`
        })))) : el("p", {
        text: ctx.t("shift.noHistory")
    })), el("div", {
        className: "form-actions"
    }, el("a", {
        href: href(`shift/${encodeURIComponent(shift.id)}/edit`),
        className: "button button-primary",
        text: ctx.t("common.edit"),
        dataset: {
            testid: "shift-edit"
        }
    }), button(ctx.t("shift.recalculate"), {
        className: "button button-secondary",
        dataset: {
            testid: "shift-recalculate"
        },
        onclick: ()=>{
            void ctx.run(async ()=>{
                await ctx.adapter.recalculateShift(shift.id, shift.revision);
                await ctx.refresh(`shift/${encodeURIComponent(shift.id)}`);
            }, ctx.t("shift.recalculated"));
        }
    }), button(ctx.t("common.duplicate"), {
        className: "button button-secondary",
        dataset: {
            testid: "shift-duplicate"
        },
        onclick: ()=>{
            duplicatePanel.hidden = false;
            duplicateDate.focus();
        }
    }), button(ctx.t("common.delete"), {
        className: "button button-danger",
        dataset: {
            testid: "shift-delete"
        },
        onclick: ()=>{
            deletion.hidden = false;
            confirmDelete.focus();
        }
    })), duplicatePanel, deletion));
}


//# sourceURL=ui/pages/shift.ts