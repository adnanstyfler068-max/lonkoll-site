export function el(tag, attributes = {}, ...children) {
    const node = document.createElement(tag);
    for (const [name, value] of Object.entries(attributes)){
        if (value === undefined || value === null || value === false) continue;
        if (name === "className") {
            node.className = String(value);
        } else if (name === "text") {
            node.textContent = String(value);
        } else if (name === "dataset" && typeof value === "object") {
            for (const [dataName, dataValue] of Object.entries(value)){
                if (dataValue !== undefined) node.dataset[dataName] = String(dataValue);
            }
        } else if (name === "style" && typeof value === "object") {
            Object.assign(node.style, value);
        } else if (name.startsWith("on") && typeof value === "function") {
            node.addEventListener(name.slice(2).toLowerCase(), value);
        } else if (name in node && !name.startsWith("aria-") && name !== "role") {
            try {
                node[name] = value;
            } catch  {
                node.setAttribute(name, String(value));
            }
        } else {
            node.setAttribute(name, value === true ? "" : String(value));
        }
    }
    append(node, ...children);
    return node;
}
export function append(parent, ...children) {
    for (const child of children){
        if (child === undefined || child === null || child === false) continue;
        if (Array.isArray(child)) append(parent, ...child);
        else parent.append(child instanceof Node ? child : document.createTextNode(String(child)));
    }
}
export function clear(node) {
    node.replaceChildren();
}
export function icon(name) {
    const paths = {
        home: "M3 11.5 12 4l9 7.5V21h-6v-6H9v6H3z",
        calendar: "M5 3v3m14-3v3M4 8h16v12H4z",
        plus: "M12 5v14M5 12h14",
        chart: "M5 20V10m7 10V4m7 16v-7",
        settings: "M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zm0-12v2m0 13v2m8.5-8.5h-2m-13 0h-2m14.5-6-1.5 1.5m-9 9L6 18m12 0-1.5-1.5m-9-9L6 6",
        chevron: "m9 18 6-6-6-6",
        clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zm0-13v5l3 2"
    };
    const svgNamespace = "http:" + "//www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNamespace, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    const path = document.createElementNS(svgNamespace, "path");
    path.setAttribute("d", paths[name]);
    path.setAttribute("fill", name === "home" ? "currentColor" : "none");
    path.setAttribute("stroke", "currentColor");
    path.setAttribute("stroke-width", "1.8");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    svg.append(path);
    return svg;
}
export function heading(title, options = {}) {
    const level = options.level ?? 1;
    return el("header", {
        className: "page-heading"
    }, options.eyebrow ? el("p", {
        className: "eyebrow",
        text: options.eyebrow
    }) : null, el(`h${level}`, {
        text: title
    }));
}
export function field(labelText, control, options = {}) {
    if (!control.id) control.id = `field-${crypto.randomUUID()}`;
    const hintId = options.hint ? `${control.id}-hint` : "";
    if (hintId) control.setAttribute("aria-describedby", hintId);
    return el("div", {
        className: `field ${options.className ?? ""}`.trim()
    }, el("label", {
        htmlFor: control.id,
        text: labelText
    }), control, options.hint ? el("p", {
        id: hintId,
        className: "field-hint",
        text: options.hint
    }) : null);
}
export function actionLink(href, label, className = "button button-secondary") {
    return el("a", {
        href,
        className,
        text: label
    });
}
export function button(label, attributes = {}) {
    return el("button", {
        type: "button",
        ...attributes,
        text: label
    });
}
export function testId(value) {
    return {
        dataset: {
            testid: value
        }
    };
}


//# sourceURL=ui/dom.ts