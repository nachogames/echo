# Echo DevTools Extension - Feature Design Document

## Overview
This document outlines the design for two new features in the Echo DevTools extension:
1. Pretty-printed JSON when copying from tabs
2. Advanced multi-key search/filter capabilities

## Feature 1: Pretty-Printed JSON Copy

### Current State
- JSON data is copied with minimal formatting (`JSON.stringify(data)`)
- Applies to all copy operations: Copy as JSON, Copy Schema, Copy All
- Headers, Query Parameters, Request Body, and Response Body tabs all have copy functionality

### Design Goals
- All JSON copy operations should produce pretty-printed output
- Maintain consistent indentation (2 spaces)
- Preserve the existing copy mechanisms (background script for clipboard access)

### Implementation Design

#### Affected Copy Points
1. **Context Menu Operations** (panel.js)
   - `copy-json`: Already uses `JSON.stringify(jsonObject, null, 2)`
   - `copy-schema`: Already uses `JSON.stringify(schemaObject, null, 2)`
   - `copy-all`: Already uses `JSON.stringify(dashboardData, null, 2)`

2. **Tab-Specific Copy Buttons** (panel.js)
   - Headers tab: Uses `JSON.stringify(headersData, null, 2)` ✓
   - Query Parameters tab: Uses `JSON.stringify(request.queryParams, null, 2)` ✓
   - Request/Response Body tabs: Need to check

3. **Smart Copy Feature** (panel.js)
   - Individual value copying: No change needed (copies raw values)
   - Full JSON copy buttons: Need verification

#### Implementation Steps
1. Audit all `copyToClipboard()` calls in panel.js
2. Ensure all JSON.stringify calls use `(data, null, 2)` format
3. Test all copy operations across different tabs

## Feature 2: Advanced Multi-Key Search/Filter

### Current State
- Single search input for filtering requests list
- Tab-specific JSON search with filter/highlight modes
- Simple string matching against URL, method, status, domain

### Design Goals
- Enable complex queries with multiple criteria
- Support logical operators (AND, OR, NOT)
- Allow field-specific searches
- Maintain performance with large request lists
- Intuitive UI that doesn't overwhelm casual users

### Implementation Design

#### Query Language Syntax
```
Simple searches (backward compatible):
- "login" - searches all fields
- "POST" - matches method
- "404" - matches status

Field-specific searches:
- method:POST - exact method match
- status:404 - exact status match
- url:login - URL contains "login"
- domain:api.example.com - exact domain match
- header:authorization - has authorization header
- response:error - response body contains "error"
- time:>1000 - response time > 1000ms

Logical operators:
- method:POST AND url:login
- status:404 OR status:500
- domain:api.example.com NOT url:health

Advanced examples:
- method:POST AND (status:400 OR status:401) AND response:error
- time:>1000 AND NOT domain:localhost
- header:authorization AND method:(GET OR POST)
```

#### UI Design

##### Option 1: Enhanced Search Bar (Recommended)
```
┌─────────────────────────────────────────────────────┐
│ 🔍 method:POST AND url:login                    ⓘ │
└─────────────────────────────────────────────────────┘
         ↓ (on focus/hover)
┌─────────────────────────────────────────────────────┐
│ Quick filters:                                      │
│ [method:___] [status:___] [url:___] [domain:___]   │
│ [time:>___] [header:___] [response:___]            │
│                                                     │
│ Examples: • method:POST AND url:login               │
│          • status:404 OR status:500                 │
│          • time:>1000 AND NOT domain:localhost      │
└─────────────────────────────────────────────────────┘
```

##### Option 2: Query Builder Mode
```
┌─────────────────────────────────────────────────────┐
│ Search: [________________] [Simple ▼] [Clear]       │
└─────────────────────────────────────────────────────┘
                            ↓ (Advanced mode)
┌─────────────────────────────────────────────────────┐
│ Query Builder:                                      │
│ ┌─────────────────────────────────────────┐        │
│ │ [Field ▼] [Operator ▼] [Value_______] ✕ │        │
│ └─────────────────────────────────────────┘        │
│ [AND ▼]                                             │
│ ┌─────────────────────────────────────────┐        │
│ │ [Field ▼] [Operator ▼] [Value_______] ✕ │        │
│ └─────────────────────────────────────────┘        │
│ [+ Add condition]                                   │
│                                                     │
│ Query preview: method:POST AND url:login            │
└─────────────────────────────────────────────────────┘
```

