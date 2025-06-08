import mongoose from "mongoose";

const SaleSchema = new mongoose.Schema({
    id: {
        type: String,
        unique: true,
        required: true,
        trim: true
    },
    customer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Customer",
        required: true
    },
    branch: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Branch",
        required: true
    },
    products: [{
        product: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Product",
            required: true
        },
        quantity: {
            type: Number,
            required: true,
            validate: {
                validator: function(v) {
                    return Number.isInteger(v) && v > 0;
                },
                message: props => `${props.value} is not a valid quantity. Quantity must be a positive integer`
            }
        },
        sale_price: {
            type: Number,
            required: true,
            validate: {
                validator: function(v) {
                    return Number.isInteger(v) && v >= 0;
                },
                message: props => `${props.value} is not a valid price. Price must be a non-negative integer`
            }
        },
        total: {
            type: Number,
            required: true
        }
    }],
    salesDate: {
        type: Date,
        required: true,
        default: Date.now,
        get: function(date) {
            return date ? date.toISOString().split('T')[0] : null;
        }
    },
    total: {
        type: Number,
        required: true,
        validate: {
            validator: function(v) {
                return Number.isInteger(v) && v >= 0;
            },
            message: props => `${props.value} is not a valid total. Total must be a non-negative integer`
        }
    },
    status: {
        type: String,
        enum: ["processing", "completed", "cancelled"],
        default: "processing"
    }
});

// Pre-save middleware para calcular el total
SaleSchema.pre('save', function() {
    if (this.products && Array.isArray(this.products)) {
        this.total = this.products.reduce((sum, item) => {
            return sum + item.total;
        }, 0);
    }
});

// Virtual to get total items
SaleSchema.virtual('totalItems').get(function() {
    return this.products.reduce((sum, item) => sum + item.quantity, 0);
});

// Virtual to format total as currency
SaleSchema.virtual('formattedTotal').get(function() {
    return `$${this.total.toLocaleString('es-CO')}`;
});

// Método para calcular total producto
SaleSchema.methods.calculateProductTotal = function(product) {
    if (!product.quantity || !product.sale_price) return 0;
    return product.quantity * product.sale_price;
};

SaleSchema.set('toJSON', { virtuals: true, getters: true });
SaleSchema.set('toObject', { virtuals: true, getters: true });

export default mongoose.model("Sale", SaleSchema);