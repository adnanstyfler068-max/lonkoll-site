export class EmployerCalendarError extends Error {
    constructor(message){
        super(message);
        this.name = "EmployerCalendarError";
    }
}
const fail = (message)=>{
    throw new EmployerCalendarError(message);
};
export const MAX_EMPLOYER_CALENDAR_BYTES = 1_000_000;
export const MAX_EMPLOYER_SHIFTS = 200;
const day = /^20\d\d-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/;
const hour = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
function checkDay(date) {
    if (!day.test(date) || new Date(date + "T12:00:00Z").toISOString().slice(0, 10) !== date) fail("Invalid calendar date: " + date);
    return date;
}
function checkTime(time) {
    if (!hour.test(time)) fail("Invalid time: " + time);
    return time;
}
function nextDay(date) {
    const d = new Date(date + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
}
function validShift(date, startTime, endDate, endTime, label, breaks = []) {
    checkDay(date);
    checkDay(endDate);
    checkTime(startTime);
    checkTime(endTime);
    if (endDate < date || endDate === date && endTime <= startTime || Date.parse(endDate + "T" + endTime + ":00Z") - Date.parse(date + "T" + startTime + ":00Z") > 24 * 3600000) fail("Shift must last between 1 minute and 24 hours");
    if (breaks.length > 10) fail("Too many breaks");
    for (const b of breaks){
        checkDay(b.startDate);
        checkDay(b.endDate);
        checkTime(b.startTime);
        checkTime(b.endTime);
        if (b.startDate + "T" + b.startTime < date + "T" + startTime || b.endDate + "T" + b.endTime > endDate + "T" + endTime || b.endDate + "T" + b.endTime <= b.startDate + "T" + b.startTime) fail("Break outside working hours");
    }
    return {
        date,
        startTime,
        endDate,
        endTime,
        label: label.slice(0, 100),
        breaks
    };
}
function parseCsvRows(text, delimiter) {
    const rows = [];
    let row = [], cell = "", quoted = false;
    for(let i = 0; i < text.length; i++){
        const ch = text[i];
        if (ch === '"') {
            if (quoted && text[i + 1] === '"') {
                cell += '"';
                i++;
            } else if (!quoted && cell.length === 0) quoted = true;
            else if (quoted) quoted = false;
            else fail("Invalid CSV quoting");
        } else if (ch === delimiter && !quoted) {
            row.push(cell.trim());
            cell = "";
        } else if ((ch === "\n" || ch === "\r") && !quoted) {
            if (ch === "\r" && text[i + 1] === "\n") i++;
            row.push(cell.trim());
            if (row.some((x)=>x)) rows.push(row);
            row = [];
            cell = "";
        } else {
            cell += ch;
        }
    }
    if (quoted) fail("Unclosed CSV quote");
    row.push(cell.trim());
    if (row.some((x)=>x)) rows.push(row);
    if (rows.length > MAX_EMPLOYER_SHIFTS + 1) fail("Too many CSV rows");
    return rows;
}
function parseCsv(source) {
    const first = source.split(/\r?\n/, 1)[0];
    const sep = first.includes(";") ? ";" : ",";
    const rows = parseCsvRows(source, sep);
    if (rows.length < 2) fail("CSV needs a header and at least one shift");
    const header = rows[0].map((x)=>x.toLowerCase().replace(/[^a-z0-9_åäö]/g, ""));
    const col = (names)=>header.findIndex((x)=>names.includes(x));
    const dateCol = col([
        "date",
        "datum",
        "startdate",
        "startdatum"
    ]);
    const startCol = col([
        "start",
        "starttime",
        "starttid",
        "från",
        "fran"
    ]);
    const endCol = col([
        "end",
        "endtime",
        "slut",
        "sluttid",
        "till"
    ]);
    const endDateCol = col([
        "enddate",
        "slutdatum"
    ]);
    const labelCol = col([
        "summary",
        "title",
        "description",
        "pass",
        "shift"
    ]);
    const pauseStartCol = col([
        "breakstart",
        "pausstart",
        "raststart"
    ]);
    const pauseEndCol = col([
        "breakend",
        "pausend",
        "rastslut"
    ]);
    if (dateCol < 0 || startCol < 0 || endCol < 0) fail("CSV headers required: date,start,end (or datum,start,slut)");
    return rows.slice(1).map((row, index)=>{
        if (row.length !== header.length) fail("CSV row " + (index + 2) + " has wrong column count");
        const date = checkDay(row[dateCol]);
        const start = checkTime(row[startCol]);
        const end = checkTime(row[endCol]);
        const endDate = endDateCol >= 0 && row[endDateCol] ? checkDay(row[endDateCol]) : end <= start ? nextDay(date) : date;
        let breaks = [];
        const pauseStart = pauseStartCol >= 0 ? row[pauseStartCol] : "";
        const pauseEnd = pauseEndCol >= 0 ? row[pauseEndCol] : "";
        if (Boolean(pauseStart) !== Boolean(pauseEnd)) fail("CSV break start and end must both be provided");
        if (pauseStart && pauseEnd) {
            checkTime(pauseStart);
            checkTime(pauseEnd);
            const bStartDate = pauseStart < start ? endDate : date;
            const bEndDate = pauseEnd <= pauseStart ? nextDay(bStartDate) : bStartDate;
            breaks = [
                {
                    startDate: bStartDate,
                    startTime: pauseStart,
                    endDate: bEndDate,
                    endTime: pauseEnd,
                    isPaid: false,
                    eligibleForPremium: false
                }
            ];
        }
        return validShift(date, start, endDate, end, labelCol >= 0 ? row[labelCol] : "Work", breaks);
    });
}
function localInstant(input, name) {
    const match = /^(20\d\d)(\d\d)(\d\d)T(\d\d)(\d\d)(\d\d)?(Z)?$/.exec(input);
    if (!match) throw new EmployerCalendarError(name + " must be a dated appointment with time");
    const date = checkDay(`${match[1]}-${match[2]}-${match[3]}`), time = checkTime(`${match[4]}:${match[5]}`);
    if (match[6] && match[6] !== "00") fail(name + " requires whole-minute precision");
    if (!match[7]) return {
        date,
        time
    };
    const utc = Date.parse(date + "T" + time + ":00Z");
    const parts = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Europe/Stockholm",
        hourCycle: "h23",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
    }).formatToParts(new Date(utc));
    const val = (k)=>parts.find((p)=>p.type === k)?.value ?? "";
    return {
        date: `${val("year")}-${val("month")}-${val("day")}`,
        time: `${val("hour")}:${val("minute")}`
    };
}
function parseIcs(text) {
    const normalized = text.replace(/\r\n[ \t]|\n[ \t]/g, "").replace(/\r\n?/g, "\n");
    const lines = normalized.split("\n");
    if (!lines.some((l)=>l.trim() === "BEGIN:VCALENDAR")) fail("Not an iCalendar file");
    const events = [];
    let current = null;
    for (const raw of lines){
        const line = raw.trim();
        if (line === "BEGIN:VEVENT") {
            if (current) fail("Nested calendar events");
            current = {};
            continue;
        }
        if (line === "END:VEVENT") {
            if (!current) throw new EmployerCalendarError("Unexpected VEVENT end");
            events.push(current);
            current = null;
            continue;
        }
        if (!current) continue;
        const colon = line.indexOf(":");
        if (colon < 0) continue;
        const key = line.slice(0, colon).toUpperCase();
        const val = line.slice(colon + 1);
        const base = key.split(";")[0];
        if ([
            "DTSTART",
            "DTEND",
            "RRULE",
            "EXDATE",
            "RECURRENCE-ID",
            "STATUS",
            "SUMMARY",
            "DURATION"
        ].includes(base)) {
            if (current[base] !== undefined) fail("Duplicate " + base + " property");
            if ((base === "DTSTART" || base === "DTEND") && key.includes("TZID=") && !key.includes("TZID=EUROPE/STOCKHOLM")) fail("Unsupported timezone; export Europe/Stockholm or UTC");
            current[base] = val;
        }
    }
    if (current) fail("Incomplete VEVENT");
    if (events.length < 1 || events.length > MAX_EMPLOYER_SHIFTS) fail("Calendar needs 1–200 events");
    const result = [];
    for (const event of events){
        if (event.STATUS === "CANCELLED") continue;
        if (event.RRULE || event.EXDATE || event["RECURRENCE-ID"]) fail("Recurring calendars must be expanded to individual shifts before import");
        if (event.DURATION) fail("Calendar DURATION unsupported; use DTEND");
        if (!event.DTSTART || !event.DTEND) fail("Calendar events must contain DTSTART and DTEND");
        const start = localInstant(event.DTSTART, "DTSTART"), end = localInstant(event.DTEND, "DTEND");
        result.push(validShift(start.date, start.time, end.date, end.time, event.SUMMARY ?? "Work"));
    }
    if (!result.length) fail("Calendar contains no active shifts");
    return result;
}
export function parseEmployerCalendar(text, fileName) {
    if (new TextEncoder().encode(text).length > MAX_EMPLOYER_CALENDAR_BYTES) fail("Calendar exceeds 1 MB");
    if (text.includes("\u0000")) fail("Binary calendars are unsupported");
    const source = text.replace(/^\uFEFF/, "");
    const parsed = fileName.toLowerCase().endsWith(".ics") ? parseIcs(source) : fileName.toLowerCase().endsWith(".csv") ? parseCsv(source) : fail("Choose a .ics or .csv file");
    if (!parsed.length || parsed.length > MAX_EMPLOYER_SHIFTS) fail("Choose 1–200 shifts");
    const unique = new Set(parsed.map((s)=>[
            s.date,
            s.startTime,
            s.endDate,
            s.endTime
        ].join("|")));
    if (unique.size !== parsed.length) fail("Duplicate shifts in imported file");
    const sorted = [
        ...parsed
    ].sort((a, b)=>(a.date + a.startTime).localeCompare(b.date + b.startTime));
    for(let i = 1; i < sorted.length; i++){
        const previous = sorted[i - 1], current = sorted[i];
        if (current.date + "T" + current.startTime < previous.endDate + "T" + previous.endTime) fail("Overlapping shifts in the file; correct them before importing");
    }
    return sorted;
}


//# sourceURL=domain/employerCalendar.ts