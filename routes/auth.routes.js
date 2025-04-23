import { Router } from "express";
import { registerUser, loginUser, getAuthenticatedUser, changeOwnPassword } from "../controllers/auth.controller.js";
import { authenticateUser, authorizePermission } from "../middlewares/auth.middleware.js";

const router = Router();

router.post("/register", authenticateUser, authorizePermission("create_users"), registerUser);
router.post("/login", loginUser);
router.get("/me", authenticateUser, getAuthenticatedUser);
router.post("/reset-password", authenticateUser, changeOwnPassword);

export default router;
