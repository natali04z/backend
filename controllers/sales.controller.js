import mongoose from "mongoose";
import Sale from "../models/sales.js";
import Product from "../models/product.js";
import Customer from "../models/customer.js";
import { checkPermission } from "../utils/permissions.js";
import PDFDocument from "pdfkit";
import ExcelJS from "exceljs";

// Function to generate sale ID
async function generateSaleId() {
    const lastSale = await Sale.findOne().sort({ createdAt: -1 });
    if (!lastSale || !/^Sa\d{2}$/.test(lastSale.id)) return "Sa01";
    const lastNumber = parseInt(lastSale.id.substring(2), 10);
    const nextNumber = (lastNumber + 1).toString().padStart(2, "0");
    return `Sa${nextNumber}`;
}

// Validate sale data
function validateSaleData(data, isUpdate = false) {
    const errors = [];
    
    // Only validate required fields if it's not an update
    if (!isUpdate) {
        if (!data.customer) errors.push("Customer is required");
        if (!Array.isArray(data.products) || data.products.length === 0) {
            errors.push("At least one product is required");
        }
    }
    
    // Validate customer ID if provided
    if (data.customer && !mongoose.Types.ObjectId.isValid(data.customer)) {
        errors.push("Invalid customer ID format");
    }
    
    // Validate products array if provided
    if (data.products) {
        if (!Array.isArray(data.products)) {
            errors.push("Products must be an array");
        } else {
            data.products.forEach((item, index) => {
                if (!item.product || !mongoose.Types.ObjectId.isValid(item.product)) {
                    errors.push(`Invalid product ID at index ${index}`);
                }
                if (!item.quantity || typeof item.quantity !== 'number' || item.quantity <= 0) {
                    errors.push(`Invalid quantity at index ${index}`);
                }
                if (!item.price || typeof item.price !== 'number' || item.price <= 0) {
                    errors.push(`Invalid price at index ${index}`);
                }
            });
        }
    }
    
    // Validate date if provided
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
        // Check if req.user exists before accessing its role property
        if (!req.user || !checkPermission(req.user.role, "view_sales")) {
            return res.status(403).json({ message: "Unauthorized access" });
        }

        // Query all sales
        console.log("Executing sales query");
        const sales = await Sale.find()
            .populate("customer", "name")
            .populate("products.product", "name");
        console.log(`Found ${sales.length} sales`);

        // Format response
        const formattedSales = sales.map(sale => {
            const saleObj = sale.toObject();
            
            // Format sale date
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
        // Check if req.user exists before accessing its role property
        if (!req.user || !checkPermission(req.user.role, "view_sales_id")) {
            return res.status(403).json({ message: "Unauthorized access" });
        }

        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: "Invalid sale ID format" });
        }

        const sale = await Sale.findById(id)
            .populate("customer", "name")
            .populate("products.product", "name");

        if (!sale) {
            return res.status(404).json({ message: "Sale not found" });
        }

        // Format the response
        const formattedSale = sale.toObject();
        
        // Format the sale date
        if (formattedSale.salesDate) {
            formattedSale.salesDate = new Date(formattedSale.salesDate).toISOString().split('T')[0];
        }

        res.status(200).json(formattedSale);
    } catch (error) {
        console.error("Error fetching sale:", error);
        res.status(500).json({ message: "Server error", details: error.message });
    }
};

