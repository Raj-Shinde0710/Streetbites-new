const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const Razorpay = require("razorpay");
const { saveDonation } = require("../utils/storage");
const { requireLogin } = require("../middleware/authMiddleware");

// Helper: parse food items safely whether single string or array
function extractFoodItems(body) {
  const foodNames = [].concat(body.foodName || body["foodName[]"] || []);
  const quantities = [].concat(body.quantity || body["quantity[]"] || []);
  const storages = [].concat(body.storage || body["storage[]"] || []);

  const items = [];
  for (let i = 0; i < foodNames.length; i++) {
    const name = typeof foodNames[i] === "string" ? foodNames[i].trim() : "";
    if (name) {
      items.push({
        foodName: name,
        quantity: quantities[i] ? String(quantities[i]).trim() : "1",
        storage: storages[i] ? String(storages[i]).trim() : "Room Temp"
      });
    }
  }

  if (items.length === 0) {
    items.push({
      foodName: "Cooked Meal",
      quantity: "1 batch",
      storage: "Room Temp"
    });
  }

  return items;
}

// Helper: parse clothes items safely whether single string or array
function extractClothesItems(body) {
  const types = [].concat(body.clothingType || body["clothingType[]"] || []);
  const sizes = [].concat(body.size || body["size[]"] || []);
  const quantities = [].concat(body.quantity || body["quantity[]"] || []);

  const items = [];
  for (let i = 0; i < types.length; i++) {
    const t = typeof types[i] === "string" ? types[i].trim() : "";
    if (t) {
      items.push({
        clothingType: t,
        size: sizes[i] ? String(sizes[i]).trim() : "Standard",
        quantity: quantities[i] ? String(quantities[i]).trim() : "1"
      });
    }
  }

  if (items.length === 0) {
    items.push({
      clothingType: "Clothes",
      size: "Standard",
      quantity: "1"
    });
  }

  return items;
}

// Helper: safe date parsing (avoids Mongoose CastError on empty strings)
function parseDate(val) {
  if (!val) return undefined;
  const d = new Date(val);
  return isNaN(d.getTime()) ? undefined : d;
}

// Helper: get authenticated user ID strictly from server session
function getAuthenticatedUserId(req) {
  if (req.session) {
    if (req.session.userId) return req.session.userId;
    if (req.session.user && req.session.user.id) return req.session.user.id;
  }
  return null;
}

// -------------------------------------------------------------
// Landing Page (Publicly Accessible)
// -------------------------------------------------------------
router.get("/", (req, res) => {
  res.render("index");
});

// -------------------------------------------------------------
// Food Donation (Protected by requireLogin)
// -------------------------------------------------------------
router.get("/donate", requireLogin, (req, res) => {
  const type = req.query.type === "organization" ? "organization" : "individual";
  res.render("donate", { type });
});

router.post("/donate/individual", requireLogin, async (req, res) => {
  try {
    const donorName = req.body.fullName ? req.body.fullName.trim() : (req.session.user ? req.session.user.fullName : "Generous Donor");
    const foodItems = extractFoodItems(req.body);
    const userId = getAuthenticatedUserId(req);

    const donationData = {
      fullName: donorName,
      email: req.body.email ? req.body.email.trim() : (req.session.user ? req.session.user.email : ""),
      mobile: req.body.mobile ? req.body.mobile.trim() : (req.session.user ? req.session.user.mobile : ""),
      address: req.body.address ? req.body.address.trim() : "",
      pickupMethod: req.body.pickupMethod === "self" ? "self" : "volunteer",
      cookingDate: parseDate(req.body.cookingDate),
      useBeforeDate: parseDate(req.body.useBeforeDate),
      foodItems: foodItems,
      status: "Pending",
      user: userId
    };

    await saveDonation("IndividualDonation", donationData);
    res.render("success", { donorName });
  } catch (err) {
    console.error("[Donation Error - Individual Food]:", err);
    res.status(500).send(`<h3>Error saving individual food donation</h3><p>${err.message}</p><p><a href="/donate?type=individual">Go Back</a></p>`);
  }
});

