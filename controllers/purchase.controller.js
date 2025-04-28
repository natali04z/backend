import mongoose from "mongoose";
import Purchase from "../models/purchase.js";
import Product from "../models/product.js";
import { checkPermission } from "../utils/permissions.js";
import { generatePdfReport, generateExcelReport } from "../utils/report-exporters.js";

// Function to generate purchase ID
async function generatePurchaseId() {
    const lastPurchase = await Purchase.findOne().sort({ createdAt: -1 });
    if (!lastPurchase || !/^Pu\d{2}$/.test(lastPurchase.id)) {
        return "Pu01";
    }

    const lastNumber = parseInt(lastPurchase.id.substring(2), 10);
    const nextNumber = (lastNumber + 1).toString().padStart(2, "0");
    return `Pu${nextNumber}`;
}

// Validate purchase data
function validatePurchaseData(data, isUpdate = false) {
    const errors = [];
    
    // Only validate required fields if it's not an update
    if (!isUpdate) {
        if (!data.product) errors.push("Product is required");
        if (data.total === undefined) errors.push("Total is required");
        if (!data.details) errors.push("Details are required");
    }
    
    // Validate product ID if provided
    if (data.product && !mongoose.Types.ObjectId.isValid(data.product)) {
        errors.push("Invalid product ID format");
    }
    
    // Validate numeric fields
    if (data.total !== undefined) {
        if (typeof data.total !== "number") {
            errors.push("Total must be a number");
        } else if (data.total <= 0) {
            errors.push("Total must be a positive number");
        }
    }
    
    // Validate date if provided
    if (data.purchaseDate !== undefined) {
        const dateRegex = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{3})?Z)?$/;
        if (!dateRegex.test(data.purchaseDate) && !(data.purchaseDate instanceof Date)) {
            errors.push("Invalid date format. Use YYYY-MM-DD or ISO format");
        }
    }
    
    // Validate string fields
    if (data.details !== undefined && (typeof data.details !== "string" || data.details.trim() === "")) {
        errors.push("Details must be a non-empty string");
    }
    
    // Validate status if provided
    if (data.status !== undefined && !["active", "inactive"].includes(data.status)) {
        errors.push("Status must be either 'active' or 'inactive'");
    }
    
    return errors;
}

// GET: Retrieve all purchases
export const getPurchases = async (req, res) => {
    try {        
        // Verificar si req.user existe antes de acceder a su propiedad role
        if (!req.user || !checkPermission(req.user.role, "view_purchases")) {
            return res.status(403).json({ message: "Unauthorized access" });
        }

        // Consultar todas las compras
        console.log("Ejecutando consulta de compras");
        const purchases = await Purchase.find();
        console.log(`Encontradas ${purchases.length} compras`);

        // Formato para la respuesta, manejar tanto la estructura antigua como la nueva
        const formattedPurchases = purchases.map(purchase => {
            const purchaseObj = purchase.toObject();
            
            // Formatear la fecha de compra
            if (purchaseObj.purchaseDate) {
                purchaseObj.purchaseDate = new Date(purchaseObj.purchaseDate).toISOString().split('T')[0];
            }
            
            // Manejar el caso donde tenemos un array de productos (nueva estructura)
            if (Array.isArray(purchaseObj.products)) {
                // Ya tenemos la estructura correcta, pero podríamos formatear algo si es necesario
            } 
            // Manejar el caso donde tenemos una referencia simple a producto (estructura antigua)
            else if (purchaseObj.product) {
                // Convertir la estructura antigua a la nueva para mantener consistencia
                purchaseObj.products = [{
                    product: purchaseObj.product,
                    quantity: 1,
                    price: purchaseObj.total,
                    total: purchaseObj.total
                }];
                // Podríamos eliminar el campo antiguo si queremos
                // delete purchaseObj.product;
            }
            
            return purchaseObj;
        });

        res.status(200).json(formattedPurchases);
    } catch (error) {
        console.error("Error fetching purchases:", error);
        res.status(500).json({ message: "Server error", details: error.message });
    }
};

// GET: Retrieve a single purchase by ID
export const getPurchaseById = async (req, res) => {
    try {
        // Verificar si req.user existe antes de acceder a su propiedad role
        if (!req.user || !checkPermission(req.user.role, "view_purchases_id")) {
            return res.status(403).json({ message: "Unauthorized access" });
        }

        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: "Invalid purchase ID format" });
        }

        const purchase = await Purchase.findById(id);

        if (!purchase) {
            return res.status(404).json({ message: "Purchase not found" });
        }

        // Formatear la respuesta según la estructura de la compra
        const formattedPurchase = purchase.toObject();
        
        // Formatear la fecha de compra
        if (formattedPurchase.purchaseDate) {
            formattedPurchase.purchaseDate = new Date(formattedPurchase.purchaseDate).toISOString().split('T')[0];
        }
        
        // Si existe el array de productos, poblar información de cada producto
        if (Array.isArray(formattedPurchase.products)) {
            // Opcionalmente podríamos poblar información adicional de los productos
            // Podría requerir consultas adicionales
        }

        res.status(200).json(formattedPurchase);
    } catch (error) {
        console.error("Error fetching purchase:", error);
        res.status(500).json({ message: "Server error", details: error.message });
    }
};