// POST: Create new sale
export const postSale = async (req, res) => {
    try {
        if (!checkPermission(req.user.role, "create_sales")) {
            return res.status(403).json({ message: "Unauthorized access" });
        }

        const { customer, products } = req.body;

        // Validate sale data
        const validationErrors = validateSaleData(req.body);
        if (validationErrors.length > 0) {
            return res.status(400).json({ message: "Validation failed", errors: validationErrors });
        }

        // Verify customer exists
        if (!mongoose.Types.ObjectId.isValid(customer)) {
            return res.status(400).json({ message: "Invalid customer ID" });
        }

        const customerExists = await Customer.findById(customer);
        if (!customerExists) {
            return res.status(404).json({ message: "Customer not found" });
        }

        let total = 0;
        const validatedProducts = [];

        // Process and validate each product
        for (let i = 0; i < products.length; i++) {
            const item = products[i];
            
            // Verify product exists
            const product = await Product.findById(item.product);
            if (!product) {
                return res.status(404).json({ message: `Product not found at index ${i}` });
            }

            // Calculate totals
            const itemTotal = item.price * item.quantity;
            validatedProducts.push({ 
                product: item.product,
                quantity: item.quantity,
                price: item.price,
                total: itemTotal 
            });
            total += itemTotal;
        }

        // Generate sale ID
        const id = await generateSaleId();

        const newSale = new Sale({
            id,
            customer,
            products: validatedProducts,
            total,
            salesDate: req.body.salesDate || new Date()
        });

        await newSale.save();

        // Format the response
        const formattedSale = newSale.toObject();
        if (formattedSale.salesDate) {
            formattedSale.salesDate = new Date(formattedSale.salesDate).toISOString().split('T')[0];
        }

        res.status(201).json({ 
            message: "Sale created successfully", 
            sale: formattedSale 
        });
    } catch (error) {
        console.error("Error creating sale:", error);
        res.status(500).json({ message: "Server error", details: error.message });
    }
};

// PUT: Update an existing sale
export const updateSale = async (req, res) => {
    try {
        if (!checkPermission(req.user.role, "edit_sales")) {
            return res.status(403).json({ message: "Unauthorized access" });
        }

        const { id } = req.params;
        const { customer, products, salesDate } = req.body;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: "Invalid sale ID format" });
        }

        // Validate input data (with isUpdate flag)
        const validationErrors = validateSaleData(req.body, true);
        if (validationErrors.length > 0) {
            return res.status(400).json({ message: "Validation failed", errors: validationErrors });
        }

        // Find the sale
        const sale = await Sale.findById(id);
        if (!sale) {
            return res.status(404).json({ message: "Sale not found" });
        }

        let updateFields = {};
        let total = 0;

        // Check and update customer if provided
        if (customer) {
            if (!mongoose.Types.ObjectId.isValid(customer)) {
                return res.status(400).json({ message: "Invalid customer ID format" });
            }
            
            const existingCustomer = await Customer.findById(customer);
            if (!existingCustomer) {
                return res.status(404).json({ message: "Customer not found" });
            }
            updateFields.customer = customer;
        }

        // Process products if provided
        if (products && Array.isArray(products)) {
            const updatedProducts = [];
            
            for (let i = 0; i < products.length; i++) {
                const item = products[i];
                
                if (!mongoose.Types.ObjectId.isValid(item.product)) {
                    return res.status(400).json({ message: `Invalid product ID at index ${i}` });
                }
                
                const product = await Product.findById(item.product);
                if (!product) {
                    return res.status(404).json({ message: `Product not found at index ${i}` });
                }
                
                const itemTotal = item.price * item.quantity;
                updatedProducts.push({
                    product: item.product, 
                    quantity: item.quantity,
                    price: item.price,
                    total: itemTotal
                });
                total += itemTotal;
            }
            
            updateFields.products = updatedProducts;
            updateFields.total = total;
        }

        // Update date if provided
        if (salesDate) {
            updateFields.salesDate = salesDate;
        }

        // Check if there are fields to update
        if (Object.keys(updateFields).length === 0) {
            return res.status(400).json({ message: "No valid fields to update" });
        }

        // Update the sale
        const updatedSale = await Sale.findByIdAndUpdate(id, updateFields, {
            new: true,
            runValidators: true
        }).populate("customer", "name").populate("products.product", "name");

        // Format the date in the response
        const formattedSale = updatedSale.toObject();
        if (formattedSale.salesDate) {
            formattedSale.salesDate = new Date(formattedSale.salesDate).toISOString().split('T')[0];
        }

        res.status(200).json({ message: "Sale updated successfully", sale: formattedSale });
    } catch (error) {
        console.error("Error updating sale:", error);
        
        // Handle Mongoose validation errors
        if (error.name === 'ValidationError') {
            const errors = Object.values(error.errors).map(err => err.message);
            return res.status(400).json({ message: "Validation failed", errors });
        }
        
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

        const deletedSale = await Sale.findByIdAndDelete(id);

        if (!deletedSale) {
            return res.status(404).json({ message: "Sale not found" });
        }

        res.status(200).json({ message: "Sale deleted successfully" });
    } catch (error) {
        console.error("Error deleting sale:", error);
        res.status(500).json({ message: "Server error", details: error.message });
    }
};