#### Parser Implementation

```javascript
class QueryParser {
  constructor() {
    this.operators = ['AND', 'OR', 'NOT'];
    this.fields = ['method', 'status', 'url', 'domain', 'header', 'response', 'time'];
    this.comparators = [':', '>', '<', '>=', '<=', '!='];
  }

  parse(query) {
    // Tokenize the query
    const tokens = this.tokenize(query);
    
    // Build AST (Abstract Syntax Tree)
    const ast = this.buildAST(tokens);
    
    // Return executable filter function
    return this.compileFilter(ast);
  }

  tokenize(query) {
    // Handle quoted strings, operators, parentheses
    // Return array of tokens with types
  }

  buildAST(tokens) {
    // Parse tokens into tree structure
    // Handle operator precedence: NOT > AND > OR
    // Handle parentheses for grouping
  }

  compileFilter(ast) {
    // Convert AST to executable filter function
    return (request) => this.evaluateNode(ast, request);
  }

  evaluateNode(node, request) {
    // Recursively evaluate AST nodes against request
  }
}
```

#### Search Enhancement for JSON Tabs

Current JSON search only supports single term matching. Enhance to support:

1. **Multiple search terms**
   ```
   "userId email" - highlight/filter lines containing either
   "userId AND email" - highlight/filter lines containing both
   "userId:123" - search for specific key-value pairs
   ```

2. **Path-based search**
   ```
   "user.profile.email" - search nested structures
   "items[].id" - search within arrays
   ```

3. **Value type filters**
   ```
   ":string" - all string values
   ":number>100" - numbers greater than 100
   ":null" - null values
   ":boolean:true" - true boolean values
   ```

### Implementation Plan

#### Phase 1: Pretty Print JSON (Quick Win)
1. Audit all JSON.stringify calls
2. Add pretty printing where missing
3. Test all copy operations
4. Deploy

#### Phase 2: Basic Multi-Field Search
1. Implement field-specific search (method:, status:, url:, domain:)
2. Add simple AND operator support
3. Update filter logic in updateRequestsList()
4. Add search syntax hints in UI

#### Phase 3: Advanced Query Support
1. Implement full query parser with AST
2. Add OR, NOT, parentheses support
3. Add comparison operators for numeric fields
4. Implement query builder UI option

#### Phase 4: JSON Tab Enhancement
1. Extend JSON search to support multiple terms
2. Add path-based search for nested structures
3. Implement value type filters
4. Add search history/saved searches

### Performance Considerations

1. **Query Compilation**: Parse query once, compile to optimized filter function
2. **Indexing**: Pre-index requests by common fields for faster filtering
3. **Debouncing**: Debounce search input to avoid excessive re-filtering
4. **Virtual Scrolling**: For large result sets, implement virtual scrolling
5. **Web Workers**: For very complex queries, offload filtering to web worker

### User Experience

1. **Progressive Enhancement**: Simple searches work as before, advanced features discoverable
2. **Syntax Help**: Inline hints, examples, and error messages for invalid queries
3. **Saved Searches**: Allow users to save frequently used complex queries
4. **Query History**: Recent searches accessible via dropdown
5. **Visual Feedback**: Highlight which parts of request match which query conditions

### Testing Strategy

1. **Unit Tests**: Query parser, tokenizer, AST builder
2. **Integration Tests**: Filter function against various request types
3. **Performance Tests**: Large request lists (1000+ items)
4. **Usability Tests**: Ensure discoverability and ease of use

## Summary

These two features will significantly enhance the Echo DevTools extension:

1. **Pretty-printed JSON** is a simple but impactful improvement for developer experience
2. **Advanced search/filter** transforms Echo from a basic request viewer to a powerful debugging tool

The phased implementation allows for quick wins while building toward the more complex features.