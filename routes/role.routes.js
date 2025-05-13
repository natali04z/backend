import { Router } from "express";
import {
  getRoles,
  getRoleById,
  postRole,
  updateRole,
  deleteRole,
  toggleRoleStatus
} from "../controllers/role.controller.js";
import { authenticateUser, authorizePermission } from "../middlewares/auth.middleware.js";

const router = Router();

// Rutas para roles
router.get("/", authenticateUser, authorizePermission("view_roles"), getRoles);
router.get("/:id", authenticateUser, authorizePermission("view_roles_id"), getRoleById);
router.post("/", authenticateUser, authorizePermission("create_roles"), postRole);
router.put("/:id", authenticateUser, authorizePermission("update_roles"), updateRole);
router.patch("/:id/status", authenticateUser, authorizePermission("update_role_status"), toggleRoleStatus);
router.delete("/:id", authenticateUser, authorizePermission("delete_roles"), deleteRole);

export default router;