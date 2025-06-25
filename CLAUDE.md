# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Echo is a developer tool for debugging and sharing network requests. It consists of:
- **Chrome DevTools Extension**: Captures network requests and provides context menu actions
- **Inspector Dashboard**: Web-based viewer for analyzing requests with Postman integration

## Architecture

### Chrome Extension (`/chrome-extension`)
- **Manifest V3** service worker architecture
- **DevTools Panel**: Custom panel showing network requests
- **Background Service Worker**: Handles context menu and cross-component communication
- **Data Flow**: Network API → Panel → Storage → Background → Dashboard/Postman

### Dashboard (`/dashboard`)
- **Single-file HTML** application with embedded CSS/JS
- **Base64 URL parameter** for receiving request data
- **Postman Collection v2.1.0** generation and submission

## Development Commands

### Chrome Extension
```bash
# Load unpacked extension in Chrome
# 1. Navigate to chrome://extensions
# 2. Enable Developer mode
# 3. Click "Load unpacked" and select /chrome-extension directory

# Test DevTools panel
# 1. Open Chrome DevTools (F12)
# 2. Look for "Echo" tab
# 3. Make network requests to see them captured
```

### Dashboard
```bash
# The dashboard is designed to be hosted separately from the extension
# For local testing, use the provided serve script:
./serve-dashboard.sh

# Or manually:
cd dashboard && python3 -m http.server 8000
# Then navigate to http://localhost:8000

# Update background.js line 55 with your dashboard URL:
# - Local: http://localhost:8000/index.html
# - Production: https://your-domain.com/echo-dashboard/

# Test with sample data
# Append ?data=<base64-encoded-json> to URL
```

## Key Integration Points

### Request Data Format
The extension generates two formats:
1. **Dashboard Format**: Simplified JSON with request, payload, response, curl
2. **Postman Format**: Full Collection v2.1.0 structure

### Chrome Storage Keys
- `lastRequest`: Dashboard format data
- `lastPostmanCollection`: Postman collection data

### Postman Integration
- Collection submission endpoint: `https://app.getpostman.com/run-collection/fork`
- Uses form POST with `collection` parameter containing JSON

## Common Development Tasks

### Adding New Context Menu Items
1. Update `background.js` to create menu item
2. Add handler in chrome.contextMenus.onClicked
3. Access stored data from chrome.storage.local

### Modifying Request Capture
1. Edit `panel.js` chrome.devtools.network.onRequestFinished listener
2. Update data transformation logic
3. Ensure both dashboard and Postman formats are generated

### Updating Dashboard UI
1. All changes in single `dashboard/index.html` file
2. Maintain Base64 parsing compatibility
3. Test with various request types (GET, POST, with/without auth)

## Testing Workflow
1. Load extension in Chrome
2. Open DevTools Echo panel
3. Make test requests
4. Right-click request → "Open in Echo Dashboard"
5. Verify dashboard displays correctly
6. Test "Run in Postman" button

## Important Notes
- Always test with real network requests, not mock data
- Ensure Base64 encoding/decoding handles special characters
- Postman Collection must include proper auth headers
- Context menu only works when right-clicking in the Echo panel

## Current Dashboard Issues and Fixes (Dec 2024)

### JSON Rendering Fix
The response body must use proper structure for syntax highlighting to work:
```html
<pre id="response-body"><div class="json-viewer">{syntaxHighlightJSON output}</div></pre>
```
- Do NOT add class="json-viewer" to the pre tag
- The syntaxHighlightJSON function generates HTML with spans for collapsible sections

### Smart Copy Multi-Color Highlighting
Implemented type-specific colors:
- UUID: Yellow (#fffbdd → #ffeb3b hover)
- JWT: Light blue (#e3f2fd → #bbdefb hover) 
- Email: Light green (#e8f5e9 → #c8e6c9 hover)
- URL: Gray (#f5f5f5 → #eeeeee hover)
- Domain: Light gray (#fafafa → #f5f5f5 hover)
- Nested UUID in URL: Brighter yellow (#fff59d → #ffd54f hover)

### Pattern Detection Requirements
1. **URLs**: Must support `http://localhost:8080` and `https://api.example.com/path`
2. **Domains**: Should highlight `api.dev-5-2772-1.24g.lxp.live` (without protocol)
3. **UUIDs**: `66b61d8d-ed59-4d2c-87c4-bd2811fdc445`
4. **JWTs**: Exactly 3 parts separated by dots, min 10 chars each part

### Known Issue: Domain False Positives
Headers like "access-control-allow-credentials" are incorrectly detected as domains.
Need to fix by:
1. Excluding patterns with multiple hyphens between "words"
2. Checking against common HTTP header patterns
3. Only highlighting in appropriate contexts (not header names)


## Feature Implementation System Guidelines

### Feature Implementation Priority Rules
- IMMEDIATE EXECUTION: Launch parallel Tasks immediately upon feature requests
- NO CLARIFICATION: Skip asking what type of implementation unless absolutely critical
- PARALLEL BY DEFAULT: Always use 7-parallel-Task method for efficiency

### Parallel Feature Implementation Workflow
1. **Component**: Create main component file
2. **Styles**: Create component styles/CSS
3. **Tests**: Create test files  
4. **Types**: Create type definitions
5. **Hooks**: Create custom hooks/utilities
6. **Integration**: Update routing, imports, exports
7. **Remaining**: Update package.json, documentation, configuration files
8. **Review and Validation**: Coordinate integration, run tests, verify build, check for conflicts

### Context Optimization Rules
- Strip out all comments when reading code files for analysis
- Each task handles ONLY specified files or file types
- Task 7 combines small config/doc updates to prevent over-splitting

### Feature Implementation Guidelines
- **CRITICAL**: Make MINIMAL CHANGES to existing patterns and structures
- **CRITICAL**: Preserve existing naming conventions and file organization
- Follow project's established architecture and component patterns
- Use existing utility functions and avoid duplicating functionality