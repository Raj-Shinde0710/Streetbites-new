const mongoose = require("mongoose");

const clothingItemSchema = new mongoose.Schema({
  clothingType: String,
  size: String,
  quantity: String
});

const organizationClothesDonationSchema = new mongoose.Schema({

  organizationName: {
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

  clothesItems: [clothingItemSchema]

}, { timestamps: true });

module.exports = mongoose.model("OrganizationClothesDonation", organizationClothesDonationSchema);
