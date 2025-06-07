import { Router } from "express";
import { 
  getPurchases, 
  getPurchaseById, 
  postPurchase, 
  deletePurchase,
  deactivatePurchase,
  reactivatePurchase
} from "../controllers/purchase.controller.js";
import { authenticateUser, authorizePermission } from "../middlewares/auth.middleware.js";

const router = Router(); 

router.get("/", authenticateUser, authorizePermission("view_purchases"), getPurchases);
router.get("/:id", authenticateUser, authorizePermission("view_purchases_id"), getPurchaseById);
router.post("/", authenticateUser, authorizePermission("create_purchases"), postPurchase);
router.patch("/:id/deactivate", authenticateUser, authorizePermission("update_status_purchases"), deactivatePurchase);
router.patch("/:id/reactivate", authenticateUser, authorizePermission("reatcivate_purchases"), reactivatePurchase);
router.delete("/:id", authenticateUser, authorizePermission("delete_purchases"), deletePurchase);

export default router;