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
            .populate("provider", "company")
            .populate("products.product", "name price");
        console.log(`Found ${purchases.length} purchases`);

        const formattedPurchases = purchases.map(purchase => {
            const purchaseObj = purchase.toObject();
            
            if (purchaseObj.purchase_date) {
                purchaseObj.purchase_date = new Date(purchaseObj.purchase_date).toISOString().split('T')[0];
            }
            
            if (purchaseObj.products && Array.isArray(purchaseObj.products)) {
                purchaseObj.products = purchaseObj.products.map(item => {
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
        
        if (formattedPurchase.products && Array.isArray(formattedPurchase.products)) {
            formattedPurchase.products = formattedPurchase.products.map(item => {
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

        const validationErrors = validatePurchaseData(req.body);
        if (validationErrors.length > 0) {
            return res.status(400).json({ message: "Validation error", errors: validationErrors });
        }

        const existingProvider = await Provider.findById(provider);
        if (!existingProvider) {
            return res.status(404).json({ message: "Provider not found" });
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
                return res.status(400).json({ message: `Cannot use inactive product at index ${i}` });
            }

            const itemTotal = item.purchase_price * item.quantity;
            
            validatedProducts.push({
                product: item.product,
                quantity: item.quantity,
                purchase_price: item.purchase_price,
                total: itemTotal
            });
            
            total += itemTotal;

            await foundProduct.incrementStock(item.quantity);
        }

        const id = await generatePurchaseId();

        const newPurchase = new Purchase({
            id,
            provider,
            products: validatedProducts,
            purchase_date: purchase_date || new Date(),
            total
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

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: "Invalid purchase ID format" });
        }

        const validationErrors = validatePurchaseData(req.body, true);
        if (validationErrors.length > 0) {
            return res.status(400).json({ message: "Validation error", errors: validationErrors });
        }

        let updateFields = {};

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

// UPDATE: Purchase status
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

        const currentPurchase = await Purchase.findById(id);
        
        if (!currentPurchase) {
            return res.status(404).json({ message: "Purchase not found" });
        }
        
        if (currentPurchase.status !== status) {
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
            else if (currentPurchase.status === "inactive" && status === "active") {
                for (const item of currentPurchase.products) {
                    const product = await Product.findById(item.product);
                    if (product) {
                        await product.incrementStock(item.quantity);
                    }
                }
            }
        }

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

        const purchaseToDelete = await Purchase.findById(id);
        
        if (!purchaseToDelete) {
            return res.status(404).json({ message: "Purchase not found" });
        }
        
        if (purchaseToDelete.status === "active" && purchaseToDelete.products && Array.isArray(purchaseToDelete.products)) {
            for (const item of purchaseToDelete.products) {
                const product = await Product.findById(item.product);
                if (product) {
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

        await Purchase.findByIdAndDelete(id);

        res.status(200).json({ message: "Purchase deleted successfully and stock updated" });
    } catch (error) {
        console.error("Error deleting purchase:", error);
        res.status(500).json({ message: "Server error", details: error.message });
    }
};

// EXPORT: Export purchases to PDF
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
        
        if (status && ["active", "inactive"].includes(status)) {
            query.status = status;
        }

        const purchases = await Purchase.find(query)
            .sort({ purchase_date: -1 })
            .populate({
                path: "provider",
                select: "company contact_name email phone"
            })
            .populate({
                path: "products.product",
                select: "name price category sku"
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

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=purchases-report-${Date.now()}.pdf`);

        const reportOptions = {
            data: purchases,
            title: "Purchase Report",
            companyName: companyName,
            filters: {
                startDate,
                endDate,
                provider: providerInfo ? providerInfo.company : "All",
                product: productInfo ? productInfo.name : "All",
                status: status || "All"
            },
            columns: [
                { header: "Purchase ID", key: "id", width: 80 },
                { header: "Date", key: "purchase_date", width: 100, type: "date" },
                { header: "Provider", key: "providerName", width: 120 },
                { header: "Contact", key: "providerContact", width: 120 },
                { header: "Products", key: "productsDetail", width: 300 },
                { header: "Total Items", key: "totalItems", width: 70, align: "right" },
                { header: "Purchase Total", key: "total", width: 100, align: "right", type: "currency" },
                { header: "Status", key: "status", width: 80 }
            ],
            formatData: (purchase) => {
                let productsDetail = "No products";
                if (purchase.products && purchase.products.length > 0) {
                    productsDetail = purchase.products.map(item => {
                        const productName = item.product?.name || "Unknown product";
                        const quantity = item.quantity || 0;
                        const purchasePrice = item.purchase_price || 0;
                        const itemTotal = item.total || (quantity * purchasePrice);
                        const sku = item.product?.sku ? `(SKU: ${item.product.sku})` : '';
                        
                        return `${productName} ${sku}
                        Qty: ${quantity} | Unit Price: $${purchasePrice.toFixed(2)} | Subtotal: $${itemTotal.toFixed(2)}`;
                    }).join("\n\n");
                }
                
                const totalItems = purchase.products ? 
                    purchase.products.reduce((sum, item) => sum + (item.quantity || 0), 0) : 0;
                
                const providerContact = purchase.provider ? 
                    `${purchase.provider.contact_name || 'N/A'} | ${purchase.provider.phone || 'N/A'}` : 
                    'No contact info';
                
                return {
                    id: purchase.id || "N/A",
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
                const totalAmount = data.reduce((sum, purchase) => sum + (purchase.total || 0), 0);
                const totalItems = data.reduce((sum, purchase) => {
                    if (purchase.products) {
                        return sum + purchase.products.reduce((itemSum, item) => 
                            itemSum + (item.quantity || 0), 0);
                    }
                    return sum;
                }, 0);
                
                const activeCount = data.filter(p => p.status === 'active').length;
                const inactiveCount = data.filter(p => p.status === 'inactive').length;
                
                return {
                    count: data.length,
                    totalAmount,
                    totalItems,
                    activeCount,
                    inactiveCount
                };
            },
            pdfOptions: {
                pageNumbers: true,
                landscape: true,
                detailedHeader: true,
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

// EXPORT: Export purchases to Excel
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
        
        if (status && ["active", "inactive"].includes(status)) {
            query.status = status;
        }

        const purchases = await Purchase.find(query)
            .sort({ purchase_date: -1 })
            .populate({
                path: "provider",
                select: "company contact_name email phone"
            })
            .populate({
                path: "products.product",
                select: "name price category sku"
            })
            .lean();
            
        if (purchases.length === 0) {
            return res.status(404).json({ 
                message: "No purchases found with the specified criteria" 
            });
        }

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=purchases-report-${Date.now()}.xlsx`);

        let providerInfo = null;
        let productInfo = null;
        
        if (providerId && mongoose.Types.ObjectId.isValid(providerId)) {
            providerInfo = await Provider.findById(providerId).lean();
        }
        
        if (productId && mongoose.Types.ObjectId.isValid(productId)) {
            productInfo = await Product.findById(productId).lean();
        }

        const reportOptions = {
            data: purchases,
            title: "Purchase Report",
            companyName: "IceSoft",
            filters: {
                dateRange: startDate && endDate ? `${startDate} to ${endDate}` : "All time",
                provider: providerInfo ? providerInfo.company : "All",
                product: productInfo ? productInfo.name : "All",
                status: status || "All"
            },
            columns: [
                { header: "Purchase ID", key: "id", width: 15 },
                { header: "Date", key: "purchase_date", width: 15, type: "date" },
                { header: "Provider", key: "providerName", width: 25 },
                { header: "Provider Contact", key: "providerContact", width: 25 },
                { header: "Provider Email", key: "providerEmail", width: 25 },
                { header: "Provider Phone", key: "providerPhone", width: 20 },
                { header: "Total Products", key: "totalProducts", width: 15, align: "right" },
                { header: "Total Items", key: "totalItems", width: 15, align: "right" },
                { header: "Total Amount", key: "total", width: 20, align: "right", type: "currency" },
                { header: "Status", key: "status", width: 15 }
            ],
            detailedProductsColumns: [
                { header: "Purchase ID", key: "purchaseId", width: 15 },
                { header: "Purchase Date", key: "purchaseDate", width: 15, type: "date" },
                { header: "Provider", key: "providerName", width: 25 },
                { header: "Product ID", key: "productId", width: 25 },
                { header: "Product Name", key: "productName", width: 30 },
                { header: "Product SKU", key: "productSku", width: 20 },
                { header: "Product Category", key: "productCategory", width: 20 },
                { header: "Quantity", key: "quantity", width: 15, align: "right" },
                { header: "Unit Price", key: "unitPrice", width: 20, align: "right", type: "currency" },
                { header: "Item Total", key: "itemTotal", width: 20, align: "right", type: "currency" },
                { header: "Purchase Status", key: "purchaseStatus", width: 15 }
            ],
            formatData: (purchase) => {
                const totalItems = purchase.products ? 
                    purchase.products.reduce((sum, item) => sum + (item.quantity || 0), 0) : 0;
                const totalProducts = purchase.products ? purchase.products.length : 0;
                
                return {
                    id: purchase.id || "N/A",
                    purchase_date: purchase.purchase_date ? new Date(purchase.purchase_date) : null,
                    providerName: purchase.provider?.company || "Unknown",
                    providerContact: purchase.provider?.contact_name || "N/A",
                    providerEmail: purchase.provider?.email || "N/A",
                    providerPhone: purchase.provider?.phone || "N/A",
                    totalProducts: totalProducts,
                    totalItems: totalItems,
                    total: purchase.total || 0,
                    status: purchase.status || "N/A",
                    _originalData: purchase
                };
            },
            formatDetailedProductsData: (purchases) => {
                const detailedRows = [];
                
                purchases.forEach(purchase => {
                    if (purchase._originalData.products && purchase._originalData.products.length > 0) {
                        purchase._originalData.products.forEach(item => {
                            detailedRows.push({
                                purchaseId: purchase.id,
                                purchaseDate: purchase.purchase_date,
                                providerName: purchase.providerName,
                                productId: item.product?._id?.toString() || "N/A",
                                productName: item.product?.name || "Unknown product",
                                productSku: item.product?.sku || "N/A",
                                productCategory: item.product?.category || "N/A",
                                quantity: item.quantity || 0,
                                unitPrice: item.purchase_price || 0,
                                itemTotal: item.total || ((item.quantity || 0) * (item.purchase_price || 0)),
                                purchaseStatus: purchase.status
                            });
                        });
                    }
                });
                
                return detailedRows;
            },
            calculateSummary: (data) => {
                const totalAmount = data.reduce((sum, purchase) => sum + (purchase.total || 0), 0);
                const totalItems = data.reduce((sum, purchase) => sum + purchase.totalItems, 0);
                const totalProducts = data.reduce((sum, purchase) => sum + purchase.totalProducts, 0);
                const uniqueProviders = new Set(data.map(p => p.providerName)).size;
                
                const activeCount = data.filter(p => p.status === 'active').length;
                const inactiveCount = data.filter(p => p.status === 'inactive').length;
                
                return {
                    count: data.length,
                    totalAmount,
                    totalItems,
                    totalProducts,
                    uniqueProviders,
                    activeCount,
                    inactiveCount
                };
            },
            excelOptions: {
                multipleSheets: true,
                sheetNames: ["Summary", "Product Details"],
                includeFilters: true,
                freezeHeader: true,
                autoWidth: true
            },
            filename: `purchases-report-${Date.now()}.xlsx`
        };
        
        try {
            await generateExcelReport(reportOptions, res);
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