// POST: Create new purchase
export const postPurchase = async (req, res) => {
    try {
        if (!checkPermission(req.user.role, "create_purchases")) {
            return res.status(403).json({ message: "Unauthorized access" });
        }

        const { products, details, purchaseDate, status = "active" } = req.body;

        // Validate status
        if (!["active", "inactive"].includes(status)) {
            return res.status(400).json({ message: "Status must be either 'active' or 'inactive'" });
        }

        // Validate if products array exists and is not empty
        if (!Array.isArray(products) || products.length === 0) {
            return res.status(400).json({ message: "At least one product is required" });
        }

        // Initialize total
        let total = 0;
        let validatedProducts = [];

        // Validate and process each product
        for (let i = 0; i < products.length; i++) {
            const item = products[i];
            
            // Check product ID
            if (!item.product || !mongoose.Types.ObjectId.isValid(item.product)) {
                return res.status(400).json({ message: `Invalid product ID at index ${i}` });
            }

            // Find product in database
            const foundProduct = await Product.findById(item.product);
            if (!foundProduct) {
                return res.status(404).json({ message: `Product not found at index ${i}` });
            }

            // Verificar si el producto está activo
            if (foundProduct.status !== "active") {
                return res.status(400).json({ message: `Cannot use inactive product at index ${i}` });
            }

            // Validate quantity
            if (!item.quantity || typeof item.quantity !== 'number' || item.quantity <= 0) {
                return res.status(400).json({ message: `Invalid quantity at index ${i}` });
            }

            // Calculate item total
            const itemPrice = foundProduct.price;
            const itemTotal = itemPrice * item.quantity;
            
            // Add to validated products
            validatedProducts.push({
                product: item.product,
                quantity: item.quantity,
                price: itemPrice,
                total: itemTotal
            });
            
            // Add to overall total
            total += itemTotal;
        }

        // Generate purchase ID
        const id = await generatePurchaseId();

        // Create new purchase
        const newPurchase = new Purchase({
            id,
            products: validatedProducts,
            details: details || "Purchase details not provided",
            purchaseDate: purchaseDate || new Date(),
            total,
            status
        });

        // Save to database
        await newPurchase.save();

        // Format the response
        const formattedPurchase = newPurchase.toObject();
        if (formattedPurchase.purchaseDate) {
            formattedPurchase.purchaseDate = new Date(formattedPurchase.purchaseDate).toISOString().split('T')[0];
        }

        res.status(201).json({ 
            message: "Purchase created successfully", 
            purchase: formattedPurchase 
        });
    } catch (error) {
        console.error("Error creating purchase:", error);
        res.status(500).json({ message: "Server error", details: error.message });
    }
};

// PUT: Update an existing purchase
export const updatePurchase = async (req, res) => {
    try {
        if (!checkPermission(req.user.role, "update_purchases")) {
            return res.status(403).json({ message: "Unauthorized access" });
        }

        const { id } = req.params;
        const { product, purchaseDate, total, details, status } = req.body;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: "Invalid purchase ID format" });
        }

        // Validate input data (with isUpdate flag)
        const validationErrors = validatePurchaseData(req.body, true);
        if (validationErrors.length > 0) {
            return res.status(400).json({ message: "Validation failed", errors: validationErrors });
        }

        let updateFields = {};

        // Check and update product if provided
        if (product) {
            const existingProduct = await Product.findById(product);
            if (!existingProduct) {
                return res.status(404).json({ message: "Product not found" });
            }
            
            // Verificar si el producto está activo
            if (existingProduct.status !== "active") {
                return res.status(400).json({ message: "Cannot use inactive product" });
            }
            
            updateFields.product = product;
        }

        // Update other fields if provided
        if (purchaseDate !== undefined) updateFields.purchaseDate = purchaseDate;
        if (total !== undefined) updateFields.total = total;
        if (details !== undefined) updateFields.details = details;
        if (status !== undefined) updateFields.status = status;
        
        // Check if there are fields to update
        if (Object.keys(updateFields).length === 0) {
            return res.status(400).json({ message: "No valid fields to update" });
        }

        const updatedPurchase = await Purchase.findByIdAndUpdate(id, updateFields, {
            new: true,
            runValidators: true
        })
            .select("id product purchaseDate total details status")
            .populate("product", "name");

        if (!updatedPurchase) {
            return res.status(404).json({ message: "Purchase not found" });
        }

        // Format the date in the response
        const formattedPurchase = updatedPurchase.toObject();
        if (formattedPurchase.purchaseDate) {
            formattedPurchase.purchaseDate = new Date(formattedPurchase.purchaseDate).toISOString().split('T')[0];
        }

        res.status(200).json({ message: "Purchase updated successfully", purchase: formattedPurchase });
    } catch (error) {
        console.error("Error updating purchase:", error);
        
        // Handle Mongoose validation errors
        if (error.name === 'ValidationError') {
            const errors = Object.values(error.errors).map(err => err.message);
            return res.status(400).json({ message: "Validation failed", errors });
        }
        
        res.status(500).json({ message: "Server error" });
    }
};

