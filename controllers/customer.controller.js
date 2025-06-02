import Customer from "../models/customer.js";
import mongoose from "mongoose";
import { checkPermission } from "../utils/permissions.js";

// ===== FUNCIONES HELPER PARA FECHAS =====

/**
 * Formatea una fecha de MongoDB para enviar al frontend
 * Mantiene la fecha original sin conversiones de zona horaria
 * @param {Date} date - Fecha de MongoDB
 * @returns {string} Fecha en formato ISO (YYYY-MM-DDTHH:mm:ss.sssZ)
 */
function formatDateForResponse(date) {
    if (!date) return null;
    
    // Simplemente devolver la fecha ISO tal como viene de MongoDB
    // El frontend se encargará del formateo para mostrar
    return date.toISOString();
}

/**
 * Convierte fecha de string YYYY-MM-DD a objeto Date (zona local)
 * @param {string} dateString
 * @returns {Date}
 */
function parseLocalDate(dateString) {
    if (!dateString) return new Date();
    
    if (typeof dateString === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
        const [year, month, day] = dateString.split('-').map(Number);
        return new Date(year, month - 1, day);
    }
    
    return new Date(dateString);
}

// Función auxiliar para validar teléfono
function validatePhone(phone) {
    if (!phone) return { isValid: false, message: "Contact phone is required" };
    
    if (!/^\d+$/.test(phone)) {
        return { isValid: false, message: "Contact phone must contain only digits" };
    }
    
    if (phone.length < 10) {
        return { isValid: false, message: "Contact phone must be at least 10 digits" };
    }
    
    return { isValid: true };
}

// Función auxiliar para validar email
function validateEmail(email) {
    if (!email) return { isValid: false, message: "Email is required" };
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return { isValid: false, message: "Invalid email format" };
    }
    
    return { isValid: true };
}

// Obtener todos los clientes
export const getCustomers = async (req, res) => {
    try {
        if (!checkPermission(req.user.role, "view_customers")) {
            return res.status(403).json({ 
                success: false,
                message: "Unauthorized access" 
            });
        }
        
        await Customer.getDefaultCustomer();

        const customers = await Customer.find()
            .select("name lastname email phone status createdAt isDefault");

        const formattedCustomers = customers.map(customer => ({
            id: customer._id,
            name: customer.name,
            lastname: customer.lastname,
            email: customer.email,
            phone: customer.phone,
            status: customer.status,
            isDefault: customer.isDefault || false,
            createdAt: formatDateForResponse(customer.createdAt)
        }));

        res.status(200).json({
            success: true,
            data: formattedCustomers
        });
    } catch (error) {
        console.error("Error fetching customers:", error);
        res.status(500).json({ 
            success: false,
            message: "Error retrieving customers. Please try again later." 
        });
    }
};

// Obtener un cliente por ID
export const getCustomerById = async (req, res) => {
    try {
        if (!checkPermission(req.user.role, "view_customers_id")) {
            return res.status(403).json({ 
                success: false,
                message: "Unauthorized access" 
            });
        }

        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ 
                success: false,
                message: "Invalid customer ID format" 
            });
        }

        const customer = await Customer.findById(id);

        if (!customer) {
            return res.status(404).json({ 
                success: false,
                message: "Customer not found" 
            });
        }

        res.status(200).json({
            success: true,
            data: {
                id: customer._id,
                name: customer.name,
                lastname: customer.lastname,
                email: customer.email,
                phone: customer.phone,
                status: customer.status,
                isDefault: customer.isDefault || false,
                createdAt: formatDateForResponse(customer.createdAt)
            }
        });
    } catch (error) {
        console.error("Error fetching customer:", error);
        res.status(500).json({ 
            success: false,
            message: "Error retrieving customer. Please try again later." 
        });
    }
};

