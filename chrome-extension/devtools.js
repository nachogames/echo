// Create the Echo panel in Chrome DevTools
chrome.devtools.panels.create(
    "Echo",
    "icons/icon16.png",
    "panel.html",
    function(panel) {
        // Panel created successfully
        console.log("Echo panel created");
    }
);