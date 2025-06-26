// Network request capture and display logic
let requests = [];
let selectedRequest = null;
let activeFilter = 'all';
let searchFilter = '';
let activeDomain = null;
let activeTab = 'headers';
let viewMode = localStorage.getItem('echo-view-mode') || 'truncated';
let tooltipTimeout = null;
let tooltipShowTimeout = null;
const MAX_REQUESTS = 500;
let clearOnReload = localStorage.getItem('echo-clear-on-reload') !== 'false'; // Default true
let savedDomains = [];

// Load saved domains on startup
async function loadSavedDomains() {
    try {
        const data = await chrome.storage.local.get(['savedDomains', 'activeDomain']);
        if (data.savedDomains) {
            // Clean up old domains (older than 7 days)
            const weekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
            savedDomains = data.savedDomains.filter(d => d.timestamp > weekAgo);
            
            // Set active domain if it still exists
            if (data.activeDomain && savedDomains.some(d => d.domain === data.activeDomain)) {
                activeDomain = data.activeDomain;
            }
        }
    } catch (e) {
        console.error('Failed to load saved domains:', e);
    }
}

// Save domains to storage
async function saveDomains() {
    try {
        // Get unique domains from current requests
        const currentDomains = [...new Set(requests.map(req => req.domain))];
        
        // Create domain objects with timestamps
        const domainMap = new Map();
        
        // Add existing saved domains
        savedDomains.forEach(d => {
            domainMap.set(d.domain, d.timestamp);
        });
        
        // Add or update current domains with new timestamp
        currentDomains.forEach(domain => {
            domainMap.set(domain, Date.now());
        });
        
        // Convert back to array and sort by timestamp (newest first)
        const sortedDomains = Array.from(domainMap.entries())
            .map(([domain, timestamp]) => ({ domain, timestamp }))
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, 20); // Keep last 20 domains
        
        savedDomains = sortedDomains; // Update local copy
        
        await chrome.storage.local.set({
            savedDomains: sortedDomains,
            activeDomain: activeDomain
        });
    } catch (e) {
        console.error('Failed to save domains:', e);
    }
}

// Check if extension context is valid
let contextLostWarningShown = false;
function checkExtensionContext() {
    if (!chrome || !chrome.runtime) {
        if (!contextLostWarningShown) {
            contextLostWarningShown = true;
            const existingWarning = document.getElementById('context-lost-warning');
            if (!existingWarning) {
                const warningDiv = document.createElement('div');
                warningDiv.id = 'context-lost-warning';
                warningDiv.style.cssText = 'position: fixed; top: 10px; left: 50%; transform: translateX(-50%); background: #f44336; color: white; padding: 10px 20px; border-radius: 4px; z-index: 10000; font-size: 12px; box-shadow: 0 2px 5px rgba(0,0,0,0.3);';
                warningDiv.textContent = '⚠️ Extension context lost. Please close and reopen DevTools.';
                document.body.appendChild(warningDiv);
            }
        }
        return false;
    }
    return true;
}

// Initialize UI
document.addEventListener('DOMContentLoaded', async () => {
    // Load saved domains on startup
    await loadSavedDomains();
    
    // Update domain tags to show saved domains
    updateDomainTags();
    
    // Apply active domain filter if loaded
    if (activeDomain) {
        console.log('Restored active domain filter:', activeDomain);
        updateRequestsList();
    }
    
    // Check context periodically
    setInterval(checkExtensionContext, 5000);
    
    // Clear button handler
    document.getElementById('clear-btn').addEventListener('click', () => {
        requests = [];
        selectedRequest = null;
        // Keep active domain filter intact
        updateRequestsList();
        updateDomainTags();
        hideDetailsPanel();
    });

    // Export HAR button
    document.getElementById('export-har').addEventListener('click', exportAsHAR);

    // Copy all as cURL button
    document.getElementById('copy-all-curl').addEventListener('click', copyAllAsCurl);

    // Open local dashboard button
    document.getElementById('open-local-dashboard').addEventListener('click', openLocalDashboard);

    // Settings button
    document.getElementById('settings-btn').addEventListener('click', () => {
        document.getElementById('settings-modal').style.display = 'block';
        document.getElementById('clear-on-reload-checkbox').checked = clearOnReload;
        
        // Set the URL mode dropdown
        const urlModeSelect = document.getElementById('url-display-mode');
        if (urlModeSelect) {
            urlModeSelect.value = viewMode;
        }
    });
    
    // Close settings modal functions
    function closeSettingsModal() {
        document.getElementById('settings-modal').style.display = 'none';
    }
    
    // Close button
    document.getElementById('close-settings').addEventListener('click', closeSettingsModal);
    
    // Click overlay to close
    document.getElementById('settings-modal').addEventListener('click', (e) => {
        if (e.target.id === 'settings-modal') {
            closeSettingsModal();
        }
    });
    
    // ESC key to close
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && document.getElementById('settings-modal').style.display === 'block') {
            closeSettingsModal();
        }
    });
    
    // Auto-save clear on reload checkbox
    document.getElementById('clear-on-reload-checkbox').addEventListener('change', (e) => {
        clearOnReload = e.target.checked;
        localStorage.setItem('echo-clear-on-reload', clearOnReload);
    });
    
    // Auto-save URL display mode
    const urlModeSelect = document.getElementById('url-display-mode');
    if (urlModeSelect) {
        urlModeSelect.addEventListener('change', (e) => {
            viewMode = e.target.value;
            localStorage.setItem('echo-view-mode', viewMode);
            updateRequestsList();
        });
    }


    // Filter type buttons
    document.querySelectorAll('.filter-type').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.filter-type').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            activeFilter = btn.dataset.type;
            updateRequestsList();
        });
    });

    // Search filter
    document.getElementById('filter-input').addEventListener('input', (e) => {
        searchFilter = e.target.value.toLowerCase();
        updateRequestsList();
    });

    // Details panel close button
    document.getElementById('close-details').addEventListener('click', hideDetailsPanel);

    // Tab switching
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            activeTab = tab.dataset.tab;
            if (selectedRequest) {
                showRequestDetails(selectedRequest);
            }
        });
    });
    
    // Initialize splitter
    initializeSplitter();
});

// Listen for page navigation/reload
chrome.devtools.network.onNavigated.addListener(() => {
    if (clearOnReload) {
        // Store the active domain before clearing
        const preservedActiveDomain = activeDomain;
        
        requests = [];
        selectedRequest = null;
        updateRequestsList();
        updateDomainTags();
        hideDetailsPanel();
        
        // Restore the active domain filter after clearing
        if (preservedActiveDomain) {
            activeDomain = preservedActiveDomain;
            // Update UI to show the active domain
            updateDomainTags();
            updateRequestsList();
            saveDomains(); // Save the preserved active domain
        }
    }
});

