const mongoose = require("mongoose");

const organizationMoneyDonationSchema = new mongoose.Schema({
  organizationName: {
    type: String,
    required: true
  },
  email: String,
  mobile: String,
  amount: {
    type: Number,
    required: true
  },
  message: String,
  razorpayOrderId: String,
  razorpayPaymentId: String,
  razorpaySignature: String,
  paymentStatus: {
    type: String,
    enum: ["Success", "Pending", "Failed"],
    default: "Success"
  },
  status: {
    type: String,
    enum: ["Pending", "Accepted", "Completed", "Rejected"],
    default: "Completed"
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null
  }
}, { timestamps: true });

module.exports = mongoose.models.OrganizationMoneyDonation || mongoose.model("OrganizationMoneyDonation", organizationMoneyDonationSchema);
