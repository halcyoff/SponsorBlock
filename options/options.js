window.addEventListener('DOMContentLoaded', init);

var invidiousInstancesRegex = [];
for (const url of supportedInvidiousInstances) {
    invidiousInstancesRegex.push("https://*." + url + "/*");
    invidiousInstancesRegex.push("http://*." + url + "/*");
}

async function init() {
    localizeHtmlPage();

    await wait(() => SB.config !== undefined);

    // Set all of the toggle options to the correct option
    let optionsContainer = document.getElementById("options");
    let optionsElements = optionsContainer.children;

    for (let i = 0; i < optionsElements.length; i++) {
        switch (optionsElements[i].getAttribute("option-type")) {
            case "toggle": 
                let option = optionsElements[i].getAttribute("sync-option");
                let optionResult = SB.config[option];

                let checkbox = optionsElements[i].querySelector("input");
                let reverse = optionsElements[i].getAttribute("toggle-type") === "reverse";

                if (optionResult != undefined) {
                    checkbox.checked = optionResult;

                    if (reverse) {
                        optionsElements[i].querySelector("input").checked = !optionResult;
                    }
                }

                // See if anything extra should be run first time
                switch (option) {
                    case "supportInvidious":
                        invidiousInit(checkbox, option);
                        break;
                }

                // Add click listener
                checkbox.addEventListener("click", () => {
                    setOptionValue(option, reverse ? !checkbox.checked : checkbox.checked);

                    // See if anything extra must be run
                    switch (option) {
                        case "supportInvidious":
                            invidiousOnClick(checkbox, option);
                            break;
                    }
                });
                break;
            case "text-change":
                let button = optionsElements[i].querySelector(".trigger-button");
                button.addEventListener("click", () => activateTextChange(optionsElements[i]));

                break;
            case "keybind-change":
                let keybindButton = optionsElements[i].querySelector(".trigger-button");
                keybindButton.addEventListener("click", () => activateKeybindChange(optionsElements[i]));

                break;
        }
    }

    optionsContainer.classList.remove("hidden");
    optionsContainer.classList.add("animated");
}

/**
 * Run when the invidious button is being initialized
 * 
 * @param {HTMLElement} checkbox 
 * @param {string} option 
 */
function invidiousInit(checkbox, option) {
    let permissions = ["declarativeContent"];
    if (isFirefox()) permissions = [];

    chrome.permissions.contains({
        origins: invidiousInstancesRegex,
        permissions: permissions
    }, function (result) {
        if (result != checkbox.checked) {
            setOptionValue(option, result);

            checkbox.checked = result;
        }
    });
}

/**
 * Run whenever the invidious checkbox is clicked
 * 
 * @param {HTMLElement} checkbox 
 * @param {string} option 
 */
function invidiousOnClick(checkbox, option) {
    if (checkbox.checked) {
        // Request permission
        let permissions = ["declarativeContent"];
        if (isFirefox()) permissions = [];

        chrome.permissions.request({
            origins: invidiousInstancesRegex,
            permissions: permissions
        }, async function (granted) {
            if (granted) {
                let js = [
                    "config.js",
                    "utils/previewBar.js",
                    "utils/skipNotice.js",
                    "utils.js",
                    "content.js",
                    "popup.js"
                ];
                let css = [
                    "content.css",
                    "./libs/Source+Sans+Pro.css",
                    "popup.css"
                ];

                if (isFirefox()) {
                    let firefoxJS = [];
                    for (const file of js) {
                        firefoxJS.push({file});
                    }
                    let firefoxCSS = [];
                    for (const file of css) {
                        firefoxCSS.push({file});
                    }

                    chrome.runtime.sendMessage({
                        message: "registerContentScript",
                        id: "invidious",
                        allFrames: true,
                        js: firefoxJS,
                        css: firefoxCSS,
                        matches: invidiousInstancesRegex
                    });
                } else {
                    chrome.declarativeContent.onPageChanged.removeRules(["invidious"], function() {
                        let conditions = [];
                        for (const regex of invidiousInstancesRegex) {
                            conditions.push(new chrome.declarativeContent.PageStateMatcher({
                                pageUrl: { urlMatches: regex }
                            }));
                        }
                        // Add page rule
                        let rule = {
                            id: "invidious",
                            conditions,
                            actions: [new chrome.declarativeContent.RequestContentScript({
                                    allFrames: true,
                                    js,
                                    css
                            })]
                        };
                        
                        chrome.declarativeContent.onPageChanged.addRules([rule]);
                    });
                }
            } else {
                setOptionValue(option, false);
                checkbox.checked = false;

                chrome.declarativeContent.onPageChanged.removeRules(["invidious"]);
            }
        });
    } else {
        if (isFirefox()) {
            chrome.runtime.sendMessage({
                message: "unregisterContentScript",
                id: "invidious"
            });
        } else {
            chrome.declarativeContent.onPageChanged.removeRules(["invidious"]);
        }

        chrome.permissions.remove({
            origins: invidiousInstancesRegex
        });
    }
}

