export function formatMoney(value, language) {
    const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(value.trim());
    if (!match) return value;
    const sign = match[1];
    const integer = match[2].replace(/\B(?=(\d{3})+(?!\d))/g, language === "sv" ? "\u202f" : ",");
    const fraction = (match[3] ?? "").padEnd(2, "0");
    return `${sign}${integer}${language === "sv" ? "," : "."}${fraction} SEK`;
}
export function formatDuration(seconds, language) {
    if (!Number.isSafeInteger(seconds) || seconds < 0) return "–";
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor(seconds % 3600 / 60);
    return language === "sv" ? `${hours} h ${String(minutes).padStart(2, "0")} min` : `${hours} hr ${String(minutes).padStart(2, "0")} min`;
}
export function formatDate(isoDate, language, options = {}) {
    const [year, month, day] = isoDate.split("-").map(Number);
    if (!year || !month || !day) return isoDate;
    const formatterOptions = {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric",
        ...options,
        timeZone: "UTC"
    };
    return new Intl.DateTimeFormat(language === "sv" ? "sv-SE" : "en-GB", formatterOptions).format(new Date(Date.UTC(year, month - 1, day, 12)));
}
export function formatTimestamp(iso, language) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return iso;
    return new Intl.DateTimeFormat(language === "sv" ? "sv-SE" : "en-GB", {
        dateStyle: "medium",
        timeStyle: "short"
    }).format(date);
}
export function addDays(isoDate, days) {
    const [year, month, day] = isoDate.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day + days));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}
export function mondayFor(isoDate) {
    const [year, month, day] = isoDate.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    const weekday = date.getUTCDay() || 7;
    return addDays(isoDate, 1 - weekday);
}
export function monthStart(isoDate) {
    return `${isoDate.slice(0, 7)}-01`;
}
export function compareDate(a, b) {
    return a.localeCompare(b);
}


//# sourceURL=ui/format.ts