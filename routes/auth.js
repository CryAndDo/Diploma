const express = require('express');
const router = express.Router();

const {
  register,
  forgotPassword,
  resetPassword,
  sendEmailVerificationCode,
  verifyEmailCode,
} = require('../controllers/authController');

router.post('/register', register);

// Запрос на отправку письма с кодом подтверждения
router.post('/send-email-code', sendEmailVerificationCode);

// Запрос на проверку кода подтверждения
router.post('/verify-email-code', verifyEmailCode);

// Запрос на восстановление пароля (запрос кода + установка нового пароля)
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);

module.exports = router;
