import mongoose from "mongoose";

const PurchaseSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    proveedor: { type: mongoose.Schema.Types.ObjectId, ref: "Provider", required: true },
    productos: [{
        producto: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
        cantidad: { type: Number, required: true },
        precio_compra: { type: Number, required: true },
        total: { type: Number, required: true }
    }],
    fecha_compra: { type: Date, default: Date.now },
    total: { type: Number, required: true },
    estado: { type: String, enum: ["active", "inactive"], default: "active" }
}, { timestamps: true });

PurchaseSchema.post('save', async function(doc) {
    try {
        for (const item of doc.productos) {
            const producto = await mongoose.model('Product').findById(item.producto);
            
            if (producto) {
                await producto.incrementStock(item.cantidad);
            }
        }
    } catch (error) {
        console.error('Error al actualizar el stock:', error);
    }
});

export default mongoose.model("Purchase", PurchaseSchema);