// En tu archivo de rutas (routes/customers.js o similar)
import express from 'express';
import { 
    getCustomers, 
    getCustomerById, 
    getDefaultCustomer,
    createCustomer, 
    updateCustomer, 
    deleteCustomer, 
    updateCustomerStatus,
} from '../controllers/customer.controller.js';
import {  authenticateUser, authorizePermission} from '../middlewares/auth.middleware.js';

const router = express.Router();

// Rutas existentes
router.get('/',  authenticateUser, authorizePermission("view_customers"), getCustomers);
router.get('/default',  authenticateUser, authorizePermission("view_customers"), getDefaultCustomer);
router.get('/:id', authenticateUser, authorizePermission("view_customers_id"), getCustomerById);
router.post('/',  authenticateUser, authorizePermission("create_customers"), createCustomer);
router.put('/:id',  authenticateUser, authorizePermission("update_customers"), updateCustomer);
router.delete('/:id',  authenticateUser, authorizePermission("delete_customers"), deleteCustomer);
router.patch('/:id/status',  authenticateUser, authorizePermission("update_customers_status"), updateCustomerStatus);

export default router;