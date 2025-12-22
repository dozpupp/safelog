from fastapi import WebSocket
from typing import Dict, List
import json

class ConnectionManager:
    def __init__(self):
        # Map: user_address -> List[WebSocket] (Support multiple tabs/devices)
        self.active_connections: Dict[str, List[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, user_address: str):
        # WebSocket is already accepted in main.py
        if user_address not in self.active_connections:
            self.active_connections[user_address] = []
        self.active_connections[user_address].append(websocket)

    def disconnect(self, websocket: WebSocket, user_address: str):
        if user_address in self.active_connections:
            if websocket in self.active_connections[user_address]:
                self.active_connections[user_address].remove(websocket)
            if not self.active_connections[user_address]:
                del self.active_connections[user_address]

    async def send_personal_message(self, message: dict, user_address: str):
        if user_address in self.active_connections:
            for connection in self.active_connections[user_address]:
                try:
                    await connection.send_json(message)
                except Exception as e:
                    print(f"ERROR: Sending WS message failed: {e}")

manager = ConnectionManager()
