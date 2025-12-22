
# ---------------------------------------------------------------------
# MESSENGER ENDPOINTS
# ---------------------------------------------------------------------

@app.post("/messages", response_model=schemas.MessageResponse)
def send_message(msg: schemas.MessageCreate, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    # Verify recipient exists
    recipient = db.query(models.User).filter(models.User.address == msg.recipient_address).first()
    if not recipient:
        raise HTTPException(status_code=404, detail="Recipient not found")
    
    # Create message
    new_msg = models.Message(
        sender_address=current_user.address,
        recipient_address=msg.recipient_address,
        content=msg.content
    )
    db.add(new_msg)
    db.commit()
    db.refresh(new_msg)
    return new_msg

@app.get("/messages/conversations", response_model=List[schemas.ConversationResponse])
def get_conversations(current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    # Fetch all messages involving me
    all_msgs = db.query(models.Message).filter(
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
                conversations[partner_addr] = {
                    "user": partner,
                    "last_message": m
                }
    
    return list(conversations.values())

@app.post("/messages/history", response_model=List[schemas.MessageResponse])
def get_message_history(req: schemas.HistoryRequest, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    partner_address = req.partner_address
    
    msgs = db.query(models.Message).filter(
        or_(
            (models.Message.sender_address == current_user.address) & (models.Message.recipient_address == partner_address),
            (models.Message.sender_address == partner_address) & (models.Message.recipient_address == current_user.address)
        )
    ).order_by(models.Message.created_at.asc()).all()
    
    return msgs
