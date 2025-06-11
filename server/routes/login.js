require('dotenv').config();
const express = require('express');
const router = express.Router();
const sql = require('mssql');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) {
  console.error('❌ JWT_SECRET is not set in environment variables');
  process.exit(1);
}

// POST /api/login
router.post('/', async (req, res) => {
  const { fio, password } = req.body;
  const normalize = (str) => str.trim().toLowerCase().replace(/\s+/g, ' ');
  const normalizedFio = normalize(fio);
  try {
    const pool = await sql.connect();

    // Ищем пользователя и в "ответственных", и в "студентах"
    const [resStudent, resResponsible] = await Promise.all([
      pool
        .request()
        .input('fio', sql.NVarChar(200), fio)
        .query(`SELECT Id, PasswordHash, IsExpelled FROM UorPitanie.Students WHERE FIO = @fio`),
      pool
        .request()
        .input('fio', sql.NVarChar(200), fio)
        .query(`SELECT PasswordHash FROM UorPitanie.ResponsibleForNutrition WHERE FIO = @fio`),
    ]);

    const responsible = resResponsible.recordset[0];
    const student = resStudent.recordset[0];

    let matchedUser = null;
    let userType = null;
    let userId = null;
    let isExpelled = false;

    // 1. Пробуем сначала "ответственного за питание"
    if (responsible && (await bcrypt.compare(password, responsible.PasswordHash))) {
      matchedUser = responsible;
      userType = 'ResponsibleForNutrition';
      userId = fio; // для ответственных можно использовать FIO
    }

    // 2. Если ответственный не подошёл — пробуем студента
    else if (student && (await bcrypt.compare(password, student.PasswordHash))) {
      // Проверка на отчисление
      if (student.IsExpelled) {
        return res.status(403).json({ message: 'Вы отчислены и не можете войти в систему' });
      }

      // Проверка по времени
      const hour = new Date().getHours();
      if (hour < 6 || hour >= 23) {
        return res.status(403).json({ message: 'Студенты могут входить только с 6 до 23' });
      }

      matchedUser = student;
      userType = 'Students';
      userId = student.Id.toString();
      isExpelled = student.IsExpelled;
    }

    // 3. Если никто не подошёл
    if (!matchedUser) {
      return res.status(401).json({ message: 'Неверное ФИО или пароль' });
    }

    // 4. Генерация токена
    const payload = { userId, userType, isExpelled };
    const token = jwt.sign(payload, jwtSecret, { expiresIn: '1h' });

    return res.json({ token, userType });
  } catch (err) {
    console.error('Ошибка входа:', err);
    return res.status(500).json({ message: 'Ошибка сервера' });
  }
});

module.exports = router;
