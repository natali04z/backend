import mongoose from "mongoose";
import Sale from "../models/sales.js";
import Product from "../models/product.js";
import Customer from "../models/customer.js";
import Branch from "../models/branches.js";
import { checkPermission } from "../utils/permissions.js";

// ===== FUNCIONES HELPER PARA FECHAS =====

/**
 * Convierte una fecha a formato YYYY-MM-DD respetando la zona horaria local
 * @param {Date|string} date - Fecha a convertir
 * @returns {string} Fecha en formato YYYY-MM-DD
 */
function formatLocalDate(date = new Date()) {
    const dateObj = date instanceof Date ? date : new Date(date);
    
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getDate()).padStart(2, '0');
    
    return `${year}-${month}-${day}`;
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

// Generar ID personalizado para la venta
async function generateSaleId() {
    try {
        const lastSale = await Sale.findOne()
            .sort({ id: -1 })
            .select('id');
            
        if (!lastSale || !lastSale.id || !/^Sa\d{2}$/.test(lastSale.id)) {
            const existingSa01 = await Sale.findOne({ id: "Sa01" });
            if (existingSa01) {
                return await findNextAvailableSaleId();
            }
            return "Sa01";
        }

        const lastNumber = parseInt(lastSale.id.substring(2), 10);
        let nextNumber = lastNumber + 1;
        let attempts = 0;
        const maxAttempts = 100;
        
        while (attempts < maxAttempts) {
            const candidateId = `Sa${String(nextNumber).padStart(2, "0")}`;
            
            const existing = await Sale.findOne({ id: candidateId });
            
            if (!existing) {
                return candidateId;
            }
            
            nextNumber++;
            attempts++;
        }
        
        const timestamp = Date.now().toString().slice(-4);
        return `Sa${timestamp}`;
        
    } catch (error) {
        const emergencyId = `Sa${Date.now().toString().slice(-4)}`;
        return emergencyId;
    }
}

async function findNextAvailableSaleId() {
    for (let i = 1; i <= 99; i++) {
        const candidateId = `Sa${String(i).padStart(2, "0")}`;
        const existing = await Sale.findOne({ id: candidateId });
        
        if (!existing) {
            return candidateId;
        }
    }
    
    // Si todos los números del 01 al 99 están ocupados
    const timestamp = Date.now().toString().slice(-4);
    return `Sa${timestamp}`;
}

