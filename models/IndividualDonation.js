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

  foodItems: [foodItemSchema]

}, { timestamps: true });

module.exports = mongoose.model("IndividualDonation", individualDonationSchema);