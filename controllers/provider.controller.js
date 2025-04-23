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

// Get all providers
export const getProviders = async (req, res) => {
    try {
        if (!checkPermission(req.user.role, "view_providers")) {
            return res.status(403).json({ message: "Unauthorized access" });
        }

        const providers = await Provider.find().select("id name contact_number address email personal_phone status");
        
        res.status(200).json(providers);
    } catch (error) {
        console.error("Error fetching providers:", error);
        res.status(500).json({ message: "Server error" });
    }
};

// Get provider by ID
export const getOneProvider = async (req, res) => {
    try {
        if (!checkPermission(req.user.role, "view_providers_id")) {
            return res.status(403).json({ message: "Unauthorized access" });
        }

        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: "Invalid provider ID" });
        }

        const provider = await Provider.findById(id).select("id name contact_number address email personal_phone status");

        if (!provider) {
            return res.status(404).json({ message: "Provider not found" });
        }

        res.status(200).json(provider);
    } catch (error) {
        console.error("Error fetching provider:", error);
        res.status(500).json({ message: "Server error" });
    }
};

// Create a new provider
export const postProvider = async (req, res) => {
    try {
        if (!checkPermission(req.user.role, "create_providers")) {
            return res.status(403).json({ message: "Unauthorized access" });
        }

        const { name, contact_number, address, email, personal_phone, status } = req.body;

        if (!name || !contact_number || !address || !email || !personal_phone || !status) {
            return res.status(400).json({ message: "All fields are required" });
        }

        if (!/^\d{10,}$/.test(contact_number)) {
            return res.status(400).json({ message: "Contact number must be at least 10 digits" });
        }

        if (!/^\d{10,}$/.test(personal_phone)) {
            return res.status(400).json({ message: "Personal phone must be at least 10 digits" });
        }

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.status(400).json({ message: "Invalid email format" });
        }

        if (address.length < 5 || address.length > 100) {
            return res.status(400).json({ message: "Address must be between 5 and 100 characters" });
        }

        if (!["active", "inactive"].includes(status.toLowerCase())) {
            return res.status(400).json({ message: "Status must be 'active' or 'inactive'" });
        }

        const existingProvider = await Provider.findOne({ email });
        if (existingProvider) {
            return res.status(400).json({ message: "A provider with this email already exists" });
        }

        const id = await generateProviderId();
        const newProvider = new Provider({
            id,
            name,
            contact_number,
            address,
            email,
            personal_phone,
            status: status.toLowerCase()
        });

        await newProvider.save();
        res.status(201).json({ message: "Provider created successfully", provider: newProvider });
    } catch (error) {
        console.error("Error creating provider:", error);
        res.status(500).json({ message: "Server error" });
    }
};

// Update a provider
export const putProvider = async (req, res) => {
    try {
        if (!checkPermission(req.user.role, "update_providers")) {
            return res.status(403).json({ message: "Unauthorized access" });
        }

        const { id } = req.params;
        const { name, contact_number, address, email, personal_phone, status } = req.body;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: "Invalid provider ID" });
        }

        // Validate fields if they are provided
        if (name === "") {
            return res.status(400).json({ message: "Name cannot be empty" });
        }

        if (contact_number && !/^\d{10,}$/.test(contact_number)) {
            return res.status(400).json({ message: "Contact number must be at least 10 digits" });
        }

        if (personal_phone && !/^\d{10,}$/.test(personal_phone)) {
            return res.status(400).json({ message: "Personal phone must be at least 10 digits" });
        }

        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.status(400).json({ message: "Invalid email format" });
        }

        if (address && (address.length < 5 || address.length > 100)) {
            return res.status(400).json({ message: "Address must be between 5 and 100 characters" });
        }

        if (status && !["active", "inactive"].includes(status.toLowerCase())) {
            return res.status(400).json({ message: "Status must be 'active' or 'inactive'" });
        }

        // Create update object with only the provided fields
        const updateData = {};
        if (name) updateData.name = name;
        if (contact_number) updateData.contact_number = contact_number;
        if (address) updateData.address = address;
        if (email) updateData.email = email;
        if (personal_phone) updateData.personal_phone = personal_phone;
        if (status) updateData.status = status.toLowerCase();

        const updatedProvider = await Provider.findByIdAndUpdate(
            id,
            updateData,
            { new: true, runValidators: true }
        ).select("id name contact_number address email personal_phone status");

        if (!updatedProvider) {
            return res.status(404).json({ message: "Provider not found" });
        }

        res.status(200).json({ message: "Provider updated successfully", provider: updatedProvider });
    } catch (error) {
        console.error("Error updating provider:", error);
        res.status(500).json({ message: "Server error" });
    }
};

// Delete a provider
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