import sqlite3

conn = sqlite3.connect('sql_app.db')
cursor = conn.cursor()

# Get schema for users table
cursor.execute("PRAGMA table_info(users)")
columns = cursor.fetchall()

print("Users table schema:")
for col in columns:
    print(f"  {col[1]} ({col[2]}) - nullable: {not col[3]}")

# Check if there are any users
cursor.execute("SELECT * FROM users")
users = cursor.fetchall()
print(f"\nTotal users: {len(users)}")
for user in users:
    print(f"  {user}")

conn.close()
