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
    validateCustomerForSale  // Nueva función importada
} from '../controllers/customer.controller.js';
import { authenticateToken } from '../middleware/auth.middleware.js';

const router = express.Router();

// Rutas existentes
router.get('/', authenticateToken, getCustomers);
router.get('/default', authenticateToken, getDefaultCustomer);
router.get('/:id', authenticateToken, getCustomerById);
router.post('/', authenticateToken, createCustomer);
router.put('/:id', authenticateToken, updateCustomer);
router.delete('/:id', authenticateToken, deleteCustomer);
router.patch('/:id/status', authenticateToken, updateCustomerStatus);

// Nueva ruta para validar cliente en ventas
router.get('/:id/validate-sale', authenticateToken, validateCustomerForSale);

export default router;