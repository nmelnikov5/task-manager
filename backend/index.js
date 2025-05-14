const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const PORT = process.env.PORT || 3010;
const app = express();
const SECRET_KEY = 'your-secret-key';

app.use(cors({
  origin: 'http://localhost:3000',
  credentials: true
}));
app.use(bodyParser.json());

// Загрузка данных из файлов при запуске сервера
let users = loadUsers() || [];
let todoItems = loadTodos() || [];

// Функции для работы с файлами
function loadUsers() {
  try {
    const data = fs.readFileSync(path.join(__dirname, 'users.json'), 'utf8');
    return JSON.parse(data);
  } catch (err) {
    if (err.code === 'ENOENT') {
      // Файл не существует, создадим пустой массив
      fs.writeFileSync(path.join(__dirname, 'users.json'), '[]');
      return [];
    }
    console.error('Error loading users:', err);
    return null;
  }
}

function loadTodos() {
  try {
    const data = fs.readFileSync(path.join(__dirname, 'todo-items.json'), 'utf8');
    return JSON.parse(data);
  } catch (err) {
    if (err.code === 'ENOENT') {
      // Файл не существует, создадим пустой массив
      fs.writeFileSync(path.join(__dirname, 'todo-items.json'), '[]');
      return [];
    }
    console.error('Error loading todos:', err);
    return null;
  }
}

function saveUsers() {
  fs.writeFileSync(path.join(__dirname, 'users.json'), JSON.stringify(users, null, 2));
}

function saveTodos() {
  fs.writeFileSync(path.join(__dirname, 'todo-items.json'), JSON.stringify(todoItems, null, 2));
}

// Auth middleware
const authenticate = (req, res, next) => {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Access denied' });

  try {
    const verified = jwt.verify(token, SECRET_KEY);
    req.user = verified;
    next();
  } catch (err) {
    res.status(400).json({ error: 'Invalid token' });
  }
};

// Auth routes
app.post('/api/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Введите имя пользователя и пароль' });
    }

    if (users.find(u => u.username === username)) {
      return res.status(400).json({ error: 'Имя пользователя уже существует' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = { 
      id: users.length > 0 ? Math.max(...users.map(u => u.id)) + 1 : 1, 
      username, 
      password: hashedPassword 
    };
    
    users.push(user);
    saveUsers();
    
    res.status(201).json({ message: 'Пользователь успешно зарегестрирован' });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Введите имя пользователя и пароль' });
    }

    const user = users.find(u => u.username === username);
    if (!user) return res.status(400).json({ error: 'Имя пользователя не найдено' });

    const validPass = await bcrypt.compare(password, user.password);
    if (!validPass) return res.status(400).json({ error: 'Неправильный пароль' });

    const token = jwt.sign({ id: user.id, username: user.username }, SECRET_KEY, { expiresIn: '1h' });
    res.json({ token });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Todo routes (остаются без изменений)
app.get('/api/todo-items', authenticate, (req, res) => {
  try {
    const userItems = todoItems.filter(item => item.userId === req.user.id);
    res.json({ data: userItems });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/todo-items', authenticate, (req, res) => {
  try {
    const { text } = req.body;
    if (!text) {
      return res.status(400).json({ error: 'Введите описание задачи' });
    }

    const newItem = {
      id: todoItems.length > 0 ? Math.max(...todoItems.map(item => item.id)) + 1 : 1,
      text,
      done: false,
      status: 'new',
      dueDate: req.body.dueDate || null,
      tags: req.body.tags || [],
      reminder: req.body.reminder || null,
      userId: req.user.id
    };
    todoItems.push(newItem);
    saveTodos();
    res.status(201).json(newItem);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.put('/api/todo-items/:id', authenticate, (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const index = todoItems.findIndex(item => item.id === id && item.userId === req.user.id);
    
    if (index === -1) return res.status(404).json({ error: 'Item not found' });
    
    const updatedItem = { ...todoItems[index], ...req.body };
    todoItems[index] = updatedItem;
    saveTodos();
    res.json(updatedItem);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/api/todo-items/:id', authenticate, (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const initialLength = todoItems.length;
    todoItems = todoItems.filter(item => !(item.id === id && item.userId === req.user.id));
    
    if (todoItems.length === initialLength) {
      return res.status(404).json({ error: 'Item not found' });
    }
    
    saveTodos();
    res.status(204).end();
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.listen(PORT, () => {
  console.log(`Server listening on ${PORT}`);
});