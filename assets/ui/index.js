import { htmlLanguage, isLanguage, translator } from "../i18n/index.js";
import { el, icon } from "./dom.js";
import { HashRouter, href, navigate, parseRoute } from "./router.js";
import { renderOnboarding } from "./pages/onboarding.js";
import { renderCalendar, renderHome } from "./pages/home-calendar.js";
import { renderShiftDetail, renderShiftForm } from "./pages/shift.js";
import { renderSummaries } from "./pages/summary.js";
import { renderEmployerCalendarImport } from "./pages/employer-calendar.js";
import { renderAgreementCatalog, renderData, renderEmployers, renderInstall, renderProfile, renderRates, renderRecurrences, renderRules, renderSettings, renderTax } from "./pages/settings.js";
export * from "./types.js";
export { href, navigate, parseRoute } from "./router.js";
export function defineUIAdapter(adapter) {
    return adapter;
}
function routeRoot(route) {
    if (route.name === "home") return "home";
    if (route.name === "calendar" || route.name === "shift" || route.name === "edit-shift") return "calendar";
    if (route.name === "new-shift") return "add";
    if (route.name === "summaries") return "summaries";
    if ([
        "settings",
        "profile",
        "employers",
        "rates",
        "rules",
        "recurrences",
        "data",
        "tax",
        "install",
        "agreement-catalog"
    ].includes(route.name)) return "settings";
    return undefined;
}
function userErrorKey(error) {
    if (!error || typeof error !== "object") return "common.error";
    const code = "code" in error && typeof error.code === "string" ? error.code.toLowerCase() : "";
    if (code.includes("local_time") || code.includes("localtime") || code.includes("dst")) return "error.invalidLocalTime";
    if (code.includes("configuration") || code.includes("employment") || code.includes("rate_valid")) return "error.invalidConfiguration";
    if (code.includes("duplicate")) return "error.duplicate";
    if (code.includes("stale") || code.includes("revision")) return "error.stale";
    if (code.includes("corrupt") || code.includes("invalid_import")) return "error.corruptImport";
    if (code.includes("schema") || code.includes("version")) return "error.unsupportedSchema";
    if (code.includes("file_too_large")) return "error.fileTooLarge";
    if (code.includes("not_found") || code.includes("shift_not_found")) return "error.shiftNotFound";
    if (code.includes("storage") || code.includes("indexeddb") || code.includes("database")) return "error.storage";
    return "error.invalidInput";
}
class LonkollUI {
    root;
    adapter;
    router;
    snapshot;
    language;
    renderToken = 0;
    unsubscribe;
    destroyed = false;
    previewLanguageListener;
    onlineListener;
    visibilityListener;
    statusTimer;
    constructor(options){
        this.root = options.root;
        this.adapter = options.adapter;
        this.language = options.initialLanguage ?? "sv";
        this.router = new HashRouter(()=>{
            void this.refresh();
        });
        this.previewLanguageListener = (event)=>{
            if (isLanguage(event.detail)) {
                this.language = event.detail;
                this.render(parseRoute());
            }
        };
        this.onlineListener = ()=>this.updateConnectionStatus();
        this.visibilityListener = ()=>{
            if (document.visibilityState === "visible") void this.refreshAutomaticStatuses();
        };
        window.addEventListener("lonkoll:preview-language", this.previewLanguageListener);
        window.addEventListener("online", this.onlineListener);
        window.addEventListener("offline", this.onlineListener);
        document.addEventListener("visibilitychange", this.visibilityListener);
        this.statusTimer = window.setInterval(()=>{
            void this.refreshAutomaticStatuses();
        }, 60_000);
        this.unsubscribe = this.adapter.subscribe?.(()=>{
            void this.refresh();
        });
        this.renderLoading();
        this.router.start();
        void this.refreshAutomaticStatuses();
    }
    async refresh() {
        if (this.destroyed) return;
        const token = ++this.renderToken;
        const route = parseRoute();
        try {
            const snapshot = await this.adapter.loadSnapshot(route.name === "summaries" ? {
                summaryKind: route.period,
                anchorDate: route.date
            } : undefined);
            if (token !== this.renderToken || this.destroyed) return;
            this.snapshot = snapshot;
            if (snapshot.profile) this.language = snapshot.profile.language;
            if (!snapshot.profile?.onboardingComplete && route.name !== "onboarding") {
                navigate("onboarding", true);
                return;
            }
            if (snapshot.profile?.onboardingComplete && route.name === "onboarding") {
                navigate("home", true);
                return;
            }
            this.render(route);
        } catch (error) {
            if (token !== this.renderToken || this.destroyed) return;
            this.renderFailure(error);
        }
    }
    destroy() {
        this.destroyed = true;
        this.router.destroy();
        this.unsubscribe?.();
        window.removeEventListener("lonkoll:preview-language", this.previewLanguageListener);
        window.removeEventListener("online", this.onlineListener);
        window.removeEventListener("offline", this.onlineListener);
        document.removeEventListener("visibilitychange", this.visibilityListener);
        window.clearInterval(this.statusTimer);
        this.root.replaceChildren();
    }
    async refreshAutomaticStatuses() {
        if (this.destroyed) return;
        try {
            if (await this.adapter.reconcileAutomaticStatuses() > 0) await this.refresh();
        } catch  {}
    }
    renderLoading() {
        const t = translator(this.language);
        this.root.replaceChildren(el("div", {
            className: "app-loading",
            role: "status",
            "aria-live": "polite"
        }, el("p", {
            text: t("common.loading")
        })));
    }
    context() {
        const snapshot = this.snapshot;
        if (!snapshot) throw new Error("UI snapshot unavailable");
        const t = translator(this.language);
        return {
            adapter: this.adapter,
            snapshot,
            language: this.language,
            t,
            run: async (action, successMessage)=>{
                this.root.setAttribute("aria-busy", "true");
                try {
                    await action();
                    if (successMessage) this.notify(successMessage, "success");
                } catch (error) {
                    this.notify(t(userErrorKey(error)), "error");
                } finally{
                    this.root.removeAttribute("aria-busy");
                }
            },
            refresh: async (path)=>{
                if (path) {
                    const target = href(path);
                    if (window.location.hash !== target) {
                        window.location.hash = target;
                        return;
                    }
                }
                await this.refresh();
            },
            notify: (message, kind)=>this.notify(message, kind)
        };
    }
    render(route) {
        if (!this.snapshot) return;
        const ctx = this.context();
        const t = ctx.t;
        document.documentElement.lang = htmlLanguage(this.language);
        document.title = t("app.name");
        const documentSkipLink = document.querySelector("body > .skip-link");
        if (documentSkipLink) documentSkipLink.textContent = t("skip.content");
        let page;
        switch(route.name){
            case "onboarding":
                page = renderOnboarding(ctx);
                break;
            case "home":
                page = renderHome(ctx);
                break;
            case "calendar":
                page = renderCalendar(ctx, route.view, route.date);
                break;
            case "new-shift":
                page = renderShiftForm(ctx);
                break;
            case "shift":
                {
                    const shift = this.snapshot.shifts.find((item)=>item.id === route.id);
                    page = shift ? renderShiftDetail(ctx, shift) : this.notFoundPage(ctx);
                    break;
                }
            case "edit-shift":
                {
                    const shift = this.snapshot.shifts.find((item)=>item.id === route.id);
                    page = shift ? renderShiftForm(ctx, shift) : this.notFoundPage(ctx);
                    break;
                }
            case "summaries":
                page = renderSummaries(ctx, route.period, route.date);
                break;
            case "settings":
                page = renderSettings(ctx);
                break;
            case "profile":
                page = renderProfile(ctx);
                break;
            case "employers":
                page = renderEmployers(ctx);
                break;
            case "rates":
                page = renderRates(ctx);
                break;
            case "rules":
                page = renderRules(ctx);
                break;
            case "recurrences":
                page = renderRecurrences(ctx);
                break;
            case "data":
                page = renderData(ctx);
                break;
            case "tax":
                page = renderTax(ctx);
                break;
            case "agreement-catalog":
                page = renderAgreementCatalog(ctx);
                break;
            case "employer-calendar-import":
                page = renderEmployerCalendarImport(ctx);
                break;
            case "install":
                page = renderInstall(ctx);
                break;
            default:
                page = this.notFoundPage(ctx);
                break;
        }
        const content = route.name === "onboarding" ? page : el("div", {
            className: "app-layout"
        }, el("div", {
            className: "connection-banner",
            hidden: navigator.onLine,
            role: "status",
            dataset: {
                connectionStatus: ""
            },
            text: t("status.offline")
        }), page, this.bottomNavigation(route));
        const shell = el("div", {
            className: "lonkoll-app"
        }, content, el("div", {
            className: "toast-region",
            dataset: {
                toastRegion: ""
            },
            "aria-live": "polite",
            "aria-atomic": "true"
        }));
        this.root.replaceChildren(shell);
        this.root.removeAttribute("aria-busy");
        this.updateConnectionStatus();
        requestAnimationFrame(()=>document.getElementById("main-content")?.focus({
                preventScroll: true
            }));
    }
    bottomNavigation(route) {
        const t = translator(this.language);
        const active = routeRoot(route);
        const item = (root, path, label, iconName, testid)=>el("a", {
                href: href(path),
                className: active === root ? "active" : "",
                "aria-current": active === root ? "page" : undefined,
                dataset: {
                    testid
                }
            }, icon(iconName), el("span", {
                text: label
            }));
        return el("nav", {
            className: "bottom-nav",
            "aria-label": t("app.name")
        }, item("home", "home", t("nav.home"), "home", "nav-home"), item("calendar", "calendar", t("nav.calendar"), "calendar", "nav-calendar"), item("add", "add", t("nav.add"), "plus", "nav-add"), item("summaries", "summaries", t("nav.summaries"), "chart", "nav-summaries"), item("settings", "settings", t("nav.settings"), "settings", "nav-settings"));
    }
    notify(message, kind = "info") {
        const region = this.root.querySelector("[data-toast-region]");
        if (!region) return;
        const toast = el("div", {
            className: `toast toast-${kind}`,
            role: kind === "error" ? "alert" : "status"
        }, el("span", {
            text: message
        }), el("button", {
            type: "button",
            className: "toast-close",
            "aria-label": translator(this.language)("toast.dismiss"),
            text: "×",
            onclick: ()=>toast.remove()
        }));
        region.append(toast);
        window.setTimeout(()=>toast.remove(), 6_000);
    }
    updateConnectionStatus() {
        const banner = this.root.querySelector("[data-connection-status]");
        if (!banner) return;
        banner.hidden = navigator.onLine;
        banner.textContent = translator(this.language)(navigator.onLine ? "status.online" : "status.offline");
    }
    notFoundPage(ctx) {
        return el("main", {
            id: "main-content",
            tabIndex: -1,
            className: "page-content empty-state"
        }, el("h1", {
            text: ctx.t("error.shiftNotFound")
        }), el("a", {
            href: href("home"),
            className: "button button-primary",
            text: ctx.t("nav.home")
        }));
    }
    renderFailure(error) {
        const t = translator(this.language);
        this.root.replaceChildren(el("main", {
            id: "main-content",
            tabIndex: -1,
            className: "fatal-error"
        }, el("h1", {
            text: t("common.error")
        }), el("p", {
            text: t(userErrorKey(error))
        }), el("button", {
            type: "button",
            className: "button button-primary",
            text: t("common.retry"),
            onclick: ()=>{
                void this.refresh();
            }
        })));
        this.root.removeAttribute("aria-busy");
    }
}
export function mountLonkollUI(options) {
    return new LonkollUI(options);
}


//# sourceURL=ui/index.ts