router.post("/donate/organization", requireLogin, async (req, res) => {
  try {
    const orgName = req.body.organizationName ? req.body.organizationName.trim() : "Generous Organization";
    const foodItems = extractFoodItems(req.body);
    const userId = getAuthenticatedUserId(req);

    const donationData = {
      organizationName: orgName,
      email: req.body.email ? req.body.email.trim() : (req.session.user ? req.session.user.email : ""),
      mobile: req.body.mobile ? req.body.mobile.trim() : (req.session.user ? req.session.user.mobile : ""),
      address: req.body.address ? req.body.address.trim() : "",
      pickupMethod: req.body.pickupMethod === "self" ? "self" : "volunteer",
      cookingDate: parseDate(req.body.cookingDate),
      useBeforeDate: parseDate(req.body.useBeforeDate),
      foodItems: foodItems,
      status: "Pending",
      user: userId
    };

    await saveDonation("OrganizationDonation", donationData);
    res.render("success", { donorName: orgName });
  } catch (err) {
    console.error("[Donation Error - Organization Food]:", err);
    res.status(500).send(`<h3>Error saving organization food donation</h3><p>${err.message}</p><p><a href="/donate?type=organization">Go Back</a></p>`);
  }
});

// -------------------------------------------------------------
// Clothes Donation (Protected by requireLogin)
// -------------------------------------------------------------
router.get("/donate/clothes", requireLogin, (req, res) => {
  const type = req.query.type === "organization" ? "organization" : "individual";
  res.render("donate_clothes", { type });
});

router.post("/donate/clothes/individual", requireLogin, async (req, res) => {
  try {
    const donorName = req.body.fullName ? req.body.fullName.trim() : (req.session.user ? req.session.user.fullName : "Generous Donor");
    const clothesItems = extractClothesItems(req.body);
    const userId = getAuthenticatedUserId(req);

    const donationData = {
      fullName: donorName,
      email: req.body.email ? req.body.email.trim() : (req.session.user ? req.session.user.email : ""),
      mobile: req.body.mobile ? req.body.mobile.trim() : (req.session.user ? req.session.user.mobile : ""),
      address: req.body.address ? req.body.address.trim() : "",
      pickupMethod: req.body.pickupMethod === "self" ? "self" : "volunteer",
      clothesItems: clothesItems,
      status: "Pending",
      user: userId
    };

    await saveDonation("IndividualClothesDonation", donationData);
    res.render("success", { donorName });
  } catch (err) {
    console.error("[Donation Error - Individual Clothes]:", err);
    res.status(500).send(`<h3>Error saving clothes donation</h3><p>${err.message}</p><p><a href="/donate/clothes?type=individual">Go Back</a></p>`);
  }
});

router.post("/donate/clothes/organization", requireLogin, async (req, res) => {
  try {
    const orgName = req.body.organizationName ? req.body.organizationName.trim() : "Generous Organization";
    const clothesItems = extractClothesItems(req.body);
    const userId = getAuthenticatedUserId(req);

    const donationData = {
      organizationName: orgName,
      email: req.body.email ? req.body.email.trim() : (req.session.user ? req.session.user.email : ""),
      mobile: req.body.mobile ? req.body.mobile.trim() : (req.session.user ? req.session.user.mobile : ""),
      address: req.body.address ? req.body.address.trim() : "",
      pickupMethod: req.body.pickupMethod === "self" ? "self" : "volunteer",
      clothesItems: clothesItems,
      status: "Pending",
      user: userId
    };

    await saveDonation("OrganizationClothesDonation", donationData);
    res.render("success", { donorName: orgName });
  } catch (err) {
    console.error("[Donation Error - Organization Clothes]:", err);
    res.status(500).send(`<h3>Error saving organization clothes donation</h3><p>${err.message}</p><p><a href="/donate/clothes?type=organization">Go Back</a></p>`);
  }
});

// -------------------------------------------------------------
// Money Donation (Protected by requireLogin)
// -------------------------------------------------------------
router.get("/donate/money", requireLogin, (req, res) => {
  const type = req.query.type === "organization" ? "organization" : "individual";
  res.render("donate_money", { type, razorpayKey: process.env.RAZORPAY_KEY_ID || "" });
});

