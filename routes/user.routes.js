import { Router } from "express";
import { 
    getUsers, 
    getOneUser, 
    putUser, 
    deleteUser, 
    updateUserStatus,
    getProfile,
} from "../controllers/user.controller.js";
import { authenticateUser, authorizePermission } from "../middlewares/auth.middleware.js";

const router = Router();

router.get("/profile/me", authenticateUser, getProfile);
router.get("/", authenticateUser, authorizePermission("view_users"), getUsers);
router.get("/:id", authenticateUser, authorizePermission("view_users_id"), getOneUser);
router.put("/:id", authenticateUser, authorizePermission("update_users"), putUser);
router.delete("/:id", authenticateUser, authorizePermission("delete_users"), deleteUser);
router.patch("/:id/status", authenticateUser, authorizePermission("update_user_status"), updateUserStatus);

export default router;