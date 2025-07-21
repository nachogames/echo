# Echo DevTools Extension - Implementation Plan

## Quick Analysis of Current State

### Pretty Print JSON Status
After analyzing the code, I found that most copy operations already use pretty printing:
- ✅ Context menu "Copy as JSON": `JSON.stringify(jsonObject, null, 2)`
- ✅ Context menu "Copy Schema": `JSON.stringify(schemaObject, null, 2)`
- ✅ Context menu "Copy All": `JSON.stringify(dashboardData, null, 2)`
- ✅ Headers tab: `JSON.stringify(headersData, null, 2)`
- ✅ Query Parameters tab: `JSON.stringify(request.queryParams, null, 2)`
- ❌ Response Body tab: `copyToClipboard(request.responseBody)` - raw copy
- ❓ Request Body tab: Need to verify

The main issue is in the Response Body tab where JSON responses are copied in their raw format.

## Implementation Tasks

### Task 1: Fix Response Body Copy (Immediate Fix)

**File**: `/chrome-extension/panel.js`

**Change needed in `showResponseTab` function**:
```javascript
// Current (line ~1850):
copyBtn.addEventListener('click', () => copyToClipboard(request.responseBody));

// Should be:
copyBtn.addEventListener('click', () => {
    try {
        const parsed = JSON.parse(request.responseBody);
        copyToClipboard(JSON.stringify(parsed, null, 2));
    } catch {
        // If not JSON, copy as-is
        copyToClipboard(request.responseBody);
    }
});
```

**Also need to check**:
1. Request body tab (if it exists separately)
2. Any other copy operations that might be missing pretty printing

### Task 2: Implement Advanced Search/Filter (Phase 1 - Basic)

**File**: `/chrome-extension/panel.js`

#### Step 1: Create Query Parser
Add a new class before the main initialization:

```javascript
class RequestQueryParser {
    constructor() {
        this.fieldMappings = {
            'method': (req, val) => req.method === val.toUpperCase(),
            'status': (req, val) => String(req.status) === val,
            'url': (req, val) => req.url.toLowerCase().includes(val.toLowerCase()),
            'domain': (req, val) => req.domain === val,
            'time': (req, val, op) => this.compareNumeric(req.time, val, op),
            'size': (req, val, op) => this.compareNumeric(req.responseSize, val, op)
        };
    }

    parse(query) {
        // Start with simple field:value parsing
        const fieldMatch = query.match(/^(\w+):(.+)$/);
        if (fieldMatch) {
            const [, field, value] = fieldMatch;
            return this.createFieldFilter(field, value);
        }
        
        // Fallback to current behavior (search all fields)
        return (req) => this.searchAllFields(req, query);
    }

    createFieldFilter(field, value) {
        const filterFn = this.fieldMappings[field];
        if (!filterFn) {
            // Unknown field, search in all fields
            return (req) => this.searchAllFields(req, `${field}:${value}`);
        }
        return (req) => filterFn(req, value);
    }

    searchAllFields(req, query) {
        const searchTerm = query.toLowerCase();
        return req.url.toLowerCase().includes(searchTerm) ||
               req.method.toLowerCase().includes(searchTerm) ||
               String(req.status).includes(searchTerm) ||
               req.domain.toLowerCase().includes(searchTerm);
    }

    compareNumeric(actual, expected, op = '>') {
        const actualNum = parseFloat(actual);
        const expectedNum = parseFloat(expected);
        if (isNaN(actualNum) || isNaN(expectedNum)) return false;
        
        switch(op) {
            case '>': return actualNum > expectedNum;
            case '<': return actualNum < expectedNum;
            case '>=': return actualNum >= expectedNum;
            case '<=': return actualNum <= expectedNum;
            case '=': return actualNum === expectedNum;
            default: return false;
        }
    }
}

// Initialize at the top with other globals
const queryParser = new RequestQueryParser();
```

#### Step 2: Update Filter Function
Modify the `updateRequestsListNow` function:

```javascript
// Replace current search filter logic with:
if (searchFilter) {
    const filterFn = queryParser.parse(searchFilter);
    filteredRequests = filteredRequests.filter(filterFn);
}
```

#### Step 3: Add Search Hints UI
Update the search input area:

```html
<!-- In panel.html, update the filter input section -->
<div class="filter-section">
    <input type="text" 
           id="filter-input" 
           placeholder="Search... (try: method:POST, status:404, time:>1000)"
           title="Search syntax: field:value | Examples: method:POST, url:login, status:404">
    <div id="search-hints" class="search-hints" style="display: none;">
        <div class="hint-item">method:POST - Filter by HTTP method</div>
        <div class="hint-item">status:404 - Filter by status code</div>
        <div class="hint-item">url:api - Filter by URL containing 'api'</div>
        <div class="hint-item">domain:example.com - Filter by exact domain</div>
        <div class="hint-item">time:>1000 - Response time > 1000ms</div>
    </div>
</div>
```

