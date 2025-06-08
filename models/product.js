import mongoose from "mongoose";

const ProductSchema = new mongoose.Schema({
  id: { type: String, unique: true, required: true, trim: true },
  name: { type: String, required: true, trim: true },
  category: { type: mongoose.Schema.Types.ObjectId, ref: "Category", required: true },
  price: {
    type: Number,
    required: true,
    min: [0, 'Price cannot be negative'],
    validate: {
      validator: function(v) {
        return typeof v === 'number' && v >= 0;
      },
      message: props => `${props.value} is not a valid price. Price must be a positive number`
    }
  },
  batchDate: {
    type: Date,
    required: true,
    get: function(date) {
      return date ? date.toISOString().split('T')[0] : null;
    }
  },
  expirationDate: {
    type: Date,
    required: true,
    get: function(date) {
      return date ? date.toISOString().split('T')[0] : null;
    }
  },
  stock: {
    type: Number,
    required: true,
    default: 0,
    validate: {
      validator: function(v) {
        return Number.isInteger(v) && v >= 0;
      },
      message: props => `${props.value} is not a valid quantity. Stock must be a non-negative integer`
    }
  },
  status: {
    type: String,
    enum: ["active", "inactive"],
    default: "active"
  }
});

ProductSchema.methods.incrementStock = function(quantity) {
  this.stock += quantity;
  return this.save();
};

ProductSchema.methods.decrementStock = function(quantity) {
  if (this.stock < quantity) {
    throw new Error('Insufficient stock');
  }
  this.stock -= quantity;
  return this.save();
};

ProductSchema.methods.getFormattedPrice = function() {
  return `$${this.price.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

ProductSchema.virtual('formattedPrice').get(function() {
  return this.getFormattedPrice();
});

ProductSchema.set('toJSON', { virtuals: true, getters: true });
ProductSchema.set('toObject', { virtuals: true, getters: true });

export default mongoose.model("Product", ProductSchema);