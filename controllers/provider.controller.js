import Provider from "../models/provider.js";
import mongoose from "mongoose";
import { checkPermission } from "../utils/permissions.js";

async function generateProviderId() {
    try {
        const lastProvider = await Provider.findOne().sort({ _id: -1 });

        if (!lastProvider || !/^Pr\d{2}$/.test(lastProvider.id)) {
            return "Pr01";
        }

        const lastNumber = parseInt(lastProvider.id.substring(2), 10);
        const nextNumber = (lastNumber + 1).toString().padStart(2, "0");
        return `Pr${nextNumber}`;
    } catch (error) {
        console.error("Error generating provider ID:", error);
        return "Pr01";
    }
}

function validateNIT(nit) {
    if (!nit) return { isValid: false, message: "NIT is required" };

    if (!/^[\d-]+$/.test(nit)) {
        return { isValid: false, message: "NIT must contain only digits and hyphens" };
    }

    if (nit.replace(/-/g, "").length < 9) {
        return { isValid: false, message: "NIT must have at least 9 digits" };
    }

    return { isValid: true };
}

function validateEmail(email) {
    if (!email) return { isValid: false, message: "Email is required" };

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return { isValid: false, message: "Invalid email format" };
    }

    return { isValid: true };
}

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

// ─── GET ALL PROVIDERS ────────────────────────────────────────────────────────
export const getProviders = async (req, res) => {
    try {
        if (!checkPermission(req.user.role, "view_providers")) {
            return res.status(403).json({ success: false, message: "Unauthorized access" });
        }

        const providers = await Provider.find()
            .select("id nit company name contact_phone email status");

        res.status(200).json({ success: true, data: providers });
    } catch (error) {
        console.error("Error fetching providers:", error);
        res.status(500).json({
            success: false,
            message: "Error retrieving providers. Please try again later."
        });
    }
};

// ─── GET ONE PROVIDER ─────────────────────────────────────────────────────────
export const getOneProvider = async (req, res) => {
    try {
        if (!checkPermission(req.user.role, "view_providers_id")) {
            return res.status(403).json({ success: false, message: "Unauthorized access" });
        }

        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: "Invalid provider ID format" });
        }

        const provider = await Provider.findById(id)
            .select("id nit company name contact_phone email status");

        if (!provider) {
            return res.status(404).json({ success: false, message: "Provider not found" });
        }

        res.status(200).json({ success: true, data: provider });
    } catch (error) {
        console.error("Error fetching provider:", error);
        res.status(500).json({
            success: false,
            message: "Error retrieving provider. Please try again later."
        });
    }
};

// ─── CREATE PROVIDER ──────────────────────────────────────────────────────────
export const postProvider = async (req, res) => {
    try {
        if (!checkPermission(req.user.role, "create_providers")) {
            return res.status(403).json({ success: false, message: "Unauthorized access" });
        }

        const { nit, company, name, contact_phone, email } = req.body;

        if (!nit || !company || !name || !contact_phone || !email) {
            return res.status(400).json({
                success: false,
                message: "All fields are required (nit, company, name, contact_phone, email)"
            });
        }

        const nitValidation = validateNIT(nit.toString().trim());
        if (!nitValidation.isValid) {
            return res.status(400).json({ success: false, message: nitValidation.message, field: "nit" });
        }

        const phoneValidation = validatePhone(contact_phone.toString().trim());
        if (!phoneValidation.isValid) {
            return res.status(400).json({ success: false, message: phoneValidation.message, field: "contact_phone" });
        }

        const emailValidation = validateEmail(email.toString().trim());
        if (!emailValidation.isValid) {
            return res.status(400).json({ success: false, message: emailValidation.message, field: "email" });
        }

        const trimmedCompany = company.toString().trim();
        if (trimmedCompany.length < 2 || trimmedCompany.length > 100) {
            return res.status(400).json({
                success: false,
                message: "Company name must be between 2 and 100 characters",
                field: "company"
            });
        }

        const existingProviderByEmail = await Provider.findOne({
            email: email.toString().trim().toLowerCase()
        });
        if (existingProviderByEmail) {
            return res.status(400).json({
                success: false,
                message: "A provider with this email already exists",
                field: "email"
            });
        }

        const existingProviderByNIT = await Provider.findOne({ nit: nit.toString().trim() });
        if (existingProviderByNIT) {
            return res.status(400).json({
                success: false,
                message: "A provider with this NIT already exists",
                field: "nit"
            });
        }

        const providerId = await generateProviderId();
        const newProvider = new Provider({
            id: providerId,
            nit: nit.toString().trim(),
            company: trimmedCompany,
            name: name.toString().trim(),
            contact_phone: contact_phone.toString().trim(),
            email: email.toString().trim().toLowerCase(),
            status: "active"
        });

        const savedProvider = await newProvider.save();

        res.status(201).json({
            success: true,
            message: "Provider created successfully",
            data: savedProvider
        });
    } catch (error) {
        console.error("Error creating provider:", error);

        if (error.name === "ValidationError") {
            const validationErrors = Object.values(error.errors).map(err => err.message);
            return res.status(400).json({
                success: false,
                message: "Validation error: " + validationErrors.join(", ")
            });
        }

        if (error.code === 11000) {
            const field = Object.keys(error.keyPattern)[0];
            return res.status(400).json({
                success: false,
                message: `A provider with this ${field} already exists`,
                field
            });
        }

        res.status(500).json({
            success: false,
            message: "Error creating provider. Please try again later."
        });
    }
};