// Splitter functionality for resizable panels
function initializeSplitter() {
    const splitter = document.getElementById('splitter');
    const detailsPanel = document.getElementById('details-panel');
    const requestsList = document.getElementById('requests-list');
    const mainContent = document.getElementById('main-content');
    
    let isResizing = false;
    let startX = 0;
    let startWidth = 0;
    
    splitter.addEventListener('mousedown', (e) => {
        isResizing = true;
        startX = e.clientX;
        startWidth = detailsPanel.offsetWidth;
        
        splitter.classList.add('active');
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        
        // Prevent text selection during resize
        e.preventDefault();
    });
    
    document.addEventListener('mousemove', (e) => {
        if (!isResizing) return;
        
        const deltaX = startX - e.clientX; // Reverse direction for intuitive resizing
        const newWidth = Math.max(300, Math.min(startWidth + deltaX, mainContent.offsetWidth * 0.8));
        
        detailsPanel.style.width = newWidth + 'px';
        
        // Store the width preference
        localStorage.setItem('echo-details-panel-width', newWidth.toString());
    });
    
    document.addEventListener('mouseup', () => {
        if (isResizing) {
            isResizing = false;
            splitter.classList.remove('active');
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        }
    });
    
    // Restore saved width
    const savedWidth = localStorage.getItem('echo-details-panel-width');
    if (savedWidth) {
        const width = parseInt(savedWidth);
        if (width >= 300 && width <= window.innerWidth * 0.8) {
            detailsPanel.style.width = width + 'px';
        }
    }
}

// Get resource type from request
function getResourceType(request) {
    const resourceType = request._resourceType || '';
    const url = request.request.url.toLowerCase();
    const contentType = request.response.headers.find(h => h.name.toLowerCase() === 'content-type')?.value || '';
    
    if (resourceType === 'xhr' || resourceType === 'fetch') return 'xhr';
    if (resourceType === 'script') return 'js';
    if (resourceType === 'stylesheet') return 'css';
    if (resourceType === 'image') return 'img';
    if (resourceType === 'document') return 'doc';
    
    if (url.endsWith('.js') || contentType.includes('javascript')) return 'js';
    if (url.endsWith('.css') || contentType.includes('css')) return 'css';
    if (url.match(/\.(jpg|jpeg|png|gif|webp|svg|ico)/) || contentType.includes('image')) return 'img';
    if (url.match(/\.(html|htm)/) || contentType.includes('html')) return 'doc';
    if (contentType.includes('json') || contentType.includes('xml')) return 'xhr';
    
    return 'other';
}

// Listen for network requests
chrome.devtools.network.onRequestFinished.addListener(async (request) => {
    try {
        // Skip data URLs and chrome-extension URLs
        if (request.request.url.startsWith('data:') || 
            request.request.url.startsWith('chrome-extension://')) {
            return;
        }
        
        const startTime = request.startedDateTime ? new Date(request.startedDateTime).getTime() : Date.now();
        const endTime = startTime + request.time;
        
        const requestData = {
            id: Date.now() + Math.random(),
            url: request.request.url,
            method: request.request.method,
            status: request.response.status,
            time: new Date().toLocaleTimeString(),
            headers: request.request.headers,
            requestHeaders: request.request.headers,
            responseHeaders: request.response.headers,
            timestamp: Date.now(),
            resourceType: getResourceType(request),
            size: request.response.bodySize || 0,
            duration: request.time || 0,
            startTime: startTime,
            endTime: endTime,
            domain: new URL(request.request.url).hostname,
            failed: request.response.status >= 400,
            slow: request.time > 1000
        };

        // Parse query parameters for GET requests
        if (request.request.method === 'GET') {
            try {
                const urlObj = new URL(request.request.url);
                if (urlObj.search) {
                    const queryParams = {};
                    const params = new URLSearchParams(urlObj.search);
                    for (const [key, value] of params) {
                        queryParams[key] = value;
                    }
                    if (Object.keys(queryParams).length > 0) {
                        requestData.queryParams = queryParams;
                    }
                }
            } catch (error) {
                console.error('Error parsing query parameters:', error);
            }
        }

        if (request.request.postData) {
            requestData.requestBody = request.request.postData.text;
        }

        request.getContent((content, encoding) => {
            if (content) {
                // Don't truncate response body - let compression handle large data
                requestData.responseBody = content;
                console.log('Response body length:', content.length);
            }
            
            requests.push(requestData);
            if (requests.length > MAX_REQUESTS) {
                requests = requests.slice(-MAX_REQUESTS);
            }
            
            // Add loading state to prevent strobe effect
            const requestsBody = document.getElementById('requests-body');
            if (requestsBody) {
                requestsBody.classList.add('loading');
            }
            
            updateRequestsList();
            updateDomainTags();
            
            // Remove loading state after a short delay
            setTimeout(() => {
                if (requestsBody) {
                    requestsBody.classList.remove('loading');
                }
            }, 100);
        });
    } catch (error) {
        console.error('Error processing request:', error);
    }
});

// Update domain tags
function updateDomainTags() {
    const domainCounts = {};
    
    // Count domains from current requests
    requests.forEach(req => {
        domainCounts[req.domain] = (domainCounts[req.domain] || 0) + 1;
    });
    
    // Add saved domains with count 0 if not in current requests
    savedDomains.forEach(savedDomain => {
        if (!domainCounts[savedDomain.domain]) {
            domainCounts[savedDomain.domain] = 0;
        }
    });
    
    // Always include the active domain if it's set
    if (activeDomain && !domainCounts[activeDomain]) {
        domainCounts[activeDomain] = 0;
    }
    
    // Sort by count (current requests first) then alphabetically
    const sortedDomains = Object.entries(domainCounts)
        .sort((a, b) => {
            // Always put active domain first
            if (a[0] === activeDomain) return -1;
            if (b[0] === activeDomain) return 1;
            if (b[1] !== a[1]) return b[1] - a[1];
            return a[0].localeCompare(b[0]);
        })
        .slice(0, 5);
    
    const container = document.getElementById('domain-tags');
    container.innerHTML = sortedDomains.map(([domain, count]) => {
        const isActive = activeDomain === domain ? 'active' : '';
        const countDisplay = count > 0 ? ` (${count})` : ' (saved)';
        return `<span class="domain-tag ${isActive}" data-domain="${domain}">${domain}${countDisplay}</span>`;
    }).join('');
    
    container.querySelectorAll('.domain-tag').forEach(tag => {
        tag.addEventListener('click', () => {
            if (activeDomain === tag.dataset.domain) {
                activeDomain = null;
                tag.classList.remove('active');
            } else {
                document.querySelectorAll('.domain-tag').forEach(t => t.classList.remove('active'));
                activeDomain = tag.dataset.domain;
                tag.classList.add('active');
            }
            updateRequestsList();
            saveDomains(); // Save domains when active domain changes
        });
    });
    
    // Save domains whenever they are updated
    saveDomains();
}

// Throttling for updateRequestsList to prevent loops
let updateRequestsListTimeout = null;
let isUpdatingRequestsList = false;

// Update requests list UI
function updateRequestsList() {
    // Prevent recursive calls
    if (isUpdatingRequestsList) {
        return;
    }
    
    // Throttle rapid successive calls
    if (updateRequestsListTimeout) {
        clearTimeout(updateRequestsListTimeout);
    }
    
    updateRequestsListTimeout = setTimeout(updateRequestsListNow, 10);
}