// Función para validar datos de venta
function validateSaleData(data, isUpdate = false) {
    const errors = [];
    
    if (!isUpdate) {
        if (!data.products || !Array.isArray(data.products) || data.products.length === 0) {
            errors.push("At least one product is required");
        }
        if (!data.customer) {
            errors.push("Customer is required");
        }
        if (!data.branch) {
            errors.push("Branch is required");
        }
    }
    
    if (data.customer && !mongoose.Types.ObjectId.isValid(data.customer)) {
        errors.push("Invalid customer ID format");
    }
    
    if (data.branch && !mongoose.Types.ObjectId.isValid(data.branch)) {
        errors.push("Invalid branch ID format");
    }
    
    if (data.products && Array.isArray(data.products)) {
        data.products.forEach((item, index) => {
            if (!item.product || !mongoose.Types.ObjectId.isValid(item.product)) {
                errors.push(`Invalid product ID at index ${index}`);
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

// Función para validar disponibilidad de productos
async function validateProductsAvailability(products) {
    const validatedProducts = [];
    let total = 0;

    for (let i = 0; i < products.length; i++) {
        const item = products[i];
        
        if (!mongoose.Types.ObjectId.isValid(item.product)) {
            throw new Error(`Invalid product ID format at index ${i}`);
        }

        const foundProduct = await Product.findById(item.product);
        if (!foundProduct) {
            throw new Error(`Product not found at index ${i}`);
        }

        if (foundProduct.status !== "active") {
            throw new Error(`Cannot sell inactive product "${foundProduct.name}" at index ${i}`);
        }

        if (foundProduct.stock < item.quantity) {
            throw new Error(`Insufficient stock for product "${foundProduct.name}". Available: ${foundProduct.stock}, Requested: ${item.quantity}`);
        }

        const currentDate = new Date();
        if (foundProduct.expirationDate && foundProduct.expirationDate <= currentDate) {
            throw new Error(`Product "${foundProduct.name}" has expired and cannot be sold`);
        }

        const salePrice = foundProduct.price;
        const itemTotal = salePrice * item.quantity;
        
        validatedProducts.push({
            product: item.product,
            quantity: item.quantity,
            sale_price: salePrice,
            total: itemTotal,
            productName: foundProduct.name
        });
        
        total += itemTotal;
    }

    return { validatedProducts, total };
}

// Función auxiliar para verificar si una venta se puede modificar
export const canModifySale = (saleStatus) => {
    return !["completed", "cancelled"].includes(saleStatus);
};

// Obtener todas las ventas
export const getSales = async (req, res) => {
    try {        
        if (!req.user || !checkPermission(req.user.role, "view_sales")) {
            return res.status(403).json({ message: "Unauthorized access" });
        }

        const sales = await Sale.find()
            .populate("customer", "name lastname email phone")
            .populate("branch", "id name address")
            .populate("products.product", "id name price")
            .sort({ createdAt: -1 });

        const formattedSales = sales.map(sale => {
            const saleObj = sale.toObject();
            
            if (saleObj.salesDate) {
                saleObj.salesDate = formatLocalDate(saleObj.salesDate);
            }
            
            if (saleObj.products && Array.isArray(saleObj.products)) {
                saleObj.products = saleObj.products.map(item => {
                    return {
                        ...item,
                        quantity: item.quantity || 0
                    };
                });
            }
            
            return saleObj;
        });

        res.status(200).json(formattedSales);
    } catch (error) {
        console.error("Error fetching sales:", error);
        res.status(500).json({ message: "Server error", details: error.message });
    }
};

// Obtener una venta por ID
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
            .populate("customer", "name lastname email phone")
            .populate("branch", "id name address")
            .populate("products.product", "id name price");

        if (!sale) {
            return res.status(404).json({ message: "Sale not found" });
        }

        const formattedSale = sale.toObject();
        
        if (formattedSale.salesDate) {
            formattedSale.salesDate = formatLocalDate(formattedSale.salesDate);
        }
        
        if (formattedSale.products && Array.isArray(formattedSale.products)) {
            formattedSale.products = formattedSale.products.map(item => {
                return {
                    ...item,
                    quantity: item.quantity || 0
                };
            });
        }

        res.status(200).json(formattedSale);
    } catch (error) {
        console.error("Error fetching sale:", error);
        res.status(500).json({ message: "Server error", details: error.message });
    }
};

// Crear nueva venta
export const postSale = async (req, res) => {
    try {
        if (!checkPermission(req.user.role, "create_sales")) {
            return res.status(403).json({ message: "Unauthorized access" });
        }

        const { products, customer, branch, salesDate } = req.body;

        const validationErrors = validateSaleData(req.body);
        if (validationErrors.length > 0) {
            return res.status(400).json({ 
                message: "Validation error", 
                errors: validationErrors 
            });
        }

        const existingCustomer = await Customer.findById(customer);
        if (!existingCustomer) {
            return res.status(404).json({ message: "Customer not found" });
        }

        if (existingCustomer.status !== "active") {
            return res.status(400).json({ 
                message: "Cannot create sale for inactive customer" 
            });
        }

        const existingBranch = await Branch.findById(branch);
        if (!existingBranch) {
            return res.status(404).json({ message: "Branch not found" });
        }

        if (existingBranch.status !== "active") {
            return res.status(400).json({ 
                message: "Cannot create sale for inactive branch" 
            });
        }

        const { validatedProducts, total } = await validateProductsAvailability(products);

        // Reservar stock al crear la venta (processing)
        for (const item of validatedProducts) {
            await Product.findByIdAndUpdate(
                item.product,
                { $inc: { stock: -item.quantity } },
                { new: true, runValidators: true }
            );
        }

        const saleId = await generateSaleId();

        const saleDate = salesDate ? parseLocalDate(salesDate) : new Date();

        const newSale = new Sale({
            id: saleId,
            customer,
            branch,
            products: validatedProducts.map(item => ({
                product: item.product,
                quantity: item.quantity,
                sale_price: item.sale_price,
                total: item.total
            })),
            salesDate: saleDate,
            total,
            status: "processing"
        });

        await newSale.save();

        const createdSale = await Sale.findById(newSale._id)
            .populate("customer", "name lastname email phone")
            .populate("branch", "id name address")
            .populate("products.product", "id name price");

        const formattedSale = createdSale.toObject();
        
        if (formattedSale.salesDate) {
            formattedSale.salesDate = formatLocalDate(formattedSale.salesDate);
        }

        res.status(201).json({ 
            message: "Sale created successfully and stock has been reserved for processing.", 
            sale: formattedSale 
        });

    } catch (error) {
        console.error("Error creating sale:", error);
        
        if (error.code === 11000 && error.keyPattern?.id) {
            return res.status(409).json({ 
                message: "Sale ID conflict, please try again"
            });
        }
        
        if (error.message.includes("Invalid product") || 
            error.message.includes("not found") || 
            error.message.includes("Insufficient stock") ||
            error.message.includes("expired")) {
            return res.status(400).json({ message: error.message });
        }
        
        res.status(500).json({ message: "Server error", details: error.message });
    }
};

// Actualizar estado de venta
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

        const validStatuses = ["processing", "completed", "cancelled"];
        if (!status || !validStatuses.includes(status)) {
            return res.status(400).json({ 
                message: "Status must be one of: processing, completed, or cancelled" 
            });
        }

        const currentSale = await Sale.findById(id);
        
        if (!currentSale) {
            return res.status(404).json({ message: "Sale not found" });
        }

        if (currentSale.status === "completed") {
            return res.status(400).json({ 
                message: "Cannot change status of a completed sale." 
            });
        }

        if (currentSale.status === "cancelled") {
            return res.status(400).json({ 
                message: "Cannot change status of a cancelled sale." 
            });
        }

        if (currentSale.status === status) {
            return res.status(400).json({ 
                message: `Sale is already in ${status} status` 
            });
        }
        
        const allowedTransitions = {
            "processing": ["completed", "cancelled"],
            "completed": [],
            "cancelled": []
        };

        if (!allowedTransitions[currentSale.status].includes(status)) {
            return res.status(400).json({
                message: `Cannot change status from ${currentSale.status} to ${status}. Allowed transitions from ${currentSale.status}: ${allowedTransitions[currentSale.status].join(', ') || 'none'}`
            });
        }

        // Manejar stock según el cambio de estado
        if (currentSale.status === "processing") {
            if (status === "cancelled") {
                // De processing a cancelled: Restaurar stock reservado
                for (const item of currentSale.products) {
                    const product = await Product.findById(item.product);
                    if (!product) {
                        return res.status(404).json({
                            message: `Product not found in sale`
                        });
                    }

                    await Product.findByIdAndUpdate(
                        item.product,
                        { $inc: { stock: item.quantity } },
                        { new: true }
                    );
                }
            }
        }

        const updatedSale = await Sale.findByIdAndUpdate(
            id,
            { 
                status,
                ...(status === "completed" && { completedAt: new Date() }),
                ...(status === "cancelled" && { cancelledAt: new Date() })
            },
            { new: true, runValidators: true }
        )
            .populate("customer", "name lastname email phone")
            .populate("branch", "id name address")
            .populate("products.product", "id name price");

        const formattedSale = updatedSale.toObject();
        
        if (formattedSale.salesDate) {
            formattedSale.salesDate = formatLocalDate(formattedSale.salesDate);
        }

        const statusMessages = {
            "processing": "Sale is being processed with stock reserved", 
            "completed": "Sale completed successfully - stock consumed permanently",
            "cancelled": "Sale cancelled - reserved stock has been restored"
        };

        res.status(200).json({ 
            message: statusMessages[status],
            sale: formattedSale,
            isFinalStatus: ["completed", "cancelled"].includes(status)
        });

    } catch (error) {
        console.error("Error updating sale status:", error);
        res.status(500).json({ message: "Server error", details: error.message });
    }
};

// Eliminar una venta
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
        
        if (!["processing", "cancelled"].includes(saleToDelete.status)) {
            return res.status(400).json({ 
                message: "Cannot delete sale that is completed. Only processing or cancelled sales can be deleted." 
            });
        }

        // Restaurar stock reservado si la venta estaba en processing
        if (saleToDelete.status === "processing") {
            for (const item of saleToDelete.products) {
                await Product.findByIdAndUpdate(
                    item.product,
                    { $inc: { stock: item.quantity } },
                    { new: true }
                );
            }
        }

        await Sale.findByIdAndDelete(id);

        res.status(200).json({ 
            message: "Sale deleted successfully" + 
                    (saleToDelete.status === "processing" ? " and reserved stock restored" : "")
        });

    } catch (error) {
        console.error("Error deleting sale:", error);
        res.status(500).json({ message: "Server error", details: error.message });
    }
};