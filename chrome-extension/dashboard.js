let currentRequestData = null;

// Decompress gzipped data
async function decompressString(compressedData) {
    const stream = new DecompressionStream('gzip');
    const writer = stream.writable.getWriter();
    const reader = stream.readable.getReader();
    
    writer.write(compressedData);
    writer.close();
    
    const chunks = [];
    let done = false;
    while (!done) {
        const { value, done: streamDone } = await reader.read();
        done = streamDone;
        if (value) chunks.push(value);
    }
    
    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
        result.set(chunk, offset);
        offset += chunk.length;
    }
    
    return new TextDecoder().decode(result);
}

// Parse and display request data
async function parseAndDisplayData(base64Data) {
    try {
        // Handle URL encoding issues
        base64Data = base64Data.replace(/ /g, '+');
        
        // Try to decompress first (new format), fall back to old format
        let jsonString;
        try {
            // New compressed format
            const binaryString = atob(base64Data);
            const compressedData = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                compressedData[i] = binaryString.charCodeAt(i);
            }
            jsonString = await decompressString(compressedData);
        } catch {
            // Fall back to old uncompressed format
            jsonString = decodeURIComponent(escape(atob(base64Data)));
        }
        
        const data = JSON.parse(jsonString);
        
        // Handle both single requests and arrays of requests
        if (Array.isArray(data)) {
            if (data.length === 0) {
                // Show empty state for empty array
                document.getElementById('empty-state').style.display = 'block';
                document.getElementById('request-details').style.display = 'none';
                return;
            } else if (data.length === 1) {
                // Single request in array
                currentRequestData = data[0];
                displayRequestData(data[0]);
            } else {
                // Multiple requests - show the first one and add a selector
                currentRequestData = data[0];
                displayMultipleRequests(data);
                return;
            }
        } else {
            // Single request object
            currentRequestData = data;
            displayRequestData(data);
        }
        
        // Hide empty state, show request details
        document.getElementById('empty-state').style.display = 'none';
        document.getElementById('request-details').style.display = 'block';
    } catch (error) {
        console.error('Error parsing data:', error);
        console.error('Base64 data length:', base64Data.length);
        console.error('Base64 data (first 100 chars):', base64Data.substring(0, 100));
        alert('Error parsing request data. The data may be too long or corrupted. Try using a shorter request.');
    }
}

// Display request data in the UI
function displayRequestData(data) {
    // Request details
    const method = data.request.method;
    document.getElementById('request-method').textContent = method;
    document.getElementById('request-method').className = `method-badge method-${method.toLowerCase()}`;
    document.getElementById('request-url').innerHTML = processStringForSmartContent(data.request.url);
    
    // Request headers
    const requestHeadersBody = document.querySelector('#request-headers tbody');
    requestHeadersBody.innerHTML = '';
    if (data.request.headers && data.request.headers.length > 0) {
        data.request.headers.forEach(header => {
            const row = requestHeadersBody.insertRow();
            row.insertCell(0).textContent = header.name || header.key;
            row.insertCell(1).textContent = header.value;
        });
    }
    
    // Payload
    if (data.payload) {
        document.getElementById('payload-card').style.display = 'block';
        const payloadContent = document.getElementById('payload-content');
        
        // Try to parse and format JSON
        try {
            const parsedPayload = JSON.parse(data.payload);
            payloadContent.innerHTML = '<div class="json-viewer">' + syntaxHighlightJSON(parsedPayload) + '</div>';
            
            // Process smart content in payload
            setTimeout(() => {
                processSmartContentInElement(payloadContent);
            }, 50);
        } catch (error) {
            payloadContent.textContent = data.payload;
        }
    } else {
        document.getElementById('payload-card').style.display = 'none';
    }
    
    // Response status
    const status = data.response.status;
    const statusBadge = document.getElementById('response-status');
    statusBadge.textContent = status;
    statusBadge.className = `status-badge status-${Math.floor(status/100)}xx`;
    
    // Response headers
    const responseHeadersBody = document.querySelector('#response-headers tbody');
    responseHeadersBody.innerHTML = '';
    if (data.response.headers && data.response.headers.length > 0) {
        data.response.headers.forEach(header => {
            const row = responseHeadersBody.insertRow();
            row.insertCell(0).textContent = header.name || header.key;
            row.insertCell(1).textContent = header.value;
        });
    }
    
    // Response body
    const responseBody = document.getElementById('response-body');
    if (data.response.body) {
        try {
            const parsedBody = JSON.parse(data.response.body);
            const highlighted = syntaxHighlightJSON(parsedBody);
            responseBody.innerHTML = '<div class="json-viewer">' + highlighted + '</div>';
            
            // Process smart content in the response body after a short delay
            setTimeout(() => {
                processSmartContentInElement(responseBody);
            }, 50);
        } catch (error) {
            responseBody.textContent = data.response.body;
        }
    } else {
        responseBody.textContent = 'No response body';
    }
    
    // cURL command with smart highlighting
    const curlElement = document.getElementById('curl-command');
    curlElement.innerHTML = processCurlForSmartCopy(data.curl);
    
    // Process all content for smart copy detection
    setTimeout(processAllSmartContent, 100);
}