function updateRequestsListNow() {
    if (isUpdatingRequestsList) return;
    isUpdatingRequestsList = true;
    
    console.log('updateRequestsListNow called, requests count:', requests.length);
    const listContainer = document.getElementById('requests-body');
    
    let filteredRequests = requests;
    
    // Apply type filter
    if (activeFilter !== 'all') {
        if (activeFilter === 'failed') {
            filteredRequests = filteredRequests.filter(req => req.failed);
        } else if (activeFilter === 'slow') {
            filteredRequests = filteredRequests.filter(req => req.slow);
        } else {
            filteredRequests = filteredRequests.filter(req => req.resourceType === activeFilter);
        }
    }
    
    // Apply domain filter
    if (activeDomain) {
        filteredRequests = filteredRequests.filter(req => req.domain === activeDomain);
    }
    
    // Apply search filter
    if (searchFilter) {
        filteredRequests = filteredRequests.filter(req => {
            return req.url.toLowerCase().includes(searchFilter) ||
                   req.method.toLowerCase().includes(searchFilter) ||
                   req.status.toString().includes(searchFilter) ||
                   req.domain.toLowerCase().includes(searchFilter);
        });
    }
    
    document.getElementById('request-count').textContent = `${filteredRequests.length} requests`;
    
    if (filteredRequests.length === 0) {
        listContainer.innerHTML = '<div id="empty-state">No matching requests found.</div>';
        // Reset the updating flag before returning
        isUpdatingRequestsList = false;
        return;
    }
    
    listContainer.innerHTML = filteredRequests.map(request => {
        const statusClass = getStatusClass(request.status);
        const isSelected = selectedRequest && selectedRequest.id === request.id;
        const failedClass = request.failed ? 'failed' : '';
        const slowClass = request.slow ? 'slow' : '';
        
        const duration = request.duration ? `${Math.round(request.duration)}ms` : '';
        
        const urlObj = new URL(request.url);
        const displayUrl = viewMode === 'compact' 
            ? getCompactUrl(urlObj) 
            : viewMode === 'smart'
            ? smartAbbreviateUrl(urlObj)
            : truncateUrl(urlObj);
        
        return `
            <div class="request-item ${isSelected ? 'selected' : ''} ${failedClass} ${slowClass}" 
                 data-id="${request.id}" 
                 title="${request.url}">
                <div class="sticky-columns">
                    <span class="status-code ${statusClass}">${request.status}</span>
                    <span class="method method-${request.method}">${request.method}</span>
                </div>
                <span class="url">${displayUrl}</span>
                <span class="duration">${duration}</span>
            </div>
        `;
    }).join('');
    
    // Add event listeners to all items (innerHTML replacement already removed old listeners)
    listContainer.querySelectorAll('.request-item').forEach(item => {
        item.addEventListener('click', () => handleRequestClick(item.dataset.id));
        item.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            handleRequestRightClick(item.dataset.id, e);
        });
        
        // Add hover handlers for URL tooltip
        const urlElement = item.querySelector('.url');
        if (urlElement) {
            urlElement.addEventListener('mouseenter', () => {
                const fullUrl = item.getAttribute('title');
                if (fullUrl) {
                    showUrlTooltip(urlElement, fullUrl);
                }
            });
            urlElement.addEventListener('mouseleave', hideUrlTooltip);
        }
    });
    
    // Add hint about right-clicking
    if (filteredRequests.length > 0 && document.querySelectorAll('.request-item').length > 0) {
        const hint = document.getElementById('context-menu-hint');
        if (!hint) {
            const hintDiv = document.createElement('div');
            hintDiv.id = 'context-menu-hint';
            hintDiv.style.cssText = 'position: fixed; bottom: 10px; right: 10px; background: #094771; color: white; padding: 8px 12px; border-radius: 4px; font-size: 11px; opacity: 0.9; z-index: 500;';
            hintDiv.textContent = 'Right-click on any request for more options';
            document.body.appendChild(hintDiv);
            setTimeout(() => hintDiv.remove(), 5000);
        }
    }
    
    // Reset the updating flag
    isUpdatingRequestsList = false;
}

// Get CSS class for status code
function getStatusClass(status) {
    if (status >= 200 && status < 300) return 'status-2xx';
    if (status >= 300 && status < 400) return 'status-3xx';
    if (status >= 400 && status < 500) return 'status-4xx';
    if (status >= 500) return 'status-5xx';
    return '';
}

// Format bytes to human readable
function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 10) / 10 + sizes[i];
}

// Truncate URL for display
function truncateUrl(urlObj) {
    const pathname = urlObj.pathname;
    const search = urlObj.search;
    
    // For very short paths, just return pathname + search
    if ((pathname + search).length < 40) {
        return pathname + search;
    }
    
    // Split pathname into segments
    const segments = pathname.split('/').filter(s => s);
    
    if (segments.length === 0) {
        return '/' + (search ? '?' + search.substring(1, 20) + '...' : '');
    }
    
    if (segments.length === 1) {
        // Just one segment, show it with truncated query
        return '/' + segments[0] + (search ? '?' + search.substring(1, 20) + '...' : '');
    }
    
    if (segments.length === 2) {
        // Two segments, show both if not too long
        const fullPath = '/' + segments.join('/');
        if (fullPath.length <= 40) {
            return fullPath + (search ? '?' + search.substring(1, 15) + '...' : '');
        }
    }
    
    // For longer paths, show: /.../{last-segment}
    const lastSegment = segments[segments.length - 1];
    const truncated = '/.../' + lastSegment;
    
    // Add truncated query if present
    if (search) {
        const queryPreview = search.length > 20 ? search.substring(0, 20) + '...' : search;
        return truncated + queryPreview;
    }
    
    return truncated;
}

// Get compact URL (domain + route)
function getCompactUrl(urlObj) {
    const pathname = urlObj.pathname || '/';
    const host = urlObj.hostname;
    return host + pathname;
}

// Smart abbreviate URL with intelligent pattern detection
function smartAbbreviateUrl(urlObj) {
    const pathname = urlObj.pathname || '/';
    const search = urlObj.search || '';
    
    // UUID pattern
    const uuidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
    
    // Split path into segments
    const segments = pathname.split('/').filter(s => s);
    
    if (segments.length === 0) {
        return '/' + (search ? search.substring(0, 20) + '...' : '');
    }
    
    // Process each segment
    const processedSegments = segments.map(segment => {
        // Reset regex lastIndex for proper matching
        uuidPattern.lastIndex = 0;
        
        // Check if segment is a UUID
        if (uuidPattern.test(segment)) {
            // Show first 8 and last 6 characters of UUID
            return segment.substring(0, 8) + '...' + segment.substring(segment.length - 6);
        }
        
        // Check if segment is a long number/ID (more than 10 digits)
        if (/^\d{10,}$/.test(segment)) {
            return segment.substring(0, 5) + '...' + segment.substring(segment.length - 3);
        }
        
        // Check if segment is a hash (alphanumeric, more than 16 chars)
        if (/^[a-zA-Z0-9]{16,}$/.test(segment)) {
            return segment.substring(0, 6) + '...' + segment.substring(segment.length - 4);
        }
        
        // For long text segments (more than 20 chars)
        if (segment.length > 20) {
            // Try to abbreviate intelligently by keeping start and end
            const words = segment.split(/[-_]/);
            if (words.length > 1) {
                // If it has hyphens or underscores, abbreviate each word
                return words.map(w => w.length > 8 ? w.substring(0, 4) + '...' : w).join('-');
            }
            // Otherwise just truncate
            return segment.substring(0, 10) + '...' + segment.substring(segment.length - 6);
        }
        
        // Keep short segments as-is
        return segment;
    });
    
    // Join the segments back
    let result = '/' + processedSegments.join('/');
    
    // Add abbreviated query if present
    if (search) {
        if (search.length > 30) {
            result += search.substring(0, 25) + '...';
        } else {
            result += search;
        }
    }
    
    return result;
}

