import { el, field } from "../dom.js";
import { isLanguage } from "../../i18n/index.js";
import { readImportFile, validateImportFile } from "../import-file.js";
export function renderOnboarding(ctx) {
    const language = el("select", {
        id: "onboarding-language",
        required: true,
        dataset: {
            testid: "onboarding-language"
        }
    }, el("option", {
        value: "sv",
        text: "Svenska"
    }), el("option", {
        value: "en",
        text: "English"
    }));
    language.value = ctx.language;
    language.addEventListener("change", ()=>{
        const value = language.value;
        if (isLanguage(value)) {
            document.documentElement.lang = value === "sv" ? "sv-SE" : "en";
            window.dispatchEvent(new CustomEvent("lonkoll:preview-language", {
                detail: value
            }));
        }
    });
    const name = el("input", {
        id: "onboarding-name",
        name: "name",
        type: "text",
        required: true,
        maxLength: 100,
        autoComplete: "name",
        placeholder: ctx.t("onboarding.namePlaceholder"),
        dataset: {
            testid: "onboarding-name"
        }
    });
    const employerName = el("input", {
        id: "onboarding-employer",
        name: "employerName",
        type: "text",
        required: true,
        maxLength: 160,
        autoComplete: "organization",
        placeholder: ctx.t("onboarding.employerPlaceholder"),
        dataset: {
            testid: "onboarding-employer-name"
        }
    });
    const hourlyRate = el("input", {
        id: "onboarding-rate",
        name: "hourlyRate",
        type: "text",
        required: true,
        inputMode: "decimal",
        pattern: "[0-9]+([,.][0-9]{1,2})?",
        placeholder: "165,50",
        dataset: {
            testid: "onboarding-hourly-rate"
        }
    });
    const form = el("form", {
        className: "stack onboarding-form",
        noValidate: false,
        dataset: {
            testid: "onboarding-form"
        }
    }, field(ctx.t("onboarding.language"), language), field(ctx.t("onboarding.name"), name), field(ctx.t("onboarding.employer"), employerName), field(ctx.t("onboarding.rate"), hourlyRate, {
        hint: ctx.t("onboarding.rateHint")
    }), el("button", {
        type: "submit",
        className: "button button-primary button-wide",
        text: ctx.t("onboarding.submit"),
        dataset: {
            testid: "onboarding-submit"
        }
    }));
    form.addEventListener("submit", (event)=>{
        event.preventDefault();
        if (!form.reportValidity() || !isLanguage(language.value)) return;
        void ctx.run(async ()=>{
            await ctx.adapter.completeOnboarding({
                language: language.value,
                name: name.value.trim(),
                employerName: employerName.value.trim(),
                hourlyRate: hourlyRate.value.trim().replace(",", ".")
            });
            await ctx.refresh("home");
        });
    });
    const importInput = el("input", {
        type: "file",
        accept: "application/json,.json",
        className: "visually-hidden",
        "aria-label": ctx.t("data.chooseFile"),
        dataset: {
            testid: "import-file"
        }
    });
    const importButton = el("button", {
        type: "button",
        className: "button button-link",
        text: ctx.t("data.import"),
        dataset: {
            testid: "onboarding-import"
        }
    });
    importButton.addEventListener("click", ()=>importInput.click());
    const importConfirmation = el("div", {
        className: "import-confirmation stack",
        hidden: true
    }, el("p", {
        className: "warning",
        text: ctx.t("data.importWarning")
    }));
    const selectedFileName = el("p", {
        className: "file-name",
        "aria-live": "polite"
    });
    const confirmImport = el("button", {
        type: "button",
        className: "button button-primary",
        text: ctx.t("data.importConfirm"),
        dataset: {
            testid: "confirm-import"
        }
    });
    importConfirmation.append(selectedFileName, confirmImport);
    importInput.addEventListener("change", ()=>{
        const file = importInput.files?.item(0);
        if (!file) return;
        try {
            validateImportFile(file);
            selectedFileName.textContent = file.name;
            importConfirmation.hidden = false;
            confirmImport.focus();
        } catch  {
            importInput.value = "";
            importConfirmation.hidden = true;
            ctx.notify(ctx.t("error.fileTooLarge"), "error");
        }
    });
    confirmImport.addEventListener("click", ()=>{
        const file = importInput.files?.item(0);
        if (!file) return;
        void ctx.run(async ()=>{
            await ctx.adapter.importData(await readImportFile(file), {
                replaceExisting: true
            });
            await ctx.refresh("home");
        }, ctx.t("data.imported"));
    });
    return el("main", {
        id: "main-content",
        tabIndex: -1,
        className: "onboarding-page",
        dataset: {
            testid: "onboarding-screen"
        }
    }, el("section", {
        className: "onboarding-card",
        "aria-labelledby": "onboarding-title"
    }, el("p", {
        className: "eyebrow",
        text: ctx.t("onboarding.eyebrow")
    }), el("h1", {
        id: "onboarding-title",
        text: ctx.t("onboarding.title")
    }), el("p", {
        className: "lede",
        text: ctx.t("onboarding.intro")
    }), form, el("p", {
        className: "privacy-note",
        text: ctx.t("onboarding.privacy")
    }), el("div", {
        className: "onboarding-import"
    }, importInput, importButton, importConfirmation)));
}


//# sourceURL=ui/pages/onboarding.ts