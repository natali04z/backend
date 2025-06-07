import mongoose from "mongoose";

const PurchaseSchema = new mongoose.Schema({
    id: {
        type: String,
        required: true,
        unique: true
    },
    provider: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Provider",
        required: true
    },
    products: [{
        product: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Product',
            required: true
        },
        quantity: {
            type: Number,
            required: true,
            min: 1,
            validate: {
                validator: function(v) {
                    return Number.isInteger(v) && v > 0;
                },
                message: props => `${props.value} is not a valid quantity. Quantity must be a positive integer`
            }
        },
        purchase_price: {
            type: Number,
            required: true,
            min: 0,
            validate: {
                validator: function(v) {
                    return v > 0;
                },
                message: props => `${props.value} is not a valid price. Price must be a positive number`
            }
        },
        total: {
            type: Number,
            required: true
        }
    }],
    purchase_date: {
        type: Date,
        default: Date.now
    },
    total: {
        type: Number,
        required: true
    },
    status: {
        type: String,
        enum: ["active", "inactive"],
        default: "active"
    },
    // Campos para desactivación
    deactivation_reason: {
        type: String,
        trim: true
    },
    deactivated_at: {
        type: Date
    },
    deactivated_by: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
    },
    // Campos para reactivación
    reactivation_reason: {
        type: String,
        trim: true
    },
    reactivated_at: {
        type: Date
    },
    reactivated_by: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
    }
});

export default mongoose.model("Purchase", PurchaseSchema);