// Show URL tooltip
function showUrlTooltip(element, url) {
    // Clear any existing hide timeout
    if (tooltipTimeout) {
        clearTimeout(tooltipTimeout);
        tooltipTimeout = null;
    }
    
    // Clear any existing show timeout
    if (tooltipShowTimeout) {
        clearTimeout(tooltipShowTimeout);
    }
    
    // Add 300ms delay before showing
    tooltipShowTimeout = setTimeout(() => {
        const tooltip = document.getElementById('url-tooltip');
        if (!tooltip) return;
        
        // Set tooltip content
        tooltip.textContent = url;
        
        // Get element position
        const rect = element.getBoundingClientRect();
        
        // Calculate tooltip position
        let top = rect.top - 5;
        let left = rect.left;
        
        // Show tooltip to calculate its dimensions
        tooltip.style.display = 'block';
        tooltip.classList.add('visible');
        
        // Adjust position if tooltip would go off screen
        const tooltipRect = tooltip.getBoundingClientRect();
        
        // Check if tooltip would go above viewport
        if (top - tooltipRect.height < 0) {
            // Show below instead
            top = rect.bottom + 5;
        } else {
            // Show above
            top = rect.top - tooltipRect.height - 5;
        }
        
        // Check if tooltip would go off right edge
        if (left + tooltipRect.width > window.innerWidth - 10) {
            left = window.innerWidth - tooltipRect.width - 10;
        }
        
        // Apply position
        tooltip.style.top = top + 'px';
        tooltip.style.left = left + 'px';
    }, 300);
}

// Hide URL tooltip
function hideUrlTooltip() {
    // Clear show timeout if still pending
    if (tooltipShowTimeout) {
        clearTimeout(tooltipShowTimeout);
        tooltipShowTimeout = null;
    }
    
    const tooltip = document.getElementById('url-tooltip');
    if (!tooltip) return;
    
    // Add delay before hiding
    tooltipTimeout = setTimeout(() => {
        tooltip.classList.remove('visible');
        setTimeout(() => {
            tooltip.style.display = 'none';
        }, 200);
    }, 100);
}

// Handle request click
function handleRequestClick(requestId) {
    document.querySelectorAll('.request-item').forEach(item => {
        item.classList.remove('selected');
    });
    
    const selectedItem = document.querySelector(`[data-id="${requestId}"]`);
    if (selectedItem) {
        selectedItem.classList.add('selected');
    }
    
    selectedRequest = requests.find(r => r.id == requestId);
    
    if (selectedRequest) {
        showDetailsPanel();
        showRequestDetails(selectedRequest);
        
        // Store for context menu (with error handling)
        if (chrome.storage && chrome.storage.local) {
            try {
                const dashboardData = generateDashboardFormat(selectedRequest);
                const postmanCollection = generatePostmanCollection(selectedRequest);
                
                chrome.storage.local.set({
                    lastRequest: dashboardData,
                    lastPostmanCollection: postmanCollection,
                    lastRequestId: selectedRequest.id
                }, () => {
                    if (chrome.runtime.lastError) {
                        console.error('Error storing request data:', chrome.runtime.lastError);
                    }
                });
            } catch (error) {
                console.error('Error preparing request data:', error);
            }
        }
    }
}

// Handle right-click on request
function handleRequestRightClick(requestId, event) {
    const request = requests.find(r => r.id == requestId);
    if (!request) return;
    
    selectedRequest = request;
    
    // Try to store data if chrome.storage is available
    if (chrome && chrome.storage && chrome.storage.local) {
        try {
            const dashboardData = generateDashboardFormat(request);
            const postmanCollection = generatePostmanCollection(request);
            
            chrome.storage.local.set({
                lastRequest: dashboardData,
                lastPostmanCollection: postmanCollection,
                lastRequestId: request.id
            }, () => {
                if (chrome.runtime.lastError) {
                    console.error('Error storing request data:', chrome.runtime.lastError);
                }
            });
        } catch (error) {
            console.error('Error preparing request data for context menu:', error);
        }
    }
    
    // Show custom context menu even if storage fails
    showCustomContextMenu(event, request);
}

