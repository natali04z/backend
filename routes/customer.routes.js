import express from "express";
import {
    getCustomers,
    getCustomerById,
    createCustomer,
    updateCustomer,
    deleteCustomer
} from "../controllers/customer.controller.js";

import { authenticateUser, authorizePermission } from "../middlewares/auth.middleware.js";

const router = express.Router();

router.get("/", authenticateUser, authorizePermission("view_customers"), getCustomers);
router.get("/:id", authenticateUser, authorizePermission("view_customers_id"), getCustomerById);
router.post("/", authenticateUser, authorizePermission("create_customers"), createCustomer);
router.put("/:id", authenticateUser, authorizePermission("update_customers"), updateCustomer);
router.delete("/:id", authenticateUser, authorizePermission("delete_customers"), deleteCustomer);

export default router;