import sqlite3
import os

# The database file will be created in the same folder as this script
DATABASE = 'taskit.db'

def get_db():
    """
    Opens a connection to the SQLite database.
    Every time we need to read or write data we call this function.
    SQLite creates the .db file automatically if it doesn't exist.
    """
    conn = sqlite3.connect(DATABASE)
    # row_factory lets us access columns by name instead of index
    # e.g. row['email'] instead of row[0]
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    """
    Creates our two tables if they don't already exist.
    Called once when the app starts up.
    """
    conn = get_db()
    cursor = conn.cursor()

    # TABLE 1: users
    # Stores every registered user
    # id is auto-incremented — SQLite assigns 1, 2, 3 automatically
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            email      TEXT UNIQUE NOT NULL,
            password   TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    # TABLE 2: tasks
    # Stores every task — linked to a user via user_id (foreign key)
    # user_id REFERENCES users(id) means every task must belong to a valid user
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS tasks (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id    INTEGER NOT NULL REFERENCES users(id),
            title      TEXT NOT NULL,
            due_date   TEXT,
            priority   TEXT DEFAULT 'medium',
            color      TEXT DEFAULT '#22c55e',
            completed  INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    conn.commit()
    conn.close()
    print("Database initialized successfully.")
