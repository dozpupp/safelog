from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import engine, Base
import os

# Routers
from routers import auth, users, secrets, multisig, messenger

# Create tables
Base.metadata.create_all(bind=engine)

app = FastAPI()

# CORS configuration
origins = []

# Add allowed origins from environment variable
env_origins = os.getenv("ALLOWED_ORIGINS")
if env_origins:
    # Split by comma, strip whitespace, and remove trailing slashes
    origins.extend([origin.strip().rstrip("/") for origin in env_origins.split(",")])
    print(f"INFO: Loaded ALLOWED_ORIGINS: {origins}")

if not origins:
    print("WARNING: ALLOWED_ORIGINS not set. CORS will block all requests.")

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include Routers
app.include_router(auth.router)
app.include_router(users.router)
app.include_router(secrets.router)
app.include_router(multisig.router)
app.include_router(messenger.router)
app.include_router(messenger.ws_router) # Include the WS router (root path /ws)

# Root/Health check (optional)
@app.get("/")
def read_root():
    return {"status": "running"}
