import Sale from "../models/sales.js";
import Customer from "../models/customer.js";
import Product from "../models/product.js";
import Branch from "../models/branches.js";

// Crear una nueva venta
export const createSale = async (req, res) => {
    try {
        const { id, customer, branch, products, status } = req.body;

        // Verificar que el customer existe
        const customerExists = await Customer.findById(customer);
        if (!customerExists) {
            return res.status(404).json({
                success: false,
                message: "Customer not found"
            });
        }

        // Verificar que la branch existe
        const branchExists = await Branch.findById(branch);
        if (!branchExists) {
            return res.status(404).json({
                success: false,
                message: "Branch not found"
            });
        }

        // Verificar y calcular totales de productos
        const processedProducts = [];
        for (const item of products) {
            const product = await Product.findById(item.product);
            if (!product) {
                return res.status(404).json({
                    success: false,
                    message: `Product with ID ${item.product} not found`
                });
            }

            const total = item.quantity * item.sale_price;
            processedProducts.push({
                product: item.product,
                quantity: item.quantity,
                sale_price: item.sale_price,
                total: total
            });
        }

        const newSale = new Sale({
            id,
            customer,
            branch,
            products: processedProducts,
            status: status || "processing"
        });

        const savedSale = await newSale.save();
        
        // Populate para devolver información completa
        const populatedSale = await Sale.findById(savedSale._id)
            .populate('customer', 'name email phone')
            .populate('branch', 'name address')
            .populate('products.product', 'name price category');

        res.status(201).json({
            success: true,
            message: "Sale created successfully",
            data: populatedSale
        });

    } catch (error) {
        if (error.code === 11000) {
            return res.status(400).json({
                success: false,
                message: "Sale ID already exists"
            });
        }
        
        res.status(500).json({
            success: false,
            message: "Error creating sale",
            error: error.message
        });
    }
};

// Obtener todas las ventas
export const getAllSales = async (req, res) => {
    try {
        const { page = 1, limit = 10, status, branch, customer, startDate, endDate } = req.query;
        
        // Construir filtros
        const filters = {};
        
        if (status) {
            filters.status = status;
        }
        
        if (branch) {
            filters.branch = branch;
        }
        
        if (customer) {
            filters.customer = customer;
        }
        
        if (startDate || endDate) {
            filters.salesDate = {};
            if (startDate) {
                filters.salesDate.$gte = new Date(startDate);
            }
            if (endDate) {
                filters.salesDate.$lte = new Date(endDate);
            }
        }

        const options = {
            page: parseInt(page),
            limit: parseInt(limit),
            populate: [
                { path: 'customer', select: 'name email phone' },
                { path: 'branch', select: 'name address' },
                { path: 'products.product', select: 'name price category' }
            ],
            sort: { createdAt: -1 }
        };

        const sales = await Sale.paginate(filters, options);

        res.status(200).json({
            success: true,
            message: "Sales retrieved successfully",
            data: sales
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error retrieving sales",
            error: error.message
        });
    }
};

// Obtener una venta por ID
export const getSaleById = async (req, res) => {
    try {
        const { id } = req.params;

        const sale = await Sale.findById(id)
            .populate('customer', 'name email phone address')
            .populate('branch', 'name address phone')
            .populate('products.product', 'name price category description');

        if (!sale) {
            return res.status(404).json({
                success: false,
                message: "Sale not found"
            });
        }

        res.status(200).json({
            success: true,
            message: "Sale retrieved successfully",
            data: sale
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error retrieving sale",
            error: error.message
        });
    }
};

// Actualizar una venta
export const updateSale = async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        // Si se actualiza el customer, verificar que existe
        if (updates.customer) {
            const customerExists = await Customer.findById(updates.customer);
            if (!customerExists) {
                return res.status(404).json({
                    success: false,
                    message: "Customer not found"
                });
            }
        }

        // Si se actualiza la branch, verificar que existe
        if (updates.branch) {
            const branchExists = await Branch.findById(updates.branch);
            if (!branchExists) {
                return res.status(404).json({
                    success: false,
                    message: "Branch not found"
                });
            }
        }

        // Si se actualizan productos, verificar y recalcular totales
        if (updates.products) {
            const processedProducts = [];
            for (const item of updates.products) {
                const product = await Product.findById(item.product);
                if (!product) {
                    return res.status(404).json({
                        success: false,
                        message: `Product with ID ${item.product} not found`
                    });
                }

                const total = item.quantity * item.sale_price;
                processedProducts.push({
                    product: item.product,
                    quantity: item.quantity,
                    sale_price: item.sale_price,
                    total: total
                });
            }
            updates.products = processedProducts;
        }

        const updatedSale = await Sale.findByIdAndUpdate(
            id,
            updates,
            { new: true, runValidators: true }
        )
        .populate('customer', 'name email phone')
        .populate('branch', 'name address')
        .populate('products.product', 'name price category');

        if (!updatedSale) {
            return res.status(404).json({
                success: false,
                message: "Sale not found"
            });
        }

        res.status(200).json({
            success: true,
            message: "Sale updated successfully",
            data: updatedSale
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error updating sale",
            error: error.message
        });
    }
};

