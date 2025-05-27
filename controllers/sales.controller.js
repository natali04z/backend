import mongoose from "mongoose";
import Sale from "../models/sales.js";
import Product from "../models/product.js";
import Customer from "../models/customer.js";
import { checkPermission } from "../utils/permissions.js";

// Generar ID personalizado para la venta
async function generateSaleId() {
    const lastSale = await Sale.findOne().sort({ createdAt: -1 });
    if (!lastSale || !/^Sa\d{2}$/.test(lastSale.id)) {
        return "Sa01";
    }

    const lastNumber = parseInt(lastSale.id.substring(2), 10);
    const nextNumber = (lastNumber + 1).toString().padStart(2, "0");
    return `Sa${nextNumber}`;
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
    }
    
    if (data.customer && !mongoose.Types.ObjectId.isValid(data.customer)) {
        errors.push("Invalid customer ID format");
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
        
        // Validar que el product ID sea un ObjectId válido
        if (!mongoose.Types.ObjectId.isValid(item.product)) {
            throw new Error(`Invalid product ID format at index ${i}`);
        }

        const foundProduct = await Product.findById(item.product);
        if (!foundProduct) {
            throw new Error(`Product not found at index ${i}`);
        }

        // Verificar que el producto esté activo
        if (foundProduct.status !== "active") {
            throw new Error(`Cannot sell inactive product "${foundProduct.name}" at index ${i}`);
        }

        // Verificar stock disponible
        if (foundProduct.stock < item.quantity) {
            throw new Error(`Insufficient stock for product "${foundProduct.name}". Available: ${foundProduct.stock}, Requested: ${item.quantity}`);
        }

        // Verificar fecha de vencimiento
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
            productName: foundProduct.name // Para logs
        });
        
        total += itemTotal;
    }

    return { validatedProducts, total };
}

