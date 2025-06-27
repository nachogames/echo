// Create the Echo panel in Chrome DevTools and start capturing network requests early

// Buffer to store requests before panel opens
let bufferedRequests = [];
const MAX_BUFFERED_REQUESTS = 500;

// Start capturing network requests as soon as DevTools opens
chrome.devtools.network.onRequestFinished.addListener((request) => {
    try {
        // Skip data URLs and chrome-extension URLs
        if (request.request.url.startsWith('data:') || 
            request.request.url.startsWith('chrome-extension://')) {
            return;
        }
        
        // Extract domain from URL
        let domain = 'unknown';
        try {
            const url = new URL(request.request.url);
            domain = url.hostname;
        } catch (e) {
            console.error('Failed to parse URL:', request.request.url);
        }
        
        // Create request data (same format as panel.js)
        const requestData = {
            id: Date.now() + Math.random(),
            url: request.request.url,
            method: request.request.method,
            status: request.response.status,
            time: new Date().toLocaleTimeString(),
            timestamp: Date.now(),
            size: request.response.bodySize || 0,
            domain: domain,
            // Store raw request for later processing
            _rawRequest: request
        };
        
        // Add to buffer
        bufferedRequests.push(requestData);
        
        // Limit buffer size
        if (bufferedRequests.length > MAX_BUFFERED_REQUESTS) {
            bufferedRequests.shift();
        }
    } catch (error) {
        console.error('Error buffering request:', error);
    }
});

// Create the Echo panel
chrome.devtools.panels.create(
    "Echo",
    "icons/icon16.png",
    "panel.html",
    function(panel) {
        console.log("Echo panel created");
        
        // When panel is shown, it can request buffered data
        panel.onShown.addListener((window) => {
            // Make buffered requests available to the panel
            if (window.getBufferedRequests) {
                // Panel already has the function, just trigger an update
                window.updateWithBufferedRequests();
            } else {
                // First time showing, set up the communication
                window.bufferedRequests = bufferedRequests;
                window.clearBufferedRequests = () => {
                    bufferedRequests = [];
                };
            }
        });
    }
);