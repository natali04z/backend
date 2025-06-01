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

// Obtener todos los clientes
export const getCustomers = async (req, res) => {
    try {
        if (!checkPermission(req.user.role, "view_customers")) {
            return res.status(403).json({ message: "Unauthorized access" });
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

        res.status(200).json(formattedCustomers);
    } catch (error) {
        console.error("Error fetching customers:", error);
        res.status(500).json({ message: "Server error", details: error.message });
    }
};

// Obtener un cliente por ID
export const getCustomerById = async (req, res) => {
    try {
        if (!checkPermission(req.user.role, "view_customers_id")) {
            return res.status(403).json({ message: "Unauthorized access" });
        }

        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: "Invalid customer ID format" });
        }

        const customer = await Customer.findById(id);

        if (!customer) {
            return res.status(404).json({ message: "Customer not found" });
        }

        res.status(200).json({
            id: customer._id,
            name: customer.name,
            lastname: customer.lastname,
            email: customer.email,
            phone: customer.phone,
            status: customer.status,
            isDefault: customer.isDefault || false,
            createdAt: formatDateForResponse(customer.createdAt)
        });
    } catch (error) {
        console.error("Error fetching customer:", error);
        res.status(500).json({ message: "Server error", details: error.message });
    }
};

// Crear un nuevo cliente
export const createCustomer = async (req, res) => {
    try {
        if (!checkPermission(req.user.role, "create_customers")) {
            return res.status(403).json({ message: "Unauthorized access" });
        }

        const { name, lastname, email, phone } = req.body;

        if (!name || !lastname || !email || !phone) {
            return res.status(400).json({ message: "Name, lastname, email, and phone are required" });
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ message: "Invalid email format" });
        }

        if (!/^\d+$/.test(phone)) {
            return res.status(400).json({ message: "Phone number must contain only digits" });
        }

        const existingCustomer = await Customer.findOne({ email: email.toLowerCase() });
        if (existingCustomer) {
            return res.status(400).json({ message: "Customer with this email already exists" });
        }

        const newCustomer = new Customer({
            name: name.trim(),
            lastname: lastname.trim(),
            email: email.trim().toLowerCase(),
            phone: phone.trim(),
            status: 'active',
            isDefault: false
        });

        const savedCustomer = await newCustomer.save();

        res.status(201).json({
            message: "Customer created successfully",
            customer: {
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
        
        if (error.name === 'ValidationError') {
            const errors = Object.values(error.errors).map(err => err.message);
            return res.status(400).json({ message: "Validation error", errors });
        }
        
        if (error.code === 11000) {
            return res.status(400).json({ message: "Customer with this email already exists" });
        }
        
        res.status(500).json({ message: "Server error", details: error.message });
    }
};

// Actualizar un cliente
export const updateCustomer = async (req, res) => {
    try {
        if (!checkPermission(req.user.role, "update_customers")) {
            return res.status(403).json({ message: "Unauthorized access" });
        }

        const { id } = req.params;
        const { name, lastname, email, phone } = req.body;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: "Invalid customer ID format" });
        }

        const existingCustomer = await Customer.findById(id);
        if (!existingCustomer) {
            return res.status(404).json({ message: "Customer not found" });
        }

        // VALIDACIÓN: No editar cliente predeterminado
        if (existingCustomer.isDefault) {
            return res.status(400).json({ 
                message: "Default customer cannot be edited"
            });
        }

        if (phone && !/^\d+$/.test(phone)) {
            return res.status(400).json({ message: "Phone number must contain only digits" });
        }

        if (email) {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                return res.status(400).json({ message: "Invalid email format" });
            }

            const duplicateCustomer = await Customer.findOne({ 
                email: email.toLowerCase(), 
                _id: { $ne: id } 
            });
            if (duplicateCustomer) {
                return res.status(400).json({ message: "Email already in use by another customer" });
            }
        }

        const updateData = {};
        if (name) updateData.name = name.trim();
        if (lastname) updateData.lastname = lastname.trim();
        if (email) updateData.email = email.trim().toLowerCase();
        if (phone) updateData.phone = phone.trim();

        const updatedCustomer = await Customer.findByIdAndUpdate(
            id,
            updateData,
            { new: true, runValidators: true }
        );

        res.status(200).json({
            message: "Customer updated successfully",
            customer: {
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
        
        if (error.code === 11000) {
            return res.status(400).json({ message: "Email already in use by another customer" });
        }
        
        res.status(500).json({ message: "Server error", details: error.message });
    }
};

// Eliminar un cliente
export const deleteCustomer = async (req, res) => {
    try {
        if (!checkPermission(req.user.role, "delete_customers")) {
            return res.status(403).json({ message: "Unauthorized access" });
        }

        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: "Invalid customer ID format" });
        }

        const customer = await Customer.findById(id);
        if (!customer) {
            return res.status(404).json({ message: "Customer not found" });
        }

        // VALIDACIÓN: No eliminar cliente predeterminado
        if (customer.isDefault) {
            return res.status(400).json({ message: "Default customer cannot be deleted" });
        }

        await Customer.findByIdAndDelete(id);

        res.status(200).json({ message: "Customer deleted successfully" });
    } catch (error) {
        console.error("Error deleting customer:", error);
        res.status(500).json({ message: "Server error", details: error.message });
    }
};

// Cambiar el estado de un cliente
export const updateCustomerStatus = async (req, res) => {
    try {
        if (!checkPermission(req.user.role, "update_customers_status")) {
            return res.status(403).json({ message: "Unauthorized access" });
        }

        const { id } = req.params;
        const { status } = req.body;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: "Invalid customer ID format" });
        }

        if (!status || !['active', 'inactive'].includes(status)) {
            return res.status(400).json({ message: "Status must be either 'active' or 'inactive'" });
        }

        const customer = await Customer.findById(id);
        if (!customer) {
            return res.status(404).json({ message: "Customer not found" });
        }

        // VALIDACIÓN: No desactivar cliente predeterminado
        if (customer.isDefault && status === 'inactive') {
            return res.status(400).json({ message: "Default customer cannot be deactivated" });
        }

        const updatedCustomer = await Customer.findByIdAndUpdate(
            id,
            { status },
            { new: true, runValidators: true }
        );

        res.status(200).json({
            message: `Customer status updated to ${status}`,
            customer: {
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
        res.status(500).json({ message: "Server error", details: error.message });
    }
};

// Obtener cliente predeterminado
export const getDefaultCustomer = async (req, res) => {
    try {
        if (!checkPermission(req.user.role, "view_customers")) {
            return res.status(403).json({ message: "Unauthorized access" });
        }

        const defaultCustomer = await Customer.getDefaultCustomer();

        res.status(200).json({
            id: defaultCustomer._id,
            name: defaultCustomer.name,
            lastname: defaultCustomer.lastname,
            email: defaultCustomer.email,
            phone: defaultCustomer.phone,
            status: defaultCustomer.status,
            isDefault: defaultCustomer.isDefault,
            createdAt: formatDateForResponse(defaultCustomer.createdAt)
        });
    } catch (error) {
        console.error("Error fetching default customer:", error);
        res.status(500).json({ message: "Server error", details: error.message });
    }
};