// GET: Obtener todas las ventas
export const getSales = async (req, res) => {
    try {        
        if (!req.user || !checkPermission(req.user.role, "view_sales")) {
            return res.status(403).json({ message: "Unauthorized access" });
        }

        console.log("Executing sales query");
        const sales = await Sale.find()
            .populate("customer", "name lastname email phone")
            .populate("products.product", "id name price")
            .sort({ createdAt: -1 }); // Más recientes primero

        console.log(`Found ${sales.length} sales`);

        const formattedSales = sales.map(sale => {
            const saleObj = sale.toObject();
            
            // Formatear fecha para mostrar
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

// GET: Obtener una venta por ID
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
            .populate("products.product", "id name price");

        if (!sale) {
            return res.status(404).json({ message: "Sale not found" });
        }

        const formattedSale = sale.toObject();
        
        // Formatear fecha para mostrar
        if (formattedSale.salesDate) {
            formattedSale.salesDate = new Date(formattedSale.salesDate).toISOString().split('T')[0];
        }

        res.status(200).json(formattedSale);
    } catch (error) {
        console.error("Error fetching sale:", error);
        res.status(500).json({ message: "Server error", details: error.message });
    }
};

// POST: Crear nueva venta
export const postSale = async (req, res) => {
    try {
        if (!checkPermission(req.user.role, "create_sales")) {
            return res.status(403).json({ message: "Unauthorized access" });
        }

        const { products, customer, salesDate } = req.body;

        // Validar datos de entrada
        const validationErrors = validateSaleData(req.body);
        if (validationErrors.length > 0) {
            return res.status(400).json({ 
                message: "Validation error", 
                errors: validationErrors 
            });
        }

        // Verificar que el cliente existe y está activo
        const existingCustomer = await Customer.findById(customer);
        if (!existingCustomer) {
            return res.status(404).json({ message: "Customer not found" });
        }

        if (existingCustomer.status !== "active") {
            return res.status(400).json({ 
                message: "Cannot create sale for inactive customer" 
            });
        }

        // Validar productos y verificar disponibilidad
        const { validatedProducts, total } = await validateProductsAvailability(products);

        // Reducir stock de productos
        for (const item of validatedProducts) {
            const updateResult = await Product.findByIdAndUpdate(
                item.product,
                { $inc: { stock: -item.quantity } },
                { new: true, runValidators: true }
            );
            
            console.log(`Stock updated for product ${item.productName}: ${updateResult.stock + item.quantity} -> ${updateResult.stock}`);
        }

        // Generar ID personalizado para la venta
        const saleId = await generateSaleId();

        // Crear nueva venta
        const newSale = new Sale({
            id: saleId,
            customer,
            products: validatedProducts.map(item => ({
                product: item.product,
                quantity: item.quantity,
                sale_price: item.sale_price,
                total: item.total
            })),
            salesDate: salesDate ? new Date(salesDate) : new Date(),
            total,
            status: "completed" // Venta completada inmediatamente
        });

        await newSale.save();

        // Obtener la venta creada con populate
        const createdSale = await Sale.findById(newSale._id)
            .populate("customer", "name lastname email phone")
            .populate("products.product", "id name price");

        const formattedSale = createdSale.toObject();
        
        // Formatear fecha para respuesta
        if (formattedSale.salesDate) {
            formattedSale.salesDate = new Date(formattedSale.salesDate).toISOString().split('T')[0];
        }

        res.status(201).json({ 
            message: "Sale completed successfully and stock has been reduced", 
            sale: formattedSale 
        });

    } catch (error) {
        console.error("Error creating sale:", error);
        
        // Manejar errores específicos de validación
        if (error.message.includes("Invalid product") || 
            error.message.includes("not found") || 
            error.message.includes("Insufficient stock") ||
            error.message.includes("expired")) {
            return res.status(400).json({ message: error.message });
        }
        
        res.status(500).json({ message: "Server error", details: error.message });
    }
};

// PATCH: Actualizar estado de venta (versión modificada)
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
        
        const allowedTransitions = {
            "pending": ["processing", "completed", "cancelled"],
            "processing": ["pending", "completed", "cancelled"], 
            "completed": ["cancelled", "pending"],
            "cancelled": ["pending", "processing"]
        };

        // Manejar cambios de stock según el cambio de estado
        if (currentSale.status !== status) {
            // Lógica de stock más inteligente
            const statusStockImpact = {
                "pending": 0,      // No afecta stock
                "processing": -1,  // Reduce stock
                "completed": -1,   // Stock ya reducido
                "cancelled": 0     // Stock restaurado
            };

            const currentImpact = statusStockImpact[currentSale.status];
            const newImpact = statusStockImpact[status];
            
            // Calcular diferencia de stock necesaria
            const stockDifference = newImpact - currentImpact;
            
            if (stockDifference !== 0) {
                for (const item of currentSale.products) {
                    const product = await Product.findById(item.product);
                    if (!product) {
                        return res.status(404).json({
                            message: `Product not found in sale`
                        });
                    }

                    const stockChange = item.quantity * stockDifference;
                    
                    // Verificar stock disponible si vamos a reducir
                    if (stockChange < 0 && product.stock < Math.abs(stockChange)) {
                        return res.status(400).json({
                            message: `Cannot process sale. Insufficient stock for product "${product.name}". Available: ${product.stock}, Required: ${Math.abs(stockChange)}`
                        });
                    }

                    await Product.findByIdAndUpdate(
                        item.product,
                        { $inc: { stock: stockChange } },
                        { new: true }
                    );
                    
                    console.log(`Stock updated for ${product.name}: ${stockChange > 0 ? '+' : ''}${stockChange}`);
                }
            }
        }

        // Actualizar el estado de la venta
        const updatedSale = await Sale.findByIdAndUpdate(
            id,
            { status },
            { new: true, runValidators: true }
        )
            .populate("customer", "name lastname email phone")
            .populate("products.product", "id name price");

        const formattedSale = updatedSale.toObject();
        
        // Formatear fecha para respuesta
        if (formattedSale.salesDate) {
            formattedSale.salesDate = new Date(formattedSale.salesDate).toISOString().split('T')[0];
        }

        const statusMessages = {
            "pending": "Sale status updated to pending",
            "processing": "Sale is now being processed",
            "completed": "Sale has been completed successfully",
            "cancelled": "Sale has been cancelled"
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

// DELETE: Eliminar una venta
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
        
        // Solo permitir eliminar si está en estado pending o cancelled
        if (!["pending", "cancelled"].includes(saleToDelete.status)) {
            return res.status(400).json({ 
                message: "Cannot delete sale that is already being processed or completed. Only pending or cancelled sales can be deleted." 
            });
        }

        // Si la venta está en pending (no cancelled), restaurar stock antes de eliminar
        if (saleToDelete.status === "pending") {
            for (const item of saleToDelete.products) {
                await Product.findByIdAndUpdate(
                    item.product,
                    { $inc: { stock: item.quantity } },
                    { new: true }
                );
                console.log(`Stock restored before deletion: +${item.quantity}`);
            }
        }

        await Sale.findByIdAndDelete(id);

        res.status(200).json({ 
            message: "Sale deleted successfully" + 
                    (saleToDelete.status === "pending" ? " and stock restored" : "")
        });

    } catch (error) {
        console.error("Error deleting sale:", error);
        res.status(500).json({ message: "Server error", details: error.message });
    }
};