// ===== EXPORT FUNCTIONS =====

// GET: Generate a PDF report of sales
// GET: Generate a PDF report of sales
export const exportSalesPDF = async (req, res) => {
    try {
        if (!checkPermission(req.user.role, "view_sales")) {
            return res.status(403).json({ message: "Unauthorized access" });
        }

        const { startDate, endDate, customerId } = req.query;
        const sales = await fetchFilteredSales(startDate, endDate, customerId);
            
        if (sales.length === 0) {
            return res.status(404).json({ message: "No sales found for the specified criteria" });
        }
        
        const companyName = "IceSoft";
        
        // Create PDF document
        const doc = new PDFDocument({
            margin: 50,
            size: 'A4',
            info: {
                Title: 'Informe de Ventas',
                Author: companyName,
                Creator: 'IceSoft System'
            }
        });
        
        // Set response headers
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=informe-ventas-${Date.now()}.pdf`);
        doc.pipe(res);
        
        // Define style constants
        const styles = {
            primary: '#336699',
            secondary: '#f5f5f5',
            text: '#333333',
            headerText: '#ffffff',
            border: '#cccccc'
        };
        
        // Format date and currency helpers
        const now = new Date();
        const formatCOP = (amount) => new Intl.NumberFormat('es-CO', { 
            style: 'currency', currency: 'COP', minimumFractionDigits: 0 
        }).format(amount);
        
        // Add document header
        addPDFHeader(doc, companyName, now, styles);
        
        // Add report info section
        addPDFReportInfo(doc, startDate, endDate, customerId, styles);
        
        // Add summary section
        const totalAmount = sales.reduce((sum, sale) => sum + sale.total, 0);
        addPDFSummary(doc, sales.length, totalAmount, styles);
        
        // Add sales table
        addPDFSalesTable(doc, sales, styles, formatCOP);
        
        // Add footer to all pages
        addPDFFooter(doc, companyName, styles);
        
        // Finalize PDF
        doc.end();
    } catch (error) {
        console.error("Error generating sales PDF report:", error);
        res.status(500).json({ message: "Error generating PDF report", details: error.message });
    }
};

export const exportSalesExcel = async (req, res) => {
    try {
        if (!checkPermission(req.user.role, "view_sales")) {
            return res.status(403).json({ message: "Unauthorized access" });
        }
        
        const { startDate, endDate, customerId } = req.query;
        const sales = await fetchFilteredSales(startDate, endDate, customerId);
            
        if (sales.length === 0) {
            return res.status(404).json({ message: "No sales found for the specified criteria" });
        }

        // Create Excel workbook
        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'IceSoft System';
        workbook.created = new Date();
        
        // Add worksheet
        const worksheet = workbook.addWorksheet('Informe de Ventas', {
            pageSetup: { paperSize: 9, orientation: 'portrait', fitToWidth: 1 }
        });
        
        // Define styles
        const styles = defineExcelStyles();
        
        // Set column structure
        setExcelColumns(worksheet);
        
        // Add header and info sections
        addExcelHeader(worksheet, startDate, endDate, customerId, styles);
        
        // Calculate and add summary data
        const totalSalesAmount = sales.reduce((sum, sale) => sum + sale.total, 0);
        const totalItemsSold = sales.reduce((sum, sale) => 
            sum + sale.products.reduce((prodSum, prod) => prodSum + prod.quantity, 0), 0);
        addExcelSummary(worksheet, sales.length, totalItemsSold, totalSalesAmount);
        
        // Add sales data
        const tableStartRow = 13;
        const rowNumber = addExcelSalesData(worksheet, sales, tableStartRow, styles);
        
        // Format columns
        formatExcelColumns(worksheet);
        
        // Add totals row
        addExcelTotalsRow(worksheet, rowNumber, totalSalesAmount, styles.totalStyle);
        
        // Add footer
        addExcelFooter(worksheet, rowNumber);
        
        // Set response headers and send workbook
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=ventas-informe-${Date.now()}.xlsx`);
        await workbook.xlsx.write(res);
        res.end();
        
    } catch (error) {
        console.error("Error generating sales Excel report:", error);
        res.status(500).json({ message: "Error generating Excel report" });
    }
};

