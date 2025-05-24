import Customer from "../models/customer.js";
import mongoose from "mongoose";
import { checkPermission } from "../utils/permissions.js";

const formatDate = (date) => {
  if (!date) return null;
  return new Date(date).toLocaleDateString('es-ES', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
};

// Obtener todos los clientes (sin cambios - ya devuelve activos e inactivos)
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
            createdAt: formatDate(customer.createdAt)
        }));

        res.status(200).json(formattedCustomers);
    } catch (error) {
        console.error("Error fetching customers:", error);
        res.status(500).json({ message: "Server error" });
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
            return res.status(400).json({ message: "Invalid customer ID" });
        }

        const customer = await Customer.findById(id)
            .select("id name lastname email phone status createdAt isDefault");

        if (!customer) {
            return res.status(404).json({ message: "Customer not found" });
        }

        const formattedCustomer = {
            id: customer._id,
            name: customer.name,
            lastname: customer.lastname,
            email: customer.email,
            phone: customer.phone,
            status: customer.status,
            createdAt: formatDate(customer.createdAt)
        };

        res.status(200).json(formattedCustomer);
    } catch (error) {
        console.error("Error fetching customer:", error);
        res.status(500).json({ message: "Server error" });
    }
};

// NUEVA FUNCIÓN: Validar cliente para uso en ventas
export const validateCustomerForSale = async (req, res) => {
    try {
        if (!checkPermission(req.user.role, "view_customers")) {
            return res.status(403).json({ message: "Unauthorized access" });
        }

        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: "Invalid customer ID" });
        }

        const customer = await Customer.findById(id)
            .select("name lastname email phone status isDefault");

        if (!customer) {
            return res.status(404).json({ 
                message: "Customer not found",
                isValid: false,
                canProceed: false
            });
        }

        // Verificar si el cliente está activo
        if (customer.status === 'inactive') {
            return res.status(200).json({ 
                message: `El cliente ${customer.name} ${customer.lastname} está inactivo y no puede ser usado en ventas. Por favor reactívalo o selecciona otro cliente.`,
                isValid: false,
                canProceed: false,
                customer: {
                    id: customer._id,
                    name: customer.name,
                    lastname: customer.lastname,
                    email: customer.email,
                    phone: customer.phone,
                    status: customer.status,
                    fullName: `${customer.name} ${customer.lastname}`
                },
                statusInfo: {
                    status: customer.status,
                    statusText: 'Inactivo',
                    canUseInSales: false,
                    warningMessage: 'Este cliente no puede ser usado en ventas hasta que sea reactivado.'
                }
            });
        }

        // Cliente activo - puede ser usado
        return res.status(200).json({ 
            message: `Cliente ${customer.name} ${customer.lastname} está activo y puede ser usado en ventas.`,
            isValid: true,
            canProceed: true,
            customer: {
                id: customer._id,
                name: customer.name,
                lastname: customer.lastname,
                email: customer.email,
                phone: customer.phone,
                status: customer.status,
                isDefault: customer.isDefault,
                fullName: `${customer.name} ${customer.lastname}`
            },
            statusInfo: {
                status: customer.status,
                statusText: 'Activo',
                canUseInSales: true,
                successMessage: 'Este cliente puede ser usado en ventas.'
            }
        });

    } catch (error) {
        console.error("Error validating customer for sale:", error);
        res.status(500).json({ 
            message: "Server error",
            isValid: false,
            canProceed: false
        });
    }
};

// Obtener cliente predeterminado
export const getDefaultCustomer = async (req, res) => {
    try {
        if (!checkPermission(req.user.role, "view_customers")) {
            return res.status(403).json({ message: "Unauthorized access" });
        }

        const defaultCustomer = await Customer.getDefaultCustomer();

        const formattedCustomer = {
            id: defaultCustomer._id,
            name: defaultCustomer.name,
            lastname: defaultCustomer.lastname,
            email: defaultCustomer.email,
            phone: defaultCustomer.phone,
            status: defaultCustomer.status,
            createdAt: formatDate(defaultCustomer.createdAt)
        };

        res.status(200).json(formattedCustomer);
    } catch (error) {
        console.error("Error fetching default customer:", error);
        res.status(500).json({ message: "Server error" });
    }
};

