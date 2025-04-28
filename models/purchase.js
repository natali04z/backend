import mongoose from "mongoose";

const PurchaseSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    products: [{
        product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
        quantity: { type: Number, required: true },
        price: { type: Number, required: true },
        total: { type: Number, required: true }
    }],
    total: { type: Number, required: true },
    details: { type: String, required: true },
    purchaseDate: { type: Date, default: Date.now },
    status: { type: String, enum: ["active", "inactive"], default: "active" }
}, { timestamps: true });

export default mongoose.model("Purchase", PurchaseSchema);