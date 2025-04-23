import { Router } from "express";
import { 
  getPurchases, 
  getPurchaseById, 
  postPurchase, 
  updatePurchase, 
  deletePurchase, 
  generatePdfReport,
  generateExcelReport,
  getPurchaseStatistics
} from "../controllers/purchase.controller.js";
import { authenticateUser, authorizePermission } from "../middlewares/auth.middleware.js";

const router = Router(); 

// Rutas existentes
router.get("/", authenticateUser, authorizePermission("view_purchases"), getPurchases);
router.get("/:id", authenticateUser, authorizePermission("view_purchases_id"), getPurchaseById);
router.post("/", authenticateUser, authorizePermission("create_purchases"), postPurchase);
router.put("/:id", authenticateUser, authorizePermission("update_purchases"), updatePurchase);
router.delete("/:id", authenticateUser, authorizePermission("delete_purchases"), deletePurchase);

router.get("/reports/pdf", authenticateUser, authorizePermission("view_purchases"), generatePdfReport);
router.get("/reports/excel", authenticateUser, authorizePermission("view_purchases"), generateExcelReport);
router.get("/statistics", authenticateUser, authorizePermission("view_purchases"), getPurchaseStatistics);

export default router;