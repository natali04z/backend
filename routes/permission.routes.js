import { Router } from "express";
import {
  getPermissions,
  getPermissionById,
  postPermission,
  updatePermission,
  deletePermission,
  togglePermissionStatus
} from "../controllers/permission.controller.js";
import { authenticateUser, authorizePermission } from "../middlewares/auth.middleware.js";

const router = Router();

// Rutas para permisos
router.get("/", authenticateUser, authorizePermission("view_permissions"), getPermissions);
router.get("/:id", authenticateUser, authorizePermission("view_permissions_id"), getPermissionById);
router.post("/", authenticateUser, authorizePermission("create_permissions"), postPermission);
router.put("/:id", authenticateUser, authorizePermission("update_permissions"), updatePermission);
router.patch("/:id/status", authenticateUser, authorizePermission("update_permission_status"), togglePermissionStatus);
router.delete("/:id", authenticateUser, authorizePermission("delete_permissions"), deletePermission);

export default router;