// Show custom context menu
function showCustomContextMenu(event, request) {
    event.preventDefault();
    
    // Remove existing menu if any
    const existingMenu = document.getElementById('custom-context-menu');
    if (existingMenu) existingMenu.remove();
    
    // Create custom menu
    const menu = document.createElement('div');
    menu.id = 'custom-context-menu';
    menu.className = 'context-menu';
    menu.innerHTML = `
        <div class="context-menu-item" data-action="copy-json">
            <span class="icon">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M4 1.5H3a2 2 0 0 0-2 2V14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V3.5a2 2 0 0 0-2-2h-1v1h1a1 1 0 0 1 1 1V14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1h1v-1z"/>
                    <path d="M9.5 1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1-.5-.5v-1a.5.5 0 0 1 .5-.5h3zm-3-1A1.5 1.5 0 0 0 5 1.5v1A1.5 1.5 0 0 0 6.5 4h3A1.5 1.5 0 0 0 11 2.5v-1A1.5 1.5 0 0 0 9.5 0h-3z"/>
                </svg>
            </span>
            Copy as JSON Object
        </div>
        <div class="context-menu-item" data-action="copy-curl">
            <span class="icon">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M4 1.5H3a2 2 0 0 0-2 2V14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V3.5a2 2 0 0 0-2-2h-1v1h1a1 1 0 0 1 1 1V14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1h1v-1z"/>
                    <path d="M9.5 1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1-.5-.5v-1a.5.5 0 0 1 .5-.5h3zm-3-1A1.5 1.5 0 0 0 5 1.5v1A1.5 1.5 0 0 0 6.5 4h3A1.5 1.5 0 0 0 11 2.5v-1A1.5 1.5 0 0 0 9.5 0h-3z"/>
                </svg>
            </span>
            Copy as cURL
        </div>
        <div class="context-menu-item" data-action="copy-schema">
            <span class="icon">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M8 4.754a3.246 3.246 0 1 0 0 6.492 3.246 3.246 0 0 0 0-6.492zM5.754 8a2.246 2.246 0 1 1 4.492 0 2.246 2.246 0 0 1-4.492 0z"/>
                    <path d="M9.796 1.343c-.527-1.79-3.065-1.79-3.592 0l-.094.319a.873.873 0 0 1-1.255.52l-.292-.16c-1.64-.892-3.433.902-2.54 2.541l.159.292a.873.873 0 0 1-.52 1.255l-.319.094c-1.79.527-1.79 3.065 0 3.592l.319.094a.873.873 0 0 1 .52 1.255l-.16.292c-.892 1.64.901 3.434 2.541 2.54l.292-.159a.873.873 0 0 1 1.255.52l.094.319c.527 1.79 3.065 1.79 3.592 0l.094-.319a.873.873 0 0 1 1.255-.52l.292.16c1.64.893 3.434-.902 2.54-2.541l-.159-.292a.873.873 0 0 1 .52-1.255l.319-.094c1.79-.527 1.79-3.065 0-3.592l-.319-.094a.873.873 0 0 1-.52-1.255l.16-.292c.893-1.64-.902-3.433-2.541-2.54l-.292.159a.873.873 0 0 1-1.255-.52l-.094-.319zm-2.633.283c.246-.835 1.428-.835 1.674 0l.094.319a1.873 1.873 0 0 0 2.693 1.115l.291-.16c.764-.415 1.6.42 1.184 1.185l-.159.292a1.873 1.873 0 0 0 1.116 2.692l.318.094c.835.246.835 1.428 0 1.674l-.319.094a1.873 1.873 0 0 0-1.115 2.693l.16.291c.415.764-.42 1.6-1.185 1.184l-.291-.159a1.873 1.873 0 0 0-2.693 1.116l-.094.318c-.246.835-1.428.835-1.674 0l-.094-.319a1.873 1.873 0 0 0-2.692-1.115l-.292.16c-.764.415-1.6-.42-1.184-1.185l.159-.291A1.873 1.873 0 0 0 1.945 8.93l-.319-.094c-.835-.246-.835-1.428 0-1.674l.319-.094A1.873 1.873 0 0 0 3.06 4.377l-.16-.292c-.415-.764.42-1.6 1.185-1.184l.292.159a1.873 1.873 0 0 0 2.692-1.115l.094-.319z"/>
                </svg>
            </span>
            Copy as Schema
        </div>
        <div class="context-menu-item" data-action="open-dashboard">
            <span class="icon">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M0 3a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V3zm5 3a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm0 2.5a.5.5 0 0 1 .5.5v3a.5.5 0 0 1-1 0V9a.5.5 0 0 1 .5-.5zm2-.5a.5.5 0 0 0-1 0v5a.5.5 0 0 0 1 0V8zm2 0a.5.5 0 0 0-1 0v5a.5.5 0 0 0 1 0V8zm2 0a.5.5 0 0 0-1 0v5a.5.5 0 0 0 1 0V8z"/>
                </svg>
            </span>
            Open in Echo Dashboard
        </div>
        <div class="context-menu-item" data-action="run-postman">
            <span class="icon">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M5.5 3.5a.5.5 0 1 1-1 0 .5.5 0 0 1 1 0zM3.5 1a.5.5 0 0 0 0 1H13a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3.5a.5.5 0 0 0-1 0V13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V3a2 2 0 0 0-2-2H3.5z"/>
                    <path d="M4.5 6a.5.5 0 0 0 0 1h7a.5.5 0 0 0 0-1h-7zm0 3a.5.5 0 0 0 0 1h7a.5.5 0 0 0 0-1h-7zm0 3a.5.5 0 0 0 0 1h7a.5.5 0 0 0 0-1h-7z"/>
                </svg>
            </span>
            Run in Postman
        </div>
        <div class="context-menu-divider"></div>
        <div class="context-menu-item" data-action="copy-all">
            <span class="icon">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M2 2a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v13.5a.5.5 0 0 1-.777.416L8 13.101l-5.223 2.815A.5.5 0 0 1 2 15.5V2zm2-1a1 1 0 0 0-1 1v12.566l4.723-2.482a.5.5 0 0 1 .554 0L13 14.566V2a1 1 0 0 0-1-1H4z"/>
                </svg>
            </span>
            Copy Request Details
        </div>
    `;
    
    // Position menu at cursor
    menu.style.left = event.pageX + 'px';
    menu.style.top = event.pageY + 'px';
    
    // Adjust position if menu would go off screen
    document.body.appendChild(menu);
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
        menu.style.left = (event.pageX - rect.width) + 'px';
    }
    if (rect.bottom > window.innerHeight) {
        menu.style.top = (event.pageY - rect.height) + 'px';
    }
    
    // Handle menu item clicks
    menu.addEventListener('click', (e) => {
        const item = e.target.closest('.context-menu-item');
        if (item) {
            const action = item.dataset.action;
            handleContextMenuAction(action, request);
        }
        menu.remove();
    });
    
    // Remove menu on outside click
    setTimeout(() => {
        document.addEventListener('click', () => menu.remove(), { once: true });
    }, 0);
}

// Create a schema version of an object (truncate arrays to first item only)
function createObjectSchema(obj, maxDepth = 10, currentDepth = 0) {
    if (currentDepth >= maxDepth) {
        return '[Max Depth Reached]';
    }
    
    if (obj === null || obj === undefined) {
        return obj;
    }
    
    if (typeof obj !== 'object') {
        return obj;
    }
    
    if (Array.isArray(obj)) {
        if (obj.length === 0) {
            return [];
        }
        // Only include the first item of the array, but show it's an array
        const firstItem = createObjectSchema(obj[0], maxDepth, currentDepth + 1);
        return [firstItem, `... +${obj.length - 1} more items`];
    }
    
    // Handle regular objects
    const schema = {};
    for (const [key, value] of Object.entries(obj)) {
        schema[key] = createObjectSchema(value, maxDepth, currentDepth + 1);
    }
    
    return schema;
}

// Handle context menu actions
function handleContextMenuAction(action, request) {
    try {
        const dashboardData = generateDashboardFormat(request);
        const postmanCollection = generatePostmanCollection(request);
        
        switch (action) {
            case 'copy-json':
                // Create complete JSON object with all pieces
                let payload = null;
                let responseBody = null;
                
                // For GET requests with query params, use them as payload
                if (request.method === 'GET' && request.queryParams) {
                    payload = request.queryParams;
                } else {
                    try {
                        payload = request.requestBody ? JSON.parse(request.requestBody) : null;
                    } catch {
                        payload = request.requestBody; // Keep as string if not JSON
                    }
                }
                
                try {
                    responseBody = request.responseBody ? JSON.parse(request.responseBody) : null;
                } catch {
                    responseBody = request.responseBody; // Keep as string if not JSON
                }
                
                const jsonObject = {
                    request: {
                        url: request.url,
                        method: request.method,
                        headers: request.requestHeaders ? request.requestHeaders.reduce((acc, h) => {
                            acc[h.name] = h.value;
                            return acc;
                        }, {}) : {}
                    },
                    payload: payload,
                    response: {
                        status: request.status,
                        headers: request.responseHeaders ? request.responseHeaders.reduce((acc, h) => {
                            acc[h.name] = h.value;
                            return acc;
                        }, {}) : {},
                        body: responseBody
                    },
                    curl: request.curl || generateCurl(request)
                };
                copyToClipboard(JSON.stringify(jsonObject, null, 2));
                break;
                
            case 'copy-curl':
                copyToClipboard(request.curl || generateCurl(request));
                break;
                
            case 'copy-schema':
                // Create schema version with truncated arrays
                let payloadSchema = null;
                let responseBodySchema = null;
                
                // For GET requests with query params, use them as payload
                if (request.method === 'GET' && request.queryParams) {
                    payloadSchema = createObjectSchema(request.queryParams);
                } else {
                    try {
                        if (request.requestBody) {
                            const payload = JSON.parse(request.requestBody);
                            payloadSchema = createObjectSchema(payload);
                        }
                    } catch {
                        payloadSchema = request.requestBody; // Keep as string if not JSON
                    }
                }
                
                try {
                    if (request.responseBody) {
                        const responseBody = JSON.parse(request.responseBody);
                        responseBodySchema = createObjectSchema(responseBody);
                    }
                } catch {
                    responseBodySchema = request.responseBody; // Keep as string if not JSON
                }
                
                const schemaObject = {
                    request: {
                        url: request.url,
                        method: request.method,
                        headers: request.requestHeaders ? request.requestHeaders.reduce((acc, h) => {
                            acc[h.name] = h.value;
                            return acc;
                        }, {}) : {}
                    },
                    payload: payloadSchema,
                    response: {
                        status: request.status,
                        headers: request.responseHeaders ? request.responseHeaders.reduce((acc, h) => {
                            acc[h.name] = h.value;
                            return acc;
                        }, {}) : {},
                        body: responseBodySchema
                    }
                };
                copyToClipboard(JSON.stringify(schemaObject, null, 2));
                showToast('Schema copied to clipboard!', 'success');
                break;
                
            case 'open-dashboard':
                sendRuntimeMessage({
                    type: 'open-dashboard',
                    data: dashboardData
                });
                break;
                
            case 'run-postman':
                sendRuntimeMessage({
                    type: 'run-postman',
                    data: postmanCollection
                });
                break;
                
            case 'copy-all':
                const details = JSON.stringify(dashboardData, null, 2);
                copyToClipboard(details);
                break;
        }
    } catch (error) {
        console.error('Error handling context menu action:', error);
        showToast('Error: ' + error.message, 'error');
    }
}