Add CSS for hints:
```css
.search-hints {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    background: #2d2d30;
    border: 1px solid #464647;
    border-radius: 3px;
    margin-top: 2px;
    padding: 5px;
    z-index: 1000;
    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
}

.hint-item {
    padding: 3px 8px;
    font-size: 11px;
    color: #ccc;
}

.hint-item:hover {
    background: #094771;
    color: #fff;
}
```

### Task 3: Implement JSON Tab Multi-Search (Phase 1)

**File**: `/chrome-extension/panel.js`

Update the `addJsonSearch` function to support multiple search terms:

```javascript
function performSearch() {
    const query = searchInput.value.toLowerCase().trim();
    
    // Clear previous highlights
    jsonViewer.querySelectorAll('.json-highlight').forEach(el => {
        const textNode = document.createTextNode(el.textContent);
        el.parentNode.replaceChild(textNode, el);
    });
    
    // Parse multiple search terms (space-separated)
    const searchTerms = query.split(/\s+/).filter(term => term.length > 0);
    
    if (searchTerms.length === 0) {
        // Reset view
        jsonViewer.querySelectorAll('.json-line.hidden').forEach(el => {
            el.classList.remove('hidden');
        });
        return;
    }
    
    // For filter mode: hide lines that don't match ANY term
    // For highlight mode: highlight ALL matching terms
    
    if (searchMode === 'filter') {
        jsonViewer.querySelectorAll('.json-line').forEach(line => {
            const text = line.textContent.toLowerCase();
            const hasMatch = searchTerms.some(term => text.includes(term));
            line.classList.toggle('hidden', !hasMatch);
        });
    } else {
        // Highlight mode - highlight all matching terms
        searchAndHighlight(jsonViewer, searchTerms);
    }
}

function searchAndHighlight(element, searchTerms) {
    // Create a regex that matches any of the search terms
    const regex = new RegExp(`(${searchTerms.map(escapeRegex).join('|')})`, 'gi');
    
    // Walk through text nodes and highlight matches
    walkTextNodes(element, (textNode) => {
        const text = textNode.textContent;
        const matches = text.match(regex);
        
        if (matches) {
            const fragment = document.createDocumentFragment();
            let lastIndex = 0;
            
            text.replace(regex, (match, p1, offset) => {
                // Add text before match
                if (offset > lastIndex) {
                    fragment.appendChild(
                        document.createTextNode(text.substring(lastIndex, offset))
                    );
                }
                
                // Add highlighted match
                const highlight = document.createElement('span');
                highlight.className = 'json-highlight';
                highlight.textContent = match;
                fragment.appendChild(highlight);
                
                lastIndex = offset + match.length;
                return match;
            });
            
            // Add remaining text
            if (lastIndex < text.length) {
                fragment.appendChild(
                    document.createTextNode(text.substring(lastIndex))
                );
            }
            
            textNode.parentNode.replaceChild(fragment, textNode);
        }
    });
}

function escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function walkTextNodes(element, callback) {
    if (element.nodeType === 3) { // Text node
        callback(element);
    } else if (element.nodeType === 1) { // Element node
        for (let child of element.childNodes) {
            if (!child.classList || !child.classList.contains('json-highlight')) {
                walkTextNodes(child, callback);
            }
        }
    }
}
```

## Implementation Priority & Timeline

### Immediate (< 1 hour)
1. ✅ Fix Response Body copy to use pretty printing
2. ✅ Verify Request Body copy behavior

### Phase 1 (2-3 hours)
1. Implement basic field-specific search (method:, status:, url:, domain:, time:)
2. Add search hints/help UI
3. Support multiple search terms in JSON tabs (space-separated)

### Phase 2 (Next iteration)
1. Add AND/OR operators support
2. Implement comparison operators for numeric fields
3. Add parentheses support for complex queries
4. Enhanced JSON search with key:value syntax

### Phase 3 (Future)
1. Query builder UI for complex queries
2. Saved searches / search history
3. Advanced JSON path searching (user.profile.email)
4. Performance optimizations for large datasets

## Testing Checklist

### Pretty Print JSON
- [ ] Copy from Response Body tab (JSON responses)
- [ ] Copy from Response Body tab (non-JSON responses)
- [ ] Copy from Request Body tab (if applicable)
- [ ] Verify all context menu copy operations
- [ ] Test with large JSON responses

### Search Enhancement
- [ ] Basic search still works (backward compatibility)
- [ ] Field-specific search (method:POST)
- [ ] Numeric comparisons (time:>1000)
- [ ] Multiple search terms in JSON tabs
- [ ] Search hints appear/disappear correctly
- [ ] Performance with 500+ requests

## Notes
- The pretty print fix is trivial and should be done immediately
- The search enhancement can be implemented incrementally
- Phase 1 provides immediate value with minimal complexity
- Future phases can be prioritized based on user feedback