router.post("/create-razorpay-order", requireLogin, async (req, res) => {
  try {
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      return res.status(500).json({ error: "Razorpay credentials not configured in .env" });
    }

    const instance = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET
    });

    const parsedAmount = Math.max(1, Math.round(Number(req.body.amount || 1)));
    const options = {
      amount: parsedAmount * 100, // paise
      currency: "INR",
      receipt: "rcpt_" + Date.now() + "_" + Math.floor(Math.random() * 1000)
    };

    const order = await instance.orders.create(options);
    res.json(order);
  } catch (error) {
    console.error("[Razorpay Order Error]:", error);
    res.status(500).json({ error: error.message || "Failed to create Razorpay order" });
  }
});

router.post("/donate/money/individual", requireLogin, async (req, res) => {
  try {
    const { razorpay_payment_id, razorpay_order_id, razorpay_signature } = req.body;
    const donorName = req.body.fullName ? req.body.fullName.trim() : (req.session.user ? req.session.user.fullName : "Generous Donor");
    const userId = getAuthenticatedUserId(req);

    // Verify signature strictly
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).send("Payment signature details are missing.");
    }

    if (!process.env.RAZORPAY_KEY_SECRET) {
      return res.status(500).send("Razorpay payment gateway secret is not configured on the server.");
    }

    const shasum = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET);
    shasum.update(`${razorpay_order_id}|${razorpay_payment_id}`);
    const digest = shasum.digest("hex");
    if (digest !== razorpay_signature) {
      return res.status(400).send("Payment signature verification failed. Transaction cannot be validated.");
    }

    const donationData = {
      fullName: donorName,
      email: req.body.email ? req.body.email.trim() : (req.session.user ? req.session.user.email : ""),
      mobile: req.body.mobile ? req.body.mobile.trim() : (req.session.user ? req.session.user.mobile : ""),
      amount: Number(req.body.amount) || 0,
      message: req.body.message ? req.body.message.trim() : "",
      razorpayOrderId: razorpay_order_id || "",
      razorpayPaymentId: razorpay_payment_id || "",
      razorpaySignature: razorpay_signature || "",
      paymentStatus: "Success",
      status: "Completed",
      user: userId
    };

    await saveDonation("IndividualMoneyDonation", donationData);
    res.render("success", { donorName });
  } catch (err) {
    console.error("[Donation Error - Individual Money]:", err);
    res.status(500).send(`<h3>Error saving monetary donation</h3><p>${err.message}</p><p><a href="/donate/money?type=individual">Go Back</a></p>`);
  }
});

router.post("/donate/money/organization", requireLogin, async (req, res) => {
  try {
    const { razorpay_payment_id, razorpay_order_id, razorpay_signature } = req.body;
    const orgName = req.body.organizationName ? req.body.organizationName.trim() : "Generous Organization";
    const userId = getAuthenticatedUserId(req);

    // Verify signature strictly
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).send("Payment signature details are missing.");
    }

    if (!process.env.RAZORPAY_KEY_SECRET) {
      return res.status(500).send("Razorpay payment gateway secret is not configured on the server.");
    }

    const shasum = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET);
    shasum.update(`${razorpay_order_id}|${razorpay_payment_id}`);
    const digest = shasum.digest("hex");
    if (digest !== razorpay_signature) {
      return res.status(400).send("Payment signature verification failed. Transaction cannot be validated.");
    }

    const donationData = {
      organizationName: orgName,
      email: req.body.email ? req.body.email.trim() : (req.session.user ? req.session.user.email : ""),
      mobile: req.body.mobile ? req.body.mobile.trim() : (req.session.user ? req.session.user.mobile : ""),
      amount: Number(req.body.amount) || 0,
      message: req.body.message ? req.body.message.trim() : "",
      razorpayOrderId: razorpay_order_id || "",
      razorpayPaymentId: razorpay_payment_id || "",
      razorpaySignature: razorpay_signature || "",
      paymentStatus: "Success",
      status: "Completed",
      user: userId
    };

    await saveDonation("OrganizationMoneyDonation", donationData);
    res.render("success", { donorName: orgName });
  } catch (err) {
    console.error("[Donation Error - Organization Money]:", err);
    res.status(500).send(`<h3>Error saving organization monetary donation</h3><p>${err.message}</p><p><a href="/donate/money?type=organization">Go Back</a></p>`);
  }
});

module.exports = router;
