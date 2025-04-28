import { Router } from "express";
import { 
  getPurchases, 
  getPurchaseById, 
  postPurchase, 
  updatePurchase, 
  deletePurchase,
  updatePurchaseStatus,
  exportPurchaseToPdf,
  exportPurchaseToExcel
} from "../controllers/purchase.controller.js";
import { authenticateUser, authorizePermission } from "../middlewares/auth.middleware.js";

const router = Router(); 

// Rutas existentes
router.get("/", authenticateUser, authorizePermission("view_purchases"), getPurchases);
router.get("/:id", authenticateUser, authorizePermission("view_purchases_id"), getPurchaseById);
router.post("/", authenticateUser, authorizePermission("create_purchases"), postPurchase);
router.put("/:id", authenticateUser, authorizePermission("update_purchases"), updatePurchase);
router.delete("/:id", authenticateUser, authorizePermission("delete_purchases"), deletePurchase);
router.patch("/:id/status", authenticateUser, authorizePermission("update_status_purchases"), updatePurchaseStatus);
router.get("/export/pdf", authenticateUser, authorizePermission("view_purchases"), exportPurchaseToPdf);
router.get("/export/excel", authenticateUser, authorizePermission("view_purchases"), exportPurchaseToExcel);

export default router;