// ─── UPDATE PROVIDER ──────────────────────────────────────────────────────────
export const putProvider = async (req, res) => {
    try {
        if (!checkPermission(req.user.role, "update_providers")) {
            return res.status(403).json({ success: false, message: "Unauthorized access" });
        }

        const { id } = req.params;
        const { nit, company, name, contact_phone, email } = req.body;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: "Invalid provider ID format" });
        }

        const existingProvider = await Provider.findById(id);
        if (!existingProvider) {
            return res.status(404).json({ success: false, message: "Provider not found" });
        }

        const updateData = {};

        if (nit !== undefined) {
            if (nit === "") {
                return res.status(400).json({ success: false, message: "NIT cannot be empty", field: "nit" });
            }

            const nitValidation = validateNIT(nit.toString().trim());
            if (!nitValidation.isValid) {
                return res.status(400).json({ success: false, message: nitValidation.message, field: "nit" });
            }

            const existingNIT = await Provider.findOne({
                nit: nit.toString().trim(),
                _id: { $ne: id }
            });
            if (existingNIT) {
                return res.status(400).json({
                    success: false,
                    message: "Another provider with this NIT already exists",
                    field: "nit"
                });
            }

            updateData.nit = nit.toString().trim();
        }

        if (name !== undefined) {
            if (name === "") {
                return res.status(400).json({ success: false, message: "Name cannot be empty", field: "name" });
            }
            updateData.name = name.toString().trim();
        }

        if (contact_phone !== undefined) {
            const phoneValidation = validatePhone(contact_phone.toString().trim());
            if (!phoneValidation.isValid) {
                return res.status(400).json({ success: false, message: phoneValidation.message, field: "contact_phone" });
            }
            updateData.contact_phone = contact_phone.toString().trim();
        }

        if (email !== undefined) {
            const emailValidation = validateEmail(email.toString().trim());
            if (!emailValidation.isValid) {
                return res.status(400).json({ success: false, message: emailValidation.message, field: "email" });
            }

            const existingEmail = await Provider.findOne({
                email: email.toString().trim().toLowerCase(),
                _id: { $ne: id }
            });
            if (existingEmail) {
                return res.status(400).json({
                    success: false,
                    message: "Another provider with this email already exists",
                    field: "email"
                });
            }

            updateData.email = email.toString().trim().toLowerCase();
        }

        if (company !== undefined) {
            const trimmedCompany = company.toString().trim();
            if (trimmedCompany.length < 2 || trimmedCompany.length > 100) {
                return res.status(400).json({
                    success: false,
                    message: "Company name must be between 2 and 100 characters",
                    field: "company"
                });
            }
            updateData.company = trimmedCompany;
        }

        const updatedProvider = await Provider.findByIdAndUpdate(
            id,
            updateData,
            { new: true, runValidators: true }
        ).select("id nit company name contact_phone email status");

        res.status(200).json({
            success: true,
            message: "Provider updated successfully",
            data: updatedProvider
        });
    } catch (error) {
        console.error("Error updating provider:", error);

        if (error.name === "ValidationError") {
            const validationErrors = Object.values(error.errors).map(err => err.message);
            return res.status(400).json({
                success: false,
                message: "Validation error: " + validationErrors.join(", ")
            });
        }

        if (error.code === 11000) {
            const field = Object.keys(error.keyPattern)[0];
            return res.status(400).json({
                success: false,
                message: `Another provider with this ${field} already exists`,
                field
            });
        }

        res.status(500).json({
            success: false,
            message: "Error updating provider. Please try again later."
        });
    }
};

// ─── UPDATE PROVIDER STATUS ───────────────────────────────────────────────────
export const updateProviderStatus = async (req, res) => {
    try {
        if (!checkPermission(req.user.role, "update_status_providers")) {
            return res.status(403).json({ success: false, message: "Unauthorized access" });
        }

        const { id } = req.params;
        const { status } = req.body;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: "Invalid provider ID format" });
        }

        if (!status || !["active", "inactive"].includes(status.toLowerCase())) {
            return res.status(400).json({
                success: false,
                message: "Status must be 'active' or 'inactive'",
                field: "status"
            });
        }

        const updatedProvider = await Provider.findByIdAndUpdate(
            id,
            { status: status.toLowerCase() },
            { new: true, runValidators: true }
        ).select("id nit company name contact_phone email status");

        if (!updatedProvider) {
            return res.status(404).json({ success: false, message: "Provider not found" });
        }

        res.status(200).json({
            success: true,
            message: `Provider ${status === "active" ? "activated" : "deactivated"} successfully`,
            data: updatedProvider
        });
    } catch (error) {
        console.error("Error updating provider status:", error);
        res.status(500).json({
            success: false,
            message: "Error updating provider status. Please try again later."
        });
    }
};

// ─── DELETE PROVIDER ──────────────────────────────────────────────────────────
export const deleteProvider = async (req, res) => {
    try {
        if (!checkPermission(req.user.role, "delete_providers")) {
            return res.status(403).json({ success: false, message: "Unauthorized access" });
        }

        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: "Invalid provider ID format" });
        }

        const deletedProvider = await Provider.findByIdAndDelete(id);

        if (!deletedProvider) {
            return res.status(404).json({ success: false, message: "Provider not found" });
        }

        res.status(200).json({ success: true, message: "Provider deleted successfully" });
    } catch (error) {
        console.error("Error deleting provider:", error);
        res.status(500).json({
            success: false,
            message: "Error deleting provider. Please try again later."
        });
    }
};