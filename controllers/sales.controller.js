import mongoose from "mongoose";
import Sale from "../models/sales.js";
import Product from "../models/product.js";
import Customer from "../models/customer.js";
import { checkPermission } from "../utils/permissions.js";
import PDFDocument from "pdfkit";
import ExcelJS from "exceljs";

// Función para generar ID de venta
async function generateSaleId() {
    const lastSale = await Sale.findOne().sort({ createdAt: -1 });
    if (!lastSale || !/^Sa\d{2}$/.test(lastSale.id)) return "Sa01";
    const lastNumber = parseInt(lastSale.id.substring(2), 10);
    const nextNumber = (lastNumber + 1).toString().padStart(2, "0");
    return `Sa${nextNumber}`;
}

// GET: Obtener todas las ventas
export const getSales = async (req, res) => {
    try {
        if (!req.user || !checkPermission(req.user.role, "view_sales"))
            return res.status(403).json({ message: "Unauthorized access" });

        const sales = await Sale.find()
            .populate("customer", "name")
            .populate("products.product", "name");

        res.status(200).json(sales);
    } catch (error) {
        console.error("Error fetching sales:", error);
        res.status(500).json({ message: "Server error" });
    }
};

// GET: Obtener venta por ID
export const getSaleById = async (req, res) => {
    try {
        if (!req.user || !checkPermission(req.user.role, "view_sales_id"))
            return res.status(403).json({ message: "Unauthorized access" });

        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id))
            return res.status(400).json({ message: "Invalid sale ID format" });

        const sale = await Sale.findById(id)
            .populate("customer", "name")
            .populate("products.product", "name");

        if (!sale) return res.status(404).json({ message: "Sale not found" });

        res.status(200).json(sale);
    } catch (error) {
        console.error("Error fetching sale:", error);
        res.status(500).json({ message: "Server error" });
    }
};

// POST: Crear nueva venta
export const postSale = async (req, res) => {
    try {
        if (!checkPermission(req.user.role, "create_sales"))
            return res.status(403).json({ message: "Unauthorized access" });

        const { customer, products } = req.body;
        if (!mongoose.Types.ObjectId.isValid(customer))
            return res.status(400).json({ message: "Invalid customer ID" });

        if (!Array.isArray(products) || products.length === 0)
            return res.status(400).json({ message: "At least one product is required" });

        let total = 0;
        const validatedProducts = [];

        for (let i = 0; i < products.length; i++) {
            const item = products[i];
            if (!mongoose.Types.ObjectId.isValid(item.product))
                return res.status(400).json({ message: `Invalid product ID at index ${i}` });

            const product = await Product.findById(item.product);
            if (!product)
                return res.status(404).json({ message: `Product not found at index ${i}` });

            const itemTotal = item.price * item.quantity;
            validatedProducts.push({ ...item, total: itemTotal });
            total += itemTotal;
        }

        const id = await generateSaleId();

        const newSale = new Sale({
            id,
            customer,
            products: validatedProducts,
            total,
            salesDate: new Date()
        });

        await newSale.save();
        res.status(201).json({ message: "Sale created successfully", sale: newSale });
    } catch (error) {
        console.error("Error creating sale:", error);
        res.status(500).json({ message: "Server error" });
    }
};

// PUT: Actualizar venta
export const updateSale = async (req, res) => {
    try {
        if (!checkPermission(req.user.role, "edit_sales"))
            return res.status(403).json({ message: "Unauthorized access" });

        const { id } = req.params;
        const { customer, products } = req.body;

        if (!mongoose.Types.ObjectId.isValid(id))
            return res.status(400).json({ message: "Invalid sale ID format" });

        const sale = await Sale.findById(id);
        if (!sale) return res.status(404).json({ message: "Sale not found" });

        let total = 0;
        const updatedProducts = [];

        for (let i = 0; i < products.length; i++) {
            const item = products[i];
            if (!mongoose.Types.ObjectId.isValid(item.product))
                return res.status(400).json({ message: `Invalid product ID at index ${i}` });

            const itemTotal = item.price * item.quantity;
            updatedProducts.push({ ...item, total: itemTotal });
            total += itemTotal;
        }

        sale.customer = customer;
        sale.products = updatedProducts;
        sale.total = total;

        await sale.save();
        res.status(200).json({ message: "Sale updated successfully", sale });
    } catch (error) {
        console.error("Error updating sale:", error);
        res.status(500).json({ message: "Server error" });
    }
};

