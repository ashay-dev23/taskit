from flask import Flask, request, jsonify, session, redirect, url_for, render_template
import bcrypt
from database import get_db, init_db

app = Flask(__name__)

# Secret key is used to encrypt the session cookie
# In a real production app this would be a long random string stored in environment variables
app.secret_key = 'taskit-secret-key-2025'

# ── INITIALIZE DATABASE ON STARTUP ───────────────────────
# Creates the tables if they don't exist yet
init_db()

# ── HELPER: Check if user is logged in ───────────────────
def logged_in():
    return 'user_id' in session

# ═══════════════════════════════════════════════════════════
# AUTH ROUTES
# ═══════════════════════════════════════════════════════════

# ROUTE 1: Home — redirect based on login status
@app.route('/')
def index():
    if logged_in():
        return redirect(url_for('dashboard'))
    return redirect(url_for('login'))

# ROUTE 2: Login page
@app.route('/login', methods=['GET', 'POST'])
def login():
    # GET request — just show the login page
    if request.method == 'GET':
        return render_template('login.html')

    # POST request — user submitted the login form
    data  = request.get_json()
    email = data.get('email', '').strip().lower()
    password = data.get('password', '')

    # Basic validation
    if not email or not password:
        return jsonify({'error': 'Email and password are required.'}), 400

    # Look up the user in the database
    conn = get_db()
    user = conn.execute('SELECT * FROM users WHERE email = ?', (email,)).fetchone()
    conn.close()

    # If user doesn't exist or password doesn't match the stored hash
    # bcrypt.checkpw hashes the input and compares to stored hash — never stores plain text
    if not user or not bcrypt.checkpw(password.encode('utf-8'), user['password']):
        return jsonify({'error': 'Invalid email or password.'}), 401

    # Store user_id in session — this keeps the user logged in across requests
    session['user_id'] = user['id']
    session['email']   = user['email']
    return jsonify({'success': True}), 200

# ROUTE 3: Register page
@app.route('/register', methods=['GET', 'POST'])
def register():
    if request.method == 'GET':
        return render_template('register.html')

    data     = request.get_json()
    email    = data.get('email', '').strip().lower()
    password = data.get('password', '')
    confirm  = data.get('confirm', '')

    # Validation
    if not email or not password:
        return jsonify({'error': 'All fields are required.'}), 400
    if password != confirm:
        return jsonify({'error': 'Passwords do not match.'}), 400
    if len(password) < 6:
        return jsonify({'error': 'Password must be at least 6 characters.'}), 400

    # Hash the password using bcrypt before storing
    # bcrypt.hashpw automatically adds a random salt — makes each hash unique
    hashed = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt())

    conn = get_db()
    try:
        conn.execute('INSERT INTO users (email, password) VALUES (?, ?)', (email, hashed))
        conn.commit()
    except Exception:
        # UNIQUE constraint on email means duplicate emails throw an exception
        conn.close()
        return jsonify({'error': 'An account with this email already exists.'}), 409
    conn.close()

    return jsonify({'success': True}), 201

# ROUTE 4: Logout
@app.route('/logout')
def logout():
    # Clear the session — user is now logged out
    session.clear()
    return redirect(url_for('login'))

# ROUTE 5: Dashboard page
@app.route('/dashboard')
def dashboard():
    if not logged_in():
        return redirect(url_for('login'))
    return render_template('dashboard.html', email=session['email'])

# ═══════════════════════════════════════════════════════════
# TASK ROUTES (REST API)
# ═══════════════════════════════════════════════════════════

# ROUTE 6: Get all tasks for logged in user
@app.route('/api/tasks', methods=['GET'])
def get_tasks():
    if not logged_in():
        return jsonify({'error': 'Unauthorized'}), 401

    conn  = get_db()
    # WHERE user_id = ? ensures users only see THEIR tasks
    tasks = conn.execute(
        'SELECT * FROM tasks WHERE user_id = ? ORDER BY due_date ASC, created_at DESC',
        (session['user_id'],)
    ).fetchall()
    conn.close()

    # Convert Row objects to plain dictionaries so we can return as JSON
    return jsonify([dict(t) for t in tasks])

# ROUTE 7: Create a new task
@app.route('/api/tasks', methods=['POST'])
def create_task():
    if not logged_in():
        return jsonify({'error': 'Unauthorized'}), 401

    data = request.get_json()
    title    = data.get('title', '').strip()
    due_date = data.get('due_date', '')
    priority = data.get('priority', 'medium')
    color    = data.get('color', '#22c55e')

    if not title:
        return jsonify({'error': 'Task title is required.'}), 400

    conn = get_db()
    cursor = conn.execute(
        'INSERT INTO tasks (user_id, title, due_date, priority, color) VALUES (?, ?, ?, ?, ?)',
        (session['user_id'], title, due_date, priority, color)
    )
    conn.commit()
    # Get the newly created task to return it
    task = conn.execute('SELECT * FROM tasks WHERE id = ?', (cursor.lastrowid,)).fetchone()
    conn.close()

    return jsonify(dict(task)), 201

# ROUTE 8: Update a task (edit or mark complete)
@app.route('/api/tasks/<int:task_id>', methods=['PUT'])
def update_task(task_id):
    if not logged_in():
        return jsonify({'error': 'Unauthorized'}), 401

    conn = get_db()
    # Verify this task belongs to the logged in user — security check
    task = conn.execute(
        'SELECT * FROM tasks WHERE id = ? AND user_id = ?',
        (task_id, session['user_id'])
    ).fetchone()

    if not task:
        conn.close()
        return jsonify({'error': 'Task not found.'}), 404

    data      = request.get_json()
    title     = data.get('title', task['title'])
    due_date  = data.get('due_date', task['due_date'])
    priority  = data.get('priority', task['priority'])
    color     = data.get('color', task['color'])
    completed = data.get('completed', task['completed'])

    conn.execute(
        'UPDATE tasks SET title=?, due_date=?, priority=?, color=?, completed=? WHERE id=?',
        (title, due_date, priority, color, completed, task_id)
    )
    conn.commit()
    updated = conn.execute('SELECT * FROM tasks WHERE id = ?', (task_id,)).fetchone()
    conn.close()

    return jsonify(dict(updated))

# ROUTE 9: Delete a task
@app.route('/api/tasks/<int:task_id>', methods=['DELETE'])
def delete_task(task_id):
    if not logged_in():
        return jsonify({'error': 'Unauthorized'}), 401

    conn = get_db()
    # Again verify ownership before deleting
    task = conn.execute(
        'SELECT * FROM tasks WHERE id = ? AND user_id = ?',
        (task_id, session['user_id'])
    ).fetchone()

    if not task:
        conn.close()
        return jsonify({'error': 'Task not found.'}), 404

    conn.execute('DELETE FROM tasks WHERE id = ?', (task_id,))
    conn.commit()
    conn.close()

    return jsonify({'success': True})

# ── RUN THE APP ───────────────────────────────────────────
if __name__ == '__main__':
    # debug=True means Flask auto-reloads when you save changes
    # Never use debug=True in production
    app.run(debug=True, port=5000)
