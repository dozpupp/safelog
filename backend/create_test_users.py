from database import SessionLocal, engine
import models

models.Base.metadata.create_all(bind=engine)

db = SessionLocal()

test_users = [
    {"address": "0x1234567890123456789012345678901234567890", "username": "Alice", "key": "alice_public_key"},
    {"address": "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd", "username": "Bob", "key": "bob_public_key"},
    {"address": "0x9876543210987654321098765432109876543210", "username": "Charlie", "key": "charlie_public_key"},
    {"address": "0xfedcbafedcbafedcbafedcbafedcbafedcbafed", "username": "Diana", "key": "diana_public_key"},
    {"address": "0x1111111111111111111111111111111111111111", "username": "Eve", "key": "eve_public_key"},
]

for user_data in test_users:
    user = db.query(models.User).filter(models.User.address == user_data["address"].lower()).first()
    if not user:
        user = models.User(
            address=user_data["address"].lower(),
            username=user_data["username"],
            encryption_public_key=user_data["key"]
        )
        db.add(user)
        print(f"Created user: {user_data['username']} ({user_data['address']})")
    else:
        print(f"User {user_data['username']} already exists")

db.commit()
db.close()
print("\nDone!")
