// Background service worker for Echo extension

// Check if chrome APIs are available
if (typeof chrome === 'undefined' || !chrome.runtime) {
    console.error('Chrome extension APIs not available');
} else {
    // Create context menu on installation
    chrome.runtime.onInstalled.addListener(() => {
        try {
            chrome.contextMenus.create({
                id: "openEchoDashboard",
                title: "Open in Echo Dashboard (local)",
                contexts: ["all"]
            });
        } catch (error) {
            console.error('Error creating context menu:', error);
        }
    });
}

// Handle context menu clicks
if (typeof chrome !== 'undefined' && chrome.contextMenus) {
    chrome.contextMenus.onClicked.addListener((info, tab) => {
        if (info.menuItemId === "openEchoDashboard") {
            try {
                // Open the local dashboard hosted by the extension
                chrome.tabs.create({
                    url: chrome.runtime.getURL('dashboard.html')
                });
            } catch (error) {
                console.error('Error opening local dashboard:', error);
            }
        }
    });
}

// Compress string using gzip
async function compressString(str) {
    const stream = new CompressionStream('gzip');
    const writer = stream.writable.getWriter();
    const reader = stream.readable.getReader();
    
    writer.write(new TextEncoder().encode(str));
    writer.close();
    
    const chunks = [];
    let done = false;
    while (!done) {
        const { value, done: streamDone } = await reader.read();
        done = streamDone;
        if (value) chunks.push(value);
    }
    
    // Combine chunks into single Uint8Array
    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
        result.set(chunk, offset);
        offset += chunk.length;
    }
    
    return result;
}

// Handle messages from the DevTools panel
if (typeof chrome !== 'undefined' && chrome.runtime) {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    try {
        if (request.type === 'open-dashboard') {
            handleOpenDashboard(request.data);
            sendResponse({success: true});
        } else if (request.type === 'open-local-dashboard') {
            handleOpenLocalDashboard(request.data);
            sendResponse({success: true});
        } else if (request.type === 'run-postman') {
            handleRunPostman(request.data);
            sendResponse({success: true});
        } else if (request.type === 'copy-to-clipboard') {
            // Handle clipboard copy from earlier implementation
            chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
                if (tabs[0]) {
                    chrome.scripting.executeScript({
                        target: {tabId: tabs[0].id},
                        func: async (text) => {
                            try {
                                // Focus the window first to allow clipboard access
                                window.focus();
                                
                                // Also try to focus the document
                                if (document.body) {
                                    document.body.focus();
                                }
                                
                                // Small delay to ensure focus is established
                                await new Promise(resolve => setTimeout(resolve, 10));
                                
                                await navigator.clipboard.writeText(text);
                                return { success: true };
                            } catch (error) {
                                console.error('Clipboard write failed:', error);
                                
                                // Fallback: try the old document.execCommand method
                                try {
                                    const textarea = document.createElement('textarea');
                                    textarea.value = text;
                                    textarea.style.position = 'fixed';
                                    textarea.style.opacity = '0';
                                    document.body.appendChild(textarea);
                                    textarea.focus();
                                    textarea.select();
                                    const success = document.execCommand('copy');
                                    document.body.removeChild(textarea);
                                    
                                    if (success) {
                                        return { success: true };
                                    } else {
                                        return { success: false, error: 'Both clipboard API and execCommand failed' };
                                    }
                                } catch (fallbackError) {
                                    console.error('Fallback copy failed:', fallbackError);
                                    return { success: false, error: `Clipboard API failed: ${error.message}, Fallback failed: ${fallbackError.message}` };
                                }
                            }
                        },
                        args: [request.text]
                    }, (results) => {
                        if (chrome.runtime.lastError) {
                            console.error('Script injection error:', chrome.runtime.lastError);
                            sendResponse({success: false, error: chrome.runtime.lastError.message});
                        } else {
                            const result = results && results[0] && results[0].result;
                            const success = result && result.success;
                            sendResponse({success: success, error: result?.error});
                        }
                    });
                } else {
                    console.error('No active tab found');
                    sendResponse({success: false, error: 'No active tab'});
                }
            });
            return true; // Keep message channel open for async response
        }
    } catch (error) {
        console.error('Message handling error:', error);
        sendResponse({success: false, error: error.message});
    }
    return false; // Don't keep channel open for synchronous responses
    });
}

// Open dashboard with request data
async function handleOpenDashboard(requestData) {
    if (!requestData) {
        console.error('No request data available');
        return;
    }
    
    try {
        // Create a minimal version of the data to fit in URL
        const minimalData = {
            request: {
                url: requestData.request.url,
                method: requestData.request.method,
                headers: requestData.request.headers.filter(h => {
                    // Only include important headers
                    const name = h.name.toLowerCase();
                    return name.includes('content-type') || 
                           name.includes('authorization') || 
                           name.includes('accept') ||
                           name.includes('user-agent') ||
                           name.includes('referer') ||
                           name.includes('origin');
                })
            },
            payload: requestData.payload,
            response: {
                status: requestData.response.status,
                headers: requestData.response.headers.slice(0, 10), // Limit response headers
                body: requestData.response.body || '' // No size limit
            },
            curl: requestData.curl
        };
        
        const jsonString = JSON.stringify(minimalData);
        
        // Compress the data to fit in URL
        const compressed = await compressString(jsonString);
        const base64Data = btoa(String.fromCharCode(...new Uint8Array(compressed)));
        
        // For production, this would be your hosted dashboard URL
        // For local testing, the serve-dashboard.sh script will tell you which port to use
        const dashboardUrl = 'http://localhost:8081/index2.html';
        
        chrome.tabs.create({
            url: `${dashboardUrl}?data=${base64Data}`
        });
    } catch (error) {
        console.error('Error opening dashboard:', error);
    }
}

// Open local dashboard with compressed data
function handleOpenLocalDashboard(base64Data) {
    try {
        // Open the local dashboard with compressed data
        const dashboardUrl = chrome.runtime.getURL('dashboard.html') + '?data=' + encodeURIComponent(base64Data) + '&compressed=true';
        chrome.tabs.create({ url: dashboardUrl });
        
    } catch (error) {
        console.error('Error opening local dashboard:', error);
    }
}

// Open in Postman
async function handleRunPostman(postmanCollection) {
    if (!postmanCollection) {
        console.error('No Postman collection data available');
        return;
    }
    
    try {
        // Create a data URL with an HTML page that auto-submits the form
        const html = `
<!DOCTYPE html>
<html>
<head>
    <title>Opening in Postman...</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            background: #f5f5f5;
        }
        .loading {
            text-align: center;
        }
        .spinner {
            border: 3px solid #f3f3f3;
            border-top: 3px solid #ff6c37;
            border-radius: 50%;
            width: 40px;
            height: 40px;
            animation: spin 1s linear infinite;
            margin: 0 auto 20px;
        }
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
    </style>
</head>
<body>
    <div class="loading">
        <div class="spinner"></div>
        <h2>Opening in Postman...</h2>
        <p>If nothing happens, please check if popups are blocked.</p>
    </div>
    <form id="postmanForm" method="POST" action="https://app.getpostman.com/run-collection/fork" target="_blank">
        <input type="hidden" name="collection" value='${JSON.stringify(postmanCollection).replace(/'/g, "&#39;")}'>
    </form>
    <script>
        document.getElementById('postmanForm').submit();
        setTimeout(() => window.close(), 2000);
    </script>
</body>
</html>
        `;
        
        const blob = new Blob([html], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        
        chrome.tabs.create({ url });
        
        // Clean up blob URL after a delay
        setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (error) {
        console.error('Error opening in Postman:', error);
    }
}