// Eliminar una venta
export const deleteSale = async (req, res) => {
    try {
        const { id } = req.params;

        const deletedSale = await Sale.findByIdAndDelete(id);

        if (!deletedSale) {
            return res.status(404).json({
                success: false,
                message: "Sale not found"
            });
        }

        res.status(200).json({
            success: true,
            message: "Sale deleted successfully",
            data: deletedSale
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error deleting sale",
            error: error.message
        });
    }
};

// Cambiar estado de una venta
export const updateSaleStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        const validStatuses = ["processing", "completed", "cancelled"];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: "Invalid status. Valid statuses are: processing, completed, cancelled"
            });
        }

        const updatedSale = await Sale.findByIdAndUpdate(
            id,
            { status },
            { new: true, runValidators: true }
        )
        .populate('customer', 'name email phone')
        .populate('branch', 'name address')
        .populate('products.product', 'name price category');

        if (!updatedSale) {
            return res.status(404).json({
                success: false,
                message: "Sale not found"
            });
        }

        res.status(200).json({
            success: true,
            message: "Sale status updated successfully",
            data: updatedSale
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error updating sale status",
            error: error.message
        });
    }
};

// Obtener ventas por sucursal
export const getSalesByBranch = async (req, res) => {
    try {
        const { branchId } = req.params;
        const { page = 1, limit = 10, status, startDate, endDate } = req.query;

        // Verificar que la sucursal existe
        const branchExists = await Branch.findById(branchId);
        if (!branchExists) {
            return res.status(404).json({
                success: false,
                message: "Branch not found"
            });
        }

        // Construir filtros
        const filters = { branch: branchId };
        
        if (status) {
            filters.status = status;
        }
        
        if (startDate || endDate) {
            filters.salesDate = {};
            if (startDate) {
                filters.salesDate.$gte = new Date(startDate);
            }
            if (endDate) {
                filters.salesDate.$lte = new Date(endDate);
            }
        }

        const options = {
            page: parseInt(page),
            limit: parseInt(limit),
            populate: [
                { path: 'customer', select: 'name email phone' },
                { path: 'branch', select: 'name address' },
                { path: 'products.product', select: 'name price category' }
            ],
            sort: { createdAt: -1 }
        };

        const sales = await Sale.paginate(filters, options);

        res.status(200).json({
            success: true,
            message: "Sales by branch retrieved successfully",
            data: sales
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error retrieving sales by branch",
            error: error.message
        });
    }
};

// Obtener estadísticas de ventas
export const getSalesStats = async (req, res) => {
    try {
        const { startDate, endDate, branch } = req.query;

        // Construir filtros para fechas
        const dateFilter = {};
        if (startDate || endDate) {
            dateFilter.salesDate = {};
            if (startDate) {
                dateFilter.salesDate.$gte = new Date(startDate);
            }
            if (endDate) {
                dateFilter.salesDate.$lte = new Date(endDate);
            }
        }

        // Filtro por sucursal si se especifica
        if (branch) {
            dateFilter.branch = branch;
        }

        const stats = await Sale.aggregate([
            { $match: dateFilter },
            {
                $group: {
                    _id: null,
                    totalSales: { $sum: 1 },
                    totalRevenue: { $sum: "$total" },
                    averageSale: { $avg: "$total" },
                    completedSales: {
                        $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] }
                    },
                    processingSales: {
                        $sum: { $cond: [{ $eq: ["$status", "processing"] }, 1, 0] }
                    },
                    cancelledSales: {
                        $sum: { $cond: [{ $eq: ["$status", "cancelled"] }, 1, 0] }
                    }
                }
            }
        ]);

        // Estadísticas por sucursal
        const statsByBranch = await Sale.aggregate([
            { $match: dateFilter },
            {
                $group: {
                    _id: "$branch",
                    totalSales: { $sum: 1 },
                    totalRevenue: { $sum: "$total" },
                    averageSale: { $avg: "$total" }
                }
            },
            {
                $lookup: {
                    from: "branches",
                    localField: "_id",
                    foreignField: "_id",
                    as: "branchInfo"
                }
            },
            {
                $unwind: "$branchInfo"
            },
            {
                $project: {
                    _id: 1,
                    branchName: "$branchInfo.name",
                    totalSales: 1,
                    totalRevenue: 1,
                    averageSale: { $round: ["$averageSale", 2] }
                }
            }
        ]);

        const result = {
            overall: stats[0] || {
                totalSales: 0,
                totalRevenue: 0,
                averageSale: 0,
                completedSales: 0,
                processingSales: 0,
                cancelledSales: 0
            },
            byBranch: statsByBranch
        };

        res.status(200).json({
            success: true,
            message: "Sales statistics retrieved successfully",
            data: result
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error retrieving sales statistics",
            error: error.message
        });
    }
};