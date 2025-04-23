import Customer from "../models/customer.js";
import mongoose from "mongoose";
import { checkPermission } from "../utils/permissions.js";

// Función para formatear la fecha
const formatDate = (date) => {
  if (!date) return null;
  return new Date(date).toLocaleDateString('es-ES', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
};

// Obtener todos los clientes
export const getCustomers = async (req, res) => {
    try {
        if (!checkPermission(req.user.role, "view_customers")) {
            return res.status(403).json({ message: "Unauthorized access" });
        }

        const customers = await Customer.find()
            .select("name lastname email phone status createdAt");

        // Formatear fechas en la respuesta
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
            .select("id name lastname email phone status createdAt");

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

// Crear un nuevo cliente
export const createCustomer = async (req, res) => {
    try {
        if (!checkPermission(req.user.role, "create_customers")) {
            return res.status(403).json({ message: "Unauthorized access" });
        }

        const { name, lastname, email, phone, status } = req.body;

        // Validar campos obligatorios
        if (!name || !lastname || !email || !phone) {
            return res.status(400).json({ message: "Name, lastname, email, and phone are required" });
        }

        // Validar formato de email
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ message: "Invalid email format" });
        }

        // Verificar si el email ya existe
        const existingCustomer = await Customer.findOne({ email });
        if (existingCustomer) {
            return res.status(400).json({ message: "Customer with this email already exists" });
        }

        // Validar estado si se proporciona
        if (status && !['active', 'inactive'].includes(status)) {
            return res.status(400).json({ message: "Status must be either 'active' or 'inactive'" });
        }

        const newCustomer = new Customer({
            name,
            lastname,
            email,
            phone,
            status: status || 'active',
            createdAt: new Date(),
        });

        await newCustomer.save();
        res.status(201).json({ 
            message: "Customer created successfully", 
            customer: {
                id: newCustomer._id,
                name: newCustomer.name,
                lastname: newCustomer.lastname,
                email: newCustomer.email,
                phone: newCustomer.phone,
                status: newCustomer.status,
                createdAt: formatDate(newCustomer.createdAt),
            }
        });
    } catch (error) {
        console.error("Error creating customer:", error);
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
        const { name, lastname, email, phone, status } = req.body;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: "Invalid customer ID" });
        }

        // Validar email si se proporciona
        if (email) {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                return res.status(400).json({ message: "Invalid email format" });
            }

            // Verificar si otro cliente ya tiene este email
            const existingCustomer = await Customer.findOne({ email, _id: { $ne: id } });
            if (existingCustomer) {
                return res.status(400).json({ message: "Email already in use by another customer" });
            }
        }

        // Validar estado si se proporciona
        if (status && !['active', 'inactive'].includes(status)) {
            return res.status(400).json({ message: "Status must be either 'active' or 'inactive'" });
        }

        const updatedCustomer = await Customer.findByIdAndUpdate(
            id,
            { name, lastname, email, phone, status },
            { new: true, runValidators: true }
        );

        if (!updatedCustomer) {
            return res.status(404).json({ message: "Customer not found" });
        }

        res.status(200).json({ 
            message: "Customer updated successfully", 
            customer: {
                id: updatedCustomer._id,
                name: updatedCustomer.name,
                lastname: updatedCustomer.lastname,
                email: updatedCustomer.email,
                phone: updatedCustomer.phone,
                status: updatedCustomer.status,
                createdAt: formatDate(updatedCustomer.createdAt),
            }
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

        const updatedCustomer = await Customer.findByIdAndUpdate(
            id,
            { status },
            { new: true, runValidators: true }
        );

        if (!updatedCustomer) {
            return res.status(404).json({ message: "Customer not found" });
        }

        res.status(200).json({ 
            message: "Customer status updated successfully", 
            customer: {
                id: updatedCustomer._id,
                name: updatedCustomer.name,
                lastname: updatedCustomer.lastname,
                email: updatedCustomer.email,
                phone: updatedCustomer.phone,
                status: updatedCustomer.status,
                createdAt: formatDate(updatedCustomer.createdAt),
            }
        });
    } catch (error) {
        console.error("Error updating customer status:", error);
        res.status(500).json({ message: "Server error" });
    }
};