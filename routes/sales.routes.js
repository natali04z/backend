import express from "express";
import {
    getSales,
    getSaleById,
    postSale,
    updateSaleStatus,
    deleteSale,
} from "../controllers/sales.controller.js";

import { authenticateUser, authorizePermission } from "../middlewares/auth.middleware.js";
import { validateProductsForSale } from "../middlewares/sales-validation.middleware.js";

const router = express.Router();

// Rutas CRUD básicas
router.get("/", authenticateUser, authorizePermission("view_sales"), getSales);
router.get("/:id", authenticateUser, authorizePermission("view_sales_id"), getSaleById);

router.post("/", authenticateUser, authorizePermission("create_sales"), validateProductsForSale, postSale);

router.delete("/:id", authenticateUser, authorizePermission("delete_sales"), deleteSale);
router.patch("/:id/status", authenticateUser, authorizePermission("update_status_sales"), updateSaleStatus);

export default router;