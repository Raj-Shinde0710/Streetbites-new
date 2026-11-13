const IndividualDonation = require("../models/IndividualDonation");
const OrganizationDonation = require("../models/OrganizationDonation");
const IndividualClothesDonation = require("../models/IndividualClothesDonation");
const OrganizationClothesDonation = require("../models/OrganizationClothesDonation");
const IndividualMoneyDonation = require("../models/IndividualMoneyDonation");
const OrganizationMoneyDonation = require("../models/OrganizationMoneyDonation");
const User = require("../models/User");

const MODEL_MAP = {
  IndividualDonation: {
    model: IndividualDonation,
    category: "food",
    donorType: "individual"
  },
  OrganizationDonation: {
    model: OrganizationDonation,
    category: "food",
    donorType: "organization"
  },
  IndividualClothesDonation: {
    model: IndividualClothesDonation,
    category: "clothes",
    donorType: "individual"
  },
  OrganizationClothesDonation: {
    model: OrganizationClothesDonation,
    category: "clothes",
    donorType: "organization"
  },
  IndividualMoneyDonation: {
    model: IndividualMoneyDonation,
    category: "money",
    donorType: "individual"
  },
  OrganizationMoneyDonation: {
    model: OrganizationMoneyDonation,
    category: "money",
    donorType: "organization"
  }
};

function formatDonation(doc, modelName) {
  const meta = MODEL_MAP[modelName];
  const obj = doc.toObject ? doc.toObject() : doc;
  const isOrg = meta.donorType === "organization";
  const donorName = isOrg ? (obj.organizationName || "Organization") : (obj.fullName || "Individual Donor");

  let summary = "";
  let amount = 0;

  if (meta.category === "food") {
    const items = obj.foodItems || [];
    if (items.length > 0) {
      summary = items.map(i => `${i.foodName} (${i.quantity || "1"})`).join(", ");
    } else {
      summary = "Food Meal";
    }
  } else if (meta.category === "clothes") {
    const items = obj.clothesItems || [];
    if (items.length > 0) {
      summary = items.map(i => `${i.clothingType} [${i.size || "Std"}] x${i.quantity || "1"}`).join(", ");
    } else {
      summary = "Clothing Items";
    }
  } else if (meta.category === "money") {
    amount = Number(obj.amount) || 0;
    summary = `₹${amount.toLocaleString("en-IN")}`;
  }

  return {
    _id: obj._id ? obj._id.toString() : obj.id,
    modelType: modelName,
    category: meta.category,
    donorType: meta.donorType,
    donorName,
    email: obj.email || "",
    mobile: obj.mobile || "",
    address: obj.address || "",
    status: obj.status || (meta.category === "money" ? "Completed" : "Pending"),
    paymentStatus: obj.paymentStatus || (meta.category === "money" ? "Success" : ""),
    amount,
    summary,
    createdAt: obj.createdAt || new Date(),
    raw: obj
  };
}

/**
 * Get dynamic overview statistics from MongoDB Atlas
 */
async function getDashboardStats() {
  const [
    indFoodCount,
    orgFoodCount,
    indClothesCount,
    orgClothesCount,
    indMoneyCount,
    orgMoneyCount,
    indMoneyDocs,
    orgMoneyDocs,
    totalUsersCount
  ] = await Promise.all([
    IndividualDonation.countDocuments(),
    OrganizationDonation.countDocuments(),
    IndividualClothesDonation.countDocuments(),
    OrganizationClothesDonation.countDocuments(),
    IndividualMoneyDonation.countDocuments(),
    OrganizationMoneyDonation.countDocuments(),
    IndividualMoneyDonation.find({}, "amount paymentStatus"),
    OrganizationMoneyDonation.find({}, "amount paymentStatus"),
    User.countDocuments({ role: "user" })
  ]);

  const totalFood = indFoodCount + orgFoodCount;
  const totalClothes = indClothesCount + orgClothesCount;
  const totalMoney = indMoneyCount + orgMoneyCount;
  const totalIndividual = indFoodCount + indClothesCount + indMoneyCount;
  const totalOrganization = orgFoodCount + orgClothesCount + orgMoneyCount;
  const totalDonations = totalFood + totalClothes + totalMoney;

  // Calculate verified money collected
  let totalMoneyCollected = 0;
  indMoneyDocs.forEach(d => {
    if (!d.paymentStatus || d.paymentStatus === "Success") {
      totalMoneyCollected += (Number(d.amount) || 0);
    }
  });
  orgMoneyDocs.forEach(d => {
    if (!d.paymentStatus || d.paymentStatus === "Success") {
      totalMoneyCollected += (Number(d.amount) || 0);
    }
  });

  return {
    totalDonations,
    totalFood,
    totalClothes,
    totalMoney,
    totalIndividual,
    totalOrganization,
    totalMoneyCollected,
    totalUsersCount
  };
}

