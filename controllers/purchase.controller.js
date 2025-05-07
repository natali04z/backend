import mongoose from "mongoose";
import Purchase from "../models/purchase.js";
import Product from "../models/product.js";
import Provider from "../models/provider.js";
import { checkPermission } from "../utils/permissions.js";
import { generatePdfReport, generateExcelReport } from "../utils/report-exporters.js";

async function generatePurchaseId() {
    const lastPurchase = await Purchase.findOne().sort({ createdAt: -1 });
    if (!lastPurchase || !/^Pu\d{2}$/.test(lastPurchase.id)) {
        return "Pu01";
    }

    const lastNumber = parseInt(lastPurchase.id.substring(2), 10);
    const nextNumber = (lastNumber + 1).toString().padStart(2, "0");
    return `Pu${nextNumber}`;
}

function validatePurchaseData(data, isUpdate = false) {
    const errors = [];
    
    if (!isUpdate) {
        if (!data.products || !Array.isArray(data.products) || data.products.length === 0) {
            errors.push("At least one product is required");
        }
        if (!data.provider) errors.push("Provider is required");
    }
    
    if (data.provider && !mongoose.Types.ObjectId.isValid(data.provider)) {
        errors.push("Invalid provider ID format");
    }
    
    if (data.products && Array.isArray(data.products)) {
        data.products.forEach((item, index) => {
            if (!item.product || !mongoose.Types.ObjectId.isValid(item.product)) {
                errors.push(`Invalid product at index ${index}`);
            }
            if (typeof item.quantity !== 'number' || !Number.isInteger(item.quantity) || item.quantity <= 0) {
                errors.push(`Invalid quantity at index ${index}. Must be a positive integer`);
            }
            if (typeof item.purchase_price !== 'number' || item.purchase_price <= 0) {
                errors.push(`Invalid purchase price at index ${index}. Must be a positive number`);
            }
        });
    }
    
    if (data.purchase_date !== undefined) {
        const dateRegex = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{3})?Z)?$/;
        if (!dateRegex.test(data.purchase_date) && !(data.purchase_date instanceof Date)) {
            errors.push("Invalid date format. Use YYYY-MM-DD or ISO format");
        }
    }
    
    return errors;
}