// ==== Helper Functions ====

// Shared function to fetch sales with filters
async function fetchFilteredSales(startDate, endDate, customerId) {
    // Build query object based on filters
    let query = {};
    
    // Add date range filter
    if (startDate || endDate) {
        query.salesDate = {};
        if (startDate) query.salesDate.$gte = new Date(startDate);
        if (endDate) query.salesDate.$lte = new Date(endDate);
    }
    
    // Add customer filter
    if (customerId && mongoose.Types.ObjectId.isValid(customerId)) {
        query.customer = customerId;
    }
    
    // Fetch and return sales
    return await Sale.find(query)
        .sort({ salesDate: -1 })
        .populate("customer", "name")
        .populate("products.product", "name");
}

// ==== PDF Helper Functions ====

function addPDFHeader(doc, companyName, now, styles) {
    // Header background
    doc.rect(50, 50, doc.page.width - 100, 80)
       .fillAndStroke(styles.primary, styles.primary);
    
    // Company name and report title
    doc.fillColor(styles.headerText)
       .font('Helvetica-Bold')
       .fontSize(24)
       .text(companyName, 70, 70)
       .fontSize(16)
       .text('Informe de Ventas', 70, 100);
    
    // Date generated
    doc.font('Helvetica')
       .fontSize(10)
       .text(`Generado: ${now.toLocaleDateString('es-CO')} ${now.toLocaleTimeString('es-CO')}`, 
             70, 120, { align: 'left' });
}

function addPDFReportInfo(doc, startDate, endDate, customerId, styles) {
    // Info section background
    doc.rect(50, 150, doc.page.width - 100, 70)
       .fillAndStroke(styles.secondary, styles.border);
    
    // Section title   
    doc.fillColor(styles.text)
       .fontSize(12)
       .font('Helvetica-Bold')
       .text('Parámetros del Informe:', 70, 160);
    
    // Info content
    doc.font('Helvetica').fontSize(10);
    let infoY = 180;
    
    // Date range
    doc.text(`Período: ${startDate ? new Date(startDate).toLocaleDateString('es-CO') : 'Inicio'} a ${endDate ? new Date(endDate).toLocaleDateString('es-CO') : 'Fin'}`, 70, infoY);
    infoY += 15;
    
    // Customer info
    if (customerId) {
        Customer.findById(customerId).then(customer => {
            if (customer) doc.text(`Cliente: ${customer.name}`, 70, infoY);
        });
    } else {
        doc.text('Cliente: Todos', 70, infoY);
    }
}

function addPDFSummary(doc, salesCount, totalAmount, styles) {
    // Summary section background
    doc.rect(50, 240, doc.page.width - 100, 60)
       .fillAndStroke('#e6f7ff', styles.border);
    
    // Summary title
    doc.fillColor(styles.text)
       .fontSize(14)
       .font('Helvetica-Bold')
       .text('Resumen', 70, 250);
    
    // Summary content
    doc.font('Helvetica').fontSize(10)
       .text(`Total de Ventas: ${salesCount}`, 70, 270)
       .text(`Total: ${new Intl.NumberFormat('es-CO', { 
           style: 'currency', currency: 'COP', minimumFractionDigits: 0 
       }).format(totalAmount)}`, 70, 285);
}

