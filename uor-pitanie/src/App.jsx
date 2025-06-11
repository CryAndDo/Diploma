import { Routes, Route } from 'react-router-dom';
import AuthPage from './pages/AuthPage';
import LoginPage from './pages/LoginPage';
import RegistrationPage from './pages/RegistrationPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import NewPasswordPage from './pages/NewPasswordPage';
import MealStudentPage from './pages/MealStudentPage';
import NutritionManagerPage from './pages/NutritionManagerPage';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<AuthPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegistrationPage />} />
      <Route path="/forgot-password" element={<ResetPasswordPage />} />
      <Route path="/reset-password" element={<NewPasswordPage />} />
      <Route path="/meal-student" element={<MealStudentPage />} />
      <Route path="/meal-manager" element={<NutritionManagerPage />} />
    </Routes>
  );
}
