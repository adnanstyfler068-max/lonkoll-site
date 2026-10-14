function cleanHash(hash) {
    return hash.replace(/^#\/?/, "");
}
export function parseRoute(hash = window.location.hash) {
    const raw = cleanHash(hash);
    const [path, query = ""] = raw.split("?");
    let parts;
    try {
        parts = path.split("/").filter(Boolean).map(decodeURIComponent);
    } catch  {
        return {
            name: "not-found"
        };
    }
    const params = new URLSearchParams(query);
    if (parts.length === 0 || parts[0] === "home") return {
        name: "home"
    };
    if (parts[0] === "onboarding") return {
        name: "onboarding"
    };
    if (parts[0] === "calendar") {
        const date = params.get("date");
        const route = {
            name: "calendar",
            view: params.get("view") === "month" ? "month" : "week"
        };
        return date ? {
            ...route,
            date
        } : route;
    }
    if (parts[0] === "add") return {
        name: "new-shift"
    };
    if (parts[0] === "shift" && parts[1] && parts[2] === "edit") return {
        name: "edit-shift",
        id: parts[1]
    };
    if (parts[0] === "shift" && parts[1]) return {
        name: "shift",
        id: parts[1]
    };
    if (parts[0] === "summaries") {
        const date = params.get("date");
        const route = {
            name: "summaries",
            period: params.get("period") === "month" ? "month" : "week"
        };
        return date ? {
            ...route,
            date
        } : route;
    }
    if (parts[0] === "settings" && !parts[1]) return {
        name: "settings"
    };
    if (parts[0] === "settings" && parts[1] === "profile") return {
        name: "profile"
    };
    if (parts[0] === "settings" && parts[1] === "employers") return {
        name: "employers"
    };
    if (parts[0] === "settings" && parts[1] === "rates") return {
        name: "rates"
    };
    if (parts[0] === "settings" && parts[1] === "rules") return {
        name: "rules"
    };
    if (parts[0] === "settings" && parts[1] === "recurrences") return {
        name: "recurrences"
    };
    if (parts[0] === "settings" && parts[1] === "data") return {
        name: "data"
    };
    if (parts[0] === "settings" && parts[1] === "agreement-catalog") return {
        name: "agreement-catalog"
    };
    if (parts[0] === "settings" && parts[1] === "tax") return {
        name: "tax"
    };
    if (parts[0] === "settings" && parts[1] === "install") return {
        name: "install"
    };
    return {
        name: "not-found"
    };
}
export function href(path) {
    return `#/${path.replace(/^\//, "")}`;
}
export function navigate(path, replace = false) {
    const target = href(path);
    if (replace) window.location.replace(target);
    else window.location.hash = target;
}
export class HashRouter {
    listener;
    constructor(onChange){
        this.listener = ()=>onChange(parseRoute());
        window.addEventListener("hashchange", this.listener);
    }
    start() {
        this.listener();
    }
    destroy() {
        window.removeEventListener("hashchange", this.listener);
    }
}


//# sourceURL=ui/router.ts