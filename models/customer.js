import mongoose from "mongoose";

const CustomerSchema = new mongoose.Schema({
  name: { 
    type: String, 
    required: true, 
    trim: true 
  },
  lastname: { 
    type: String, 
    required: true, 
    trim: true 
  },
  phone: {
    type: String,
    required: true,
    trim: true,
    validate: {
      validator: function(v) {
        return /^\d+$/.test(v);
      },
      message: props => `${props.value} is not a valid phone number. Phone must contain only digits`
    }
  },
  email: { 
    type: String, 
    unique: true, 
    required: true, 
    trim: true,
    lowercase: true
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  },
  status: { 
    type: String, 
    enum: ['active', 'inactive'], 
    default: 'active' 
  },
  isDefault: {
    type: Boolean,
    default: false
  }
});

CustomerSchema.statics.getDefaultCustomer = async function() {
  let defaultCustomer = await this.findOne({ isDefault: true });
  
  if (!defaultCustomer) {
    defaultCustomer = new this({
      name: "Cliente",
      lastname: "Predeterminado",
      phone: "0000000000",
      email: "cpredeterminado@sistema.local",
      isDefault: true,
      status: 'active'
    });
    await defaultCustomer.save();
  }
  
  return defaultCustomer;
};

// Asegurar solo un cliente predeterminado
CustomerSchema.pre('save', async function(next) {
  if (this.isDefault && this.isNew) {
    await this.constructor.updateMany(
      { _id: { $ne: this._id }, isDefault: true },
      { isDefault: false }
    );
  }
  next();
});

const Customer = mongoose.model("Customer", CustomerSchema);

export default Customer;