import { Router } from "express";
import {
  registerUser,
  loginUser,
  getAuthenticatedUser,
  verifyEmail,
  resetPassword,
} from "../controllers/auth.controller.js";
import { authenticateUser, authorizePermission } from "../middlewares/auth.middleware.js";

const router = Router();

router.post("/register", authenticateUser, authorizePermission("create_users"), registerUser);
router.post("/login", loginUser);
router.get("/me", authenticateUser, getAuthenticatedUser);
router.post("/verify-email", verifyEmail);
router.post("/reset-password", resetPassword);

export default router;