// Update purchase status
export const updatePurchaseStatus = async (req, res) => {
    try {
        if (!checkPermission(req.user.role, "update_status_purchases")) {
            return res.status(403).json({ message: "Unauthorized access" });
        }

        const { id } = req.params;
        const { status } = req.body;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: "Invalid purchase ID format" });
        }

        if (!status || !["active", "inactive"].includes(status)) {
            return res.status(400).json({ message: "Status must be either 'active' or 'inactive'" });
        }

        const updatedPurchase = await Purchase.findByIdAndUpdate(
            id,
            { status },
            { new: true, runValidators: true }
        )
            .select("id product purchaseDate total details status")
            .populate("product", "name");

        if (!updatedPurchase) {
            return res.status(404).json({ message: "Purchase not found" });
        }

        // Format the date in the response
        const formattedPurchase = updatedPurchase.toObject();
        if (formattedPurchase.purchaseDate) {
            formattedPurchase.purchaseDate = new Date(formattedPurchase.purchaseDate).toISOString().split('T')[0];
        }

        res.status(200).json({ 
            message: `Purchase ${status === 'active' ? 'activated' : 'deactivated'} successfully`, 
            purchase: formattedPurchase 
        });
    } catch (error) {
        console.error("Error updating purchase status:", error);
        res.status(500).json({ message: "Server error", details: error.message });
    }
};

// DELETE: Remove a purchase by ID
export const deletePurchase = async (req, res) => {
    try {
        if (!checkPermission(req.user.role, "delete_purchases")) {
            return res.status(403).json({ message: "Unauthorized access" });
        }

        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: "Invalid purchase ID format" });
        }

        const deletedPurchase = await Purchase.findByIdAndDelete(id);

        if (!deletedPurchase) {
            return res.status(404).json({ message: "Purchase not found" });
        }

        res.status(200).json({ message: "Purchase deleted successfully" });
    } catch (error) {
        console.error("Error deleting purchase:", error);
        res.status(500).json({ message: "Server error" });
    }
};

