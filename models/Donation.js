const mongoose = require("mongoose");

const donationSchema = new mongoose.Schema({
  fullName: {
    type: String,
    required: true
  },

  email: {
    type: String,
    required: true
  },

  address: {
    type: String,
    required: true
  },

  mobile: {
    type: String,
    required: true
  },

  foodName: {
    type: String,
    required: true
  },

  quantity: {
    type: String,
    required: true
  },

  cookingDate: {
    type: Date,
    required: true
  }

}, { timestamps: true });

module.exports = mongoose.model("Donation", donationSchema);