// Crear un nuevo cliente
export const createCustomer = async (req, res) => {
    try {
        if (!checkPermission(req.user.role, "create_customers")) {
            return res.status(403).json({ 
                success: false,
                message: "Unauthorized access" 
            });
        }

        const { name, lastname, email, phone } = req.body;

        // Validaciones básicas de campos requeridos
        if (!name || !lastname || !email || !phone) {
            return res.status(400).json({ 
                success: false,
                message: "All fields are required (name, lastname, email, phone)" 
            });
        }

        // Validar email
        const emailValidation = validateEmail(email.toString().trim());
        if (!emailValidation.isValid) {
            return res.status(400).json({ 
                success: false,
                message: emailValidation.message,
                field: "email"
            });
        }

        // Validar teléfono
        const phoneValidation = validatePhone(phone.toString().trim());
        if (!phoneValidation.isValid) {
            return res.status(400).json({ 
                success: false,
                message: phoneValidation.message,
                field: "phone"
            });
        }

        // Validar nombre
        const trimmedName = name.toString().trim();
        if (trimmedName.length < 2 || trimmedName.length > 50) {
            return res.status(400).json({ 
                success: false,
                message: "Name must be between 2 and 50 characters",
                field: "name"
            });
        }

        // Validar apellido
        const trimmedLastname = lastname.toString().trim();
        if (trimmedLastname.length < 2 || trimmedLastname.length > 50) {
            return res.status(400).json({ 
                success: false,
                message: "Lastname must be between 2 and 50 characters",
                field: "lastname"
            });
        }

        // Verificar si ya existe un cliente con el mismo email
        const existingCustomer = await Customer.findOne({ 
            email: email.toString().trim().toLowerCase() 
        });
        if (existingCustomer) {
            return res.status(400).json({ 
                success: false,
                message: "A customer with this email already exists",
                field: "email"
            });
        }

        const newCustomer = new Customer({
            name: trimmedName,
            lastname: trimmedLastname,
            email: email.toString().trim().toLowerCase(),
            phone: phone.toString().trim(),
            status: 'active',
            isDefault: false
        });

        const savedCustomer = await newCustomer.save();

        res.status(201).json({
            success: true,
            message: "Customer created successfully",
            data: {
                id: savedCustomer._id,
                name: savedCustomer.name,
                lastname: savedCustomer.lastname,
                email: savedCustomer.email,
                phone: savedCustomer.phone,
                status: savedCustomer.status,
                isDefault: savedCustomer.isDefault,
                createdAt: formatDateForResponse(savedCustomer.createdAt)
            }
        });

    } catch (error) {
        console.error("Error creating customer:", error);
        
        // Manejar errores específicos de MongoDB
        if (error.name === 'ValidationError') {
            const validationErrors = Object.values(error.errors).map(err => err.message);
            return res.status(400).json({ 
                success: false,
                message: "Validation error: " + validationErrors.join(', ') 
            });
        }
        
        if (error.code === 11000) {
            const field = Object.keys(error.keyPattern)[0];
            return res.status(400).json({ 
                success: false,
                message: `A customer with this ${field} already exists`,
                field: field
            });
        }
        
        res.status(500).json({ 
            success: false,
            message: "Error creating customer. Please try again later." 
        });
    }
};

// Actualizar un cliente
export const updateCustomer = async (req, res) => {
    try {
        if (!checkPermission(req.user.role, "update_customers")) {
            return res.status(403).json({ 
                success: false,
                message: "Unauthorized access" 
            });
        }

        const { id } = req.params;
        const { name, lastname, email, phone } = req.body;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ 
                success: false,
                message: "Invalid customer ID format" 
            });
        }

        // Verificar que el cliente existe
        const existingCustomer = await Customer.findById(id);
        if (!existingCustomer) {
            return res.status(404).json({ 
                success: false,
                message: "Customer not found" 
            });
        }

        // VALIDACIÓN: No editar cliente predeterminado
        if (existingCustomer.isDefault) {
            return res.status(400).json({ 
                success: false,
                message: "Default customer cannot be edited"
            });
        }

        const updateData = {};

        // Validar y actualizar name si se proporciona
        if (name !== undefined) {
            if (name === "") {
                return res.status(400).json({ 
                    success: false,
                    message: "Name cannot be empty",
                    field: "name"
                });
            }
            
            const trimmedName = name.toString().trim();
            if (trimmedName.length < 2 || trimmedName.length > 50) {
                return res.status(400).json({ 
                    success: false,
                    message: "Name must be between 2 and 50 characters",
                    field: "name"
                });
            }
            
            updateData.name = trimmedName;
        }

        // Validar y actualizar lastname si se proporciona
        if (lastname !== undefined) {
            if (lastname === "") {
                return res.status(400).json({ 
                    success: false,
                    message: "Lastname cannot be empty",
                    field: "lastname"
                });
            }
            
            const trimmedLastname = lastname.toString().trim();
            if (trimmedLastname.length < 2 || trimmedLastname.length > 50) {
                return res.status(400).json({ 
                    success: false,
                    message: "Lastname must be between 2 and 50 characters",
                    field: "lastname"
                });
            }
            
            updateData.lastname = trimmedLastname;
        }

        // Validar y actualizar email si se proporciona
        if (email !== undefined) {
            const emailValidation = validateEmail(email.toString().trim());
            if (!emailValidation.isValid) {
                return res.status(400).json({ 
                    success: false,
                    message: emailValidation.message,
                    field: "email"
                });
            }
            
            // Verificar que no exista otro cliente con el mismo email
            const existingEmail = await Customer.findOne({ 
                email: email.toString().trim().toLowerCase(),
                _id: { $ne: id }
            });
            if (existingEmail) {
                return res.status(400).json({ 
                    success: false,
                    message: "Another customer with this email already exists",
                    field: "email"
                });
            }
            
            updateData.email = email.toString().trim().toLowerCase();
        }

        // Validar y actualizar phone si se proporciona
        if (phone !== undefined) {
            if (phone === "") {
                return res.status(400).json({ 
                    success: false,
                    message: "Phone cannot be empty",
                    field: "phone"
                });
            }
            
            const phoneValidation = validatePhone(phone.toString().trim());
            if (!phoneValidation.isValid) {
                return res.status(400).json({ 
                    success: false,
                    message: phoneValidation.message,
                    field: "phone"
                });
            }
            
            updateData.phone = phone.toString().trim();
        }

        const updatedCustomer = await Customer.findByIdAndUpdate(
            id,
            updateData,
            { new: true, runValidators: true }
        );

        res.status(200).json({
            success: true,
            message: "Customer updated successfully",
            data: {
                id: updatedCustomer._id,
                name: updatedCustomer.name,
                lastname: updatedCustomer.lastname,
                email: updatedCustomer.email,
                phone: updatedCustomer.phone,
                status: updatedCustomer.status,
                isDefault: updatedCustomer.isDefault,
                createdAt: formatDateForResponse(updatedCustomer.createdAt)
            }
        });

    } catch (error) {
        console.error("Error updating customer:", error);
        
        if (error.name === 'ValidationError') {
            const validationErrors = Object.values(error.errors).map(err => err.message);
            return res.status(400).json({ 
                success: false,
                message: "Validation error: " + validationErrors.join(', ') 
            });
        }
        
        if (error.code === 11000) {
            const field = Object.keys(error.keyPattern)[0];
            return res.status(400).json({ 
                success: false,
                message: `Another customer with this ${field} already exists`,
                field: field
            });
        }
        
        res.status(500).json({ 
            success: false,
            message: "Error updating customer. Please try again later." 
        });
    }
};

