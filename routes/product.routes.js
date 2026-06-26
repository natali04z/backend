import express from "express";
import {
    getProducts,
    getProductById,
    postProduct,
    updateProduct,
    deleteProduct,
    updateProductStatus,
    getProductsByProvider
} from "../controllers/product.controller.js";
import { authenticateUser, authorizePermission } from "../middlewares/auth.middleware.js";

const router = express.Router();

router.get("/", authenticateUser, authorizePermission("view_products"), getProducts);                              // también acepta ?providerId=xxx
router.get("/:id", authenticateUser, authorizePermission("view_products_id"), getProductById);
router.post("/", authenticateUser, authorizePermission("create_products"), postProduct);                           // providerId en el body
router.put("/:id", authenticateUser, authorizePermission("edit_products"), updateProduct);
router.delete("/:id", authenticateUser, authorizePermission("delete_products"), deleteProduct);
router.patch("/:id/status", authenticateUser, authorizePermission("update_status_products"), updateProductStatus);

export default router;