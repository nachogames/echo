# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Echo is a developer tool for debugging and sharing network requests. It consists of:
- **Chrome DevTools Extension**: Captures network requests with advanced filtering and analysis
- **Dual Dashboard System**: Internal (dark theme) and external (light theme) viewers for analyzing requests
- **Postman Integration**: Direct export to Postman Collections v2.1.0

## Architecture

### Chrome Extension (`/chrome-extension`)
- **Manifest V3** service worker architecture with modern Chrome APIs
- **DevTools Panel**: Custom "Echo" panel with resizable split-view interface
- **Background Service Worker**: Handles context menus, message routing, and dashboard launching
- **Internal Dashboard**: Built-in dashboard accessible via extension (dashboard.html)
- **Data Flow**: Network API → Panel → Compression → Storage → Background → Dashboard/Postman

### Dashboard Systems
1. **Internal Dashboard** (`/chrome-extension/dashboard.html`)
   - Dark theme, hosted within extension
   - Accessed via "Open Local Dashboard" button
   - Uses web_accessible_resources in manifest

2. **External Dashboard** (`/dashboard/index2.html`)
   - Light theme, designed for standalone hosting
   - Accessed via context menu → "Open in Echo Dashboard"
   - Configurable URL in background.js line 79

Both dashboards feature:
- Smart copy detection (UUIDs, JWTs, URLs, emails)
- JSON syntax highlighting with collapsible sections
- Multi-request viewing with selector
- Compressed data transfer via URL parameters

## Development Commands

### Chrome Extension
```bash
# Load unpacked extension
# 1. Navigate to chrome://extensions
# 2. Enable Developer mode
# 3. Click "Load unpacked" and select /chrome-extension directory

# Test resizable panel
# 1. Open Chrome DevTools (F12)
# 2. Look for "Echo" tab
# 3. Drag the splitter to resize request list/details panes
```

### Dashboard Testing
```bash
# Serve external dashboard with automatic port selection
./serve-dashboard.sh
# Tries ports: 8080, 8081, 8082, 8000, 3000, 3001, 5000, 5001

# Manual testing
cd dashboard && python3 -m http.server 8000

# Update dashboard URL in background.js line 79:
# - Local: http://localhost:8000/index2.html
# - Production: https://your-domain.com/echo-dashboard/
```

## Key Features

### Resizable Panel Interface
- Draggable splitter between request list and details
- Minimum pane width: 150px
- Persists width to localStorage (`panelWidth`)
- Visual hover effects and cursor feedback

### Request Capture & Filtering
- Captures all network requests via Chrome DevTools API
- Filters by: XHR, Fetch, JS, CSS, Image, Font, Document, WebSocket, Media, Other
- Domain tag filtering with visual pills
- Search across URL, method, status, domain
- Special filters: failed requests (4xx/5xx), slow requests (>1s)

### Data Compression
- Uses native CompressionStream API for gzip compression
- Reduces dashboard URL parameter size
- Fallback to uncompressed data on error
- Base64 encoding for URL safety

### Smart Copy System
Pattern detection with type-specific colors:
- **UUID**: Yellow highlighting (#fffbdd)
- **JWT**: Light blue (#e3f2fd)
- **Email**: Light green (#e8f5e9)
- **URL**: Gray (#f5f5f5)
- **Domain**: Light gray (#fafafa)
- **Nested patterns**: Enhanced highlighting (e.g., UUID in URL)

## Key Integration Points

### Request Data Formats
1. **Dashboard Format**: Simplified JSON with request, payload, response, curl
2. **Postman Format**: Full Collection v2.1.0 structure with proper escaping
3. **HAR Format**: Standard HTTP Archive format for all requests

### Chrome Storage Keys
- `lastRequest`: Dashboard format data
- `lastPostmanCollection`: Postman collection data
- `panelWidth`: Saved splitter position

### Context Menu Actions
- Copy as JSON/cURL/Schema
- Open in Echo Dashboard (external)
- Run in Postman
- Export all as HAR

## Common Development Tasks

### Adding New Filters
1. Update `panel.js` filter logic in request display
2. Add filter UI elements (buttons/checkboxes)
3. Update `filterRequests()` function
4. Add to clear filters functionality

### Modifying Smart Copy Patterns
1. Edit pattern detection in dashboard files
2. Update `detectAndHighlightPatterns()` function
3. Add new CSS classes for highlighting
4. Test with `test-smart-highlighting.html`

### Extending Context Menu
1. Update `background.js` chrome.contextMenus.create()
2. Add handler in onClicked listener
3. Access data from chrome.storage.local
4. Handle in panel.js message listener if needed

### Dashboard Modifications
1. Internal dashboard: Edit `/chrome-extension/dashboard.html`
2. External dashboard: Edit `/dashboard/index2.html`
3. Maintain URL parameter compatibility
4. Test compression/decompression flow

## Testing Workflow
1. Load extension in Chrome
2. Open DevTools Echo panel
3. Make test requests (various types)
4. Test resizable panel functionality
5. Right-click → test context menu actions
6. Verify both dashboards display correctly
7. Test Postman export functionality
8. Check smart copy detection
9. Verify filter combinations

## Important Implementation Notes

### JSON Rendering Structure
Response body must use this exact structure for collapsible JSON:
```html
<pre id="response-body"><div class="json-viewer">{syntaxHighlightJSON output}</div></pre>
```

### Error Handling
- Extension reloads may lose context - show user warning
- Circular references handled with custom replacer
- Large responses truncated with size indicator
- Compression failures fall back gracefully

### Performance Considerations
- Maximum 500 requests in memory
- Request list updates throttled
- JSON highlighting applied lazily
- Smart copy detection optimized for performance

### Known Limitations
- Context menu only works when right-clicking in Echo panel
- Dashboard URL length limited by browser (use compression)
- Some auth headers may be filtered by Chrome
- WebSocket message content not fully captured

## Current Issues and Fixes (Dec 2024)

### Domain Detection False Positives
Headers like "access-control-allow-credentials" incorrectly highlighted as domains.
Fix by excluding patterns with multiple consecutive hyphens in detection logic.

### Panel Resize Persistence
Splitter position saved to localStorage but may need migration if key changes.

### Compression Browser Support
CompressionStream API requires modern browsers - include fallback for older versions.