import mongoose from "mongoose";
import Sale from "../models/sales.js";
import Product from "../models/product.js";
import Customer from "../models/customer.js";
import { checkPermission } from "../utils/permissions.js";

async function generateSaleId() {
    const lastSale = await Sale.findOne().sort({ createdAt: -1 });
    if (!lastSale || !/^Sa\d{2}$/.test(lastSale.id)) {
        return "Sa01";
    }

    const lastNumber = parseInt(lastSale.id.substring(2), 10);
    const nextNumber = (lastNumber + 1).toString().padStart(2, "0");
    return `Sa${nextNumber}`;
}

function validateSaleData(data, isUpdate = false) {
    const errors = [];
    
    if (!isUpdate) {
        if (!data.products || !Array.isArray(data.products) || data.products.length === 0) {
            errors.push("At least one product is required");
        }
        if (!data.customer) errors.push("Customer is required");
    }
    
    if (data.customer && !mongoose.Types.ObjectId.isValid(data.customer)) {
        errors.push("Invalid customer ID format");
    }
    
    if (data.products && Array.isArray(data.products)) {
        data.products.forEach((item, index) => {
            if (!item.product || !mongoose.Types.ObjectId.isValid(item.product)) {
                errors.push(`Invalid product at index ${index}`);
            }
            if (typeof item.quantity !== 'number' || !Number.isInteger(item.quantity) || item.quantity <= 0) {
                errors.push(`Invalid quantity at index ${index}. Must be a positive integer`);
            }
        });
    }
    
    if (data.salesDate !== undefined) {
        const dateRegex = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{3})?Z)?$/;
        if (!dateRegex.test(data.salesDate) && !(data.salesDate instanceof Date)) {
            errors.push("Invalid date format. Use YYYY-MM-DD or ISO format");
        }
    }
    
    return errors;
}

// GET: Retrieve all sales
export const getSales = async (req, res) => {
    try {        
        if (!req.user || !checkPermission(req.user.role, "view_sales")) {
            return res.status(403).json({ message: "Unauthorized access" });
        }

        console.log("Executing sales query");
        const sales = await Sale.find()
            .populate("customer", "name email phone")
            .populate("products.product", "name price");
        console.log(`Found ${sales.length} sales`);

        const formattedSales = sales.map(sale => {
            const saleObj = sale.toObject();
            
            if (saleObj.salesDate) {
                saleObj.salesDate = new Date(saleObj.salesDate).toISOString().split('T')[0];
            }
            
            return saleObj;
        });

        res.status(200).json(formattedSales);
    } catch (error) {
        console.error("Error fetching sales:", error);
        res.status(500).json({ message: "Server error", details: error.message });
    }
};

// GET: Retrieve a single sale by ID
export const getSaleById = async (req, res) => {
    try {
        if (!req.user || !checkPermission(req.user.role, "view_sales_id")) {
            return res.status(403).json({ message: "Unauthorized access" });
        }

        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: "Invalid sale ID format" });
        }

        const sale = await Sale.findById(id)
            .populate("customer", "name email phone")
            .populate("products.product", "name price");

        if (!sale) {
            return res.status(404).json({ message: "Sale not found" });
        }

        const formattedSale = sale.toObject();
        
        if (formattedSale.salesDate) {
            formattedSale.salesDate = new Date(formattedSale.salesDate).toISOString().split('T')[0];
        }

        res.status(200).json(formattedSale);
    } catch (error) {
        console.error("Error fetching sale:", error);
        res.status(500).json({ message: "Server error", details: error.message });
    }
};

// POST: Create new sale (solo registra la venta, no maneja estado)
export const postSale = async (req, res) => {
    try {
        if (!checkPermission(req.user.role, "create_sales")) {
            return res.status(403).json({ message: "Unauthorized access" });
        }

        const { products, customer, salesDate } = req.body;

        const validationErrors = validateSaleData(req.body);
        if (validationErrors.length > 0) {
            return res.status(400).json({ message: "Validation error", errors: validationErrors });
        }

        const existingCustomer = await Customer.findById(customer);
        if (!existingCustomer) {
            return res.status(404).json({ message: "Customer not found" });
        }

        let total = 0;
        let validatedProducts = [];

        for (let i = 0; i < products.length; i++) {
            const item = products[i];
            
            const foundProduct = await Product.findById(item.product);
            if (!foundProduct) {
                return res.status(404).json({ message: `Product not found at index ${i}` });
            }

            if (foundProduct.status !== "active") {
                return res.status(400).json({ message: `Cannot sell inactive product at index ${i}` });
            }

            // Usar el precio del producto automáticamente
            const sale_price = foundProduct.price;
            const itemTotal = sale_price * item.quantity;
            
            validatedProducts.push({
                product: item.product,
                quantity: item.quantity,
                sale_price: sale_price,
                total: itemTotal
            });
            
            total += itemTotal;
        }

        const id = await generateSaleId();

        const newSale = new Sale({
            id,
            customer,
            products: validatedProducts,
            salesDate: salesDate || new Date(),
            total
            // El estado se define en el modelo con default
        });

        await newSale.save();

        const formattedSale = newSale.toObject();
        
        if (formattedSale.salesDate) {
            formattedSale.salesDate = new Date(formattedSale.salesDate).toISOString().split('T')[0];
        }

        res.status(201).json({ 
            message: "Sale registered successfully", 
            sale: formattedSale 
        });
    } catch (error) {
        console.error("Error creating sale:", error);
        res.status(500).json({ message: "Server error", details: error.message });
    }
};