// Show details panel
function showDetailsPanel() {
    document.getElementById('details-panel').classList.add('visible');
    document.getElementById('splitter').classList.add('visible');
}

// Hide details panel
function hideDetailsPanel() {
    document.getElementById('details-panel').classList.remove('visible');
    document.getElementById('splitter').classList.remove('visible');
    selectedRequest = null;
    document.querySelectorAll('.request-item').forEach(item => {
        item.classList.remove('selected');
    });
}

// Show request details
function showRequestDetails(request) {
    document.getElementById('details-title').textContent = `${request.method} ${request.status}`;
    
    const content = document.getElementById('details-content');
    
    switch (activeTab) {
        case 'headers':
            showHeadersTab(request, content);
            break;
        case 'payload':
            showPayloadTab(request, content);
            break;
        case 'response':
            showResponseTab(request, content);
            break;
        case 'curl':
            showCurlTab(request, content);
            break;
    }
}

// Show headers tab
function showHeadersTab(request, container) {
    let html = '<h3>General</h3>';
    html += '<table class="headers-table">';
    html += `<tr><td>URL</td><td title="${escapeHtml(request.url)}">${escapeHtml(request.url)}</td></tr>`;
    html += `<tr><td>Method</td><td>${request.method}</td></tr>`;
    html += `<tr><td>Status</td><td>${request.status}</td></tr>`;
    html += `<tr><td>Duration</td><td>${request.duration}ms</td></tr>`;
    html += `<tr><td>Size</td><td>${formatBytes(request.size)}</td></tr>`;
    html += '</table>';
    
    html += '<h3>Request Headers</h3>';
    html += '<table class="headers-table">';
    if (request.requestHeaders) {
        request.requestHeaders.forEach(header => {
            html += `<tr><td>${escapeHtml(header.name)}</td><td title="${escapeHtml(header.value)}">${escapeHtml(header.value)}</td></tr>`;
        });
    }
    html += '</table>';
    
    html += '<h3>Response Headers</h3>';
    html += '<table class="headers-table">';
    if (request.responseHeaders) {
        request.responseHeaders.forEach(header => {
            html += `<tr><td>${escapeHtml(header.name)}</td><td title="${escapeHtml(header.value)}">${escapeHtml(header.value)}</td></tr>`;
        });
    }
    html += '</table>';
    
    html += '<div style="margin-top: 20px; padding: 10px; background: #2d2d30; border-radius: 4px; font-size: 11px; color: #969696;">';
    html += 'Tip: Right-click on a request in the list to access export options (Copy as cURL, Open in Dashboard, Run in Postman)';
    html += '</div>';
    
    container.innerHTML = html;
    
    // Add click handlers to copy values
    container.querySelectorAll('.headers-table td:last-child').forEach(td => {
        td.addEventListener('click', () => {
            copyToClipboard(td.textContent);
        });
    });
}

// Show payload tab
function showPayloadTab(request, container) {
    // Check if it's a GET request with query parameters
    if (request.method === 'GET' && request.queryParams) {
        try {
            const jsonHtml = syntaxHighlightJSON(request.queryParams);
            const queryParamsJson = JSON.stringify(request.queryParams, null, 2);
            container.innerHTML = `
                <div class="json-viewer">
                    <h3 style="margin: 0 0 10px 0; color: #ddd; font-size: 12px;">Query Parameters</h3>
                    <button class="copy-json-btn" data-content="${escapeHtml(queryParamsJson)}">Copy</button>
                    <pre>${jsonHtml}</pre>
                </div>
            `;
            addJsonClickHandlers(container, request.queryParams);
        } catch (error) {
            console.error('Error displaying query parameters:', error);
            container.innerHTML = '<p style="color: #858585;">Error displaying query parameters</p>';
        }
    } else if (!request.requestBody) {
        container.innerHTML = '<p style="color: #858585;">No request payload</p>';
        return;
    } else {
        // Handle regular request body
        try {
            const parsed = JSON.parse(request.requestBody);
            const jsonHtml = syntaxHighlightJSON(parsed);
            container.innerHTML = `
                <div class="json-viewer">
                    <button class="copy-json-btn" data-content="${escapeHtml(request.requestBody)}">Copy</button>
                    <pre>${jsonHtml}</pre>
                </div>
            `;
            addJsonClickHandlers(container, parsed);
        } catch {
            container.innerHTML = `
                <div class="json-viewer">
                    <button class="copy-json-btn" data-content="${escapeHtml(request.requestBody)}">Copy</button>
                    <pre>${escapeHtml(request.requestBody)}</pre>
                </div>
            `;
        }
    }
    
    // Add copy button handler
    const copyBtn = container.querySelector('.copy-json-btn');
    if (copyBtn) {
        copyBtn.addEventListener('click', () => copyToClipboard(copyBtn.dataset.content));
    }
}

// Show response tab
function showResponseTab(request, container) {
    if (!request.responseBody) {
        container.innerHTML = '<p style="color: #858585;">No response body</p>';
        return;
    }
    
    try {
        const parsed = JSON.parse(request.responseBody);
        const jsonHtml = syntaxHighlightJSON(parsed);
        container.innerHTML = `
            <div class="json-viewer">
                <button class="copy-json-btn" data-content="${escapeHtml(request.responseBody)}">Copy</button>
                <pre>${jsonHtml}</pre>
            </div>
        `;
        addJsonClickHandlers(container, parsed);
    } catch {
        container.innerHTML = `
            <div class="json-viewer">
                <button class="copy-json-btn" data-content="${escapeHtml(request.responseBody)}">Copy</button>
                <pre>${escapeHtml(request.responseBody)}</pre>
            </div>
        `;
    }
    
    // Add copy button handler
    const copyBtn = container.querySelector('.copy-json-btn');
    if (copyBtn) {
        copyBtn.addEventListener('click', () => copyToClipboard(copyBtn.dataset.content));
    }
}

// Show cURL tab
function showCurlTab(request, container) {
    const curl = generateCurl(request);
    container.innerHTML = `
        <div class="json-viewer">
            <button class="copy-json-btn" data-content="${escapeHtml(curl)}">Copy</button>
            <pre>${escapeHtml(curl)}</pre>
        </div>
    `;
    
    // Add copy button handler
    const copyBtn = container.querySelector('.copy-json-btn');
    if (copyBtn) {
        copyBtn.addEventListener('click', () => copyToClipboard(copyBtn.dataset.content));
    }
}

// Add click handlers for JSON values
function addJsonClickHandlers(container, obj) {
    container.querySelectorAll('.json-string, .json-number, .json-boolean, .json-null, .json-key').forEach(elem => {
        elem.addEventListener('click', (e) => {
            e.stopPropagation();
            const value = elem.textContent.replace(/^"|"$/g, '').replace(/:$/, '');
            copyToClipboard(value, elem);
        });
    });
}

