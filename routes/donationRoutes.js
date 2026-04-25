const express = require("express");
const router = express.Router();

const IndividualDonation = require("../models/IndividualDonation");
const OrganizationDonation = require("../models/OrganizationDonation");
const IndividualClothesDonation = require("../models/IndividualClothesDonation");
const OrganizationClothesDonation = require("../models/OrganizationClothesDonation");
const IndividualMoneyDonation = require("../models/IndividualMoneyDonation");
const OrganizationMoneyDonation = require("../models/OrganizationMoneyDonation");

const Razorpay = require("razorpay");
const crypto = require("crypto");


// Landing Page
router.get("/", (req,res)=>{
  res.render("index");
});


// Donation Form
router.get("/donate",(req,res)=>{
  const type = req.query.type;
  res.render("donate",{type});
});


// Individual Donation
router.post("/donate/individual", async (req,res)=>{

  try{

    const foodItems = req.body.foodName.map((name,i)=>({
      foodName: name,
      quantity: req.body.quantity[i],
      storage: req.body.storage[i]
    }));

    const donation = new IndividualDonation({

      fullName: req.body.fullName,
      email: req.body.email,
      mobile: req.body.mobile,
      address: req.body.address,

      pickupMethod: req.body.pickupMethod,

      cookingDate: req.body.cookingDate,
      useBeforeDate: req.body.useBeforeDate,

      foodItems: foodItems

    });

    await donation.save();

    res.render("success", { donorName: req.body.fullName });

  }catch(err){

    console.error(err);
    res.send("Error saving individual donation");

  }

});


// Organization Donation
router.post("/donate/organization", async (req,res)=>{

  try{

    const foodItems = req.body.foodName.map((name,i)=>({
      foodName: name,
      quantity: req.body.quantity[i],
      storage: req.body.storage[i]
    }));

    const donation = new OrganizationDonation({

      organizationName: req.body.organizationName,
      email: req.body.email,
      mobile: req.body.mobile,
      address: req.body.address,

      pickupMethod: req.body.pickupMethod,

      cookingDate: req.body.cookingDate,
      useBeforeDate: req.body.useBeforeDate,

      foodItems: foodItems

    });

    await donation.save();

    res.render("success", { donorName: req.body.organizationName });

  }catch(err){

    console.error(err);
    res.send("Error saving organization donation");

  }

});


// Clothes Donation
router.get("/donate/clothes", (req, res) => {
  const type = req.query.type || "individual";
  res.render("donate_clothes", { type });
});

router.post("/donate/clothes/individual", async (req, res) => {
  try {
    const clothesItems = [];
    if (Array.isArray(req.body.clothingType)) {
      req.body.clothingType.forEach((type, i) => {
        clothesItems.push({ clothingType: type, size: req.body.size[i], quantity: req.body.quantity[i] });
      });
    } else if (req.body.clothingType) {
        clothesItems.push({ clothingType: req.body.clothingType, size: req.body.size, quantity: req.body.quantity });
    }

    const donation = new IndividualClothesDonation({
      fullName: req.body.fullName,
      email: req.body.email,
      mobile: req.body.mobile,
      address: req.body.address,
      pickupMethod: req.body.pickupMethod,
      clothesItems: clothesItems
    });
    await donation.save();
    res.render("success", { donorName: req.body.fullName });
  } catch (err) {
    console.error(err);
    res.send("Error saving individual clothes donation: " + err.message);
  }
});

router.post("/donate/clothes/organization", async (req, res) => {
  try {
    const clothesItems = [];
    if (Array.isArray(req.body.clothingType)) {
      req.body.clothingType.forEach((type, i) => {
        clothesItems.push({ clothingType: type, size: req.body.size[i], quantity: req.body.quantity[i] });
      });
    } else if (req.body.clothingType) {
        clothesItems.push({ clothingType: req.body.clothingType, size: req.body.size, quantity: req.body.quantity });
    }

    const donation = new OrganizationClothesDonation({
      organizationName: req.body.organizationName,
      email: req.body.email,
      mobile: req.body.mobile,
      address: req.body.address,
      pickupMethod: req.body.pickupMethod,
      clothesItems: clothesItems
    });
    await donation.save();
    res.render("success", { donorName: req.body.organizationName });
  } catch (err) {
    console.error(err);
    res.send("Error saving organization clothes donation");
  }
});


// Money Donation
router.get("/donate/money", (req, res) => {
  const type = req.query.type || "individual";
  res.render("donate_money", { type, razorpayKey: process.env.RAZORPAY_KEY_ID });
});

router.post("/create-razorpay-order", async (req, res) => {
  try {
    const instance = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });
    const options = {
      amount: req.body.amount * 100, 
      currency: "INR",
      receipt: "receipt_order_" + Math.floor(Math.random() * 10000)
    };
    const order = await instance.orders.create(options);
    if (!order) return res.status(500).send("Some error occured");
    res.json(order);
  } catch (error) {
    res.status(500).send(error);
  }
});

router.post("/donate/money/individual", async (req, res) => {
  try {
    const { razorpay_payment_id, razorpay_order_id, razorpay_signature } = req.body;
    const shasum = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET);
    shasum.update(`${razorpay_order_id}|${razorpay_payment_id}`);
    const digest = shasum.digest("hex");
    
    if (digest !== razorpay_signature) {
      return res.status(400).send("Transaction not legit!");
    }

    const donation = new IndividualMoneyDonation({
      fullName: req.body.fullName,
      email: req.body.email,
      mobile: req.body.mobile,
      amount: req.body.amount,
      message: req.body.message,
      razorpayOrderId: razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id,
      razorpaySignature: razorpay_signature
    });
    await donation.save();
    res.render("success", { donorName: req.body.fullName });
  } catch (err) {
    console.error(err);
    res.send("Error saving individual monetary donation");
  }
});

router.post("/donate/money/organization", async (req, res) => {
  try {
    const { razorpay_payment_id, razorpay_order_id, razorpay_signature } = req.body;
    const shasum = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET);
    shasum.update(`${razorpay_order_id}|${razorpay_payment_id}`);
    const digest = shasum.digest("hex");
    
    if (digest !== razorpay_signature) {
      return res.status(400).send("Transaction not legit!");
    }

    const donation = new OrganizationMoneyDonation({
      organizationName: req.body.organizationName,
      email: req.body.email,
      mobile: req.body.mobile,
      amount: req.body.amount,
      message: req.body.message,
      razorpayOrderId: razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id,
      razorpaySignature: razorpay_signature
    });
    await donation.save();
    res.render("success", { donorName: req.body.organizationName });
  } catch (err) {
    console.error(err);
    res.send("Error saving organization monetary donation");
  }
});

module.exports = router;