// Exportar compras a PDF
export const exportPurchaseToPdf = async (req, res) => {
    try {
        if (!checkPermission(req.user.role, "view_purchases")) {
            return res.status(403).json({ message: "You don't have permission to generate reports" });
        }

        const { startDate, endDate, productId, status } = req.query;
        
        if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
            return res.status(400).json({ 
                message: "Start date cannot be later than end date" 
            });
        }
        
        // Build query
        let query = {};
        
        if (startDate || endDate) {
            query.purchaseDate = {};
            if (startDate) query.purchaseDate.$gte = new Date(startDate);
            if (endDate) query.purchaseDate.$lte = new Date(endDate);
        }
        
        if (productId && mongoose.Types.ObjectId.isValid(productId)) {
            query.product = productId;
        }
        
        // Agregar filtro de estado si se proporciona
        if (status && ["active", "inactive"].includes(status)) {
            query.status = status;
        }

        // Get data
        const purchases = await Purchase.find(query)
            .sort({ purchaseDate: -1 })
            .populate("product", "name price")
            .lean();
            
        if (purchases.length === 0) {
            return res.status(404).json({ 
                message: "No purchases found with the specified criteria" 
            });
        }

        const companyName = "IceSoft";
        let productInfo = null;
        
        if (productId && mongoose.Types.ObjectId.isValid(productId)) {
            productInfo = await Product.findById(productId).lean();
        }

        // Configure headers for PDF download
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=purchases-report-${Date.now()}.pdf`);

        // Prepare options for the PDF report
        const reportOptions = {
            data: purchases,
            title: "Purchase Report",
            companyName: companyName,
            filters: {
                startDate,
                endDate,
                product: productInfo ? productInfo.name : "All",
                status: status || "All"
            },
            columns: [
                { header: "ID", key: "id", width: 80 },
                { header: "Date", key: "purchaseDate", width: 100, type: "date" },
                { header: "Product", key: "productName", width: 200 },
                { header: "Total", key: "total", width: 120, align: "right", type: "currency" },
                { header: "Status", key: "status", width: 80 }
            ],
            formatData: (purchase) => {
                // Format each row data
                return {
                    id: purchase.id || purchase._id?.toString().substring(0, 8) || "N/A",
                    purchaseDate: purchase.purchaseDate ? new Date(purchase.purchaseDate) : null,
                    productName: purchase.product?.name || "Unknown",
                    total: purchase.total || 0,
                    status: purchase.status || "N/A"
                };
            },
            calculateSummary: (data) => {
                // Calculate summary information
                const totalAmount = data.reduce((sum, purchase) => sum + (purchase.total || 0), 0);
                return {
                    count: data.length,
                    totalAmount
                };
            },
            filename: `purchases-report-${Date.now()}.pdf`
        };
        
        try {
            await generatePdfReport(reportOptions, res);
        } catch (pdfError) {
            console.error("Error generating PDF:", pdfError);
            
            if (!res.headersSent) {
                return res.status(500).json({ 
                    message: "Error generating PDF report", 
                    error: pdfError.message 
                });
            }
        }
        
    } catch (error) {
        console.error("Error generating PDF report:", error);
        
        if (!res.headersSent) {
            return res.status(500).json({ 
                message: "Error generating PDF report", 
                error: error.message
            });
        }
    }
};

// Exportar compras a Excel
export const exportPurchaseToExcel = async (req, res) => {
    try {
        if (!checkPermission(req.user.role, "view_purchases")) {
            return res.status(403).json({ message: "You don't have permission to generate reports" });
        }

        const { startDate, endDate, productId, status } = req.query;
        
        if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
            return res.status(400).json({ 
                message: "Start date cannot be later than end date" 
            });
        }
        
        // Build query
        let query = {};
        
        if (startDate || endDate) {
            query.purchaseDate = {};
            if (startDate) query.purchaseDate.$gte = new Date(startDate);
            if (endDate) query.purchaseDate.$lte = new Date(endDate);
        }
        
        if (productId && mongoose.Types.ObjectId.isValid(productId)) {
            query.product = productId;
        }
        
        // Agregar filtro de estado si se proporciona
        if (status && ["active", "inactive"].includes(status)) {
            query.status = status;
        }

        // Get data
        const purchases = await Purchase.find(query)
            .sort({ purchaseDate: -1 })
            .populate("product", "name price")
            .lean();
            
        if (purchases.length === 0) {
            return res.status(404).json({ 
                message: "No purchases found with the specified criteria" 
            });
        }

        const companyName = "IceSoft";
        let productInfo = null;
        
        if (productId && mongoose.Types.ObjectId.isValid(productId)) {
            productInfo = await Product.findById(productId).lean();
        }

        // Configure headers for Excel download
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=purchases-report-${Date.now()}.xlsx`);

        // Prepare options for the Excel report (using the same structure as PDF)
        const reportOptions = {
            data: purchases,
            title: "Purchase Report",
            companyName: companyName,
            filters: {
                startDate,
                endDate,
                product: productInfo ? productInfo.name : "All",
                status: status || "All"
            },
            columns: [
                { header: "ID", key: "id", width: 15 },
                { header: "Date", key: "purchaseDate", width: 15, type: "date" },
                { header: "Product", key: "productName", width: 30 },
                { header: "Total", key: "total", width: 20, align: "right", type: "currency" },
                { header: "Status", key: "status", width: 15 }
            ],
            formatData: (purchase) => {
                // Format each row data
                return {
                    id: purchase.id || purchase._id?.toString().substring(0, 8) || "N/A",
                    purchaseDate: purchase.purchaseDate ? new Date(purchase.purchaseDate) : null,
                    productName: purchase.product?.name || "Unknown",
                    total: purchase.total || 0,
                    status: purchase.status || "N/A"
                };
            },
            calculateSummary: (data) => {
                // Calculate summary information
                const totalAmount = data.reduce((sum, purchase) => sum + (purchase.total || 0), 0);
                return {
                    count: data.length,
                    totalAmount
                };
            },
            filename: `purchases-report-${Date.now()}.xlsx`
        };
        
        try {
            await generateExcelReport(reportOptions, res);
            console.log("Excel file generated and sent successfully");
        } catch (excelError) {
            console.error("Error generating Excel file:", excelError);
            
            if (!res.headersSent) {
                return res.status(500).json({ 
                    message: "Error generating Excel report", 
                    error: excelError.message 
                });
            }
        }
        
    } catch (error) {
        console.error("Error generating Excel report:", error);
        
        if (!res.headersSent) {
            return res.status(500).json({ 
                message: "Error generating Excel report", 
                error: error.message
            });
        }
    }
};