// Display multiple requests with a selector
function displayMultipleRequests(requests) {
    // Add a request selector at the top
    const content = document.getElementById('content');
    
    // Create request selector if it doesn't exist
    let selectorDiv = document.getElementById('request-selector');
    if (!selectorDiv) {
        selectorDiv = document.createElement('div');
        selectorDiv.id = 'request-selector';
        selectorDiv.style.cssText = `
            background: #252526;
            padding: 15px 20px;
            border-radius: 8px;
            margin-bottom: 20px;
            border: 1px solid #3e3e42;
        `;
        
        const label = document.createElement('label');
        label.textContent = 'Select Request: ';
        label.style.cssText = 'color: #cccccc; margin-right: 10px; font-weight: 500;';
        
        const select = document.createElement('select');
        select.id = 'request-select';
        select.style.cssText = `
            background: #3c3c3c;
            border: 1px solid #3e3e42;
            border-radius: 4px;
            color: #cccccc;
            padding: 8px 12px;
            font-size: 13px;
            min-width: 300px;
        `;
        
        select.addEventListener('change', (e) => {
            const selectedIndex = parseInt(e.target.value);
            currentRequestData = requests[selectedIndex];
            displayRequestData(requests[selectedIndex]);
        });
        
        selectorDiv.appendChild(label);
        selectorDiv.appendChild(select);
        
        // Insert before request-details
        const requestDetails = document.getElementById('request-details');
        content.insertBefore(selectorDiv, requestDetails);
    }
    
    // Populate the selector
    const select = document.getElementById('request-select');
    select.innerHTML = '';
    
    requests.forEach((request, index) => {
        const option = document.createElement('option');
        option.value = index;
        
        // Create a descriptive label for each request
        const method = request.request?.method || 'UNKNOWN';
        const url = request.request?.url || 'No URL';
        const status = request.response?.status || '???';
        
        // Truncate URL for display
        let displayUrl = url;
        if (url.length > 60) {
            displayUrl = url.substring(0, 57) + '...';
        }
        
        option.textContent = `${method} ${displayUrl} (${status})`;
        select.appendChild(option);
    });
    
    // Display the first request
    displayRequestData(requests[0]);
    
    // Show the UI
    document.getElementById('empty-state').style.display = 'none';
    document.getElementById('request-details').style.display = 'block';
}

