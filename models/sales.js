import mongoose from 'mongoose';

// Subesquema para productos en venta
const SaleProductSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Product",
    required: true
  },
  quantity: {
    type: Number,
    required: true,
    min: [1, 'La cantidad debe ser al menos 1']
  },
  price: {
    type: Number,
    required: true,
    min: [0.01, 'El precio debe ser mayor que 0']
  },
  total: {
    type: Number,
    required: true
  }
}, { _id: false });

// Esquema principal de venta
const SaleSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
    unique: true
  },
  customer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Customer",
    required: true
  },
  products: {
    type: [SaleProductSchema],
    required: true,
    validate: {
      validator: function(products) {
        return Array.isArray(products) && products.length > 0;
      },
      message: 'Se requiere al menos un producto para la venta'
    }
  },
  date: {
    type: Date,
    required: true,
    default: Date.now
  },
  total: {
    type: Number,
    required: true
  }
}, {
  timestamps: true
});

// Middleware para calcular el total antes de guardar
SaleSchema.pre('save', function(next) {
  // Si ya se ha proporcionado un total, respetamos ese valor
  if (this.total !== undefined && this.isNew) {
    next();
    return;
  }
  
  // Calcular el total basado en la suma de todos los productos
  this.total = this.products.reduce((sum, item) => {
    // Asegurar que cada producto tenga un total calculado
    if (item.total === undefined) {
      item.total = item.price * item.quantity;
    }
    return sum + item.total;
  }, 0);
  
  next();
});

const Sale = mongoose.model('Sale', SaleSchema);

export default Sale;