// middleware/checkExpelled.js
module.exports = (req, res, next) => {
  if (req.user.isExpelled) {
    return res.status(403).json({ error: 'Вы отчислены и не можете пользоваться системой' });
  }
  next();
};