function addPDFSalesTable(doc, sales, styles, formatCOP) {
    const tableTop = 320;
    const tableHeaders = ['ID', 'Fecha', 'Cliente', 'Producto', 'Cantidad', 'Total'];
    const colWidths = [60, 70, 90, 120, 60, 90];
    
    // Draw table header
    doc.rect(50, tableTop, doc.page.width - 100, 20)
       .fillAndStroke(styles.primary, styles.primary);
    
    // Add header text
    let currentX = 50;
    tableHeaders.forEach((header, i) => {
        doc.font('Helvetica-Bold')
           .fontSize(10)
           .fillColor(styles.headerText)
           .text(header, currentX + 5, tableTop + 6, 
                { width: colWidths[i], align: i === 5 ? 'right' : 'left' });
        currentX += colWidths[i];
    });
    
    // Draw table rows
    let y = tableTop + 20;
    
    for (let i = 0; i < sales.length; i++) {
        const sale = sales[i];
        
        for (let j = 0; j < sale.products.length; j++) {
            const product = sale.products[j];
            
            // Add new page if necessary
            if (y > 700) {
                doc.addPage();
                y = 50;
                
                // Redraw header on new page
                currentX = 50;
                doc.rect(50, y, doc.page.width - 100, 20)
                   .fillAndStroke(styles.primary, styles.primary);
                   
                tableHeaders.forEach((header, i) => {
                    doc.font('Helvetica-Bold')
                       .fontSize(10)
                       .fillColor(styles.headerText)
                       .text(header, currentX + 5, y + 6, 
                            { width: colWidths[i], align: i === 5 ? 'right' : 'left' });
                    currentX += colWidths[i];
                });
                
                y += 20;
            }
            
            // Row background (alternating)
            doc.rect(50, y, doc.page.width - 100, 20)
               .fillAndStroke((i + j) % 2 === 0 ? '#f9f9f9' : '#ffffff', styles.border);
            
            // Row data
            doc.font('Helvetica').fontSize(9).fillColor(styles.text);
            
            currentX = 50;
            
            // Add cell data
            doc.text(sale.id, currentX + 5, y + 6, { width: colWidths[0] });
            currentX += colWidths[0];
            
            doc.text(new Date(sale.salesDate).toLocaleDateString('es-CO'), currentX + 5, y + 6, { width: colWidths[1] });
            currentX += colWidths[1];
            
            doc.text(sale.customer ? sale.customer.name : 'Desconocido', currentX + 5, y + 6, { width: colWidths[2] });
            currentX += colWidths[2];
            
            doc.text(product.product ? product.product.name : 'Desconocido', currentX + 5, y + 6, { width: colWidths[3] });
            currentX += colWidths[3];
            
            doc.text(product.quantity.toString(), currentX + 5, y + 6, { width: colWidths[4], align: 'center' });
            currentX += colWidths[4];
            
            doc.text(formatCOP(product.total), currentX + 5, y + 6, { width: colWidths[5], align: 'right' });
            
            y += 20;
        }
    }
}

function addPDFFooter(doc, companyName, styles) {
    const pageCount = doc.bufferedPageRange().count;
    
    for (let i = 0; i < pageCount; i++) {
        doc.switchToPage(i);
        
        // Page number
        doc.font('Helvetica').fontSize(8).fillColor('#999999')
           .text(`Página ${i + 1} de ${pageCount}`, 50, doc.page.height - 50,
                 { align: 'center', width: doc.page.width - 100 });
        
        // Footer line
        doc.moveTo(50, doc.page.height - 60)
           .lineTo(doc.page.width - 50, doc.page.height - 60)
           .stroke(styles.border);
        
        // Company footer
        doc.font('Helvetica').fontSize(8).fillColor('#666666')
           .text(`${companyName} - Sistema de Gestión de Ventas`, 50, doc.page.height - 40,
                 { align: 'center', width: doc.page.width - 100 });
    }
}

// ==== Excel Helper Functions ====