/**
 * Will trigger the container to ask the user for a keybind.
 * 
 * @param {HTMLElement} element 
 */
function activateKeybindChange(element) {
    let button = element.querySelector(".trigger-button");
    if (button.classList.contains("disabled")) return;

    button.classList.add("disabled");

    let option = element.getAttribute("sync-option");

    let currentlySet = SB.config[option] !== null ? chrome.i18n.getMessage("keybindCurrentlySet") : "";
    
    let status = element.querySelector(".option-hidden-section > .keybind-status");
    status.innerText = chrome.i18n.getMessage("keybindDescription") + currentlySet;

    if (SB.config[option] !== null) {
        let statusKey = element.querySelector(".option-hidden-section > .keybind-status-key");
        statusKey.innerText = SB.config[option];
    }

    element.querySelector(".option-hidden-section").classList.remove("hidden");
    
    document.addEventListener("keydown", (e) => keybindKeyPressed(element, e), {once: true});
}

/**
 * Called when a key is pressed in an activiated keybind change option.
 * 
 * @param {HTMLElement} element 
 * @param {KeyboardEvent} e
 */
function keybindKeyPressed(element, e) {
    e = e || window.event;
    var key = e.key;

    let option = element.getAttribute("sync-option");

    SB.config[option] = key;

    let status = element.querySelector(".option-hidden-section > .keybind-status");
    status.innerText = chrome.i18n.getMessage("keybindDescriptionComplete");

    let statusKey = element.querySelector(".option-hidden-section > .keybind-status-key");
    statusKey.innerText = key;

    let button = element.querySelector(".trigger-button");

    button.classList.remove("disabled");
}

/**
 * Will trigger the textbox to appear to be able to change an option's text.
 * 
 * @param {HTMLElement} element 
 */
function activateTextChange(element) {
    let button = element.querySelector(".trigger-button");
    if (button.classList.contains("disabled")) return;

    button.classList.add("disabled");

    let textBox = element.querySelector(".option-text-box");
    let option = element.getAttribute("sync-option");
	
	textBox.value = SB.config[option];

<<<<<<< HEAD
    // See if anything extra must be done
    switch (option) {
        case "invidiousInstances":

            let setButton = element.querySelector(".text-change-set");
            setButton.addEventListener("click", async function(e) {
                if (textBox.value.includes("/") || textBox.value.includes("http") || textBox.value.includes(":")) {
                    alert(chrome.i18n.getMessage("addInvidiousInstanceError"));
                } else {
                    // Add this
                    //TODO Make the call to invidiousOnClick support passing the straight extra values, plus make the get not needed
                    //OR merge the config PR and use that
                    let result = await new Promise((resolve, reject) => {
                        chrome.storage.sync.get([option], resolve);
                    });

                    if (!result[option]) result[option] = [];

                    result[option].push(textBox.value);

                    await new Promise((resolve, reject) => {
                        setOptionValue(option, result[option], resolve);
                    });

                    let checkbox = document.querySelector("#support-invidious input");
                    checkbox.checked = true;

                    invidiousOnClick(checkbox, "supportInvidious");

                    textBox.value = "";

                    // Hide this section again
                    element.querySelector(".option-hidden-section").classList.add("hidden");
                    button.classList.remove("disabled");
                }
            });

            let resetButton = element.querySelector(".invidious-instance-reset");
            resetButton.addEventListener("click", function(e) {
                if (confirm(chrome.i18n.getMessage("resetInvidiousInstanceAlert"))) {
                    setOptionValue(option, []);
                }
            });
    
            element.querySelector(".option-hidden-section").classList.remove("hidden");

            return;
    }

    chrome.storage.sync.get([option], function(result) {
        textBox.value = result[option];

        let setButton = element.querySelector(".text-change-set");
        setButton.addEventListener("click", (e) => setOptionValue(option, textBox.value));

        element.querySelector(".option-hidden-section").classList.remove("hidden");
    });
}

/**
 * Called when an option has been changed.
 * 
 * @param {string} option 
 * @param {*} value 
 */
function setOptionValue(option, value, callback) {
    chrome.storage.sync.set({[option]: value}, callback);
}
=======
    let setButton = element.querySelector(".text-change-set");
    setButton.addEventListener("click", () => {SB.config[option] = textBox.value});

    element.querySelector(".option-hidden-section").classList.remove("hidden");
}
>>>>>>> c53bc202941f8dbf2f5481a891ca28a69825304b