// Crear un nuevo cliente - CORREGIDO
export const createCustomer = async (req, res) => {
    try {
        if (!checkPermission(req.user.role, "create_customers")) {
            return res.status(403).json({ message: "Unauthorized access" });
        }

        const { name, lastname, email, phone, isDefault } = req.body;

        // Validaciones
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

        // Verificar si el email ya existe
        const existingCustomer = await Customer.findOne({ email });
        if (existingCustomer) {
            return res.status(400).json({ message: "Customer with this email already exists" });
        }

        // Crear nuevo cliente
        const newCustomer = new Customer({
            name: name.trim(),
            lastname: lastname.trim(),
            email: email.trim().toLowerCase(),
            phone: phone.trim(),
            status: 'active',
            createdAt: new Date(),
        });

        const savedCustomer = await newCustomer.save();

        // RESPUESTA CORREGIDA
        const formattedCustomer = {
            id: savedCustomer._id,
            name: savedCustomer.name,
            lastname: savedCustomer.lastname,
            email: savedCustomer.email,
            phone: savedCustomer.phone,
            status: savedCustomer.status,
            isDefault: savedCustomer.isDefault,
            createdAt: formatDate(savedCustomer.createdAt)
        };

        res.status(201).json({
            message: "Customer created successfully",
            customer: formattedCustomer
        });

    } catch (error) {
        console.error("Error creating customer:", error);
        
        // Manejo específico de errores de validación de Mongoose
        if (error.name === 'ValidationError') {
            const errors = Object.values(error.errors).map(err => err.message);
            return res.status(400).json({ message: errors.join(', ') });
        }
        
        res.status(500).json({ message: "Server error" });
    }
};

// Actualizar un cliente
export const updateCustomer = async (req, res) => {
    try {
        if (!checkPermission(req.user.role, "update_customers")) {
            return res.status(403).json({ message: "Unauthorized access" });
        }

        const { id } = req.params;
        const { name, lastname, email, phone, isDefault } = req.body;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: "Invalid customer ID" });
        }

        // Validaciones
        if (phone && !/^\d+$/.test(phone)) {
            return res.status(400).json({ message: "Phone number must contain only digits" });
        }

        if (email) {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                return res.status(400).json({ message: "Invalid email format" });
            }

            const existingCustomer = await Customer.findOne({ email, _id: { $ne: id } });
            if (existingCustomer) {
                return res.status(400).json({ message: "Email already in use by another customer" });
            }
        }

        const updateData = {};
        if (name) updateData.name = name.trim();
        if (lastname) updateData.lastname = lastname.trim();
        if (email) updateData.email = email.trim().toLowerCase();
        if (phone) updateData.phone = phone.trim();
        if (isDefault !== undefined) updateData.isDefault = isDefault;

        const updatedCustomer = await Customer.findByIdAndUpdate(
            id,
            updateData,
            { new: true, runValidators: true }
        );

        if (!updatedCustomer) {
            return res.status(404).json({ message: "Customer not found" });
        }

        const formattedCustomer = {
            id: updatedCustomer._id,
            name: updatedCustomer.name,
            lastname: updatedCustomer.lastname,
            email: updatedCustomer.email,
            phone: updatedCustomer.phone,
            status: updatedCustomer.status,
            createdAt: formatDate(updatedCustomer.createdAt)
        };

        res.status(200).json({
            message: "Customer updated successfully",
            customer: formattedCustomer
        });

    } catch (error) {
        console.error("Error updating customer:", error);
        res.status(500).json({ message: "Server error" });
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
            return res.status(400).json({ message: "Invalid customer ID" });
        }

        const customer = await Customer.findById(id);
        if (customer && customer.isDefault) {
            return res.status(400).json({ message: "Default customer cannot be deleted" });
        }

        const deletedCustomer = await Customer.findByIdAndDelete(id);

        if (!deletedCustomer) {
            return res.status(404).json({ message: "Customer not found" });
        }

        res.status(200).json({ message: "Customer deleted successfully" });
    } catch (error) {
        console.error("Error deleting customer:", error);
        res.status(500).json({ message: "Server error" });
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
            return res.status(400).json({ message: "Invalid customer ID" });
        }

        if (!status || !['active', 'inactive'].includes(status)) {
            return res.status(400).json({ message: "Status must be either 'active' or 'inactive'" });
        }

        const customer = await Customer.findById(id);
        if (customer && customer.isDefault && status === 'inactive') {
            return res.status(400).json({ message: "Default customer cannot be deactivated" });
        }

        const updatedCustomer = await Customer.findByIdAndUpdate(
            id,
            { status },
            { new: true, runValidators: true }
        );

        if (!updatedCustomer) {
            return res.status(404).json({ message: "Customer not found" });
        }

        const formattedCustomer = {
            id: updatedCustomer._id,
            name: updatedCustomer.name,
            lastname: updatedCustomer.lastname,
            email: updatedCustomer.email,
            phone: updatedCustomer.phone,
            status: updatedCustomer.status,
            createdAt: formatDate(updatedCustomer.createdAt)
        };

        res.status(200).json({
            message: `Customer status updated to ${status}`,
            customer: formattedCustomer
        });

    } catch (error) {
        console.error("Error updating customer status:", error);
        res.status(500).json({ message: "Server error" });
    }
};