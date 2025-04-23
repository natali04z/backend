import mongoose from 'mongoose';

const BranchSchema = new mongoose.Schema({
  idBranch: { type: mongoose.Schema.Types.ObjectId, auto: true },
  name: { type: String, required: true },
  address: { type: String, required: true },
  phone: { type: String, required: true }
});

export default mongoose.model('Branch', BranchSchema);