// Syntax highlight JSON with interactive expand/collapse
function syntaxHighlightJSON(obj, expanded = true) {
    const uid = 'json_' + Math.random().toString(36).substr(2, 9);
    
    function createInteractiveJSON(data, depth = 0, forceExpanded = null) {
        if (data === null) return '<span class="json-null">null</span>';
        if (typeof data === 'boolean') return '<span class="json-boolean">' + data + '</span>';
        if (typeof data === 'number') return '<span class="json-number">' + data + '</span>';
        if (typeof data === 'string') {
            // Escape HTML entities to prevent rendering
            const escaped = data
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
            return '<span class="json-string">"' + escaped + '"</span>';
        }
        
        const isArray = Array.isArray(data);
        const keys = Object.keys(data);
        const isEmpty = keys.length === 0;
        
        if (isEmpty) {
            return isArray ? '[]' : '{}';
        }
        
        const id = uid + '_' + depth + '_' + Math.random().toString(36).substr(2, 5);
        const preview = isArray ? `[...${keys.length} items]` : `{...${keys.length} keys}`;
        
        // Decide if this should be collapsed
        // Everything expanded by default, arrays show first 2 items expanded
        let shouldCollapse;
        if (forceExpanded === true) {
            shouldCollapse = false;
        } else if (forceExpanded === false) {
            shouldCollapse = true;
        } else {
            // Expand everything by default
            shouldCollapse = false;
        }
        
        let html = '<span class="json-toggle" onclick="toggleJSON(\'' + id + '\')" id="toggle_' + id + '">' + (shouldCollapse ? '▶' : '▼') + '</span>';
        html += isArray ? '[' : '{';
        html += '<span class="json-preview" id="preview_' + id + '" style="display: ' + (shouldCollapse ? 'inline' : 'none') + ';">' + preview + '</span>';
        html += '<span id="' + id + '" style="display: ' + (shouldCollapse ? 'none' : 'inline') + ';">';
        
        keys.forEach((key, index) => {
            if (index > 0) html += ',';
            html += '\n' + '  '.repeat(depth + 1);
            
            if (!isArray) {
                const escapedKey = key
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;')
                    .replace(/'/g, '&#39;');
                html += '<span class="json-key">"' + escapedKey + '"</span>: ';
            }
            
            // For arrays, only expand first 2 items by default
            let childForceExpanded = forceExpanded;
            if (isArray && forceExpanded === null) {
                childForceExpanded = index < 2 ? null : false;
            }
            
            html += createInteractiveJSON(data[key], depth + 1, childForceExpanded);
        });
        
        html += '\n' + '  '.repeat(depth) + '</span>';
        html += isArray ? ']' : '}';
        
        return html;
    }
    
    return createInteractiveJSON(obj);
}

// Toggle JSON section
window.toggleJSON = function(id) {
    const element = document.getElementById(id);
    const toggle = document.getElementById('toggle_' + id);
    const preview = document.getElementById('preview_' + id);
    
    if (element.style.display === 'none') {
        element.style.display = 'inline';
        preview.style.display = 'none';
        toggle.textContent = '▼';
    } else {
        element.style.display = 'none';
        preview.style.display = 'inline';
        toggle.textContent = '▶';
    }
}

// Toggle card collapse
function toggleCard(header) {
    header.classList.toggle('collapsed');
    header.nextElementSibling.classList.toggle('collapsed');
}

// Copy section content
function copySection(section) {
    let textToCopy = '';
    
    switch(section) {
        case 'request':
            textToCopy = JSON.stringify({
                url: currentRequestData.request.url,
                method: currentRequestData.request.method,
                headers: currentRequestData.request.headers
            }, null, 2);
            break;
        case 'payload':
            textToCopy = currentRequestData.payload;
            break;
        case 'response':
            textToCopy = JSON.stringify(currentRequestData.response, null, 2);
            break;
        case 'curl':
            textToCopy = currentRequestData.curl;
            break;
    }
    
    navigator.clipboard.writeText(textToCopy).then(() => {
        showToast(`${section.charAt(0).toUpperCase() + section.slice(1)} copied to clipboard!`, 'success');
    }).catch(err => {
        showToast('Failed to copy to clipboard', 'error');
        console.error('Copy failed:', err);
    });
}

// Pattern detection for smart copy
function detectSmartContent(text) {
    // UUID pattern
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text)) {
        return { type: 'UUID', value: text };
    }
    // JWT pattern (more flexible)
    if (/^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.?[A-Za-z0-9-_]*$/.test(text) && text.split('.').length >= 2) {
        return { type: 'JWT', value: text };
    }
    // Bearer token
    if (/^Bearer\s+[A-Za-z0-9-_]+\.?[A-Za-z0-9-_]*\.?[A-Za-z0-9-_]*$/i.test(text)) {
        return { type: 'Bearer Token', value: text };
    }
    // API Key patterns (common formats)
    if (/^[A-Za-z0-9]{32,}$/.test(text) && text.length >= 32 && text.length <= 64) {
        return { type: 'API Key', value: text };
    }
    // Email
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) {
        return { type: 'Email', value: text };
    }
    // URL
    if (/^https?:\/\/.+/.test(text)) {
        return { type: 'URL', value: text };
    }
    // Base64 (more flexible)
    if (/^[A-Za-z0-9+/]+=*$/.test(text) && text.length > 20) {
        return { type: 'Base64', value: text };
    }
    // ISO Date
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$/.test(text)) {
        return { type: 'ISO Date', value: text };
    }
    // MongoDB ObjectId
    if (/^[0-9a-f]{24}$/i.test(text)) {
        return { type: 'ObjectId', value: text };
    }
    return null;
}

