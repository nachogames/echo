# Echo - Chrome DevTools Network Inspector

Echo is a powerful Chrome DevTools extension for debugging and sharing network requests. It provides advanced filtering, request analysis, and seamless export capabilities to help developers work more efficiently with network traffic.

![Echo Chrome Extension](https://img.shields.io/badge/Chrome-Extension-blue)
![License](https://img.shields.io/badge/license-MIT-green)

## Features

### 🎯 Advanced Request Capture
- Capture all network requests with zero setup
- Early request buffering (captures requests even before opening DevTools)
- Smart domain detection and filtering
- Request metadata including timing, size, and status

### 🔍 Powerful Search & Filter
- Advanced search syntax with field-specific queries:
  - `method:POST` - Filter by HTTP method
  - `status:404` - Filter by status code
  - `url:api` - Search in URLs
  - `time:>1000` - Find slow requests
- Multi-term search in JSON responses
- Visual filtering by request type (XHR, JS, CSS, Images, etc.)

### 📊 Dual Dashboard System
- **Internal Dashboard**: Dark theme, built into extension
- **External Dashboard**: Light theme, deployable anywhere
- Smart copy detection for UUIDs, JWTs, emails, and URLs
- Compressed data transfer via URL parameters

### 🚀 Export Options
- Export as **HAR** (HTTP Archive) format
- Copy all requests as **cURL** commands
- Direct export to **Postman Collections v2.1.0**
- Copy individual requests as JSON or cURL

### 🎨 Modern UI Features
- Resizable split-panel interface
- JSON syntax highlighting with collapsible sections
- Real-time request filtering
- Responsive design for all screen sizes

## Installation

1. Clone this repository:
   ```bash
   git clone https://github.com/yourusername/echo.git
   cd echo
   ```

2. Load the extension in Chrome:
   - Open Chrome and navigate to `chrome://extensions`
   - Enable "Developer mode" in the top right
   - Click "Load unpacked"
   - Select the `/chrome-extension` directory

3. Open Chrome DevTools (F12) and look for the "Echo" tab

## Usage

### Basic Usage
1. Open Chrome DevTools (F12)
2. Navigate to the "Echo" tab
3. Browse any website - requests will be captured automatically
4. Use filters and search to find specific requests

### Search Examples
- `method:POST` - Find all POST requests
- `status:404` - Find all 404 errors
- `url:api` - Find requests containing "api"
- `time:>1000` - Find requests slower than 1 second
- `header:authorization` - Find requests with auth headers

### Keyboard Shortcuts
- `↑↓` - Navigate search hints
- `Enter` - Apply selected search filter
- `Escape` - Close search hints

### External Dashboard Setup
To use the external dashboard:

1. Serve the dashboard files:
   ```bash
   cd dashboard
   python3 -m http.server 8000
   ```

2. Update the dashboard URL in `chrome-extension/background.js` (line 79):
   ```javascript
   const DASHBOARD_URL = 'http://localhost:8000/index2.html';
   ```

## Development

### Project Structure
```
echo/
├── chrome-extension/     # Extension source code
│   ├── manifest.json    # Extension manifest
│   ├── panel.js         # DevTools panel logic
│   ├── panel.html       # DevTools panel UI
│   ├── background.js    # Service worker
│   └── devtools.js      # DevTools API integration
├── dashboard/           # External dashboard
└── showcase/           # Documentation and examples
```

### Building from Source
No build process required! The extension runs directly from source.

### Testing
Test files are included in the `/showcase` directory:
- `test-early-capture.html` - Test early request capture
- `test-query-params.html` - Test query parameter handling

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Built with Chrome Extension Manifest V3
- Uses native Chrome DevTools APIs
- Inspired by the need for better network debugging tools

## Support

If you find this extension helpful, please consider:
- ⭐ Starring the repository
- 🐛 Reporting bugs via GitHub Issues
- 💡 Suggesting new features
- 👥 Sharing with other developers