// Eliminar un cliente
export const deleteCustomer = async (req, res) => {
    try {
        if (!checkPermission(req.user.role, "delete_customers")) {
            return res.status(403).json({ 
                success: false,
                message: "Unauthorized access" 
            });
        }

        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ 
                success: false,
                message: "Invalid customer ID format" 
            });
        }

        const customer = await Customer.findById(id);
        if (!customer) {
            return res.status(404).json({ 
                success: false,
                message: "Customer not found" 
            });
        }

        // VALIDACIÓN: No eliminar cliente predeterminado
        if (customer.isDefault) {
            return res.status(400).json({ 
                success: false,
                message: "Default customer cannot be deleted" 
            });
        }

        await Customer.findByIdAndDelete(id);

        res.status(200).json({ 
            success: true,
            message: "Customer deleted successfully" 
        });
    } catch (error) {
        console.error("Error deleting customer:", error);
        res.status(500).json({ 
            success: false,
            message: "Error deleting customer. Please try again later." 
        });
    }
};

// Cambiar el estado de un cliente
export const updateCustomerStatus = async (req, res) => {
    try {
        if (!checkPermission(req.user.role, "update_customers_status")) {
            return res.status(403).json({ 
                success: false,
                message: "Unauthorized access" 
            });
        }

        const { id } = req.params;
        const { status } = req.body;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ 
                success: false,
                message: "Invalid customer ID format" 
            });
        }

        if (!status || !['active', 'inactive'].includes(status.toLowerCase())) {
            return res.status(400).json({ 
                success: false,
                message: "Status must be 'active' or 'inactive'",
                field: "status"
            });
        }

        const customer = await Customer.findById(id);
        if (!customer) {
            return res.status(404).json({ 
                success: false,
                message: "Customer not found" 
            });
        }

        // VALIDACIÓN: No desactivar cliente predeterminado
        if (customer.isDefault && status.toLowerCase() === 'inactive') {
            return res.status(400).json({ 
                success: false,
                message: "Default customer cannot be deactivated" 
            });
        }

        const updatedCustomer = await Customer.findByIdAndUpdate(
            id,
            { status: status.toLowerCase() },
            { new: true, runValidators: true }
        );

        res.status(200).json({
            success: true,
            message: `Customer ${status === 'active' ? 'activated' : 'deactivated'} successfully`,
            data: {
                id: updatedCustomer._id,
                name: updatedCustomer.name,
                lastname: updatedCustomer.lastname,
                email: updatedCustomer.email,
                phone: updatedCustomer.phone,
                status: updatedCustomer.status,
                isDefault: updatedCustomer.isDefault,
                createdAt: formatDateForResponse(updatedCustomer.createdAt)
            }
        });

    } catch (error) {
        console.error("Error updating customer status:", error);
        res.status(500).json({ 
            success: false,
            message: "Error updating customer status. Please try again later." 
        });
    }
};

// Obtener cliente predeterminado
export const getDefaultCustomer = async (req, res) => {
    try {
        if (!checkPermission(req.user.role, "view_customers")) {
            return res.status(403).json({ 
                success: false,
                message: "Unauthorized access" 
            });
        }

        const defaultCustomer = await Customer.getDefaultCustomer();

        res.status(200).json({
            success: true,
            data: {
                id: defaultCustomer._id,
                name: defaultCustomer.name,
                lastname: defaultCustomer.lastname,
                email: defaultCustomer.email,
                phone: defaultCustomer.phone,
                status: defaultCustomer.status,
                isDefault: defaultCustomer.isDefault,
                createdAt: formatDateForResponse(defaultCustomer.createdAt)
            }
        });
    } catch (error) {
        console.error("Error fetching default customer:", error);
        res.status(500).json({ 
            success: false,
            message: "Error retrieving default customer. Please try again later." 
        });
    }
};