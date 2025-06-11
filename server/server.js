require('dotenv').config();
const express = require('express');
const cors = require('cors');
const sql = require('mssql');
const loginRoutes = require('./routes/login');
const authRoutes = require('./routes/auth');
const usersRouter = require('./routes/users');
const mealRoutes = require('./routes/meal');
const reportsRoutes = require('./routes/reports');
const authMiddleware = require('./middleware/authMiddleware');
const syncScud = require('./jobs/syncScud');
const checkExpelled = require('./middleware/checkExpelled');
const syncCards = require('./jobs/syncCards');
const app = express();

// Подключаем базу
sql
  .connect({
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_DATABASE,
    options: { encrypt: true, trustServerCertificate: true },
  })
  .then(() => console.log('✅ MSSQL Connected'))
  .catch((err) => console.error('❌ MSSQL Connection Error:', err));

// CORS и JSON-парсер
app.use(
  cors({
    origin: 'http://localhost:5173',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }),
);
app.use(express.json());

// Отладочный лог запросов и заголовков
app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  console.log('Headers:', req.headers);
  next();
});

// Public routes
app.use('/api/login', loginRoutes);
app.use('/api/auth', authRoutes);
app.use(authMiddleware);
app.use(checkExpelled);
app.use('/api/users', usersRouter);

app.use('/api/meal', mealRoutes);

// Protected reports (JWT auth inside routes)
app.use('/api/reports', reportsRoutes);

// после app.use('/api/reports', reportsRoutes);
const compRoutes = require('./routes/competition');
app.use('/api/competition-days', compRoutes);

// Health-check и старт
app.get('/health', (_, res) => res.json({ status: 'OK', timestamp: new Date() }));
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));

const cron = require('node-cron');
const finalizeToday = require('./jobs/finalizeToday');

cron.schedule('0 23 * * *', () => {
  console.log('⏰ Запуск фиксации...');
  finalizeToday();
});

cron.schedule('0 23 * * *', syncScud); // каждый день в 23:00
cron.schedule('*/20 * * * *', syncCards); // каждую 5-ю минуту