// PATCH: Update sale status (maneja estado y stock)
export const updateSaleStatus = async (req, res) => {
    try {
        if (!checkPermission(req.user.role, "update_status_sales")) {
            return res.status(403).json({ message: "Unauthorized access" });
        }

        const { id } = req.params;
        const { status } = req.body;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: "Invalid sale ID format" });
        }

        const validStatuses = ["pending", "processing", "completed", "cancelled"];
        if (!status || !validStatuses.includes(status)) {
            return res.status(400).json({ 
                message: "Status must be one of: pending, processing, completed, or cancelled" 
            });
        }

        const currentSale = await Sale.findById(id);
        
        if (!currentSale) {
            return res.status(404).json({ message: "Sale not found" });
        }
        
        // Validar transiciones de estado
        const allowedTransitions = {
            "pending": ["processing", "cancelled"],
            "processing": ["completed", "cancelled"],
            "completed": ["cancelled"],
            "cancelled": []
        };

        if (currentSale.status === "cancelled" && status !== "cancelled") {
            return res.status(400).json({ 
                message: "Cannot change status of a cancelled sale" 
            });
        }

        if (!allowedTransitions[currentSale.status].includes(status)) {
            return res.status(400).json({ 
                message: `Cannot change status from ${currentSale.status} to ${status}` 
            });
        }
        
        // Manejar cambios de stock según el estado
        if (currentSale.status !== status) {
            if (status === "cancelled") {
                // Restaurar stock al cancelar
                for (const item of currentSale.products) {
                    const product = await Product.findById(item.product);
                    if (product && currentSale.status !== "cancelled") {
                        await product.incrementStock(item.quantity);
                    }
                }
            }
            else if (currentSale.status === "pending" && status === "processing") {
                // Reducir stock al comenzar procesamiento
                for (const item of currentSale.products) {
                    const product = await Product.findById(item.product);
                    if (product) {
                        if (product.stock >= item.quantity) {
                            await product.decrementStock(item.quantity);
                        } else {
                            return res.status(400).json({
                                message: "Cannot process sale because the product no longer has sufficient stock available",
                                product: product.name
                            });
                        }
                    }
                }
            }
        }

        const updatedSale = await Sale.findByIdAndUpdate(
            id,
            { status },
            { new: true, runValidators: true }
        )
            .populate("customer", "name email phone")
            .populate("products.product", "name price");

        const formattedSale = updatedSale.toObject();
        
        if (formattedSale.salesDate) {
            formattedSale.salesDate = new Date(formattedSale.salesDate).toISOString().split('T')[0];
        }

        const statusMessages = {
            "pending": "Sale status updated to pending",
            "processing": "Sale is now being processed and stock has been reduced",
            "completed": "Sale has been completed successfully",
            "cancelled": "Sale has been cancelled and stock has been restored"
        };

        res.status(200).json({ 
            message: statusMessages[status],
            sale: formattedSale 
        });
    } catch (error) {
        console.error("Error updating sale status:", error);
        res.status(500).json({ message: "Server error", details: error.message });
    }
};

// DELETE: Remove a sale by ID
export const deleteSale = async (req, res) => {
    try {
        if (!checkPermission(req.user.role, "delete_sales")) {
            return res.status(403).json({ message: "Unauthorized access" });
        }

        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: "Invalid sale ID format" });
        }

        const saleToDelete = await Sale.findById(id);
        
        if (!saleToDelete) {
            return res.status(404).json({ message: "Sale not found" });
        }
        
        // Solo permitir eliminar si está en pending o cancelled
        if (!["pending", "cancelled"].includes(saleToDelete.status)) {
            return res.status(400).json({ 
                message: "Cannot delete sale that is already being processed or completed" 
            });
        }

        await Sale.findByIdAndDelete(id);

        res.status(200).json({ message: "Sale deleted successfully" });
    } catch (error) {
        console.error("Error deleting sale:", error);
        res.status(500).json({ message: "Server error", details: error.message });
    }
};