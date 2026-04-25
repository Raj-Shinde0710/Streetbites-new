const mongoose = require("mongoose");

const individualMoneyDonationSchema = new mongoose.Schema({
  fullName: {
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
  razorpaySignature: String
}, { timestamps: true });

module.exports = mongoose.model("IndividualMoneyDonation", individualMoneyDonationSchema);
