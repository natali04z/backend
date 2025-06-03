import { Router } from 'express';
import { 
    getBranches, 
    getBranchesById, 
    postBranches, 
    updateBranches, 
    deleteBranches,
    updateBranchStatus  // <-- Agregar esta importación
} from '../controllers/branch.controller.js';
import { authenticateUser, authorizePermission } from "../middlewares/auth.middleware.js";

const router = Router();

router.get('/', authenticateUser, authorizePermission("view_branches"), getBranches);
router.get('/:id', authenticateUser, authorizePermission("view_branches"), getBranchesById);
router.post('/', authenticateUser, authorizePermission("create_branches"), postBranches);
router.put('/:id', authenticateUser, authorizePermission("update_branches"), updateBranches);
router.delete('/:id', authenticateUser, authorizePermission("delete_branches"), deleteBranches);

// Nueva ruta para cambio de estado - DEBE IR ANTES de router.get('/:id')
router.patch('/status/:id', authenticateUser, authorizePermission("update_branches"), updateBranchStatus);

export default router;