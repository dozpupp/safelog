from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect, status
from sqlalchemy.orm import Session, defer
from sqlalchemy import or_
from typing import List
import json
import models, schemas, auth
from database import get_db
from dependencies import get_current_user
from websocket_manager import manager

router = APIRouter(
    prefix="/messages",
    tags=["messenger"]
)

@router.post("", response_model=schemas.MessageResponse)
async def send_message(msg: schemas.MessageCreate, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    # Verify recipient exists
    recipient_addr = msg.recipient_address.lower()
    recipient = db.query(models.User).filter(models.User.address == recipient_addr).first()
    if not recipient:
        raise HTTPException(status_code=404, detail="Recipient not found")
    
    # Create message
    new_msg = models.Message(
        sender_address=current_user.address,
        recipient_address=recipient_addr, # Store lowercase
        content=msg.content,
        is_read=False
    )
    db.add(new_msg)
    db.commit()
    db.refresh(new_msg)
    
    # Real-time Broadcast
    msg_data = {
        "type": "NEW_MESSAGE",
        "message": {
            "id": new_msg.id,
            "sender_address": new_msg.sender_address,
            "recipient_address": new_msg.recipient_address,
            "content": new_msg.content,
            "is_read": new_msg.is_read,
            "created_at": new_msg.created_at.isoformat()
        }
    }
    
    # Send to Recipient
    await manager.send_personal_message(msg_data, recipient_addr)
    # Send to Sender (for sync across their devices)
    await manager.send_personal_message(msg_data, current_user.address)

    return new_msg

@router.get("/conversations", response_model=List[schemas.ConversationResponse])
def get_conversations(current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    # Fetch all messages involving me
    # OPTIMIZATION: value 'content' is deferred to prevent loading massive blobs into memory
    # when we only need metadata to sort/group.
    # Content will be lazy-loaded only for the single 'last_message' per conversation during serialization.
    all_msgs = db.query(models.Message).options(defer(models.Message.content)).filter(
        or_(
            models.Message.sender_address == current_user.address,
            models.Message.recipient_address == current_user.address
        )
    ).order_by(models.Message.created_at.desc()).all()
    
    conversations = {}
    for m in all_msgs:
        partner_addr = m.recipient_address if m.sender_address == current_user.address else m.sender_address
        if partner_addr not in conversations:
            # Fetch partner user object
            partner = db.query(models.User).filter(models.User.address == partner_addr).first()
            if partner:
                # Calculate unread count (messages FROM partner TO me which are NOT read)
                unread = db.query(models.Message).filter(
                    models.Message.sender_address == partner_addr,
                    models.Message.recipient_address == current_user.address,
                    models.Message.is_read == False
                ).count()

                conversations[partner_addr] = {
                    "user": partner,
                    "last_message": m,
                    "unread_count": unread
                }
    
    return list(conversations.values())

@router.post("/history", response_model=List[schemas.MessageResponse])
def get_message_history(req: schemas.HistoryRequest, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    partner_address = req.partner_address.lower()
    
    msgs = db.query(models.Message).filter(
        or_(
            (models.Message.sender_address == current_user.address) & (models.Message.recipient_address == partner_address),
            (models.Message.sender_address == partner_address) & (models.Message.recipient_address == current_user.address)
        )
    ).order_by(models.Message.created_at.desc()).limit(req.limit).offset(req.offset).all()
    
    return msgs[::-1]

@router.post("/mark-read/{partner_address}")
def mark_read(partner_address: str, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    partner_addr = partner_address.lower()
    
    # Mark all messages sent BY partner TO me as read
    db.query(models.Message).filter(
        models.Message.sender_address == partner_addr,
        models.Message.recipient_address == current_user.address,
        models.Message.is_read == False
    ).update({"is_read": True})
    
    db.commit()
    return {"status": "ok"}

# WebSocket endpoint (Usually on root or dedicated router)
# Since we put this in /messages prefix, the URL will be /messages/ws.
# The original was /ws.
# I should probably move this to main.py OR keep it here and update frontend?
# Refactoring usually implies preserving API contract unless breaking change is intended.
# I will expose it on main.py for /ws or create a router without prefix just for WS.
# Or better: keep `websocket_endpoint` here but include the router with `prefix=""` just for this endpoint? No, clean router is better.
# I will export it and attach in main, or just define it in main.
# Let's put it here but make sure we mount it correctly. Or just leave it in main.
# The plan says "Move messenger endpoints here".
# I'll put it here, but I need to make sure I mount it at /ws in main, or simple mount the router.
# If I mount router at /messages, it becomes /messages/ws.
# I will define `websocket_router` separately or just add it to this router and change the path to `/ws` (absolute path not supported in prefix router easily unless I use multiple routers).
# I'll add a specific router for WS or just put it in this file but different router instance?
# Let's just put it in this router, and if the path changes to /messages/ws, I'll have to update frontend.
# Checking frontend config... `config.js` or `.env`.
# If I can't check frontend easily, I should preserve `/ws`.
# I will ADD `router_ws` in this file or just put it in `main.py`.
# Actually, I'll put it in `messenger.py` but as a separate function that I can import in main.py if needed, or just keep it in the router and change frontend?
# "Fixing maintainability" -> Cleaner to group in routers.
# I'll keep the `websocket_endpoint` in this file but NOT in the `router` with prefix.
# I will create a `ws_router` in this file.

ws_router = APIRouter()

@ws_router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    
    # Wait for authentication message
    try:
        data = await websocket.receive_text()
        auth_data = json.loads(data)
        
        if auth_data.get("type") != "AUTH":
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return
            
        token = auth_data.get("token")
        if not token:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return

        payload = auth.decode_access_token(token)
        if not payload or not payload.get("sub"):
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return
            
        user_address = payload.get("sub").lower()
        
        await manager.connect(websocket, user_address)
        try:
            while True:
                await websocket.receive_text()
                # We can handle client messages here (e.g. typing indicators)
        except WebSocketDisconnect:
            manager.disconnect(websocket, user_address)
            
    except WebSocketDisconnect:
        # Client disconnected normally or abnormally
        manager.disconnect(websocket, None) # We might not have user_address yet if auth failed/didn't happen
    except Exception as e:
        print(f"WS Error: {e}")
        # Only try to close if not already closed
        try:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        except Exception:
            pass
