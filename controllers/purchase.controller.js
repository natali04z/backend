import mongoose from "mongoose";
import Purchase from "../models/purchase.js";
import Product from "../models/product.js";
import { checkPermission } from "../utils/permissions.js";
import PDFDocument from "pdfkit";
import ExcelJS from "exceljs";

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
    
    return errors;
}

// GET: Retrieve all purchases
export const getPurchases = async (req, res) => {
    try {        
        if (!checkPermission(req.user.role, "view_purchases")) {
            return res.status(403).json({ message: "Unauthorized access" });
        }

        const purchases = await Purchase.find()
            .select("id total details purchaseDate product")
            .populate("product", "name");

        // Format the date in the response
        const formattedPurchases = purchases.map(purchase => {
            const purchaseObj = purchase.toObject();
            if (purchaseObj.purchaseDate) {
                purchaseObj.purchaseDate = new Date(purchaseObj.purchaseDate).toISOString().split('T')[0];
            }
            return purchaseObj;
        });

        res.status(200).json(formattedPurchases);
    } catch (error) {
        console.error("Error fetching purchases:", error);
        res.status(500).json({ message: "Server error" });
    }
};

// GET: Retrieve a single purchase by ID
export const getPurchaseById = async (req, res) => {
    try {
        if (!checkPermission(req.user.role, "view_purchases_id")) {
            return res.status(403).json({ message: "Unauthorized access" });
        }

        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: "Invalid purchase ID format" });
        }

        const purchase = await Purchase.findById(id)
            .select("id total details purchaseDate")
            .populate("product", "name price");

        if (!purchase) {
            return res.status(404).json({ message: "Purchase not found" });
        }

        // Format the date in the response
        const formattedPurchase = purchase.toObject();
        if (formattedPurchase.purchaseDate) {
            formattedPurchase.purchaseDate = new Date(formattedPurchase.purchaseDate).toISOString().split('T')[0];
        }

        res.status(200).json(formattedPurchase);
    } catch (error) {
        console.error("Error fetching purchase:", error);
        res.status(500).json({ message: "Server error" });
    }
};

