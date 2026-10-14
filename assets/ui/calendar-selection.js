function dateAtUtc(date) {
    return new Date(`${date}T00:00:00Z`);
}
function dateKey(date) {
    return date.toISOString().slice(0, 10);
}
function nextDate(date) {
    const result = dateAtUtc(date);
    result.setUTCDate(result.getUTCDate() + 1);
    return dateKey(result);
}
export function datesInMonth(anchor) {
    const start = `${anchor.slice(0, 7)}-01`;
    const nextMonthDate = dateAtUtc(start);
    nextMonthDate.setUTCMonth(nextMonthDate.getUTCMonth() + 1);
    const nextMonth = dateKey(nextMonthDate);
    const dates = [];
    for(let date = start; date < nextMonth; date = nextDate(date))dates.push(date);
    return dates;
}
export function isoWeekday(date) {
    const weekday = dateAtUtc(date).getUTCDay();
    return weekday === 0 ? 7 : weekday;
}
export function weekdaysInMonth(anchor) {
    return datesInMonth(anchor).filter((date)=>isoWeekday(date) <= 5);
}
export function weekendsInMonth(anchor) {
    return datesInMonth(anchor).filter((date)=>isoWeekday(date) >= 6);
}


//# sourceURL=ui/calendar-selection.ts