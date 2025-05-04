import { Router } from "express";
import { 
  registerUser, 
  loginUser, 
  getAuthenticatedUser, 
  requestPasswordReset,
  resetPassword,
  requestPasswordSetup
} from "../controllers/auth.controller.js";
import { authenticateUser, authorizePermission } from "../middlewares/auth.middleware.js";
import path from "path";

const router = Router();

// Authentication routes
router.post("/register", authenticateUser, authorizePermission("create_users"), registerUser);
router.post("/login", loginUser);
router.get("/me", authenticateUser, getAuthenticatedUser);
// Password management routes
router.post("/forgot-password", requestPasswordReset);
router.post("/reset-password/:token", resetPassword);
router.post("/request-password-setup", authenticateUser, requestPasswordSetup);

// Ruta para servir la página de restablecimiento de contraseña
router.get("/reset-password/:token", (req, res) => {
  res.sendFile(path.resolve(process.cwd(), 'public', 'reset-password.html'));
});

export default router;