import mongoose from "mongoose";

const SaleSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: "Customer", required: true },
    products: [{
        product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
        quantity: { type: Number, required: true },
        price: { type: Number, required: true },
        total: { type: Number, required: true }
    }],
    total: { type: Number, required: true },
    salesDate: { type: Date, default: Date.now }
}, { timestamps: true });

export default mongoose.model("Sale", SaleSchema);