// POST: Create new purchase
export const postPurchase = async (req, res) => {
    try {
        if (!checkPermission(req.user.role, "create_purchases")) {
            return res.status(403).json({ message: "Unauthorized access" });
        }

        const { products, details, purchaseDate } = req.body;

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
            total
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
        if (!checkPermission(req.user.role, "edit_purchases")) {
            return res.status(403).json({ message: "Unauthorized access" });
        }

        const { id } = req.params;
        const { product, purchaseDate, total, details } = req.body;

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
            updateFields.product = product;
        }

        // Update other fields if provided
        if (purchaseDate !== undefined) updateFields.purchaseDate = purchaseDate;
        if (total !== undefined) updateFields.total = total;
        if (details !== undefined) updateFields.details = details;
        
        // Check if there are fields to update
        if (Object.keys(updateFields).length === 0) {
            return res.status(400).json({ message: "No valid fields to update" });
        }

        const updatedPurchase = await Purchase.findByIdAndUpdate(id, updateFields, {
            new: true,
            runValidators: true
        })
            .select("id product purchaseDate total details")
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

// ===== EXPORT FUNCTIONS =====

// GET: Generate a PDF report of purchases
export const generatePdfReport = async (req, res) => {
    try {
        if (!checkPermission(req.user.role, "view_purchases")) {
            return res.status(403).json({ message: "Unauthorized access" });
        }

        // Parse query parameters for filtering
        const { startDate, endDate, productId } = req.query;
        
        // Build query object based on filters
        let query = {};
        
        // Add date range filter
        if (startDate || endDate) {
            query.purchaseDate = {};
            if (startDate) query.purchaseDate.$gte = new Date(startDate);
            if (endDate) query.purchaseDate.$lte = new Date(endDate);
        }
        
        // Add product filter
        if (productId && mongoose.Types.ObjectId.isValid(productId)) {
            query.product = productId;
        }
        
        // Fetch purchases with filters
        const purchases = await Purchase.find(query)
            .sort({ purchaseDate: -1 })
            .populate("product", "name price");
            
        if (purchases.length === 0) {
            return res.status(404).json({ message: "No purchases found for the specified criteria" });
        }
        
        // Fetch company info
        const companyName = "IceSoft"; // Puedes obtener esto de una configuración
        
        // Create PDF document with better styling
        const doc = new PDFDocument({
            margin: 50,
            size: 'A4',
            info: {
                Title: 'Informe de Compras',
                Author: companyName,
                Subject: 'Informe de Compras',
                Keywords: 'compras, informe, pdf',
                Creator: 'IceSoft System',
                Producer: 'PDFKit'
            }
        });
        
        // Set response headers
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=informe-compras-${Date.now()}.pdf`);
        
        // Pipe the PDF document to the response
        doc.pipe(res);
        
        // Define colors
        const primaryColor = '#336699';
        const secondaryColor = '#f5f5f5';
        const textColor = '#333333';
        const headerTextColor = '#ffffff';
        const borderColor = '#cccccc';
        
        // Función para formatear la moneda en formato colombiano
        const formatCOP = (amount) => {
            return new Intl.NumberFormat('es-CO', { 
                style: 'currency', 
                currency: 'COP',
                minimumFractionDigits: 0,
                maximumFractionDigits: 0
            }).format(amount);
        };
        
        // Obtener hora actual correcta
        const now = new Date();
        const formattedDate = now.toLocaleDateString('es-CO');
        const formattedTime = now.toLocaleTimeString('es-CO');
        
        // Add header with title
        doc.rect(50, 50, doc.page.width - 100, 80)
           .fillAndStroke(primaryColor, primaryColor);
        
        doc.fillColor(headerTextColor)
           .font('Helvetica-Bold')
           .fontSize(24)
           .text(companyName, 70, 70);
           
        doc.fontSize(16)
           .text('Informe de Compras', 70, 100);
        
        // Add date
        doc.font('Helvetica')
           .fontSize(10)
           .fillColor(headerTextColor)
           .text(`Generado: ${formattedDate} ${formattedTime}`, 
                 70, 120, { align: 'left' });
           
        // Add report info section
        doc.rect(50, 150, doc.page.width - 100, 70)
           .fillAndStroke(secondaryColor, borderColor);
           
        doc.fillColor(textColor)
           .fontSize(12)
           .font('Helvetica-Bold')
           .text('Parámetros del Informe:', 70, 160);
           
        doc.font('Helvetica')
           .fontSize(10);
        
        let infoY = 180;
        
        doc.text(`Período: ${startDate ? new Date(startDate).toLocaleDateString('es-CO') : 'Inicio'} a ${endDate ? new Date(endDate).toLocaleDateString('es-CO') : 'Fin'}`, 70, infoY);
        infoY += 15;
        
        if (productId) {
            const product = await Product.findById(productId);
            if (product) {
                doc.text(`Producto: ${product.name}`, 70, infoY);
                infoY += 15;
            }
        } else {
            doc.text('Producto: Todos', 70, infoY);
            infoY += 15;
        }
        
        // Add simplified summary section
        const totalAmount = purchases.reduce((sum, purchase) => sum + purchase.total, 0);
        
        doc.rect(50, 240, doc.page.width - 100, 60)
           .fillAndStroke('#e6f7ff', borderColor);
           
        doc.fillColor(textColor)
           .fontSize(14)
           .font('Helvetica-Bold')
           .text('Resumen', 70, 250);
           
        doc.font('Helvetica')
           .fontSize(10);
           
        doc.text(`Total de Compras: ${purchases.length}`, 70, 270);
        doc.text(`Total: ${formatCOP(totalAmount)}`, 70, 285);
        
        // Add table header (más compacto para reducir páginas)
        const tableTop = 320;
        const tableHeaders = ['ID', 'Fecha', 'Producto', 'Total'];
        const colWidths = [80, 100, 200, 120];
        
        // Draw table header background
        doc.rect(50, tableTop, doc.page.width - 100, 20)
           .fillAndStroke(primaryColor, primaryColor);
        
        // Draw table header text
        let currentX = 50;
        tableHeaders.forEach((header, i) => {
            doc.font('Helvetica-Bold')
               .fontSize(10)
               .fillColor(headerTextColor)
               .text(header, currentX + 5, tableTop + 6, { width: colWidths[i], align: i === 3 ? 'right' : 'left' });
            currentX += colWidths[i];
        });
        
        // Draw table rows
        let y = tableTop + 20;
        
        for (let i = 0; i < purchases.length; i++) {
            const purchase = purchases[i];
            
            // Add new page if necessary
            if (y > 700) {
                doc.addPage();
                y = 50;
                
                // Add table header in new page
                doc.rect(50, y, doc.page.width - 100, 20)
                   .fillAndStroke(primaryColor, primaryColor);
                
                currentX = 50;
                tableHeaders.forEach((header, i) => {
                    doc.font('Helvetica-Bold')
                       .fontSize(10)
                       .fillColor(headerTextColor)
                       .text(header, currentX + 5, y + 6, { width: colWidths[i], align: i === 3 ? 'right' : 'left' });
                    currentX += colWidths[i];
                });
                
                y += 20;
            }
            
            // Alternate row colors
            if (i % 2 === 0) {
                doc.rect(50, y, doc.page.width - 100, 20)
                   .fillAndStroke('#f9f9f9', borderColor);
            } else {
                doc.rect(50, y, doc.page.width - 100, 20)
                   .fillAndStroke('#ffffff', borderColor);
            }
            
            // Add row data
            doc.font('Helvetica')
               .fontSize(9)
               .fillColor(textColor);
            
            currentX = 50;
            
            // ID
            doc.text(purchase.id, currentX + 5, y + 6, { width: colWidths[0], align: 'left' });
            currentX += colWidths[0];
            
            // Date
            const formattedDate = new Date(purchase.purchaseDate).toLocaleDateString('es-CO');
            doc.text(formattedDate, currentX + 5, y + 6, { width: colWidths[1], align: 'left' });
            currentX += colWidths[1];
            
            // Product
            const productName = purchase.product ? purchase.product.name : 'Desconocido';
            doc.text(productName, currentX + 5, y + 6, { width: colWidths[2], align: 'left' });
            currentX += colWidths[2];
            
            // Total (formato colombiano)
            doc.text(formatCOP(purchase.total), currentX + 5, y + 6, { width: colWidths[3], align: 'right' });
            
            y += 20;
        }
        
        // Add footer
        const pageCount = doc.bufferedPageRange().count;
        for (let i = 0; i < pageCount; i++) {
            doc.switchToPage(i);
            
            // Add page number
            doc.font('Helvetica')
               .fontSize(8)
               .fillColor('#999999')
               .text(
                 `Página ${i + 1} de ${pageCount}`,
                 50,
                 doc.page.height - 50,
                 { align: 'center', width: doc.page.width - 100 }
               );
            
            // Add footer line
            doc.moveTo(50, doc.page.height - 60)
               .lineTo(doc.page.width - 50, doc.page.height - 60)
               .stroke(borderColor);
            
            // Add company footer
            doc.font('Helvetica')
               .fontSize(8)
               .fillColor('#666666')
               .text(
                 `${companyName} - Sistema de Gestión de Compras`,
                 50,
                 doc.page.height - 40,
                 { align: 'center', width: doc.page.width - 100 }
               );
        }
        
        // Finalize PDF
        doc.end();
        
    } catch (error) {
        console.error("Error generating purchases PDF report:", error);
        res.status(500).json({ message: "Error generating PDF report" });
    }
};

// GET: Generate Excel report of purchases
export const generateExcelReport = async (req, res) => {
    try {
        if (!checkPermission(req.user.role, "view_purchases")) {
            return res.status(403).json({ message: "Unauthorized access" });
        }

        // Parse query parameters for filtering
        const { startDate, endDate, productId } = req.query;
        
        // Build query object based on filters
        let query = {};
        
        // Add date range filter
        if (startDate || endDate) {
            query.purchaseDate = {};
            if (startDate) query.purchaseDate.$gte = new Date(startDate);
            if (endDate) query.purchaseDate.$lte = new Date(endDate);
        }
        
        // Add product filter
        if (productId && mongoose.Types.ObjectId.isValid(productId)) {
            query.product = productId;
        }
        
        // Fetch purchases with filters
        const purchases = await Purchase.find(query)
            .sort({ purchaseDate: -1 })
            .populate("product", "name price");
            
        if (purchases.length === 0) {
            return res.status(404).json({ message: "No purchases found for the specified criteria" });
        }

        // Create a new Excel workbook with improved styling
        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'IceSoft System';
        workbook.created = new Date();
        workbook.modified = new Date();
        workbook.lastPrinted = new Date();
        workbook.properties.date1904 = true;
        
        // Add a worksheet
        const worksheet = workbook.addWorksheet('Informe de Compras', {
            pageSetup: {
                paperSize: 9, // A4
                orientation: 'portrait',
                fitToPage: true,
                fitToWidth: 1,
                fitToHeight: 0,
                margins: {
                    left: 0.7, right: 0.7,
                    top: 0.75, bottom: 0.75,
                    header: 0.3, footer: 0.3
                }
            }
        });
        
        // Define styles
        const titleStyle = {
            font: { bold: true, size: 16, color: { argb: 'FFFFFFFF' } },
            fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF336699' } },
            alignment: { horizontal: 'center', vertical: 'middle' }
        };
        
        const subtitleStyle = {
            font: { bold: true, size: 12, color: { argb: 'FF333333' } },
            fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F5' } },
            alignment: { horizontal: 'left', vertical: 'middle' },
            border: {
                top: { style: 'thin', color: { argb: 'FFCCCCCC' } },
                left: { style: 'thin', color: { argb: 'FFCCCCCC' } },
                bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } },
                right: { style: 'thin', color: { argb: 'FFCCCCCC' } }
            }
        };
        
        const headerStyle = {
            font: { bold: true, size: 11, color: { argb: 'FFFFFFFF' } },
            fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF336699' } },
            alignment: { horizontal: 'center', vertical: 'middle' },
            border: {
                top: { style: 'thin', color: { argb: 'FFCCCCCC' } },
                left: { style: 'thin', color: { argb: 'FFCCCCCC' } },
                bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } },
                right: { style: 'thin', color: { argb: 'FFCCCCCC' } }
            }
        };
        
        const rowEvenStyle = {
            fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } }
        };
        
        const rowOddStyle = {
            fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9F9F9' } }
        };
        
        const totalStyle = {
            font: { bold: true, size: 11 },
            fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6F7FF' } },
            alignment: { horizontal: 'right', vertical: 'middle' },
            border: {
                top: { style: 'thin', color: { argb: 'FFCCCCCC' } },
                left: { style: 'thin', color: { argb: 'FFCCCCCC' } },
                bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } },
                right: { style: 'thin', color: { argb: 'FFCCCCCC' } }
            }
        };
        
        // Set column widths (simplificado para menos columnas)
        worksheet.columns = [
            { header: 'ID Compra', key: 'id', width: 15 },
            { header: 'Fecha', key: 'date', width: 15 },
            { header: 'Producto', key: 'product', width: 30 },
            { header: 'Total', key: 'total', width: 20 }
        ];
        
        // Obtener la hora actual correcta
        const now = new Date();
        const formattedDateTime = now.toLocaleString('es-CO');
        
        // Add title
        worksheet.mergeCells('A1:D2');
        const titleCell = worksheet.getCell('A1');
        titleCell.value = 'Informe de Compras - IceSoft';
        titleCell.style = titleStyle;
        worksheet.getRow(1).height = 30;
        
        // Add report information
        worksheet.mergeCells('A3:D3');
        const infoCell = worksheet.getCell('A3');
        infoCell.value = `Período: ${startDate ? new Date(startDate).toLocaleDateString('es-CO') : 'Inicio'} a ${endDate ? new Date(endDate).toLocaleDateString('es-CO') : 'Fin'}`;
        infoCell.style = {
            font: { size: 10 },
            alignment: { horizontal: 'left', vertical: 'middle' }
        };
        
        if (productId) {
            const product = await Product.findById(productId);
            worksheet.mergeCells('A4:D4');
            const productCell = worksheet.getCell('A4');
            productCell.value = `Producto: ${product ? product.name : 'No encontrado'}`;
            productCell.style = {
                font: { size: 10 },
                alignment: { horizontal: 'left', vertical: 'middle' }
            };
        } else {
            worksheet.mergeCells('A4:D4');
            const productCell = worksheet.getCell('A4');
            productCell.value = 'Producto: Todos';
            productCell.style = {
                font: { size: 10 },
                alignment: { horizontal: 'left', vertical: 'middle' }
            };
        }
        
        // Add generation date
        worksheet.mergeCells('A5:D5');
        const dateCell = worksheet.getCell('A5');
        dateCell.value = `Generado: ${formattedDateTime}`;
        dateCell.style = {
            font: { size: 10, italic: true },
            alignment: { horizontal: 'left', vertical: 'middle' }
        };
        
        // Add simplified summary section
        const totalAmount = purchases.reduce((sum, purchase) => sum + purchase.total, 0);
        
        worksheet.mergeCells('A7:D7');
        const summaryTitle = worksheet.getCell('A7');
        summaryTitle.value = 'Resumen';
        summaryTitle.style = subtitleStyle;
        
        worksheet.mergeCells('A8:C8');
        worksheet.getCell('A8').value = 'Total de Compras:';
        worksheet.getCell('A8').style = {
            font: { bold: true },
            alignment: { horizontal: 'right' }
        };
        worksheet.getCell('D8').value = purchases.length;
        
        worksheet.mergeCells('A9:C9');
        worksheet.getCell('A9').value = 'Total:';
        worksheet.getCell('A9').style = {
            font: { bold: true },
            alignment: { horizontal: 'right' }
        };
        worksheet.getCell('D9').value = totalAmount;
        // Formato de moneda colombiana
        worksheet.getCell('D9').numFmt = '"$"#,##0_-;[Red]-"$"#,##0_-';
        
        // Add space before table
        const tableStartRow = 12;
        
        // Style headers row
        const headerRow = worksheet.getRow(tableStartRow);
        headerRow.height = 20;
        headerRow.eachCell((cell) => {
            cell.style = headerStyle;
        });
        
        // Add data rows
        let rowNumber = tableStartRow + 1;
        purchases.forEach((purchase, index) => {
            const row = worksheet.addRow({
                id: purchase.id,
                date: new Date(purchase.purchaseDate),
                product: purchase.product ? purchase.product.name : 'Desconocido',
                total: purchase.total
            });
            
            // Apply alternating row styles
            const rowStyle = index % 2 === 0 ? rowEvenStyle : rowOddStyle;
            row.eachCell((cell) => {
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
        
        // Format date column
        worksheet.getColumn('date').numFmt = 'dd/mm/yyyy';
        
        // Format total column as Colombian currency
        worksheet.getColumn('total').numFmt = '"$"#,##0_-;[Red]-"$"#,##0_-';
        worksheet.getColumn('total').alignment = { horizontal: 'right' };
        
        // Add totals row
        const totalsRow = worksheet.addRow(['Total', '', '', totalAmount]);
        totalsRow.eachCell((cell) => {
            cell.style = totalStyle;
        });
        worksheet.getCell(`D${rowNumber}`).numFmt = '"$"#,##0_-;[Red]-"$"#,##0_-';
        
        // Create table with proper structure
        const tableName = 'PurchasesTable';
        worksheet.addTable({
            name: tableName,
            ref: `A${tableStartRow}`,
            headerRow: true,
            totalsRow: false,
            style: {
                theme: 'TableStyleMedium2',
                showRowStripes: true,
            },
            columns: [
                { name: 'ID Compra' },
                { name: 'Fecha' },
                { name: 'Producto' },
                { name: 'Total' }
            ],
            rows: purchases.map(purchase => [
                purchase.id,
                new Date(purchase.purchaseDate),
                purchase.product ? purchase.product.name : 'Desconocido',
                purchase.total
            ])
        });
        
        // Add footer
        const footerRow = rowNumber + 2;
        worksheet.mergeCells(`A${footerRow}:D${footerRow}`);
        const footerCell = worksheet.getCell(`A${footerRow}`);
        footerCell.value = 'IceSoft - Sistema de Gestión de Compras';
        footerCell.style = {
            font: { size: 8, italic: true, color: { argb: 'FF666666' } },
            alignment: { horizontal: 'center' }
        };
        
        // Set the content type and disposition
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=compras-informe-${Date.now()}.xlsx`);
        
        // Write the workbook to the response
        await workbook.xlsx.write(res);
        res.end();
        
    } catch (error) {
        console.error("Error generating purchases Excel report:", error);
        res.status(500).json({ message: "Error generating Excel report" });
    }
};

