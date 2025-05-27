import { validateProductForSale } from "../controllers/product.controller.js";

export const validateProductsForSale = async (req, res, next) => {
    try {
        const { products } = req.body;
        
        if (!products || !Array.isArray(products)) {
            return res.status(400).json({ 
                message: "Se requiere una lista de productos para procesar la venta" 
            });
        }

        const validationResults = [];
        const invalidProducts = [];

        // Validar cada producto
        for (const item of products) {
            // CAMBIO: usar item.product en lugar de item.productId
            const validation = await validateProductForSale(item.product);
            
            if (!validation.isValid) {
                invalidProducts.push({
                    productId: item.product, // CAMBIO: usar item.product
                    error: validation.message
                });
            } else {
                // Verificar que hay suficiente stock
                if (validation.product.stock < item.quantity) {
                    invalidProducts.push({
                        productId: item.product, // CAMBIO: usar item.product
                        error: `Stock insuficiente. Disponible: ${validation.product.stock}, Solicitado: ${item.quantity}`
                    });
                } else {
                    validationResults.push({
                        productId: item.product, // CAMBIO: usar item.product
                        product: validation.product,
                        quantity: item.quantity
                    });
                }
            }
        }

        // Si hay productos inválidos, retornar error
        if (invalidProducts.length > 0) {
            return res.status(400).json({
                message: "Verifica que todos los productos estén activos y tengan stock suficiente",
                invalidProducts: invalidProducts
            });
        }

        // Agregar los productos validados al request
        req.validatedProducts = validationResults;
        next();

    } catch (error) {
        console.error("Error validating products for sale:", error);
        res.status(500).json({ 
            message: "Error interno del servidor al validar productos" 
        });
    }
};

// También corregir el endpoint de verificación individual
export const checkProductAvailability = async (req, res) => {
    try {
        const { productId } = req.params;
        const { quantity } = req.query;
        
        const validation = await validateProductForSale(productId);
        
        if (!validation.isValid) {
            return res.status(400).json({
                available: false,
                message: validation.message
            });
        }

        const product = validation.product;
        const requestedQuantity = parseInt(quantity) || 1;
        
        const response = {
            available: product.stock >= requestedQuantity,
            product: {
                id: product.id,
                name: product.name,
                price: product.price,
                stock: product.stock,
                status: product.status
            },
            requestedQuantity,
            availableStock: product.stock
        };

        if (!response.available) {
            response.message = `Stock insuficiente. Disponible: ${product.stock}, Solicitado: ${requestedQuantity}`;
        }

        res.status(200).json(response);
        
    } catch (error) {
        console.error("Error checking product availability:", error);
        res.status(500).json({ message: "Error verificando disponibilidad del producto" });
    }
};