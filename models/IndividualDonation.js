const mongoose = require("mongoose");

const foodItemSchema = new mongoose.Schema({
  foodName: String,
  quantity: String,
  storage: String
});

const individualDonationSchema = new mongoose.Schema({
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
  cookingDate: Date,
  useBeforeDate: Date,
  foodItems: [foodItemSchema],
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

module.exports = mongoose.models.IndividualDonation || mongoose.model("IndividualDonation", individualDonationSchema);
