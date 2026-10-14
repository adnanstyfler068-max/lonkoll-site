import { BrowserPlanningAdapter } from "./application/adapter.js";
import { mountLonkollUI } from "./ui/index.js";
import { databaseNameForWorkspace, readWorkspaceMode } from "./domain/workspace.js";
import { PlanningStore } from "./storage/index.js";
function requiredRoot() {
    const root = document.getElementById("app");
    if (!root) throw new Error("Application root is missing");
    return root;
}
function announce(message) {
    const region = document.getElementById("app-announcer");
    if (region) region.textContent = message;
}
function showUpdate(registration) {
    if (document.querySelector("[data-update-prompt]")) return;
    const language = document.documentElement.lang.startsWith("sv") ? "sv" : "en";
    const prompt = document.createElement("div");
    prompt.className = "update-prompt";
    prompt.dataset.updatePrompt = "";
    prompt.setAttribute("role", "status");
    const message = document.createElement("span");
    message.textContent = language === "sv" ? "En ny version är tillgänglig." : "A new version is available.";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "button button-primary";
    button.textContent = language === "sv" ? "Uppdatera" : "Update";
    button.addEventListener("click", ()=>{
        const worker = registration.waiting;
        if (!worker) return;
        sessionStorage.setItem("lonkoll-update-requested", "1");
        worker.postMessage({
            type: "SKIP_WAITING"
        });
    });
    prompt.append(message, button);
    document.body.append(prompt);
    announce(message.textContent);
}
async function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    try {
        const registration = await navigator.serviceWorker.register("./sw.js");
        if (registration.waiting) showUpdate(registration);
        registration.addEventListener("updatefound", ()=>{
            const installing = registration.installing;
            installing?.addEventListener("statechange", ()=>{
                if (installing.state === "installed" && navigator.serviceWorker.controller) showUpdate(registration);
            });
        });
        navigator.serviceWorker.addEventListener("controllerchange", ()=>{
            if (sessionStorage.getItem("lonkoll-update-requested") === "1") {
                sessionStorage.removeItem("lonkoll-update-requested");
                window.location.reload();
            }
        });
    } catch  {}
}
try {
    mountLonkollUI({
        root: requiredRoot(),
        adapter: new BrowserPlanningAdapter(new PlanningStore({
            databaseName: databaseNameForWorkspace(readWorkspaceMode(localStorage))
        }))
    });
    void registerServiceWorker();
} catch  {
    const root = requiredRoot();
    root.removeAttribute("aria-busy");
    root.replaceChildren();
    const heading = document.createElement("h1");
    heading.textContent = "LönKoll";
    const message = document.createElement("p");
    message.setAttribute("role", "alert");
    message.textContent = "Lokala data kunde inte öppnas. / Local data could not be opened.";
    root.append(heading, message);
}


//# sourceURL=app.ts