import express from "express";
import {
    getSales,
    getSaleById,
    postSale,
    updateSale,
    updateSaleStatus,
    deleteSale,
    exportSaleToPdf,
    exportSaleToExcel
} from "../controllers/sales.controller.js";

import { authenticateUser, authorizePermission } from "../middlewares/auth.middleware.js";

const router = express.Router();

// Rutas CRUD básicas
router.get("/", authenticateUser, authorizePermission("view_sales"), getSales);
router.get("/:id", authenticateUser, authorizePermission("view_sales_id"), getSaleById);
router.post("/", authenticateUser, authorizePermission("create_sales"), postSale);
router.put("/:id", authenticateUser, authorizePermission("update_sales"), updateSale);
router.delete("/:id", authenticateUser, authorizePermission("delete_sales"), deleteSale);
router.patch("/:id/status", authenticateUser, authorizePermission("update_status_sales"), updateSaleStatus);
router.get("/export/pdf", authenticateUser, authorizePermission("view_sales"), exportSaleToPdf);
router.get("/export/excel", authenticateUser, authorizePermission("view_sales"), exportSaleToExcel);

export default router;