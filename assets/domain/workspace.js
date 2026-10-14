import { DATABASE_NAME } from "../storage/index.js";
export const WORKSPACE_KEY = "lonkoll-workspace-mode-v1";
export const BUSINESS_DATABASE_NAME = "lonkoll-business-planning-v1";
export function parseWorkspaceMode(value) {
    return value === "business" ? "business" : "personal";
}
export function databaseNameForWorkspace(mode) {
    return mode === "business" ? BUSINESS_DATABASE_NAME : DATABASE_NAME;
}
export function readWorkspaceMode(storage) {
    try {
        return parseWorkspaceMode(storage.getItem(WORKSPACE_KEY));
    } catch  {
        return "personal";
    }
}
export function saveWorkspaceMode(storage, mode) {
    if (mode !== "personal" && mode !== "business") throw new Error("Invalid mode");
    storage.setItem(WORKSPACE_KEY, mode);
}


//# sourceURL=domain/workspace.ts