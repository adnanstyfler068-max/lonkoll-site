import { el, icon } from "../dom.js";
import { href } from "../router.js";
import { formatDuration, formatMoney } from "../format.js";
export function pageHeader(ctx, title, backPath) {
    return el("header", {
        className: "page-header"
    }, backPath ? el("a", {
        className: "icon-button back-button",
        href: href(backPath),
        "aria-label": ctx.t("common.back")
    }, icon("chevron")) : null, el("h1", {
        text: title
    }));
}
export function estimateNotice(ctx) {
    return el("aside", {
        className: "notice estimate-notice",
        role: "note"
    }, el("strong", {
        text: ctx.t("estimate.configuredOnly")
    }), el("p", {
        text: ctx.t("estimate.notice")
    }));
}
export function emptyState(message, action) {
    return el("div", {
        className: "empty-state"
    }, el("p", {
        text: message
    }), action ?? null);
}
export function statusLabel(ctx, status) {
    return ctx.t(status === "worked" ? "shift.worked" : "shift.planned");
}
export function amountOre(value) {
    const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value);
    if (!match) return undefined;
    try {
        return (BigInt(match[1]) * 100n + BigInt((match[2] ?? "").padEnd(2, "0"))).toString();
    } catch  {
        return undefined;
    }
}
export function shiftCard(ctx, shift) {
    return el("a", {
        href: href(`shift/${encodeURIComponent(shift.id)}`),
        className: `shift-card status-${shift.status}`,
        dataset: {
            testid: "shift-card",
            shiftDate: shift.date,
            shiftId: shift.id
        }
    }, el("span", {
        className: "shift-card-time",
        text: `${shift.startTime}–${shift.endTime}`
    }), el("span", {
        className: "shift-card-body"
    }, el("strong", {
        text: shift.employerName
    }), el("small", {
        text: `${statusLabel(ctx, shift.status)} · ${ctx.t(shift.statusMode === "automatic" ? "shift.statusAutomatic" : "shift.statusManual")}`
    })), el("span", {
        className: "shift-card-total",
        text: formatMoney(shift.totalAmount, ctx.language)
    }));
}
export function metric(label, value, className = "") {
    return el("div", {
        className: `metric ${className}`.trim()
    }, el("dt", {
        text: label
    }), el("dd", {
        text: value
    }));
}
export function shiftMetrics(ctx, shift) {
    return el("dl", {
        className: "metrics-grid"
    }, metric(ctx.t("shift.grossDuration"), formatDuration(shift.grossSeconds, ctx.language)), metric(ctx.t("shift.unpaidBreaks"), formatDuration(shift.unpaidSeconds, ctx.language)), metric(ctx.t("shift.paidTime"), formatDuration(shift.paidSeconds, ctx.language)), metric(ctx.t("shift.base"), formatMoney(shift.baseAmount, ctx.language)), metric(ctx.t("shift.ob"), formatMoney(shift.premiumAmount, ctx.language)), metric(ctx.t("shift.total"), formatMoney(shift.totalAmount, ctx.language), "metric-total"));
}


//# sourceURL=ui/pages/shared.ts