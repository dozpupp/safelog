#!/bin/bash
# Run FastAPI backend with hot-reload, excluding SQLite journal files to prevent crashes

# Default secret key for development if not set
if [ -z "$SAFELOG_SECRET_KEY" ]; then
    echo "WARNING: SAFELOG_SECRET_KEY not set. Using dev default."
    export SAFELOG_SECRET_KEY="dev_secret_key_change_me"
fi

# Set allow origins for development (Vite default + Self)
export ALLOWED_ORIGINS="http://localhost:5173,http://127.0.0.1:5173"

# Load environment variables from .env
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
fi

# Ensure we are in the script's directory (backend)
cd "$(dirname "$0")"

uvicorn main:app --reload --reload-exclude "*.db" --reload-exclude "*.db-journal" --port 8000
