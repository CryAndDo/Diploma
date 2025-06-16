// middleware/authMiddleware.js
const jwt = require('jsonwebtoken');

module.exports = (req, res, next) => {
  const h = req.headers.authorization;
  if (!h?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Нет токена авторизации' });
  }
  const token = h.split(' ')[1];
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    // Теперь сохраняем сразу все нужные поля:
    req.user = {
      id:         payload.userId,
      type:       payload.userType,    
      isExpelled: payload.isExpelled
    };
    next();
  } catch {
    return res.status(401).json({ error: 'Токен недействителен' });
  }
};