// Process string content for smart patterns (used in JSON strings)
function processStringForSmartContent(text) {
    // Escape HTML first
    let processed = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    
    // Match URLs (including those with UUIDs)
    processed = processed.replace(
        /https?:\/\/[^\s'"]+/g,
        (match) => {
            // Check if the URL contains a UUID
            const uuidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
            let urlWithHighlightedUuid = match;
            
            // Replace UUIDs within the URL with highlighted versions
            urlWithHighlightedUuid = urlWithHighlightedUuid.replace(
                uuidPattern,
                (uuid) => `<span class="smart-copy" data-copy="${uuid}" data-type="UUID" title="Click to copy UUID">${uuid}</span>`
            );
            
            // Wrap the entire URL
            return `<span class="smart-copy" data-copy="${match}" data-type="URL" title="Click to copy URL">${urlWithHighlightedUuid}</span>`;
        }
    );
    
    // Match standalone UUIDs (not already in URLs)
    processed = processed.replace(
        /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
        (match) => {
            // Check if already wrapped
            if (!processed.includes(`data-copy="${match}"`)) {
                return `<span class="smart-copy" data-copy="${match}" data-type="UUID" title="Click to copy UUID">${match}</span>`;
            }
            return match;
        }
    );
    
    return processed;
}

// Process cURL command for smart copy
function processCurlForSmartCopy(curlCommand) {
    // Escape HTML first
    let processed = curlCommand
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    
    // Match URLs (including those with UUIDs)
    processed = processed.replace(
        /https?:\/\/[^\s'"]+/g,
        (match) => {
            // Check if the URL contains a UUID
            const uuidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
            let urlWithHighlightedUuid = match;
            
            // Replace UUIDs within the URL with highlighted versions
            urlWithHighlightedUuid = urlWithHighlightedUuid.replace(
                uuidPattern,
                (uuid) => `<span class="smart-copy" data-copy="${uuid}" data-type="UUID" title="Click to copy UUID">${uuid}</span>`
            );
            
            // Wrap the entire URL
            return `<span class="smart-copy" data-copy="${match}" data-type="URL" title="Click to copy URL">${urlWithHighlightedUuid}</span>`;
        }
    );
    
    // Match standalone UUIDs (not already in URLs)
    processed = processed.replace(
        /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
        (match) => {
            // Check if already wrapped
            if (!processed.includes(`data-copy="${match}"`)) {
                return `<span class="smart-copy" data-copy="${match}" data-type="UUID" title="Click to copy UUID">${match}</span>`;
            }
            return match;
        }
    );
    
    // Match JWT tokens in authorization headers
    processed = processed.replace(
        /authorization:\s*([A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.?[A-Za-z0-9-_]*)/gi,
        (match, token) => {
            return match.replace(token, `<span class="smart-copy" data-copy="${token}" data-type="JWT" title="Click to copy JWT">${token}</span>`);
        }
    );
    
    return processed;
}

// Process smart content in an element
function processSmartContentInElement(element) {
    // Process all JSON elements for smart highlighting
    element.querySelectorAll('.json-string').forEach(elem => {
        const text = elem.textContent.replace(/^"|"$/g, '');
        
        // Check if the entire string is a detectable pattern
        const detected = detectSmartContent(text);
        if (detected) {
            elem.classList.add('smart-copy');
            elem.dataset.copy = detected.value;
            elem.dataset.type = detected.type;
            elem.title = `Click to copy ${detected.type}`;
        } else {
            // Check for patterns within the string (like URLs with UUIDs)
            const processedHtml = processStringForSmartContent(text);
            if (processedHtml !== text) {
                // Remove quotes and re-add them around the processed content
                elem.innerHTML = '"' + processedHtml + '"';
            }
        }
    });
    
    // Process JSON keys and numbers
    element.querySelectorAll('.json-key, .json-number').forEach(elem => {
        const text = elem.textContent.replace(/^"|"$/g, '');
        const detected = detectSmartContent(text);
        if (detected) {
            elem.classList.add('smart-copy');
            elem.dataset.copy = detected.value;
            elem.dataset.type = detected.type;
            elem.title = `Click to copy ${detected.type}`;
        }
    });
}

// Process all table cells and pre content
function processAllSmartContent() {
    // Process table cells
    document.querySelectorAll('td').forEach(td => {
        const text = td.textContent.trim();
        const detected = detectSmartContent(text);
        if (detected) {
            td.classList.add('smart-copy');
            td.dataset.copy = detected.value;
            td.dataset.type = detected.type;
            td.title = `Click to copy ${detected.type}`;
            td.style.cursor = 'pointer';
        }
    });
    
    // Process all URL displays
    document.querySelectorAll('.url-display').forEach(elem => {
        const text = elem.textContent.trim();
        if (text) {
            elem.innerHTML = processCurlForSmartCopy(text);
        }
    });
}

// Toast notification system
function showToast(message, type = 'success', duration = 3000) {
    const toastContainer = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const icons = {
        success: '✓',
        info: 'ℹ',
        error: '✗'
    };
    
    toast.innerHTML = `
        <span class="toast-icon">${icons[type] || icons.success}</span>
        <span>${message}</span>
    `;
    
    toastContainer.appendChild(toast);
    
    setTimeout(() => {
        toast.classList.add('hiding');
        setTimeout(() => toast.remove(), 300);
    }, duration);
}



// Add click handler for smart copy with toast
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('smart-copy')) {
        e.stopPropagation(); // Prevent bubbling for nested elements
        const textToCopy = e.target.dataset.copy;
        const type = e.target.dataset.type || 'content';
        
        navigator.clipboard.writeText(textToCopy).then(() => {
            showToast(`${type} copied to clipboard!`, 'success');
        }).catch(err => {
            showToast('Failed to copy to clipboard', 'error');
            console.error('Copy failed:', err);
        });
    }
});

// Handle manual data input
document.getElementById('load-data-btn').addEventListener('click', () => {
    const input = document.getElementById('manual-input').value.trim();
    if (input) {
        parseAndDisplayData(input);
    }
});

// Check for data parameter on load
window.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const base64Data = urlParams.get('data');
    
    if (base64Data) {
        parseAndDisplayData(base64Data);
    }
}); 