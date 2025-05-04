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

const router = Router();

// Authentication routes
router.post("/register", authenticateUser, authorizePermission("create_users"), registerUser);
router.post("/login", loginUser);
router.get("/me", authenticateUser, getAuthenticatedUser);
// Password management routes
router.post("/forgot-password", requestPasswordReset);
router.post("/reset-password/:token", resetPassword);
router.post("/request-password-setup", authenticateUser, requestPasswordSetup);

export default router;