import { el } from "../dom.js";
import { addDays, formatDate, formatDuration, formatMoney, mondayFor, monthStart } from "../format.js";
import { href } from "../router.js";
import { estimateNotice, metric, pageHeader } from "./shared.js";
function summaryBucket(ctx, title, bucket, testid) {
    return el("section", {
        className: "summary-card stack",
        dataset: {
            testid
        },
        "aria-labelledby": `${testid}-heading`
    }, el("h2", {
        id: `${testid}-heading`,
        text: title
    }), el("dl", {
        className: "metrics-grid"
    }, metric(ctx.t("summary.hours"), formatDuration(bucket.seconds, ctx.language)), metric(ctx.t("summary.base"), formatMoney(bucket.baseAmount, ctx.language)), metric(ctx.t("summary.ob"), formatMoney(bucket.premiumAmount, ctx.language)), metric(ctx.t("summary.total"), formatMoney(bucket.totalAmount, ctx.language), "metric-total")));
}
export function renderSummaries(ctx, kind, requestedDate) {
    const anchor = kind === "week" ? mondayFor(requestedDate ?? ctx.snapshot.today) : monthStart(requestedDate ?? ctx.snapshot.today);
    const summary = ctx.snapshot.summary;
    const previous = kind === "week" ? addDays(anchor, -7) : monthStart(addDays(anchor, -1));
    const next = kind === "week" ? addDays(anchor, 7) : monthStart(addDays(anchor, 32));
    const periodLabel = kind === "week" ? `${formatDate(anchor, ctx.language, {
        weekday: undefined
    })} – ${formatDate(addDays(anchor, 6), ctx.language, {
        weekday: undefined
    })}` : formatDate(anchor, ctx.language, {
        weekday: undefined,
        day: undefined,
        month: "long"
    });
    return el("div", {
        className: "page"
    }, pageHeader(ctx, ctx.t("summary.title")), el("main", {
        id: "main-content",
        tabIndex: -1,
        className: "page-content stack",
        dataset: {
            testid: "summary-screen"
        }
    }, el("div", {
        className: "segmented",
        role: "group",
        "aria-label": ctx.t("summary.title")
    }, el("a", {
        href: href(`summaries?period=week&date=${anchor}`),
        className: kind === "week" ? "active" : "",
        "aria-current": kind === "week" ? "page" : undefined,
        text: ctx.t("calendar.week")
    }), el("a", {
        href: href(`summaries?period=month&date=${anchor}`),
        className: kind === "month" ? "active" : "",
        "aria-current": kind === "month" ? "page" : undefined,
        text: ctx.t("calendar.month")
    })), el("div", {
        className: "period-navigation"
    }, el("a", {
        href: href(`summaries?period=${kind}&date=${previous}`),
        className: "icon-button",
        "aria-label": ctx.t("common.previous"),
        text: "‹"
    }), el("strong", {
        text: periodLabel,
        "aria-live": "polite"
    }), el("a", {
        href: href(`summaries?period=${kind}&date=${next}`),
        className: "icon-button",
        "aria-label": ctx.t("common.next"),
        text: "›"
    })), summaryBucket(ctx, ctx.t("summary.planned"), summary.planned, "summary-planned"), summaryBucket(ctx, ctx.t("summary.worked"), summary.worked, "summary-worked"), kind === "month" ? ctx.snapshot.monthlyTax.map((item)=>el("section", {
            className: "summary-card stack",
            dataset: {
                testid: "monthly-tax"
            }
        }, el("h2", {
            text: item.employerName
        }), el("dl", {
            className: "metrics-grid"
        }, metric(ctx.t("summary.base"), formatMoney(item.baseAmount, ctx.language)), metric(ctx.t("summary.ob"), formatMoney(item.premiumAmount, ctx.language)), metric(ctx.t("summary.total"), formatMoney(item.gross, ctx.language), "metric-total")), item.calculation ? el("div", {
            className: "stack"
        }, el("p", {
            text: `${ctx.t("tax.table")} ${item.calculation.tableNumber} · ${ctx.t("tax.column")} ${item.calculation.column}`
        }), el("p", {
            text: `${ctx.t("tax.preliminary")}: ${formatMoney(item.calculation.totalTax, ctx.language)}`
        }), el("p", {
            className: "metric-total",
            text: `${ctx.t("tax.net")}: ${formatMoney(item.calculation.net, ctx.language)}`
        }), el("a", {
            href: href(`settings/tax`),
            className: "button button-secondary",
            text: ctx.t("tax.details")
        })) : el("div", {
            className: "notice"
        }, el("p", {
            text: item.unavailableReason === "unconfigured" ? ctx.t("tax.unconfigured") : item.unavailableReason === "unconfirmed" ? ctx.t("tax.unconfirmed") : ctx.t("tax.unavailable")
        }), el("a", {
            href: href("settings/tax"),
            className: "button button-secondary",
            text: ctx.t("tax.configure")
        })))) : null, estimateNotice(ctx)));
}


//# sourceURL=ui/pages/summary.ts