/**
 * Fetch unified donations list from all 6 models with filtering, sorting, searching, and pagination
 */
async function getAllUnifiedDonations(options = {}) {
  const {
    category = "all",
    donorType = "all",
    status = "all",
    search = "",
    sort = "newest",
    page = 1,
    limit = 10
  } = options;

  // Determine which models to query based on category and donorType
  const modelsToQuery = [];
  for (const [modelName, meta] of Object.entries(MODEL_MAP)) {
    if (category !== "all" && meta.category !== category) continue;
    if (donorType !== "all" && meta.donorType !== donorType) continue;
    modelsToQuery.push({ name: modelName, model: meta.model });
  }

  // Fetch from the chosen models in parallel
  const results = await Promise.all(
    modelsToQuery.map(async ({ name, model }) => {
      const docs = await model.find().sort({ createdAt: -1 }).lean();
      return docs.map(doc => formatDonation(doc, name));
    })
  );

  // Flatten into single list
  let all = results.flat();

  // Apply status filter
  if (status && status !== "all") {
    all = all.filter(d => (d.status || "").toLowerCase() === status.toLowerCase());
  }

  // Apply search (donorName, email, mobile)
  if (search && search.trim()) {
    const q = search.trim().toLowerCase();
    all = all.filter(d =>
      d.donorName.toLowerCase().includes(q) ||
      d.email.toLowerCase().includes(q) ||
      d.mobile.toLowerCase().includes(q) ||
      d.summary.toLowerCase().includes(q)
    );
  }

  // Sort
  if (sort === "oldest") {
    all.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  } else {
    // default newest
    all.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  // Pagination
  const totalCount = all.length;
  const currentPage = Math.max(1, parseInt(page, 10) || 1);
  const pageSize = Math.max(1, parseInt(limit, 10) || 10);
  const totalPages = Math.ceil(totalCount / pageSize) || 1;
  const startIndex = (currentPage - 1) * pageSize;
  const paginatedDonations = all.slice(startIndex, startIndex + pageSize);

  return {
    donations: paginatedDonations,
    pagination: {
      currentPage,
      totalPages,
      totalCount,
      limit: pageSize,
      hasNext: currentPage < totalPages,
      hasPrev: currentPage > 1
    }
  };
}

/**
 * Fetch a single donation by modelType and ID
 */
async function getDonationById(modelType, id) {
  const meta = MODEL_MAP[modelType];
  if (!meta) throw new Error("Invalid donation model type: " + modelType);

  const doc = await meta.model.findById(id).lean();
  if (!doc) return null;

  return formatDonation(doc, modelType);
}

/**
 * Update donation status
 */
async function updateDonationStatus(modelType, id, newStatus) {
  const meta = MODEL_MAP[modelType];
  if (!meta) throw new Error("Invalid donation model type: " + modelType);

  const validStatuses = ["Pending", "Accepted", "Pickup Scheduled", "Completed", "Rejected"];
  if (!validStatuses.includes(newStatus)) {
    throw new Error("Invalid status: " + newStatus);
  }

  const updatedDoc = await meta.model.findByIdAndUpdate(
    id,
    { $set: { status: newStatus } },
    { returnDocument: "after" }
  );

  if (!updatedDoc) throw new Error("Donation not found");
  return formatDonation(updatedDoc, modelType);
}

/**
 * Fetch all donations linked to a specific user (by userId or user's email)
 */
async function getUserDonations(userId, userEmail) {
  const queryConditions = [];
  if (userId) queryConditions.push({ user: userId });
  if (userEmail) queryConditions.push({ email: new RegExp(`^${userEmail}$`, "i") });

  if (queryConditions.length === 0) return [];

  const orQuery = { $or: queryConditions };

  const results = await Promise.all(
    Object.entries(MODEL_MAP).map(async ([name, meta]) => {
      const docs = await meta.model.find(orQuery).sort({ createdAt: -1 }).lean();
      return docs.map(doc => formatDonation(doc, name));
    })
  );

  const all = results.flat();
  all.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return all;
}

module.exports = {
  MODEL_MAP,
  formatDonation,
  getDashboardStats,
  getAllUnifiedDonations,
  getDonationById,
  updateDonationStatus,
  getUserDonations
};
