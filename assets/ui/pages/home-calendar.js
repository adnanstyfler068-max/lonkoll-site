import { el, button, field } from "../dom.js";
import { addDays, compareDate, formatDate, formatDuration, formatMoney, mondayFor, monthStart } from "../format.js";
import { datesInMonth, weekdaysInMonth, weekendsInMonth } from "../calendar-selection.js";
import { href } from "../router.js";
import { emptyState, estimateNotice, metric, pageHeader, shiftCard } from "./shared.js";
function dateInVisiblePeriod(date, anchor, mode) {
    if (mode === "month") return date.startsWith(anchor.slice(0, 7));
    const monday = mondayFor(anchor);
    return compareDate(date, monday) >= 0 && compareDate(date, addDays(monday, 7)) < 0;
}
function option(value, text, selected = false) {
    return el("option", {
        value,
        text,
        selected
    });
}
function bulkBreakRow(ctx) {
    const row = el("fieldset", {
        className: "break-row bulk-break-row"
    });
    const paid = el("input", {
        type: "checkbox",
        dataset: {
            field: "break-paid"
        }
    });
    const premium = el("input", {
        type: "checkbox",
        dataset: {
            field: "break-premium"
        },
        disabled: true
    });
    paid.addEventListener("change", ()=>{
        premium.disabled = !paid.checked;
        if (!paid.checked) premium.checked = false;
    });
    row.append(el("legend", {
        text: ctx.t("shift.breaks")
    }), el("div", {
        className: "form-grid form-grid-two"
    }, field(ctx.t("shift.breakStart"), el("input", {
        type: "time",
        required: true,
        dataset: {
            field: "break-start"
        }
    })), field(ctx.t("shift.breakEnd"), el("input", {
        type: "time",
        required: true,
        dataset: {
            field: "break-end"
        }
    }))), el("label", {
        className: "check-row"
    }, paid, el("span", {
        text: ctx.t("shift.breakPaid")
    })), el("label", {
        className: "check-row"
    }, premium, el("span", {
        text: ctx.t("shift.breakOb")
    })), button(ctx.t("shift.removeBreak"), {
        className: "button button-danger button-small",
        onclick: ()=>row.remove()
    }));
    return row;
}
function readBulkBreaks(container) {
    return [
        ...container.querySelectorAll(".bulk-break-row")
    ].map((row)=>({
            startTime: row.querySelector("[data-field='break-start']")?.value ?? "",
            endTime: row.querySelector("[data-field='break-end']")?.value ?? "",
            isPaid: row.querySelector("[data-field='break-paid']")?.checked ?? false,
            eligibleForPremium: row.querySelector("[data-field='break-premium']")?.checked ?? false
        }));
}
export function renderHome(ctx) {
    const { home, shifts, profile } = ctx.snapshot;
    const nextShift = home.nextShiftId ? shifts.find((shift)=>shift.id === home.nextShiftId) : undefined;
    return el("div", {
        className: "page",
        dataset: {
            testid: "home-screen"
        }
    }, pageHeader(ctx, ctx.t("home.title")), el("main", {
        id: "main-content",
        tabIndex: -1,
        className: "page-content stack"
    }, profile?.name ? el("p", {
        className: "greeting",
        text: ctx.t("home.greeting", {
            name: profile.name
        })
    }) : null, el("dl", {
        className: "dashboard-grid"
    }, metric(ctx.t("home.plannedHours"), formatDuration(home.plannedSeconds, ctx.language)), metric(ctx.t("home.workedHours"), formatDuration(home.workedSeconds, ctx.language)), metric(ctx.t("home.base"), formatMoney(home.baseAmount, ctx.language)), metric(ctx.t("home.ob"), formatMoney(home.premiumAmount, ctx.language)), metric(ctx.t("home.total"), formatMoney(home.totalAmount, ctx.language), "metric-featured")), estimateNotice(ctx), el("section", {
        className: "stack",
        "aria-labelledby": "next-shift-heading"
    }, el("h2", {
        id: "next-shift-heading",
        text: ctx.t("home.nextShift")
    }), nextShift ? el("div", {}, el("p", {
        className: "shift-date",
        text: formatDate(nextShift.date, ctx.language)
    }), shiftCard(ctx, nextShift)) : emptyState(ctx.t("home.noNextShift"))), el("a", {
        href: href("add"),
        className: "button button-primary button-wide",
        text: ctx.t("home.addShift"),
        dataset: {
            testid: "home-add-shift"
        }
    })));
}
export function renderCalendar(ctx, mode, requestedDate) {
    let anchor = requestedDate ?? ctx.snapshot.today;
    anchor = mode === "week" ? mondayFor(anchor) : monthStart(anchor);
    const visible = ctx.snapshot.shifts.filter((shift)=>dateInVisiblePeriod(shift.date, anchor, mode));
    const days = new Map();
    for (const shift of visible){
        const entries = days.get(shift.date) ?? [];
        entries.push(shift);
        days.set(shift.date, entries);
    }
    const previous = mode === "week" ? addDays(anchor, -7) : monthStart(addDays(anchor, -1));
    const next = mode === "week" ? addDays(anchor, 7) : monthStart(addDays(addDays(anchor, 32), -1));
    const rangeLabel = mode === "week" ? `${formatDate(anchor, ctx.language, {
        weekday: undefined
    })} – ${formatDate(addDays(anchor, 6), ctx.language, {
        weekday: undefined
    })}` : formatDate(anchor, ctx.language, {
        weekday: undefined,
        day: undefined,
        month: "long"
    });
    const list = el("div", {
        className: `calendar-list calendar-${mode}`,
        dataset: {
            testid: "calendar-grid"
        }
    });
    const selectedShifts = new Set();
    let selecting = false;
    const selectionBar = el("section", {
        className: "action-panel",
        hidden: true,
        dataset: {
            testid: "shift-selection-bar"
        }
    });
    const selectionCount = el("p", {
        "aria-live": "polite",
        dataset: {
            testid: "shift-selection-count"
        }
    });
    const refreshSelection = ()=>{
        selectionCount.textContent = ctx.t("calendar.selectedShifts", {
            count: selectedShifts.size
        });
        for (const item of list.querySelectorAll("[data-select-shift]"))item.classList.toggle("is-selected", selectedShifts.has(item.dataset.selectShift ?? ""));
        for (const toggle of list.querySelectorAll("[data-shift-select-toggle]"))toggle.hidden = !selecting;
        selectionBar.hidden = !selecting;
    };
    if (!visible.length && mode === "week") list.append(emptyState(ctx.t("calendar.empty"), el("a", {
        href: href("add"),
        className: "button button-primary",
        text: ctx.t("home.addShift")
    })));
    {
        const dates = mode === "week" ? Array.from({
            length: 7
        }, (_, index)=>addDays(anchor, index)) : datesInMonth(anchor);
        for (const date of dates){
            const dayShifts = (days.get(date) ?? []).sort((a, b)=>a.startTime.localeCompare(b.startTime) || a.id.localeCompare(b.id));
            const heading = mode === "month" ? el("button", {
                type: "button",
                className: "calendar-day-select",
                "aria-pressed": "false",
                text: formatDate(date, ctx.language),
                dataset: {
                    testid: "month-day-select",
                    date
                }
            }) : el("h2", {
                text: formatDate(date, ctx.language)
            });
            list.append(el("section", {
                className: "calendar-day",
                dataset: {
                    date
                }
            }, heading, dayShifts.length ? dayShifts.map((shift)=>{
                const card = shiftCard(ctx, shift);
                const select = el("button", {
                    type: "button",
                    className: "button button-secondary button-wide",
                    hidden: true,
                    text: ctx.t("calendar.selectShifts"),
                    dataset: {
                        selectShift: shift.id,
                        shiftSelectToggle: ""
                    }
                });
                select.addEventListener("click", (event)=>{
                    event.preventDefault();
                    selecting = true;
                    selectedShifts.has(shift.id) ? selectedShifts.delete(shift.id) : selectedShifts.add(shift.id);
                    refreshSelection();
                });
                return el("div", {
                    className: "stack",
                    dataset: {
                        selectShift: shift.id
                    }
                }, card, select);
            }) : el("p", {
                className: "calendar-day-empty",
                text: "–"
            })));
        }
    }
    const copyPanel = el("section", {
        className: "action-panel",
        hidden: true,
        dataset: {
            testid: "copy-week-panel"
        }
    }, el("h2", {
        text: ctx.t("calendar.copyTitle")
    }), el("p", {
        text: ctx.t("calendar.copyIntro")
    }));
    const target = el("input", {
        type: "date",
        required: true,
        min: "1900-01-01",
        max: "9999-12-31",
        dataset: {
            testid: "copy-week-target"
        }
    });
    const copyForm = el("form", {
        className: "inline-form"
    }, el("label", {
        text: ctx.t("calendar.targetWeek")
    }, target), el("button", {
        type: "submit",
        className: "button button-primary",
        text: ctx.t("calendar.copyConfirm"),
        dataset: {
            testid: "copy-week-confirm"
        }
    }), button(ctx.t("common.cancel"), {
        className: "button button-secondary",
        onclick: ()=>{
            copyPanel.hidden = true;
        },
        dataset: {
            testid: "copy-week-cancel"
        }
    }));
    copyForm.addEventListener("submit", (event)=>{
        event.preventDefault();
        if (!copyForm.reportValidity()) return;
        void ctx.run(async ()=>{
            await ctx.adapter.copyWeek(mondayFor(anchor), mondayFor(target.value));
            await ctx.refresh(`calendar?view=week&date=${encodeURIComponent(mondayFor(target.value))}`);
        });
    });
    copyPanel.append(copyForm);
    const bulkPanel = mode === "month" ? renderBulkPanel(ctx, anchor, list) : null;
    const selectMode = button(ctx.t("calendar.selectShifts"), {
        className: "button button-secondary",
        onclick: ()=>{
            selecting = !selecting;
            if (!selecting) selectedShifts.clear();
            refreshSelection();
        },
        dataset: {
            testid: "shift-select-mode"
        }
    });
    const operationPanel = el("section", {
        className: "stack",
        hidden: true,
        dataset: {
            testid: "shift-operation-preview"
        }
    });
    const showDeletePreview = ()=>{
        void ctx.run(async ()=>{
            const preview = await ctx.adapter.previewDeleteShifts([
                ...selectedShifts
            ]);
            operationPanel.replaceChildren(el("h3", {
                text: ctx.t("calendar.deleteSelected")
            }), el("p", {
                text: ctx.t("calendar.deletePreview", {
                    count: preview.affectedIds.length
                })
            }));
            const confirm = button(ctx.t("common.confirm"), {
                className: "button button-danger",
                dataset: {
                    testid: "shift-bulk-delete-confirm"
                },
                onclick: ()=>{
                    void ctx.run(async ()=>{
                        await ctx.adapter.deleteShifts(preview.affectedIds);
                        await ctx.refresh(`calendar?view=${mode}&date=${encodeURIComponent(anchor)}`);
                    });
                }
            });
            operationPanel.append(el("div", {
                className: "form-actions"
            }, confirm, button(ctx.t("common.cancel"), {
                className: "button button-secondary",
                onclick: ()=>{
                    operationPanel.hidden = true;
                }
            })));
            operationPanel.hidden = false;
        });
    };
    const patchForm = el("form", {
        className: "stack",
        hidden: true,
        dataset: {
            testid: "shift-bulk-patch-form"
        }
    });
    const patchStartEnabled = el("input", {
        type: "checkbox",
        dataset: {
            testid: "shift-patch-start-enabled"
        }
    });
    const patchStart = el("input", {
        type: "time",
        disabled: true,
        dataset: {
            testid: "shift-patch-start"
        }
    });
    const patchEndEnabled = el("input", {
        type: "checkbox",
        dataset: {
            testid: "shift-patch-end-enabled"
        }
    });
    const patchEnd = el("input", {
        type: "time",
        disabled: true,
        dataset: {
            testid: "shift-patch-end"
        }
    });
    const patchStatusEnabled = el("input", {
        type: "checkbox",
        dataset: {
            testid: "shift-patch-status-enabled"
        }
    });
    const patchStatus = el("select", {
        disabled: true,
        dataset: {
            testid: "shift-patch-status"
        }
    }, option("planned", ctx.t("shift.planned")), option("worked", ctx.t("shift.worked")));
    const patchEmployerEnabled = el("input", {
        type: "checkbox"
    });
    const patchEmployer = el("select", {
        disabled: true
    }, ctx.snapshot.employers.filter((item)=>!item.archived).map((item)=>option(item.id, item.name)));
    const patchRate = el("select", {
        disabled: true
    });
    const patchRulesEnabled = el("input", {
        type: "checkbox"
    });
    const patchRules = el("select", {
        disabled: true
    });
    const patchBreaksEnabled = el("input", {
        type: "checkbox"
    });
    const patchBreaks = el("div", {
        className: "break-list"
    });
    const addPatchBreak = button(ctx.t("shift.addBreak"), {
        className: "button button-secondary",
        disabled: true,
        onclick: ()=>patchBreaks.append(bulkBreakRow(ctx))
    });
    const refillPatchVersions = ()=>{
        patchRate.replaceChildren(...ctx.snapshot.rates.filter((item)=>item.employerId === patchEmployer.value).map((item)=>option(item.id, item.hourlyRate)));
        patchRules.replaceChildren(option("", ctx.t("common.none")), ...ctx.snapshot.ruleSets.filter((item)=>item.employerId === patchEmployer.value).map((item)=>option(item.id, item.name)));
    };
    patchEmployer.addEventListener("change", refillPatchVersions);
    refillPatchVersions();
    patchStartEnabled.addEventListener("change", ()=>{
        patchStart.disabled = !patchStartEnabled.checked;
        patchStart.required = patchStartEnabled.checked;
    });
    patchEndEnabled.addEventListener("change", ()=>{
        patchEnd.disabled = !patchEndEnabled.checked;
        patchEnd.required = patchEndEnabled.checked;
    });
    patchStatusEnabled.addEventListener("change", ()=>{
        patchStatus.disabled = !patchStatusEnabled.checked;
    });
    patchEmployerEnabled.addEventListener("change", ()=>{
        patchEmployer.disabled = !patchEmployerEnabled.checked;
        patchRate.disabled = !patchEmployerEnabled.checked;
    });
    patchRulesEnabled.addEventListener("change", ()=>{
        patchRules.disabled = !patchRulesEnabled.checked;
    });
    patchBreaksEnabled.addEventListener("change", ()=>{
        addPatchBreak.disabled = !patchBreaksEnabled.checked;
        if (patchBreaksEnabled.checked && !patchBreaks.children.length) patchBreaks.append(bulkBreakRow(ctx));
    });
    patchForm.append(el("h3", {
        text: ctx.t("calendar.patchTitle")
    }), el("label", {
        className: "check-row"
    }, patchEmployerEnabled, el("span", {
        text: ctx.t("shift.employer")
    })), patchEmployer, patchRate, el("label", {
        className: "check-row"
    }, patchStartEnabled, el("span", {
        text: ctx.t("shift.start")
    })), patchStart, el("label", {
        className: "check-row"
    }, patchEndEnabled, el("span", {
        text: ctx.t("shift.end")
    })), patchEnd, el("label", {
        className: "check-row"
    }, patchRulesEnabled, el("span", {
        text: ctx.t("shift.rules")
    })), patchRules, el("label", {
        className: "check-row"
    }, patchBreaksEnabled, el("span", {
        text: ctx.t("shift.breaks")
    })), patchBreaks, addPatchBreak, el("label", {
        className: "check-row"
    }, patchStatusEnabled, el("span", {
        text: ctx.t("shift.status")
    })), patchStatus, el("button", {
        type: "submit",
        className: "button button-primary",
        text: ctx.t("calendar.bulkApply"),
        dataset: {
            testid: "shift-patch-preview"
        }
    }));
    patchForm.addEventListener("submit", (event)=>{
        event.preventDefault();
        if (!patchForm.reportValidity()) return;
        void ctx.run(async ()=>{
            const patch = {
                ...patchEmployerEnabled.checked ? {
                    employerId: patchEmployer.value,
                    rateVersionId: patchRate.value
                } : {},
                ...patchStartEnabled.checked ? {
                    startTime: patchStart.value
                } : {},
                ...patchEndEnabled.checked ? {
                    endTime: patchEnd.value
                } : {},
                ...patchRulesEnabled.checked ? {
                    ruleSetVersionId: patchRules.value || null
                } : {},
                ...patchBreaksEnabled.checked ? {
                    breaks: readBulkBreaks(patchBreaks)
                } : {},
                ...patchStatusEnabled.checked ? {
                    status: patchStatus.value === "worked" ? "worked" : "planned"
                } : {}
            };
            const preview = await ctx.adapter.previewPatchShifts([
                ...selectedShifts
            ], patch);
            const confirm = button(ctx.t("common.confirm"), {
                className: "button button-primary",
                dataset: {
                    testid: "shift-patch-confirm"
                },
                onclick: ()=>{
                    void ctx.run(async ()=>{
                        await ctx.adapter.patchShifts(preview.affectedIds, patch);
                        await ctx.refresh(`calendar?view=${mode}&date=${encodeURIComponent(anchor)}`);
                    });
                }
            });
            operationPanel.replaceChildren(el("p", {
                text: ctx.t("calendar.patchFields", {
                    fields: preview.changedFields.join(", ")
                })
            }), el("p", {
                text: ctx.t("calendar.selectedShifts", {
                    count: preview.affectedIds.length
                })
            }), el("div", {
                className: "form-actions"
            }, confirm, button(ctx.t("common.cancel"), {
                className: "button button-secondary",
                onclick: ()=>{
                    operationPanel.hidden = true;
                }
            })));
            operationPanel.hidden = false;
        });
    });
    const duplicateForm = el("form", {
        className: "stack",
        hidden: true,
        dataset: {
            testid: "shift-duplicate-form"
        }
    });
    const duplicateDates = el("textarea", {
        required: true,
        rows: 4,
        placeholder: "2026-04-20\n2026-04-21",
        dataset: {
            testid: "shift-duplicate-dates"
        }
    });
    const duplicateMode = el("select", {}, option("ignore", ctx.t("calendar.ignoreConflicts")), option("replace", ctx.t("calendar.replaceConflicts")));
    duplicateForm.append(el("h3", {
        text: ctx.t("calendar.duplicateSelected")
    }), field(ctx.t("calendar.duplicateDates"), duplicateDates), field(ctx.t("calendar.conflictChoice"), duplicateMode), el("button", {
        type: "submit",
        className: "button button-primary",
        text: ctx.t("calendar.bulkApply"),
        dataset: {
            testid: "shift-duplicate-preview"
        }
    }));
    duplicateForm.addEventListener("submit", (event)=>{
        event.preventDefault();
        if (!duplicateForm.reportValidity() || selectedShifts.size !== 1) return;
        void ctx.run(async ()=>{
            const input = {
                sourceId: [
                    ...selectedShifts
                ][0],
                dates: duplicateDates.value.split(/\s+/u).filter(Boolean),
                conflictMode: duplicateMode.value === "replace" ? "replace" : "ignore"
            };
            const preview = await ctx.adapter.previewDuplicateShifts(input);
            const confirm = button(ctx.t("common.confirm"), {
                className: "button button-primary",
                dataset: {
                    testid: "shift-duplicate-confirm"
                },
                onclick: ()=>{
                    void ctx.run(async ()=>{
                        await ctx.adapter.duplicateShifts(input);
                        await ctx.refresh(`calendar?view=${mode}&date=${encodeURIComponent(anchor)}`);
                    });
                }
            });
            operationPanel.replaceChildren(el("p", {
                text: ctx.t("calendar.duplicatePreview", {
                    create: preview.createDates.length,
                    replace: preview.replaceDates.length,
                    conflict: preview.conflictDates.length
                })
            }), el("div", {
                className: "form-actions"
            }, confirm, button(ctx.t("common.cancel"), {
                className: "button button-secondary",
                onclick: ()=>{
                    operationPanel.hidden = true;
                }
            })));
            operationPanel.hidden = false;
        });
    });
    selectionBar.append(selectionCount, el("div", {
        className: "bulk-selection-actions"
    }, button(ctx.t("calendar.editSelected"), {
        className: "button button-secondary",
        dataset: {
            testid: "shift-bulk-edit"
        },
        onclick: ()=>{
            patchForm.hidden = false;
            duplicateForm.hidden = true;
        }
    }), button(ctx.t("calendar.deleteSelected"), {
        className: "button button-danger",
        onclick: showDeletePreview,
        dataset: {
            testid: "shift-bulk-delete"
        }
    }), button(ctx.t("calendar.duplicateSelected"), {
        className: "button button-secondary",
        dataset: {
            testid: "shift-bulk-duplicate"
        },
        onclick: ()=>{
            duplicateForm.hidden = false;
            patchForm.hidden = true;
        }
    }), button(ctx.t("calendar.clearSelection"), {
        className: "button button-secondary",
        onclick: ()=>{
            selectedShifts.clear();
            refreshSelection();
        }
    })), patchForm, duplicateForm, operationPanel);
    refreshSelection();
    return el("div", {
        className: "page"
    }, pageHeader(ctx, ctx.t("calendar.title")), el("main", {
        id: "main-content",
        tabIndex: -1,
        className: "page-content stack"
    }, el("div", {
        className: "segmented",
        role: "group",
        "aria-label": ctx.t("calendar.title")
    }, el("a", {
        href: href(`calendar?view=week&date=${encodeURIComponent(anchor)}`),
        className: mode === "week" ? "active" : "",
        "aria-current": mode === "week" ? "page" : undefined,
        text: ctx.t("calendar.week")
    }), el("a", {
        href: href(`calendar?view=month&date=${encodeURIComponent(anchor)}`),
        className: mode === "month" ? "active" : "",
        "aria-current": mode === "month" ? "page" : undefined,
        text: ctx.t("calendar.month")
    })), el("div", {
        className: "period-navigation"
    }, el("a", {
        href: href(`calendar?view=${mode}&date=${previous}`),
        className: "icon-button",
        "aria-label": ctx.t("common.previous"),
        text: "‹"
    }), el("strong", {
        text: rangeLabel,
        "aria-live": "polite"
    }), el("a", {
        href: href(`calendar?view=${mode}&date=${next}`),
        className: "icon-button",
        "aria-label": ctx.t("common.next"),
        text: "›"
    })), list, selectMode, selectionBar, bulkPanel, mode === "week" ? button(ctx.t("calendar.copyWeek"), {
        className: "button button-secondary button-wide",
        onclick: ()=>{
            copyPanel.hidden = false;
            target.focus();
        },
        dataset: {
            testid: "copy-week"
        }
    }) : null, mode === "week" ? copyPanel : null));
}
function renderBulkPanel(ctx, anchor, list) {
    const selected = new Set();
    const count = el("p", {
        className: "selection-count",
        "aria-live": "polite",
        dataset: {
            testid: "month-selected-count"
        }
    });
    const form = el("form", {
        className: "stack bulk-shift-form",
        hidden: true,
        dataset: {
            testid: "bulk-shift-form"
        }
    });
    const controls = el("div", {
        className: "bulk-selection-controls"
    });
    const updateSelection = ()=>{
        for (const day of list.querySelectorAll(".calendar-day")){
            const pressed = selected.has(day.dataset.date ?? "");
            day.classList.toggle("is-selected", pressed);
            day.querySelector("[data-testid='month-day-select']")?.setAttribute("aria-pressed", String(pressed));
        }
        count.textContent = ctx.t("calendar.selectedDays", {
            count: selected.size
        });
        form.hidden = selected.size === 0;
    };
    const choose = (dates)=>{
        selected.clear();
        dates.forEach((date)=>selected.add(date));
        updateSelection();
    };
    controls.append(button(ctx.t("calendar.selectAllMonth"), {
        type: "button",
        className: "button button-secondary",
        onclick: ()=>choose(datesInMonth(anchor)),
        dataset: {
            testid: "select-all-month"
        }
    }), button(ctx.t("calendar.selectWeekdays"), {
        type: "button",
        className: "button button-secondary",
        onclick: ()=>choose(weekdaysInMonth(anchor)),
        dataset: {
            testid: "select-weekdays"
        }
    }), button(ctx.t("calendar.selectWeekends"), {
        type: "button",
        className: "button button-secondary",
        onclick: ()=>choose(weekendsInMonth(anchor)),
        dataset: {
            testid: "select-weekends"
        }
    }), button(ctx.t("calendar.clearSelection"), {
        type: "button",
        className: "button button-secondary",
        onclick: ()=>choose([]),
        dataset: {
            testid: "clear-month-selection"
        }
    }));
    for (const toggle of list.querySelectorAll("[data-testid='month-day-select']")){
        toggle.addEventListener("click", ()=>{
            const date = toggle.dataset.date;
            selected.has(date) ? selected.delete(date) : selected.add(date);
            updateSelection();
        });
    }
    const employer = el("select", {
        required: true,
        dataset: {
            testid: "bulk-employer"
        }
    }, ctx.snapshot.employers.filter((item)=>!item.archived).map((item, index)=>option(item.id, item.name, index === 0)));
    const rate = el("select", {
        required: true,
        dataset: {
            testid: "bulk-rate"
        }
    });
    const rules = el("select", {
        dataset: {
            testid: "bulk-rules"
        }
    });
    const refillVersions = ()=>{
        const rates = ctx.snapshot.rates.filter((item)=>item.employerId === employer.value);
        rate.replaceChildren(...rates.map((item, index)=>option(item.id, item.hourlyRate, index === 0)));
        rules.replaceChildren(option("", ctx.t("common.none"), true), ...ctx.snapshot.ruleSets.filter((item)=>item.employerId === employer.value).map((item)=>option(item.id, item.name)));
    };
    employer.addEventListener("change", refillVersions);
    refillVersions();
    const action = el("select", {
        dataset: {
            testid: "bulk-action"
        }
    }, option("create", ctx.t("calendar.bulkCreate"), true), option("replace", ctx.t("calendar.bulkReplace")));
    const start = el("input", {
        type: "time",
        required: true,
        value: "09:00",
        dataset: {
            testid: "bulk-start"
        }
    });
    const end = el("input", {
        type: "time",
        required: true,
        value: "17:00",
        dataset: {
            testid: "bulk-end"
        }
    });
    const status = el("select", {
        dataset: {
            testid: "bulk-status"
        }
    }, option("planned", ctx.t("shift.planned"), true), option("worked", ctx.t("shift.worked")));
    const breaks = el("div", {
        className: "break-list"
    });
    const confirmation = el("section", {
        className: "action-panel",
        hidden: true,
        dataset: {
            testid: "bulk-confirmation"
        }
    });
    const buildInput = ()=>({
            dates: [
                ...selected
            ].sort(),
            mode: action.value === "replace" ? "replace" : "create",
            employerId: employer.value,
            rateVersionId: rate.value,
            ...rules.value ? {
                ruleSetVersionId: rules.value
            } : {},
            startTime: start.value,
            endTime: end.value,
            timeZone: "Europe/Stockholm",
            status: status.value === "worked" ? "worked" : "planned",
            breaks: readBulkBreaks(breaks)
        });
    const apply = button(ctx.t("calendar.bulkApply"), {
        type: "submit",
        className: "button button-primary",
        dataset: {
            testid: "bulk-preview"
        }
    });
    form.append(el("h2", {
        text: ctx.t("calendar.bulkTitle")
    }), el("p", {
        className: "field-hint",
        text: ctx.t("calendar.bulkHint")
    }), field(ctx.t("calendar.bulkAction"), action), field(ctx.t("shift.employer"), employer), el("div", {
        className: "form-grid form-grid-two"
    }, field(ctx.t("shift.start"), start), field(ctx.t("shift.end"), end)), el("div", {
        className: "form-grid form-grid-two"
    }, field(ctx.t("shift.status"), status), field(ctx.t("shift.rate"), rate)), field(ctx.t("shift.rules"), rules), el("section", {
        className: "stack"
    }, el("h3", {
        text: ctx.t("shift.breaks")
    }), breaks, button(ctx.t("shift.addBreak"), {
        type: "button",
        className: "button button-secondary",
        onclick: ()=>breaks.append(bulkBreakRow(ctx))
    })), apply);
    form.addEventListener("submit", (event)=>{
        event.preventDefault();
        if (!form.reportValidity()) return;
        void ctx.run(async ()=>{
            const input = buildInput();
            const preview = await ctx.adapter.previewBulkShifts(input);
            confirmation.replaceChildren(...[
                el("h3", {
                    text: ctx.t("calendar.bulkConfirmTitle")
                }),
                el("p", {
                    text: ctx.t("calendar.bulkPreview", {
                        create: preview.createDates.length,
                        update: preview.updateDates.length,
                        conflict: preview.conflictDates.length
                    })
                }),
                ...preview.conflictDates.length ? [
                    el("p", {
                        className: "warning",
                        text: ctx.t("calendar.bulkConflicts", {
                            dates: preview.conflictDates.join(", ")
                        })
                    })
                ] : []
            ]);
            const confirm = button(ctx.t("common.confirm"), {
                type: "button",
                className: "button button-primary",
                dataset: {
                    testid: "bulk-confirm"
                }
            });
            confirm.addEventListener("click", ()=>{
                void ctx.run(async ()=>{
                    const result = await ctx.adapter.applyBulkShifts(input);
                    await ctx.refresh(`calendar?view=month&date=${encodeURIComponent(anchor)}`);
                    ctx.notify(ctx.t("calendar.bulkApplied", {
                        create: result.createDates.length,
                        update: result.updateDates.length,
                        conflict: result.conflictDates.length
                    }), "success");
                });
            });
            confirmation.append(el("div", {
                className: "form-actions"
            }, confirm, button(ctx.t("common.cancel"), {
                type: "button",
                className: "button button-secondary",
                onclick: ()=>{
                    confirmation.hidden = true;
                }
            })));
            confirmation.hidden = false;
        });
    });
    updateSelection();
    return el("section", {
        className: "action-panel stack",
        dataset: {
            testid: "month-bulk-panel"
        }
    }, el("h2", {
        text: ctx.t("calendar.selectTitle")
    }), controls, count, form, confirmation);
}


//# sourceURL=ui/pages/home-calendar.ts