function defineExcelStyles() {
    return {
        titleStyle: {
            font: { bold: true, size: 16, color: { argb: 'FFFFFFFF' } },
            fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF336699' } },
            alignment: { horizontal: 'center', vertical: 'middle' }
        },
        subtitleStyle: {
            font: { bold: true, size: 12, color: { argb: 'FF333333' } },
            fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F5' } },
            alignment: { horizontal: 'left', vertical: 'middle' },
            border: {
                top: { style: 'thin', color: { argb: 'FFCCCCCC' } },
                left: { style: 'thin', color: { argb: 'FFCCCCCC' } },
                bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } },
                right: { style: 'thin', color: { argb: 'FFCCCCCC' } }
            }
        },
        headerStyle: {
            font: { bold: true, size: 11, color: { argb: 'FFFFFFFF' } },
            fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF336699' } },
            alignment: { horizontal: 'center', vertical: 'middle' },
            border: {
                top: { style: 'thin', color: { argb: 'FFCCCCCC' } },
                left: { style: 'thin', color: { argb: 'FFCCCCCC' } },
                bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } },
                right: { style: 'thin', color: { argb: 'FFCCCCCC' } }
            }
        },
        rowEvenStyle: {
            fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } }
        },
        rowOddStyle: {
            fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9F9F9' } }
        },
        totalStyle: {
            font: { bold: true, size: 11 },
            fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6F7FF' } },
            alignment: { horizontal: 'right', vertical: 'middle' },
            border: {
                top: { style: 'thin', color: { argb: 'FFCCCCCC' } },
                left: { style: 'thin', color: { argb: 'FFCCCCCC' } },
                bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } },
                right: { style: 'thin', color: { argb: 'FFCCCCCC' } }
            }
        }
    };
}

function setExcelColumns(worksheet) {
    worksheet.columns = [
        { header: 'ID Venta', key: 'id', width: 15 },
        { header: 'Fecha', key: 'date', width: 15 },
        { header: 'Cliente', key: 'customer', width: 25 },
        { header: 'Producto', key: 'product', width: 30 },
        { header: 'Cantidad', key: 'quantity', width: 10 },
        { header: 'Precio', key: 'price', width: 15 },
        { header: 'Total Producto', key: 'productTotal', width: 15 },
        { header: 'Total Venta', key: 'total', width: 15 }
    ];
}

function addExcelHeader(worksheet, startDate, endDate, customerId, styles) {
    // Add title
    worksheet.mergeCells('A1:H2');
    const titleCell = worksheet.getCell('A1');
    titleCell.value = 'Informe de Ventas - IceSoft';
    titleCell.style = styles.titleStyle;
    worksheet.getRow(1).height = 30;
    
    // Add report dates
    worksheet.mergeCells('A3:H3');
    const infoCell = worksheet.getCell('A3');
    infoCell.value = `Período: ${startDate ? new Date(startDate).toLocaleDateString('es-CO') : 'Inicio'} a ${endDate ? new Date(endDate).toLocaleDateString('es-CO') : 'Fin'}`;
    infoCell.style = { font: { size: 10 }, alignment: { horizontal: 'left', vertical: 'middle' } };
    
    // Add customer info
    worksheet.mergeCells('A4:H4');
    const customerCell = worksheet.getCell('A4');
    if (customerId) {
        Customer.findById(customerId).then(customer => {
            customerCell.value = `Cliente: ${customer ? customer.name : 'No encontrado'}`;
        });
    } else {
        customerCell.value = 'Cliente: Todos';
    }
    customerCell.style = { font: { size: 10 }, alignment: { horizontal: 'left', vertical: 'middle' } };
    
    // Add generation date
    worksheet.mergeCells('A5:H5');
    const dateCell = worksheet.getCell('A5');
    dateCell.value = `Generado: ${new Date().toLocaleString('es-CO')}`;
    dateCell.style = { font: { size: 10, italic: true }, alignment: { horizontal: 'left', vertical: 'middle' } };
}

