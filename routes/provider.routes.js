import { Router } from "express";
import { getProviders, getOneProvider, postProvider, putProvider, deleteProvider, updateProviderStatus } from "../controllers/provider.controller.js";
import { authenticateUser, authorizePermission } from "../middlewares/auth.middleware.js";

const router = Router();

router.get("/", authenticateUser, authorizePermission("view_providers"),getProviders);
router.get("/:id",authenticateUser, authorizePermission("view_providers_id"), getOneProvider);
router.post("/", authenticateUser, authorizePermission("create_providers"),postProvider);
router.put("/:id", authenticateUser, authorizePermission("update_providers"),putProvider);
router.delete("/:id", authenticateUser, authorizePermission("delete_providers"), deleteProvider);
router.patch("/:id/status", authenticateUser, authorizePermission("update_status_providers"), updateProviderStatus);

export default router