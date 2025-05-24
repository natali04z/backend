import mongoose from "mongoose";

const CustomerSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  lastname: { type: String, required: true, trim: true },
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
  email: { type: String, unique: true, required: true, trim: true },
  createdAt: { type: Date, default: Date.now },
  status: { type: String, enum: ['active', 'inactive'], default: 'active' }
});

// Ensure only one default customer exists
CustomerSchema.pre('save', async function(next) {
  if (this.isDefault) {
    await this.constructor.updateMany(
      { _id: { $ne: this._id }, isDefault: true },
      { isDefault: false }
    );
  }
  next();
});

// Static method to get the default customer
CustomerSchema.statics.getDefaultCustomer = async function() {
  let defaultCustomer = await this.findOne({ isDefault: true });
  
  // Create default customer if not exists
  if (!defaultCustomer) {
    defaultCustomer = new this({
      name: "Guest",
      lastname: "Customer",
      phone: "0000000000",
      email: "guest@example.com",
      isDefault: true
    });
    await defaultCustomer.save();
  }
  
  return defaultCustomer;
};

const Customer = mongoose.model("Customer", CustomerSchema);

export default Customer;