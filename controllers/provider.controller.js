import Provider from "../models/provider.js";
import mongoose from "mongoose";
import { checkPermission } from "../utils/permissions.js";

async function generateProviderId() {
    const lastProvider = await Provider.findOne().sort({ _id: -1 });

    if (!lastProvider || !/^Pr\d{2}$/.test(lastProvider.id)) {
        return "Pr01";
    }

    const lastNumber = parseInt(lastProvider.id.substring(2), 10);
    const nextNumber = (lastNumber + 1).toString().padStart(2, "0");
    return `Pr${nextNumber}`;
}

// Obtener todos los proveedores
export const getProviders = async (req, res) => {
    try {
        if (!checkPermission(req.user.role, "view_providers")) {
            return res.status(403).json({ message: "Unauthorized access" });
        }

        const providers = await Provider.find().select("id nit company name contact_phone email status");
        
        res.status(200).json(providers);
    } catch (error) {
        console.error("Error fetching providers:", error);
        res.status(500).json({ message: "Server error" });
    }
};

// Obtener proveedor por ID
export const getOneProvider = async (req, res) => {
    try {
        if (!checkPermission(req.user.role, "view_providers_id")) {
            return res.status(403).json({ message: "Unauthorized access" });
        }

        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: "Invalid provider ID" });
        }

        const provider = await Provider.findById(id).select("id nit company name contact_phone email status");

        if (!provider) {
            return res.status(404).json({ message: "Provider not found" });
        }

        res.status(200).json(provider);
    } catch (error) {
        console.error("Error fetching provider:", error);
        res.status(500).json({ message: "Server error" });
    }
};

// Crear un nuevo proveedor
export const postProvider = async (req, res) => {
    try {
        if (!checkPermission(req.user.role, "create_providers")) {
            return res.status(403).json({ message: "Unauthorized access" });
        }

        const { nit, company, name, contact_phone, email } = req.body;

        if (!nit || !company || !name || !contact_phone || !email) {
            return res.status(400).json({ message: "All fields are required" });
        }

        if (!/^\d{9}(-\d)?$/.test(nit)) {
            return res.status(400).json({ message: "NIT must be 9 digits, optionally followed by hyphen and verification digit (e.g., 890904478-6)" });
        }

        if (!/^\d+$/.test(contact_phone)) {
            return res.status(400).json({ message: "Contact phone must contain only digits" });
        }

        if (contact_phone.length < 10) {
            return res.status(400).json({ message: "Contact phone must be at least 10 digits" });
        }

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.status(400).json({ message: "Invalid email format" });
        }

        if (company.length < 2 || company.length > 100) {
            return res.status(400).json({ message: "Company name must be between 2 and 100 characters" });
        }

        const existingProvider = await Provider.findOne({ email });
        if (existingProvider) {
            return res.status(400).json({ message: "A provider with this email already exists" });
        }

        const id = await generateProviderId();
        const newProvider = new Provider({
            id,
            nit,
            company,
            name,
            contact_phone,
            email,
            status: "active"
        });

        await newProvider.save();
        res.status(201).json({ message: "Provider created successfully", provider: newProvider });
    } catch (error) {
        console.error("Error creating provider:", error);
        res.status(500).json({ message: "Server error" });
    }
};

// Actualizar un proveedor
export const putProvider = async (req, res) => {
    try {
        if (!checkPermission(req.user.role, "update_providers")) {
            return res.status(403).json({ message: "Unauthorized access" });
        }

        const { id } = req.params;
        const { nit, company, name, contact_phone, email } = req.body;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: "Invalid provider ID" });
        }

        if (name === "") {
            return res.status(400).json({ message: "Name cannot be empty" });
        }

        if (nit && !/^\d{9}(-\d)?$/.test(nit)) {
            return res.status(400).json({ message: "NIT must be 9 digits, optionally followed by hyphen and verification digit (e.g., 890904478-6)" });
        }

        if (contact_phone && !/^\d+$/.test(contact_phone)) {
            return res.status(400).json({ message: "Contact phone must contain only digits" });
        }

        if (contact_phone && contact_phone.length < 10) {
            return res.status(400).json({ message: "Contact phone must be at least 10 digits" });
        }

        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.status(400).json({ message: "Invalid email format" });
        }

        if (company && (company.length < 2 || company.length > 100)) {
            return res.status(400).json({ message: "Company name must be between 2 and 100 characters" });
        }

        const updateData = {};
        if (nit) updateData.nit = nit;
        if (company) updateData.company = company;
        if (name) updateData.name = name;
        if (contact_phone) updateData.contact_phone = contact_phone;
        if (email) updateData.email = email;

        const updatedProvider = await Provider.findByIdAndUpdate(
            id,
            updateData,
            { new: true, runValidators: true }
        ).select("id nit company name contact_phone email status");

        if (!updatedProvider) {
            return res.status(404).json({ message: "Provider not found" });
        }

        res.status(200).json({ message: "Provider updated successfully", provider: updatedProvider });
    } catch (error) {
        console.error("Error updating provider:", error);
        res.status(500).json({ message: "Server error" });
    }
};

// Actualizar estado del proveedor
export const updateProviderStatus = async (req, res) => {
    try {
        if (!checkPermission(req.user.role, "update_status_providers")) {
            return res.status(403).json({ message: "Unauthorized access" });
        }

        const { id } = req.params;
        const { status } = req.body;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: "Invalid provider ID" });
        }

        if (!status || !["active", "inactive"].includes(status.toLowerCase())) {
            return res.status(400).json({ message: "Status must be 'active' or 'inactive'" });
        }

        const updatedProvider = await Provider.findByIdAndUpdate(
            id,
            { status: status.toLowerCase() },
            { new: true, runValidators: true }
        ).select("id nit company name contact_phone email status");

        if (!updatedProvider) {
            return res.status(404).json({ message: "Provider not found" });
        }

        res.status(200).json({ 
            message: `Provider ${status === 'active' ? 'activated' : 'deactivated'} successfully`, 
            provider: updatedProvider 
        });
    } catch (error) {
        console.error("Error updating provider status:", error);
        res.status(500).json({ message: "Server error" });
    }
};

// Eliminar un proveedor
export const deleteProvider = async (req, res) => {
    try {
        if (!checkPermission(req.user.role, "delete_providers")) {
            return res.status(403).json({ message: "Unauthorized access" });
        }

        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: "Invalid provider ID" });
        }

        const deletedProvider = await Provider.findByIdAndDelete(id);

        if (!deletedProvider) {
            return res.status(404).json({ message: "Provider not found" });
        }

        res.status(200).json({ message: "Provider deleted successfully" });
    } catch (error) {
        console.error("Error deleting provider:", error);
        res.status(500).json({ message: "Server error" });
    }
};