// GET: Generate purchase statistics
export const getPurchaseStatistics = async (req, res) => {
    try {
        if (!checkPermission(req.user.role, "view_purchases")) {
            return res.status(403).json({ message: "Unauthorized access" });
        }

        // Parse query parameters for filtering
        const { startDate, endDate, period = 'monthly' } = req.query;
        
        // Build date range filter
        let dateFilter = {};
        if (startDate || endDate) {
            dateFilter = {};
            if (startDate) dateFilter.$gte = new Date(startDate);
            if (endDate) dateFilter.$lte = new Date(endDate);
        } else {
            // Default to last 12 months if no date range specified
            const endDateDefault = new Date();
            const startDateDefault = new Date();
            startDateDefault.setMonth(startDateDefault.getMonth() - 11);
            startDateDefault.setDate(1);
            dateFilter = { $gte: startDateDefault, $lte: endDateDefault };
        }

        // Determine grouping format based on period
        let dateFormat, dateField;
        if (period === 'daily') {
            dateFormat = '%Y-%m-%d';
            dateField = { $dateToString: { format: '%Y-%m-%d', date: '$purchaseDate' } };
        } else if (period === 'weekly') {
            // For weekly, we'll use week number in year
            dateFormat = '%Y-W%V';
            dateField = { 
                $concat: [
                    { $dateToString: { format: '%Y-W', date: '$purchaseDate' } },
                    { $toString: { $week: '$purchaseDate' } }
                ]
            };
        } else if (period === 'yearly') {
            dateFormat = '%Y';
            dateField = { $dateToString: { format: '%Y', date: '$purchaseDate' } };
        } else {
            // Default to monthly
            dateFormat = '%Y-%m';
            dateField = { $dateToString: { format: '%Y-%m', date: '$purchaseDate' } };
        }

        // Run aggregation query
        const statistics = await Purchase.aggregate([
            {
                $match: {
                    purchaseDate: dateFilter
                }
            },
            {
                $group: {
                    _id: dateField,
                    count: { $sum: 1 },
                    totalAmount: { $sum: '$total' },
                    avgAmount: { $avg: '$total' },
                    minAmount: { $min: '$total' },
                    maxAmount: { $max: '$total' }
                }
            },
            {
                $sort: { _id: 1 }
            },
            {
                $project: {
                    _id: 0,
                    period: '$_id',
                    count: 1,
                    totalAmount: { $round: ['$totalAmount', 2] },
                    avgAmount: { $round: ['$avgAmount', 2] },
                    minAmount: { $round: ['$minAmount', 2] },
                    maxAmount: { $round: ['$maxAmount', 2] }
                }
            }
        ]);

        // Calculate overall statistics
        const overall = await Purchase.aggregate([
            {
                $match: {
                    purchaseDate: dateFilter
                }
            },
            {
                $group: {
                    _id: null,
                    totalPurchases: { $sum: 1 },
                    totalAmount: { $sum: '$total' },
                    avgAmount: { $avg: '$total' },
                    minAmount: { $min: '$total' },
                    maxAmount: { $max: '$total' }
                }
            },
            {
                $project: {
                    _id: 0,
                    totalPurchases: 1,
                    totalAmount: { $round: ['$totalAmount', 2] },
                    avgAmount: { $round: ['$avgAmount', 2] },
                    minAmount: { $round: ['$minAmount', 2] },
                    maxAmount: { $round: ['$maxAmount', 2] }
                }
            }
        ]);

        // Get top products by purchase amount
        const topProducts = await Purchase.aggregate([
            {
                $match: {
                    purchaseDate: dateFilter
                }
            },
            {
                $group: {
                    _id: '$product',
                    count: { $sum: 1 },
                    totalAmount: { $sum: '$total' }
                }
            },
            {
                $sort: { totalAmount: -1 }
            },
            {
                $limit: 5
            },
            {
                $lookup: {
                    from: 'products',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'productInfo'
                }
            },
            {
                $unwind: {
                    path: '$productInfo',
                    preserveNullAndEmptyArrays: true
                }
            },
            {
                $project: {
                    _id: 0,
                    productId: '$_id',
                    productName: { $ifNull: ['$productInfo.name', 'Unknown'] },
                    count: 1,
                    totalAmount: { $round: ['$totalAmount', 2] }
                }
            }
        ]);

        // Return the complete statistics
        res.status(200).json({
            overall: overall.length > 0 ? overall[0] : {
                totalPurchases: 0,
                totalAmount: 0,
                avgAmount: 0,
                minAmount: 0,
                maxAmount: 0
            },
            periodStats: statistics,
            topProducts,
            period,
            dateRange: {
                startDate: dateFilter.$gte ? dateFilter.$gte.toISOString().split('T')[0] : null,
                endDate: dateFilter.$lte ? dateFilter.$lte.toISOString().split('T')[0] : null
            }
        });
        
    } catch (error) {
        console.error("Error generating purchase statistics:", error);
        res.status(500).json({ message: "Error generating statistics", error: error.message });
    }
};