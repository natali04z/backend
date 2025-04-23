import express from "express";
import {
    getSales,
    getSaleById,
    createSale,
    updateSale,
    deleteSale,
    exportSalesToPDF,
    exportSalesToExcel,
    generateInvoice
} from "../controllers/sales.controller.js";

import { authenticateUser, authorizePermission } from "../middlewares/auth.middleware.js";

const router = express.Router();

// Rutas CRUD básicas
router.get("/", authenticateUser, authorizePermission("view_sales"), getSales);
router.get("/:id", authenticateUser, authorizePermission("view_sales_id"), getSaleById);
router.post("/", authenticateUser, authorizePermission("create_sales"), createSale);
router.put("/:id", authenticateUser, authorizePermission("update_sales"), updateSale);
router.delete("/:id", authenticateUser, authorizePermission("delete_sales"), deleteSale);
router.get("/export/pdf", authenticateUser, authorizePermission("export_sales"), exportSalesToPDF);
router.get("/export/excel", authenticateUser, authorizePermission("export_sales"), exportSalesToExcel);
router.post("/:id/invoice", authenticateUser, authorizePermission("generate_invoice"), generateInvoice);

export default router;