// Toast notification system
function showToast(message, type = 'success', duration = 1500) {
    const toastContainer = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const icons = {
        success: '✓',
        error: '✗'
    };
    
    toast.innerHTML = `
        <span class="toast-icon">${icons[type] || icons.success}</span>
        <span>${message}</span>
    `;
    
    toastContainer.appendChild(toast);
    
    setTimeout(() => {
        toast.classList.add('hiding');
        setTimeout(() => toast.remove(), 150);
    }, duration);
}

// Send runtime message with error handling
function sendRuntimeMessage(message) {
    if (!chrome.runtime) {
        showToast('Extension context lost. Please close and reopen DevTools.', 'error');
        return;
    }
    
    try {
        chrome.runtime.sendMessage(message, (response) => {
            if (chrome.runtime.lastError) {
                console.error('Runtime message failed:', chrome.runtime.lastError);
                if (message.type === 'copy-to-clipboard') {
                    showToast('Failed to copy to clipboard', 'error');
                } else {
                    showToast('Action failed. Please try again.', 'error');
                }
                return;
            }
            
            if (response && response.success) {
                if (message.type === 'copy-to-clipboard') {
                    showToast('Copied to clipboard!', 'success');
                } else {
                    showToast('Action completed successfully!', 'success');
                }
            } else {
                if (message.type === 'copy-to-clipboard') {
                    showToast('Failed to copy to clipboard', 'error');
                } else {
                    showToast('Action failed. Please try again.', 'error');
                }
            }
        });
    } catch (error) {
        console.error('Failed to send message:', error);
        showToast('Extension error. Please reload DevTools.', 'error');
    }
}

// Copy to clipboard with error handling
function copyToClipboard(text, element) {
    // DevTools context doesn't have clipboard permissions, so always use background script
    console.log('Attempting to copy text:', text.substring(0, 100) + '...');
    sendRuntimeMessage({
        type: 'copy-to-clipboard',
        text: text
    });
}

