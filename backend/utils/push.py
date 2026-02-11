import os
import json
from pywebpush import webpush, WebPushException
import logging

logger = logging.getLogger(__name__)

VAPID_PRIVATE_KEY = os.getenv("VAPID_PRIVATE_KEY")
VAPID_PUBLIC_KEY = os.getenv("VAPID_PUBLIC_KEY")
VAPID_SUBJECT = os.getenv("VAPID_SUBJECT", "mailto:admin@safelog.io")

def send_push_notification(subscription_info, data):
    """
    Send a push notification to a specific subscription.
    subscription_info: dict with {endpoint, p256dh, auth}
    data: dict payload
    """
    if not VAPID_PRIVATE_KEY or not VAPID_PUBLIC_KEY:
        logger.warning("Push Notifications: VAPID keys not configured. Skipping.")
        return False

    try:
        webpush(
            subscription_info={
                "endpoint": subscription_info["endpoint"],
                "keys": {
                    "p256dh": subscription_info["p256dh"],
                    "auth": subscription_info["auth"]
                }
            },
            data=json.dumps(data),
            vapid_private_key=VAPID_PRIVATE_KEY,
            vapid_claims={"sub": VAPID_SUBJECT}
        )
        return True
    except WebPushException as ex:
        # If 410 Gone, the subscription is expired or revoked
        if ex.response is not None and ex.response.status_code == 410:
             return "GONE"
        logger.error(f"Push notification failed: {ex}")
        return False
    except Exception as e:
        logger.error(f"Unexpected push error: {e}")
        return False

def notify_user_push(db, user_address, title, body, data=None):
    """
    Fetch all subscriptions for a user and send them a push.
    """
    import models
    
    target_addr = user_address.lower()
    subs = db.query(models.PushSubscription).filter(
        models.PushSubscription.user_address == target_addr
    ).all()
    
    if not subs:
        return
        
    payload = {
        "title": title,
        "body": body,
        "data": data or {}
    }
    
    for sub in subs:
        res = send_push_notification({
            "endpoint": sub.endpoint,
            "p256dh": sub.p256dh,
            "auth": sub.auth
        }, payload)
        
        if res == "GONE":
            # Auto-cleanup stale subscriptions
            db.delete(sub)
            db.commit()
