import mongoose from "mongoose";
import Sale from "../models/sales.js";
import Product from "../models/product.js";
import Customer from "../models/customer.js";
import { checkPermission } from "../utils/permissions.js";
import { generatePdfReport, generateExcelReport } from "../utils/report-exporters.js";

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

// PUT: Update an existing sale (solo datos generales, no estado)
export const updateSale = async (req, res) => {
    try {
        if (!checkPermission(req.user.role, "update_sales")) {
            return res.status(403).json({ message: "Unauthorized access" });
        }

        const { id } = req.params;
        const { customer, salesDate } = req.body;
        
        // Prohibir modificación de productos y status en UPDATE básico
        if (req.body.products) {
            return res.status(400).json({ 
                message: "Cannot modify products through this endpoint. Use product management endpoint instead." 
            });
        }
        
        if (req.body.status) {
            return res.status(400).json({ 
                message: "Cannot modify status through this endpoint. Use status update endpoint instead." 
            });
        }

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: "Invalid sale ID format" });
        }

        const validationErrors = validateSaleData(req.body, true);
        if (validationErrors.length > 0) {
            return res.status(400).json({ message: "Validation error", errors: validationErrors });
        }

        let updateFields = {};

        if (customer) {
            const existingCustomer = await Customer.findById(customer);
            if (!existingCustomer) {
                return res.status(404).json({ message: "Customer not found" });
            }
            updateFields.customer = customer;
        }

        if (salesDate !== undefined) updateFields.salesDate = salesDate;
        
        if (Object.keys(updateFields).length === 0) {
            return res.status(400).json({ message: "No valid fields to update" });
        }

        const updatedSale = await Sale.findByIdAndUpdate(id, updateFields, {
            new: true,
            runValidators: true
        })
            .populate("customer", "name email phone")
            .populate("products.product", "name price");

        if (!updatedSale) {
            return res.status(404).json({ message: "Sale not found" });
        }

        const formattedSale = updatedSale.toObject();
        
        if (formattedSale.salesDate) {
            formattedSale.salesDate = new Date(formattedSale.salesDate).toISOString().split('T')[0];
        }

        res.status(200).json({ message: "Sale updated successfully", sale: formattedSale });
    } catch (error) {
        console.error("Error updating sale:", error);
        
        if (error.name === 'ValidationError') {
            const errors = Object.values(error.errors).map(err => err.message);
            return res.status(400).json({ message: "Validation error", errors });
        }
        
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

// EXPORT: Export sales to PDF
export const exportSaleToPdf = async (req, res) => {
    try {
        if (!checkPermission(req.user.role, "view_sales")) {
            return res.status(403).json({ message: "You don't have permission to generate reports" });
        }

        const { startDate, endDate, customerId, productId, status } = req.query;
        
        if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
            return res.status(400).json({ 
                message: "Start date cannot be later than end date" 
            });
        }
        
        let query = {};
        
        if (startDate || endDate) {
            query.salesDate = {};
            if (startDate) query.salesDate.$gte = new Date(startDate);
            if (endDate) query.salesDate.$lte = new Date(endDate);
        }
        
        if (customerId && mongoose.Types.ObjectId.isValid(customerId)) {
            query.customer = customerId;
        }
        
        if (productId && mongoose.Types.ObjectId.isValid(productId)) {
            query["products.product"] = productId;
        }
        
        if (status && ["active", "cancelled"].includes(status)) {
            query.status = status;
        }

        const sales = await Sale.find(query)
            .sort({ salesDate: -1 })
            .populate({
                path: "customer",
                select: "name email phone document_number"
            })
            .populate({
                path: "products.product",
                select: "name price category sku"
            })
            .lean();
            
        if (sales.length === 0) {
            return res.status(404).json({ 
                message: "No sales found with the specified criteria" 
            });
        }

        const companyName = "IceSoft";
        let customerInfo = null;
        let productInfo = null;
        
        if (customerId && mongoose.Types.ObjectId.isValid(customerId)) {
            customerInfo = await Customer.findById(customerId).lean();
        }
        
        if (productId && mongoose.Types.ObjectId.isValid(productId)) {
            productInfo = await Product.findById(productId).lean();
        }

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=sales-report-${Date.now()}.pdf`);

        const reportOptions = {
            data: sales,
            title: "Sales Report",
            companyName: companyName,
            filters: {
                startDate,
                endDate,
                customer: customerInfo ? customerInfo.name : "All",
                product: productInfo ? productInfo.name : "All",
                status: status || "All"
            },
            columns: [
                { header: "Sale ID", key: "id", width: 80 },
                { header: "Date", key: "salesDate", width: 100, type: "date" },
                { header: "Customer", key: "customerName", width: 120 },
                { header: "Contact", key: "customerContact", width: 120 },
                { header: "Products", key: "productsDetail", width: 300 },
                { header: "Total Items", key: "totalItems", width: 70, align: "right" },
                { header: "Sale Total", key: "total", width: 100, align: "right", type: "currency" },
                { header: "Status", key: "status", width: 80 }
            ],
            formatData: (sale) => {
                let productsDetail = "No products";
                if (sale.products && sale.products.length > 0) {
                    productsDetail = sale.products.map(item => {
                        const productName = item.product?.name || "Unknown product";
                        const quantity = item.quantity || 0;
                        const salePrice = item.sale_price || 0;
                        const itemTotal = item.total || (quantity * salePrice);
                        const sku = item.product?.sku ? `(SKU: ${item.product.sku})` : '';
                        
                        return `${productName} ${sku}
                        Qty: ${quantity} | Unit Price: $${salePrice.toFixed(2)} | Subtotal: $${itemTotal.toFixed(2)}`;
                    }).join("\n\n");
                }
                
                const totalItems = sale.products ? 
                    sale.products.reduce((sum, item) => sum + (item.quantity || 0), 0) : 0;
                
                const customerContact = sale.customer ? 
                    `${sale.customer.email || 'N/A'} | ${sale.customer.phone || 'N/A'}` : 
                    'No contact info';
                
                return {
                    id: sale.id || "N/A",
                    salesDate: sale.salesDate ? new Date(sale.salesDate) : null,
                    customerName: sale.customer?.name || "Unknown",
                    customerContact: customerContact,
                    productsDetail: productsDetail,
                    totalItems: totalItems,
                    total: sale.total || 0,
                    status: sale.status || "N/A"
                };
            },
            calculateSummary: (data) => {
                const totalAmount = data.reduce((sum, sale) => sum + (sale.total || 0), 0);
                const totalItems = data.reduce((sum, sale) => {
                    if (sale.products) {
                        return sum + sale.products.reduce((itemSum, item) => 
                            itemSum + (item.quantity || 0), 0);
                    }
                    return sum;
                }, 0);
                
                const activeCount = data.filter(s => s.status === 'active').length;
                const cancelledCount = data.filter(s => s.status === 'cancelled').length;
                
                return {
                    count: data.length,
                    totalAmount,
                    totalItems,
                    activeCount,
                    cancelledCount
                };
            },
            pdfOptions: {
                pageNumbers: true,
                landscape: true,
                detailedHeader: true,
                detailedSummary: true
            },
            filename: `sales-report-${Date.now()}.pdf`
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

// EXPORT: Export sales to Excel
export const exportSaleToExcel = async (req, res) => {
    try {
        if (!checkPermission(req.user.role, "view_sales")) {
            return res.status(403).json({ message: "You don't have permission to generate reports" });
        }

        const { startDate, endDate, customerId, productId, status } = req.query;
        
        if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
            return res.status(400).json({ 
                message: "Start date cannot be later than end date" 
            });
        }
        
        let query = {};
        
        if (startDate || endDate) {
            query.salesDate = {};
            if (startDate) query.salesDate.$gte = new Date(startDate);
            if (endDate) query.salesDate.$lte = new Date(endDate);
        }
        
        if (customerId && mongoose.Types.ObjectId.isValid(customerId)) {
            query.customer = customerId;
        }
        
        if (productId && mongoose.Types.ObjectId.isValid(productId)) {
            query["products.product"] = productId;
        }
        
        if (status && ["active", "cancelled"].includes(status)) {
            query.status = status;
        }

        const sales = await Sale.find(query)
            .sort({ salesDate: -1 })
            .populate({
                path: "customer",
                select: "name email phone document_number"
            })
            .populate({
                path: "products.product",
                select: "name price category sku"
            })
            .lean();
            
        if (sales.length === 0) {
            return res.status(404).json({ 
                message: "No sales found with the specified criteria" 
            });
        }

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=sales-report-${Date.now()}.xlsx`);

        let customerInfo = null;
        let productInfo = null;
        
        if (customerId && mongoose.Types.ObjectId.isValid(customerId)) {
            customerInfo = await Customer.findById(customerId).lean();
        }
        
        if (productId && mongoose.Types.ObjectId.isValid(productId)) {
            productInfo = await Product.findById(productId).lean();
        }

        const reportOptions = {
            data: sales,
            title: "Sales Report",
            companyName: "IceSoft",
            filters: {
                dateRange: startDate && endDate ? `${startDate} to ${endDate}` : "All time",
                customer: customerInfo ? customerInfo.name : "All",
                product: productInfo ? productInfo.name : "All",
                status: status || "All"
            },
            columns: [
                { header: "Sale ID", key: "id", width: 15 },
                { header: "Date", key: "salesDate", width: 15, type: "date" },
                { header: "Customer", key: "customerName", width: 25 },
                { header: "Customer Email", key: "customerEmail", width: 25 },
                { header: "Customer Phone", key: "customerPhone", width: 20 },
                { header: "Customer Document", key: "customerDocument", width: 20 },
                { header: "Total Products", key: "totalProducts", width: 15, align: "right" },
                { header: "Total Items", key: "totalItems", width: 15, align: "right" },
                { header: "Total Amount", key: "total", width: 20, align: "right", type: "currency" },
                { header: "Status", key: "status", width: 15 }
            ],
            detailedProductsColumns: [
                { header: "Sale ID", key: "saleId", width: 15 },
                { header: "Sale Date", key: "saleDate", width: 15, type: "date" },
                { header: "Customer", key: "customerName", width: 25 },
                { header: "Product ID", key: "productId", width: 25 },
                { header: "Product Name", key: "productName", width: 30 },
                { header: "Product SKU", key: "productSku", width: 20 },
                { header: "Product Category", key: "productCategory", width: 20 },
                { header: "Quantity", key: "quantity", width: 15, align: "right" },
                { header: "Unit Price", key: "unitPrice", width: 20, align: "right", type: "currency" },
                { header: "Item Total", key: "itemTotal", width: 20, align: "right", type: "currency" },
                { header: "Sale Status", key: "saleStatus", width: 15 }
            ],
            formatData: (sale) => {
                const totalItems = sale.products ? 
                    sale.products.reduce((sum, item) => sum + (item.quantity || 0), 0) : 0;
                const totalProducts = sale.products ? sale.products.length : 0;
                
                return {
                    id: sale.id || "N/A",
                    salesDate: sale.salesDate ? new Date(sale.salesDate) : null,
                    customerName: sale.customer?.name || "Unknown",
                    customerEmail: sale.customer?.email || "N/A",
                    customerPhone: sale.customer?.phone || "N/A",
                    customerDocument: sale.customer?.document_number || "N/A",
                    totalProducts: totalProducts,
                    totalItems: totalItems,
                    total: sale.total || 0,
                    status: sale.status || "N/A",
                    _originalData: sale
                };
            },
            formatDetailedProductsData: (sales) => {
                const detailedRows = [];
                
                sales.forEach(sale => {
                    if (sale._originalData.products && sale._originalData.products.length > 0) {
                        sale._originalData.products.forEach(item => {
                            detailedRows.push({
                                saleId: sale.id,
                                saleDate: sale.salesDate,
                                customerName: sale.customerName,
                                productId: item.product?._id?.toString() || "N/A",
                                productName: item.product?.name || "Unknown product",
                                productSku: item.product?.sku || "N/A",
                                productCategory: item.product?.category || "N/A",
                                quantity: item.quantity || 0,
                                unitPrice: item.sale_price || 0,
                                itemTotal: item.total || ((item.quantity || 0) * (item.sale_price || 0)),
                                saleStatus: sale.status
                            });
                        });
                    }
                });
                
                return detailedRows;
            },
            calculateSummary: (data) => {
                const totalAmount = data.reduce((sum, sale) => sum + (sale.total || 0), 0);
                const totalItems = data.reduce((sum, sale) => sum + sale.totalItems, 0);
                const totalProducts = data.reduce((sum, sale) => sum + sale.totalProducts, 0);
                const uniqueCustomers = new Set(data.map(s => s.customerName)).size;
                
                const activeCount = data.filter(s => s.status === 'active').length;
                const cancelledCount = data.filter(s => s.status === 'cancelled').length;
                
                return {
                    count: data.length,
                    totalAmount,
                    totalItems,
                    totalProducts,
                    uniqueCustomers,
                    activeCount,
                    cancelledCount
                };
            },
            excelOptions: {
                multipleSheets: true,
                sheetNames: ["Summary", "Product Details"],
                includeFilters: true,
                freezeHeader: true,
                autoWidth: true
            },
            filename: `sales-report-${Date.now()}.xlsx`
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
                message:                 "Error generating Excel report", 
                error: error.message
            });
        }
    }
};