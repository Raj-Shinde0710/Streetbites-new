const mongoose = require("mongoose");

const clothingItemSchema = new mongoose.Schema({
  clothingType: String,
  size: String,
  quantity: String
});

const individualClothesDonationSchema = new mongoose.Schema({
  fullName: {
    type: String,
    required: true
  },
  email: String,
  mobile: String,
  address: String,
  pickupMethod: {
    type: String,
    enum: ["volunteer", "self"],
    required: true
  },
  clothesItems: [clothingItemSchema],
  status: {
    type: String,
    enum: ["Pending", "Accepted", "Pickup Scheduled", "Completed", "Rejected"],
    default: "Pending"
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null
  }
}, { timestamps: true });

module.exports = mongoose.models.IndividualClothesDonation || mongoose.model("IndividualClothesDonation", individualClothesDonationSchema);
