import { Router } from "express";
import {
    getProviders,
    getOneProvider,
    postProvider,
    putProvider,
    deleteProvider,
    updateProviderStatus
} from "../controllers/provider.controller.js";
import {
    getProductsByProvider,
    postProduct
} from "../controllers/product.controller.js";
import { authenticateUser, authorizePermission } from "../middlewares/auth.middleware.js";

const router = Router();

// ─── Rutas de proveedores ─────────────────────────────────────────────────────
router.get("/", authenticateUser, authorizePermission("view_providers"), getProviders);
router.get("/:id", authenticateUser, authorizePermission("view_providers_id"), getOneProvider);
router.post("/", authenticateUser, authorizePermission("create_providers"), postProvider);
router.put("/:id", authenticateUser, authorizePermission("update_providers"), putProvider);
router.delete("/:id", authenticateUser, authorizePermission("delete_providers"), deleteProvider);
router.patch("/:id/status", authenticateUser, authorizePermission("update_status_providers"), updateProviderStatus);

// ─── Rutas anidadas: productos de un proveedor ────────────────────────────────
router.get("/:id/products", authenticateUser, authorizePermission("view_products"), getProductsByProvider);
router.post("/:id/products", authenticateUser, authorizePermission("create_products"), postProduct);

export default router;