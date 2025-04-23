import mongoose from "mongoose";

const PurchaseSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  products: [
    {
      product: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
        required: true
      },
      quantity: {
        type: Number,
        required: true,
        min: 1
      },
      price: {
        type: Number,
        required: true,
        min: 0
      }
    }
  ],
  total: {
    type: Number,
    required: true,
    min: 0
  },
  details: {
    type: String,
    trim: true
  },
  purchaseDate: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

export default mongoose.model("Purchase", PurchaseSchema);