// DELETE: Eliminar venta
export const deleteSale = async (req, res) => {
    try {
        if (!checkPermission(req.user.role, "delete_sales"))
            return res.status(403).json({ message: "Unauthorized access" });

        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id))
            return res.status(400).json({ message: "Invalid sale ID format" });

        const deleted = await Sale.findByIdAndDelete(id);
        if (!deleted) return res.status(404).json({ message: "Sale not found" });

        res.status(200).json({ message: "Sale deleted successfully" });
    } catch (error) {
        console.error("Error deleting sale:", error);
        res.status(500).json({ message: "Server error" });
    }
};

// GET: Exportar PDF de ventas
export const exportSalesPDF = async (req, res) => {
    try {
        if (!checkPermission(req.user.role, "view_sales"))
            return res.status(403).json({ message: "Unauthorized access" });

        const sales = await Sale.find()
            .sort({ salesDate: -1 })
            .populate("customer", "name")
            .populate("products.product", "name");

        if (!sales.length) return res.status(404).json({ message: "No sales found" });

        const doc = new PDFDocument({ margin: 40, size: 'A4' });
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename=ventas-${Date.now()}.pdf`);
        doc.pipe(res);

        doc.fontSize(20).text("Reporte de Ventas - IceSoft", { align: "center" });
        doc.moveDown();

        sales.forEach((sale, idx) => {
            doc.fontSize(10).text(`Venta ID: ${sale.id}`);
            doc.text(`Cliente: ${sale.customer?.name || "Desconocido"}`);
            doc.text(`Fecha: ${new Date(sale.salesDate).toLocaleDateString('es-CO')}`);
            sale.products.forEach(p => {
                doc.text(` - ${p.product?.name || "Producto"} x${p.quantity} - $${p.total.toLocaleString('es-CO')}`);
            });
            doc.text(`Total: $${sale.total.toLocaleString('es-CO')}`);
            doc.moveDown();
            if ((idx + 1) % 10 === 0) doc.addPage();
        });

        doc.end();
    } catch (error) {
        console.error("Error exporting sales PDF:", error);
        res.status(500).json({ message: "Error generating PDF report" });
    }
};

// GET: Exportar Excel de ventas
export const exportSalesExcel = async (req, res) => {
    try {
        if (!checkPermission(req.user.role, "view_sales"))
            return res.status(403).json({ message: "Unauthorized access" });

        const sales = await Sale.find()
            .sort({ salesDate: -1 })
            .populate("customer", "name")
            .populate("products.product", "name");

        if (!sales.length) return res.status(404).json({ message: "No sales found" });

        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet("Ventas");

        sheet.columns = [
            { header: "ID Venta", key: "id", width: 15 },
            { header: "Cliente", key: "customer", width: 25 },
            { header: "Fecha", key: "date", width: 15 },
            { header: "Producto", key: "product", width: 30 },
            { header: "Cantidad", key: "quantity", width: 10 },
            { header: "Precio", key: "price", width: 12 },
            { header: "Total Producto", key: "productTotal", width: 15 },
            { header: "Total Venta", key: "total", width: 15 }
        ];

        sales.forEach(sale => {
            sale.products.forEach(p => {
                sheet.addRow({
                    id: sale.id,
                    customer: sale.customer?.name || "Desconocido",
                    date: new Date(sale.salesDate).toLocaleDateString('es-CO'),
                    product: p.product?.name || "Producto",
                    quantity: p.quantity,
                    price: p.price,
                    productTotal: p.total,
                    total: sale.total
                });
            });
        });

        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        res.setHeader("Content-Disposition", `attachment; filename=ventas-${Date.now()}.xlsx`);

        await workbook.xlsx.write(res);
        res.end();
    } catch (error) {
        console.error("Error exporting sales Excel:", error);
        res.status(500).json({ message: "Error generating Excel report" });
    }
};