function addExcelSummary(worksheet, salesCount, itemsCount, totalAmount) {
    // Add summary title
    worksheet.mergeCells('A7:H7');
    const summaryTitle = worksheet.getCell('A7');
    summaryTitle.value = 'Resumen';
    summaryTitle.style = {
        font: { bold: true, size: 12 },
        fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F5' } },
        alignment: { horizontal: 'left', vertical: 'middle' }
    };
    
    // Add summary data
    worksheet.mergeCells('A8:G8');
    worksheet.getCell('A8').value = 'Total de Ventas:';
    worksheet.getCell('A8').style = { font: { bold: true }, alignment: { horizontal: 'right' } };
    worksheet.getCell('H8').value = salesCount;
    
    worksheet.mergeCells('A9:G9');
    worksheet.getCell('A9').value = 'Artículos Vendidos:';
    worksheet.getCell('A9').style = { font: { bold: true }, alignment: { horizontal: 'right' } };
    worksheet.getCell('H9').value = itemsCount;
    
    worksheet.mergeCells('A10:G10');
    worksheet.getCell('A10').value = 'Total:';
    worksheet.getCell('A10').style = { font: { bold: true }, alignment: { horizontal: 'right' } };
    worksheet.getCell('H10').value = totalAmount;
    worksheet.getCell('H10').numFmt = '"$"#,##0_-;[Red]-"$"#,##0_-';
}

function addExcelSalesData(worksheet, sales, tableStartRow, styles) {
    // Style headers row
    const headerRow = worksheet.getRow(tableStartRow);
    headerRow.height = 20;
    headerRow.eachCell(cell => { cell.style = styles.headerStyle; });
    
    // Flatten sales data (one product per row)
    let tableData = [];
    sales.forEach(sale => {
        sale.products.forEach(product => {
            tableData.push({
                id: sale._id,
                date: new Date(sale.salesDate),
                customer: sale.customer ? sale.customer.name : 'Desconocido',
                product: product.product ? product.product.name : 'Desconocido',
                quantity: product.quantity,
                price: product.price,
                productTotal: product.quantity * product.price,
                total: sale.total
            });
        });
    });
    
    // Add data rows
    let rowNumber = tableStartRow + 1;
    tableData.forEach((row, index) => {
        const excelRow = worksheet.addRow({
            id: row.id,
            date: row.date,
            customer: row.customer,
            product: row.product,
            quantity: row.quantity,
            price: row.price,
            productTotal: row.productTotal,
            total: row.total
        });
        
        // Apply alternating row styles
        const rowStyle = index % 2 === 0 ? styles.rowEvenStyle : styles.rowOddStyle;
        excelRow.eachCell(cell => {
            cell.style = { 
                ...cell.style,
                ...rowStyle,
                border: {
                    top: { style: 'thin', color: { argb: 'FFCCCCCC' } },
                    left: { style: 'thin', color: { argb: 'FFCCCCCC' } },
                    bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } },
                    right: { style: 'thin', color: { argb: 'FFCCCCCC' } }
                }
            };
        });
        
        rowNumber++;
    });
    
    return rowNumber;
}

function formatExcelColumns(worksheet) {
    // Format date column
    worksheet.getColumn('date').numFmt = 'dd/mm/yyyy';
    
    // Format currency columns
    const currencyFormat = '"$"#,##0_-;[Red]-"$"#,##0_-';
    worksheet.getColumn('price').numFmt = currencyFormat;
    worksheet.getColumn('price').alignment = { horizontal: 'right' };
    
    worksheet.getColumn('productTotal').numFmt = currencyFormat;
    worksheet.getColumn('productTotal').alignment = { horizontal: 'right' };
    
    worksheet.getColumn('total').numFmt = currencyFormat;
    worksheet.getColumn('total').alignment = { horizontal: 'right' };
}

function addExcelTotalsRow(worksheet, rowNumber, totalAmount, totalStyle) {
    const totalsRow = worksheet.addRow(['Total', '', '', '', '', '', '', totalAmount]);
    totalsRow.eachCell(cell => { cell.style = totalStyle; });
    worksheet.getCell(`H${rowNumber}`).numFmt = '"$"#,##0_-;[Red]-"$"#,##0_-';
}

function addExcelFooter(worksheet, rowNumber) {
    const footerRow = rowNumber + 2;
    worksheet.mergeCells(`A${footerRow}:H${footerRow}`);
    const footerCell = worksheet.getCell(`A${footerRow}`);
    footerCell.value = 'IceSoft - Sistema de Gestión de Ventas';
    footerCell.style = {
        font: { size: 8, italic: true, color: { argb: 'FF666666' } },
        alignment: { horizontal: 'center' }
    };
}