// GET: Retrieve all purchases
export const getPurchases = async (req, res) => {
    try {        
        if (!req.user || !checkPermission(req.user.role, "view_purchases")) {
            return res.status(403).json({ message: "Unauthorized access" });
        }

        console.log("Executing purchase query");
        const purchases = await Purchase.find()
            .populate("provider", "name")
            .populate("products.product", "name price");
        console.log(`Found ${purchases.length} purchases`);

        const formattedPurchases = purchases.map(purchase => {
            const purchaseObj = purchase.toObject();
            
            if (purchaseObj.purchase_date) {
                purchaseObj.purchase_date = new Date(purchaseObj.purchase_date).toISOString().split('T')[0];
            }
            
            // Ensure quantity is included for each product
            if (purchaseObj.products && Array.isArray(purchaseObj.products)) {
                purchaseObj.products = purchaseObj.products.map(item => {
                    // Explicitly include quantity in the response
                    return {
                        ...item,
                        quantity: item.quantity || 0
                    };
                });
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
        if (!req.user || !checkPermission(req.user.role, "view_purchases_id")) {
            return res.status(403).json({ message: "Unauthorized access" });
        }

        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: "Invalid purchase ID format" });
        }

        const purchase = await Purchase.findById(id)
            .populate("provider", "company")
            .populate("products.product", "name price");

        if (!purchase) {
            return res.status(404).json({ message: "Purchase not found" });
        }

        const formattedPurchase = purchase.toObject();
        
        if (formattedPurchase.purchase_date) {
            formattedPurchase.purchase_date = new Date(formattedPurchase.purchase_date).toISOString().split('T')[0];
        }
        
        // Ensure quantity is included for each product
        if (formattedPurchase.products && Array.isArray(formattedPurchase.products)) {
            formattedPurchase.products = formattedPurchase.products.map(item => {
                // Explicitly include quantity in the response
                return {
                    ...item,
                    quantity: item.quantity || 0
                };
            });
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

        const { products, provider, purchase_date } = req.body;
        // Status is active by default in the model

        // Data validation
        const validationErrors = validatePurchaseData(req.body);
        if (validationErrors.length > 0) {
            return res.status(400).json({ message: "Validation error", errors: validationErrors });
        }

        // Verify provider
        const existingProvider = await Provider.findById(provider);
        if (!existingProvider) {
            return res.status(404).json({ message: "Provider not found" });
        }

        // Process products
        let total = 0;
        let validatedProducts = [];

        for (let i = 0; i < products.length; i++) {
            const item = products[i];
            
            // Verify product
            const foundProduct = await Product.findById(item.product);
            if (!foundProduct) {
                return res.status(404).json({ message: `Product not found at index ${i}` });
            }

            if (foundProduct.status !== "active") {
                return res.status(400).json({ message: `Cannot use inactive product at index ${i}` });
            }

            // Calculate total
            const itemTotal = item.purchase_price * item.quantity;
            
            validatedProducts.push({
                product: item.product,
                quantity: item.quantity,
                purchase_price: item.purchase_price,
                total: itemTotal
            });
            
            total += itemTotal;

            // Increment product stock - purchases are active by default
            await foundProduct.incrementStock(item.quantity);
        }

        // Generate unique ID
        const id = await generatePurchaseId();

        // Create new purchase
        const newPurchase = new Purchase({
            id,
            provider,
            products: validatedProducts,
            purchase_date: purchase_date || new Date(),
            total
            // Status is active by default in the model
        });

        await newPurchase.save();

        const formattedPurchase = newPurchase.toObject();
        
        if (formattedPurchase.purchase_date) {
            formattedPurchase.purchase_date = new Date(formattedPurchase.purchase_date).toISOString().split('T')[0];
        }

        res.status(201).json({ 
            message: "Purchase created successfully and product stock updated", 
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
        const { provider, purchase_date } = req.body;
        // Status is handled in its own dedicated method

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: "Invalid purchase ID format" });
        }

        // Data validation
        const validationErrors = validatePurchaseData(req.body, true);
        if (validationErrors.length > 0) {
            return res.status(400).json({ message: "Validation error", errors: validationErrors });
        }

        let updateFields = {};

        // Verify fields to update
        if (provider) {
            const existingProvider = await Provider.findById(provider);
            if (!existingProvider) {
                return res.status(404).json({ message: "Provider not found" });
            }
            updateFields.provider = provider;
        }

        if (purchase_date !== undefined) updateFields.purchase_date = purchase_date;
        
        if (Object.keys(updateFields).length === 0) {
            return res.status(400).json({ message: "No valid fields to update" });
        }

        // We don't allow updating products to avoid stock inconsistencies
        const updatedPurchase = await Purchase.findByIdAndUpdate(id, updateFields, {
            new: true,
            runValidators: true
        })
            .populate("provider", "company")
            .populate("products.product", "name price");

        if (!updatedPurchase) {
            return res.status(404).json({ message: "Purchase not found" });
        }

        const formattedPurchase = updatedPurchase.toObject();
        
        if (formattedPurchase.purchase_date) {
            formattedPurchase.purchase_date = new Date(formattedPurchase.purchase_date).toISOString().split('T')[0];
        }

        res.status(200).json({ message: "Purchase updated successfully", purchase: formattedPurchase });
    } catch (error) {
        console.error("Error updating purchase:", error);
        
        if (error.name === 'ValidationError') {
            const errors = Object.values(error.errors).map(err => err.message);
            return res.status(400).json({ message: "Validation error", errors });
        }
        
        res.status(500).json({ message: "Server error", details: error.message });
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

        // Get current purchase to check its previous state
        const currentPurchase = await Purchase.findById(id);
        
        if (!currentPurchase) {
            return res.status(404).json({ message: "Purchase not found" });
        }
        
        // Only update stock if status is changing
        if (currentPurchase.status !== status) {
            // If changing from active to inactive, decrement stock
            if (currentPurchase.status === "active" && status === "inactive") {
                for (const item of currentPurchase.products) {
                    const product = await Product.findById(item.product);
                    if (product) {
                        if (product.stock >= item.quantity) {
                            await product.decrementStock(item.quantity);
                        } else {
                            return res.status(400).json({
                                message: "Cannot deactivate purchase because the product no longer has sufficient stock available",
                                product: product.name
                            });
                        }
                    }
                }
            } 
            // If changing from inactive to active, increment stock
            else if (currentPurchase.status === "inactive" && status === "active") {
                for (const item of currentPurchase.products) {
                    const product = await Product.findById(item.product);
                    if (product) {
                        await product.incrementStock(item.quantity);
                    }
                }
            }
        }

        // Update purchase status
        const updatedPurchase = await Purchase.findByIdAndUpdate(
            id,
            { status },
            { new: true, runValidators: true }
        )
            .populate("provider", "company")
            .populate("products.product", "name price");

        const formattedPurchase = updatedPurchase.toObject();
        
        if (formattedPurchase.purchase_date) {
            formattedPurchase.purchase_date = new Date(formattedPurchase.purchase_date).toISOString().split('T')[0];
        }

        res.status(200).json({ 
            message: `Purchase ${status === 'active' ? 'activated' : 'deactivated'} successfully and stock updated`, 
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

        // Find purchase before deleting to update stock
        const purchaseToDelete = await Purchase.findById(id);
        
        if (!purchaseToDelete) {
            return res.status(404).json({ message: "Purchase not found" });
        }
        
        // Revert stock increases made by the purchase
        if (purchaseToDelete.status === "active" && purchaseToDelete.products && Array.isArray(purchaseToDelete.products)) {
            for (const item of purchaseToDelete.products) {
                const product = await Product.findById(item.product);
                if (product) {
                    // Check if there's enough stock to decrement
                    if (product.stock >= item.quantity) {
                        await product.decrementStock(item.quantity);
                    } else {
                        return res.status(400).json({ 
                            message: "Cannot delete purchase because the product no longer has sufficient stock available", 
                            product: product.name
                        });
                    }
                }
            }
        }

        // Delete the purchase
        await Purchase.findByIdAndDelete(id);

        res.status(200).json({ message: "Purchase deleted successfully and stock updated" });
    } catch (error) {
        console.error("Error deleting purchase:", error);
        res.status(500).json({ message: "Server error", details: error.message });
    }
};

// Export purchases to PDF
export const exportPurchaseToPdf = async (req, res) => {
    try {
        if (!checkPermission(req.user.role, "view_purchases")) {
            return res.status(403).json({ message: "You don't have permission to generate reports" });
        }

        const { startDate, endDate, providerId, productId, status } = req.query;
        
        if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
            return res.status(400).json({ 
                message: "Start date cannot be later than end date" 
            });
        }
        
        // Build query
        let query = {};
        
        if (startDate || endDate) {
            query.purchase_date = {};
            if (startDate) query.purchase_date.$gte = new Date(startDate);
            if (endDate) query.purchase_date.$lte = new Date(endDate);
        }
        
        if (providerId && mongoose.Types.ObjectId.isValid(providerId)) {
            query.provider = providerId;
        }
        
        if (productId && mongoose.Types.ObjectId.isValid(productId)) {
            query["products.product"] = productId;
        }
        
        // Status filter
        if (status && ["active", "inactive"].includes(status)) {
            query.status = status;
        }

        // Get data with full population of related fields
        const purchases = await Purchase.find(query)
            .sort({ purchase_date: -1 })
            .populate({
                path: "provider",
                select: "company name contact_name email phone address"
            })
            .populate({
                path: "products.product",
                select: "name description price category sku"
            })
            .lean();
            
        if (purchases.length === 0) {
            return res.status(404).json({ 
                message: "No purchases found with the specified criteria" 
            });
        }

        const companyName = "IceSoft";
        let providerInfo = null;
        let productInfo = null;
        
        if (providerId && mongoose.Types.ObjectId.isValid(providerId)) {
            providerInfo = await Provider.findById(providerId).lean();
        }
        
        if (productId && mongoose.Types.ObjectId.isValid(productId)) {
            productInfo = await Product.findById(productId).lean();
        }

        // Configure headers for PDF download
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=purchases-report-${Date.now()}.pdf`);

        // Expanded columns with more detailed information
        const reportOptions = {
            data: purchases,
            title: "Purchase Report",
            companyName: companyName,
            filters: {
                startDate,
                endDate,
                provider: providerInfo ? providerInfo.name : "All",
                product: productInfo ? productInfo.name : "All",
                status: status || "All"
            },
            columns: [
                { header: "Purchase ID", key: "id", width: 80 },
                { header: "Date", key: "purchase_date", width: 100, type: "date" },
                { header: "Provider", key: "providerName", width: 120 },
                { header: "Provider Contact", key: "providerContact", width: 120 },
                { header: "Product Details", key: "productsDetail", width: 250 },
                { header: "Total Items", key: "totalItems", width: 80, align: "right" },
                { header: "Total Amount", key: "total", width: 100, align: "right", type: "currency" },
                { header: "Status", key: "status", width: 80 }
            ],
            formatData: (purchase) => {
                // Format products with expanded details
                let productsDetail = "No products";
                if (purchase.products && purchase.products.length > 0) {
                    productsDetail = purchase.products.map(item => {
                        const productName = item.product?.name || "Unknown product";
                        const sku = item.product?.sku ? `(SKU: ${item.product.sku})` : '';
                        const category = item.product?.category ? `[${item.product.category}]` : '';
                        return `${productName} ${sku} ${category} - Qty: ${item.quantity} - Unit Price: $${item.purchase_price.toFixed(2)} - Subtotal: $${(item.quantity * item.purchase_price).toFixed(2)}`;
                    }).join("\n");
                }
                
                // Calculate total items
                const totalItems = purchase.products ? purchase.products.reduce((sum, item) => sum + item.quantity, 0) : 0;
                
                // Format provider contact info
                const providerContact = purchase.provider ? 
                    `${purchase.provider.contact_name || 'N/A'} | ${purchase.provider.phone || 'N/A'} | ${purchase.provider.email || 'N/A'}` : 
                    'No contact info';
                
                // Format row data
                return {
                    id: purchase.id || purchase._id?.toString().substring(0, 8) || "N/A",
                    purchase_date: purchase.purchase_date ? new Date(purchase.purchase_date) : null,
                    providerName: purchase.provider?.company || "Unknown",
                    providerContact: providerContact,
                    productsDetail: productsDetail,
                    totalItems: totalItems,
                    total: purchase.total || 0,
                    status: purchase.status || "N/A"
                };
            },
            calculateSummary: (data) => {
                // Calculate summary information
                const totalAmount = data.reduce((sum, purchase) => sum + (purchase.total || 0), 0);
                const totalItems = data.reduce((sum, purchase) => {
                    if (purchase.products) {
                        return sum + purchase.products.reduce((itemSum, item) => itemSum + item.quantity, 0);
                    }
                    return sum;
                }, 0);
                
                return {
                    count: data.length,
                    totalAmount,
                    totalItems
                };
            },
            pdfOptions: {
                detailedHeader: true,
                pageNumbers: true,
                landscape: true,
                detailedSummary: true
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

// Export purchases to Excel
export const exportPurchaseToExcel = async (req, res) => {
    try {
        if (!checkPermission(req.user.role, "view_purchases")) {
            return res.status(403).json({ message: "You don't have permission to generate reports" });
        }

        const { startDate, endDate, providerId, productId, status } = req.query;
        
        if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
            return res.status(400).json({ 
                message: "Start date cannot be later than end date" 
            });
        }
        
        // Build query
        let query = {};
        
        if (startDate || endDate) {
            query.purchase_date = {};
            if (startDate) query.purchase_date.$gte = new Date(startDate);
            if (endDate) query.purchase_date.$lte = new Date(endDate);
        }
        
        if (providerId && mongoose.Types.ObjectId.isValid(providerId)) {
            query.provider = providerId;
        }
        
        if (productId && mongoose.Types.ObjectId.isValid(productId)) {
            query["products.product"] = productId;
        }
        
        // Status filter
        if (status && ["active", "inactive"].includes(status)) {
            query.status = status;
        }

        // Get data with full population of related fields
        const purchases = await Purchase.find(query)
            .sort({ purchase_date: -1 })
            .populate({
                path: "provider",
                select: "company name contact_name email phone address"
            })
            .populate({
                path: "products.product",
                select: "name description price category sku"
            })
            .lean();
            
        if (purchases.length === 0) {
            return res.status(404).json({ 
                message: "No purchases found with the specified criteria" 
            });
        }

        const companyName = "IceSoft";
        let providerInfo = null;
        let productInfo = null;
        
        if (providerId && mongoose.Types.ObjectId.isValid(providerId)) {
            providerInfo = await Provider.findById(providerId).lean();
        }
        
        if (productId && mongoose.Types.ObjectId.isValid(productId)) {
            productInfo = await Product.findById(productId).lean();
        }

        // Configure headers for Excel download
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=purchases-report-${Date.now()}.xlsx`);

        // Create a more detailed Excel report with multiple worksheets
        const reportOptions = {
            data: purchases,
            title: "Purchase Report",
            companyName: companyName,
            filters: {
                startDate,
                endDate,
                provider: providerInfo ? providerInfo.name : "All",
                product: productInfo ? productInfo.name : "All",
                status: status || "All"
            },
            // Main summary worksheet columns
            columns: [
                { header: "Purchase ID", key: "id", width: 15 },
                { header: "Date", key: "purchase_date", width: 15, type: "date" },
                { header: "Provider", key: "providerName", width: 25 },
                { header: "Provider Contact", key: "providerContact", width: 40 },
                { header: "Total Items", key: "totalItems", width: 15, align: "right" },
                { header: "Total Amount", key: "total", width: 15, align: "right", type: "currency" },
                { header: "Status", key: "status", width: 15 }
            ],
            // Detailed product breakdown worksheet
            detailedProductsColumns: [
                { header: "Purchase ID", key: "purchaseId", width: 15 },
                { header: "Date", key: "purchaseDate", width: 15, type: "date" },
                { header: "Provider", key: "providerName", width: 25 },
                { header: "Product Name", key: "productName", width: 30 },
                { header: "Product SKU", key: "productSku", width: 15 },
                { header: "Category", key: "productCategory", width: 20 },
                { header: "Quantity", key: "quantity", width: 15, align: "right" },
                { header: "Unit Price", key: "unitPrice", width: 15, align: "right", type: "currency" },
                { header: "Subtotal", key: "subtotal", width: 15, align: "right", type: "currency" }
            ],
            formatData: (purchase) => {
                // Calculate total items
                const totalItems = purchase.products ? purchase.products.reduce((sum, item) => sum + item.quantity, 0) : 0;
                
                // Format provider contact info
                const providerContact = purchase.provider ? 
                    `${purchase.provider.contact_name || 'N/A'} | ${purchase.provider.phone || 'N/A'} | ${purchase.provider.email || 'N/A'}` : 
                    'No contact info';
                
                // Format row data for main summary
                return {
                    id: purchase.id || purchase._id?.toString().substring(0, 8) || "N/A",
                    purchase_date: purchase.purchase_date ? new Date(purchase.purchase_date) : null,
                    providerName: purchase.provider?.company || "Unknown",
                    providerContact: providerContact,
                    totalItems: totalItems,
                    total: purchase.total || 0,
                    status: purchase.status || "N/A",
                    // Include original products array for detailed worksheet
                    _products: purchase.products || []
                };
            },
            // Function to format data for the detailed products worksheet
            formatDetailedProductsData: (purchases) => {
                // Flatten purchase data to product level for detailed worksheet
                const detailedRows = [];
                
                purchases.forEach(purchase => {
                    if (purchase._products && purchase._products.length > 0) {
                        purchase._products.forEach(item => {
                            detailedRows.push({
                                purchaseId: purchase.id,
                                purchaseDate: purchase.purchase_date,
                                providerName: purchase.providerName,
                                productName: item.product?.name || "Unknown product",
                                productSku: item.product?.sku || "N/A",
                                productCategory: item.product?.category || "N/A",
                                quantity: item.quantity || 0,
                                unitPrice: item.purchase_price || 0,
                                subtotal: (item.quantity * item.purchase_price) || 0
                            });
                        });
                    }
                });
                
                return detailedRows;
            },
            calculateSummary: (data) => {
                // Calculate summary information
                const totalAmount = data.reduce((sum, purchase) => sum + (purchase.total || 0), 0);
                const totalItems = data.reduce((sum, purchase) => sum + purchase.totalItems, 0);
                const activeCount = data.filter(purchase => purchase.status === 'active').length;
                const inactiveCount = data.filter(purchase => purchase.status === 'inactive').length;
                
                return {
                    count: data.length,
                    totalAmount,
                    totalItems,
                    activeCount,
                    inactiveCount
                };
            },
            // Excel-specific options
            excelOptions: {
                multipleSheets: true, // Create multiple worksheets
                sheetNames: ["Summary", "Detailed Products"], // Names for the worksheets
                includeFilters: true, // Add filter buttons to columns
                freezeHeader: true, // Freeze the header row
                includeCharts: true // Include summary charts if supported
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