// Syntax highlight JSON
function syntaxHighlightJSON(obj) {
    const json = JSON.stringify(obj, null, 2);
    // First escape HTML entities
    const escaped = json
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    
    return escaped.replace(/("(\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, 
        function (match) {
            let cls = 'json-number';
            if (/^"/.test(match)) {
                if (/:$/.test(match)) {
                    cls = 'json-key';
                } else {
                    cls = 'json-string';
                }
            } else if (/true|false/.test(match)) {
                cls = 'json-boolean';
            } else if (/null/.test(match)) {
                cls = 'json-null';
            }
            return '<span class="' + cls + '">' + match + '</span>';
        }
    );
}

// Escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Generate dashboard format with safe serialization
function generateDashboardFormat(request) {
    try {
        // Safely extract headers to avoid circular references
        const safeHeaders = (headers) => {
            if (!headers || !Array.isArray(headers)) return [];
            return headers.map(h => ({
                name: String(h.name || h.key || ''),
                value: String(h.value || '')
            })).slice(0, 50); // Limit to 50 headers max
        };
        
        // Safely extract string data with intelligent size limits
        const safeString = (str, maxLength = 10000000) => { // 10MB limit
            if (!str) return '';
            const stringValue = String(str);
            
            // For very large strings, try to detect if it's repetitive JSON that will compress well
            if (stringValue.length > maxLength) {
                // Check if it's JSON and might compress well
                try {
                    JSON.parse(stringValue);
                    // If it's valid JSON, it will likely compress well, so keep more of it
                    const jsonMaxLength = Math.min(stringValue.length, maxLength * 2); // Allow up to 20MB for JSON
                    if (stringValue.length > jsonMaxLength) {
                        console.warn(`Large JSON response truncated from ${stringValue.length} to ${jsonMaxLength} characters`);
                        return stringValue.substring(0, jsonMaxLength) + `... [TRUNCATED - Original size: ${stringValue.length} chars]`;
                    }
                    return stringValue;
                } catch {
                    // Not JSON, apply normal limit
                    console.warn(`Large text response truncated from ${stringValue.length} to ${maxLength} characters`);
                    return stringValue.substring(0, maxLength) + `... [TRUNCATED - Original size: ${stringValue.length} chars]`;
                }
            }
            return stringValue;
        };
        
        const dashboardData = {
            request: {
                url: String(request.url || ''),
                method: String(request.method || 'GET'),
                headers: safeHeaders(request.requestHeaders)
            },
            payload: safeString(request.requestBody),
            response: {
                status: Number(request.status) || 0,
                headers: safeHeaders(request.responseHeaders),
                body: safeString(request.responseBody)
            },
            curl: generateCurl(request)
        };
        
        // Include query parameters as payload for GET requests
        if (request.method === 'GET' && request.queryParams) {
            dashboardData.payload = JSON.stringify(request.queryParams, null, 2);
        }
        
        // Test that the object can be serialized
        JSON.stringify(dashboardData);
        
        return dashboardData;
    } catch (error) {
        console.error('Error generating dashboard format:', error);
        // Return minimal safe data
        return {
            request: {
                url: String(request.url || ''),
                method: String(request.method || 'GET'),
                headers: []
            },
            payload: null,
            response: {
                status: Number(request.status) || 0,
                headers: [],
                body: 'Error: Could not serialize response data'
            },
            curl: `curl -X ${request.method || 'GET'} '${request.url || ''}'`
        };
    }
}

// Generate cURL command with pretty formatting
function generateCurl(request) {
    try {
        const method = String(request.method || 'GET');
        const url = String(request.url || '');
        let curl = `curl -X ${method} \\\n  '${url}'`;
        
        if (request.requestHeaders && Array.isArray(request.requestHeaders)) {
            request.requestHeaders.slice(0, 20).forEach(header => { // Limit headers
                if (header && header.name && header.value) {
                    const name = String(header.name);
                    const value = String(header.value);
                    if (name.toLowerCase() !== 'cookie' && value.length < 1000) { // Skip very long headers
                        curl += ` \\\n  -H '${name}: ${value.replace(/'/g, "\\'")}}'`;
                    }
                }
            });
        }
        
        if (request.requestBody) {
            // Pretty print JSON payload if possible
            let bodyData = String(request.requestBody);
            
            // Limit body size
            if (bodyData.length > 10000) {
                bodyData = bodyData.substring(0, 10000) + '... [TRUNCATED]';
            }
            
            try {
                const parsed = JSON.parse(bodyData);
                bodyData = JSON.stringify(parsed, null, 2);
            } catch {
                // Keep original if not JSON
            }
            
            // Escape single quotes in the data
            const escapedData = bodyData.replace(/'/g, "\\'");
            curl += ` \\\n  -d '${escapedData}'`;
        }
        
        return curl;
    } catch (error) {
        console.error('Error generating cURL:', error);
        return `curl -X ${request.method || 'GET'} '${request.url || ''}'`;
    }
}

// Generate Postman Collection v2.1.0
function generatePostmanCollection(request) {
    const collection = {
        info: {
            name: `Echo Capture - ${new Date().toISOString()}`,
            schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
        },
        item: [
            {
                name: request.url.split('?')[0].split('/').pop() || 'Request',
                request: {
                    method: request.method,
                    header: [],
                    url: {
                        raw: request.url,
                        protocol: request.url.split(':')[0],
                        host: request.url.split('//')[1].split('/')[0].split('.'),
                        path: request.url.split('//')[1].split('/').slice(1).map(p => p.split('?')[0])
                    }
                }
            }
        ]
    };
    
    if (request.requestHeaders) {
        request.requestHeaders.forEach(header => {
            collection.item[0].request.header.push({
                key: header.name,
                value: header.value
            });
        });
    }
    
    if (request.requestBody) {
        const contentType = request.requestHeaders?.find(h => h.name.toLowerCase() === 'content-type')?.value || '';
        
        if (contentType.includes('application/json')) {
            collection.item[0].request.body = {
                mode: 'raw',
                raw: request.requestBody,
                options: {
                    raw: {
                        language: 'json'
                    }
                }
            };
        } else if (contentType.includes('application/x-www-form-urlencoded')) {
            collection.item[0].request.body = {
                mode: 'urlencoded',
                urlencoded: parseUrlEncoded(request.requestBody)
            };
        } else {
            collection.item[0].request.body = {
                mode: 'raw',
                raw: request.requestBody
            };
        }
    }
    
    const urlParts = request.url.split('?');
    if (urlParts.length > 1) {
        collection.item[0].request.url.query = parseQueryString(urlParts[1]);
    }
    
    return collection;
}

// Parse URL encoded data
function parseUrlEncoded(data) {
    return data.split('&').map(pair => {
        const [key, value] = pair.split('=');
        return {
            key: decodeURIComponent(key || ''),
            value: decodeURIComponent(value || '')
        };
    });
}

// Parse query string
function parseQueryString(queryString) {
    return queryString.split('&').map(pair => {
        const [key, value] = pair.split('=');
        return {
            key: decodeURIComponent(key || ''),
            value: decodeURIComponent(value || '')
        };
    });
}

// Export all requests as HAR
function exportAsHAR() {
    const har = {
        log: {
            version: "1.2",
            creator: {
                name: "Echo DevTools Extension",
                version: "1.0.0"
            },
            entries: requests.map(req => ({
                startedDateTime: new Date(req.startTime).toISOString(),
                time: req.duration,
                request: {
                    method: req.method,
                    url: req.url,
                    httpVersion: "HTTP/1.1",
                    headers: req.requestHeaders || [],
                    queryString: [],
                    postData: req.requestBody ? {
                        mimeType: req.requestHeaders?.find(h => h.name.toLowerCase() === 'content-type')?.value || 'text/plain',
                        text: req.requestBody
                    } : undefined
                },
                response: {
                    status: req.status,
                    statusText: "",
                    httpVersion: "HTTP/1.1",
                    headers: req.responseHeaders || [],
                    content: {
                        size: req.size,
                        mimeType: req.responseHeaders?.find(h => h.name.toLowerCase() === 'content-type')?.value || 'text/plain',
                        text: req.responseBody || ""
                    }
                }
            }))
        }
    };
    
    const blob = new Blob([JSON.stringify(har, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `echo-har-${new Date().toISOString()}.har`;
    a.click();
    URL.revokeObjectURL(url);
}

// Copy all requests as cURL bash script
function copyAllAsCurl() {
    const curlCommands = requests.map(req => {
        const curl = generateCurl(req);
        return `# ${req.method} ${req.url}\n${curl}\n`;
    }).join('\n');
    
    // Use the same clipboard method as other copies
    copyToClipboard(curlCommands);
}

// Compress string using gzip (same as background.js)
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

// Open local dashboard with current requests
async function openLocalDashboard() {
    try {
        console.log('Starting dashboard data preparation...', requests.length, 'requests');
        
        if (requests.length === 0) {
            showToast('No requests to display', 'info');
            return;
        }
        
        // Prepare the data in the same format as the dashboard expects
        const dashboardData = [];
        for (let i = 0; i < requests.length; i++) {
            try {
                console.log(`Processing request ${i + 1}/${requests.length}...`);
                const formatted = generateDashboardFormat(requests[i]);
                dashboardData.push(formatted);
            } catch (error) {
                console.error(`Error processing request ${i}:`, error);
                // Skip problematic requests
                continue;
            }
        }
        
        if (dashboardData.length === 0) {
            showToast('No valid requests to display', 'error');
            return;
        }
        
        console.log('Successfully processed', dashboardData.length, 'requests');
        
        // Show progress for serialization
        showToast('Serializing data...', 'info', 1000);
        
        // Compress the data using the same logic as background.js
        let jsonString;
        try {
            // Use a safer JSON.stringify with circular reference detection
            const seen = new Set();
            jsonString = JSON.stringify(dashboardData, (key, value) => {
                // Handle circular references
                if (typeof value === 'object' && value !== null) {
                    if (seen.has(value)) {
                        return '[Circular Reference]';
                    }
                    seen.add(value);
                }
                
                // Limit extremely long strings
                if (typeof value === 'string' && value.length > 10000000) { // 10MB string limit
                    return value.substring(0, 10000000) + '... [String Truncated]';
                }
                
                return value;
            });
            console.log('Original JSON length:', jsonString.length, 'characters');
            console.log('Original JSON size:', Math.round(jsonString.length / 1024), 'KB');
        } catch (error) {
            console.error('JSON stringify error:', error);
            // Fallback: try with a simpler, more limited approach
            try {
                console.log('Attempting fallback serialization with data limits...');
                jsonString = JSON.stringify(dashboardData.map(req => ({
                    request: {
                        url: String(req.request?.url || '').substring(0, 2000),
                        method: req.request?.method || 'GET',
                        headers: (req.request?.headers || []).slice(0, 20).map(h => ({
                            name: String(h.name || h.key || '').substring(0, 200),
                            value: String(h.value || '').substring(0, 1000)
                        }))
                    },
                    payload: req.payload ? String(req.payload).substring(0, 100000) : null,
                    response: {
                        status: req.response?.status || 0,
                        headers: (req.response?.headers || []).slice(0, 20).map(h => ({
                            name: String(h.name || h.key || '').substring(0, 200),
                            value: String(h.value || '').substring(0, 1000)
                        })),
                        body: req.response?.body ? String(req.response.body).substring(0, 500000) : ''
                    },
                    curl: req.curl ? String(req.curl).substring(0, 50000) : ''
                })));
                console.log('Fallback serialization successful, length:', jsonString.length);
            } catch (fallbackError) {
                console.error('Fallback serialization also failed:', fallbackError);
                throw new Error('Failed to serialize dashboard data - data contains circular references or is too complex');
            }
        }
        
        // Show compression progress
        showToast('Compressing data...', 'info', 1000);
        
        // Use native CompressionStream for compression
        const compressed = await compressString(jsonString);
        console.log('Compressed size:', compressed.length, 'bytes');
        console.log('Compression ratio:', Math.round((1 - compressed.length / jsonString.length) * 100) + '%');
        
        const base64Data = btoa(String.fromCharCode(...new Uint8Array(compressed)));
        console.log('Final base64 length:', base64Data.length, 'characters');
        
        // Send message to background script to open the dashboard
        const response = await sendRuntimeMessage({
            type: 'open-local-dashboard',
            data: base64Data
        });
        
        if (response && response.success) {
            showToast('Opening local dashboard...', 'success');
        } else {
            throw new Error(response?.error || 'Failed to open dashboard');
        }
    } catch (error) {
        console.error('Error opening local dashboard:', error);
        showToast(`Failed to open local dashboard: ${error.message}`, 'error');
    }
}

// Initialize
updateRequestsList();