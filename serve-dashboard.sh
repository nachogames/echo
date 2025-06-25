#!/bin/bash
# Script to serve the dashboard locally for testing with automatic port selection

# Function to check if port is available
check_port() {
    nc -z localhost $1 2>/dev/null
    return $?
}

# Try different ports
PORTS=(8080 8081 8082 8000 3000 3001 5000 5001)
SELECTED_PORT=""

for PORT in "${PORTS[@]}"; do
    if ! check_port $PORT; then
        SELECTED_PORT=$PORT
        break
    fi
done

if [ -z "$SELECTED_PORT" ]; then
    echo "Error: All common ports are in use. Please free up a port."
    exit 1
fi

echo "Starting Echo Dashboard server on port $SELECTED_PORT..."
echo "Dashboard will be available at: http://localhost:$SELECTED_PORT"
echo ""
echo "Update background.js line 79 to use: http://localhost:$SELECTED_PORT/index.html"
echo ""
echo "Press Ctrl+C to stop the server"
echo ""

cd dashboard && python3 -m http.server $SELECTED_PORT