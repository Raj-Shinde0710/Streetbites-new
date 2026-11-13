function getSafeRedirectUrl(target) {
  if (!target || typeof target !== "string") return "/";
  const trimmed = target.trim();
  // Ensure the target is a relative path starting with a single '/'
  // and does not contain protocol specifiers or protocol-relative slashes
  if (
    trimmed.startsWith("/") &&
    !trimmed.startsWith("//") &&
    !trimmed.includes("\\") &&
    !trimmed.includes("://")
  ) {
    return trimmed;
  }
  return "/";
}

function requireLogin(req, res, next) {
  // Check if session contains authenticated normal user credentials
  const hasUserSession = Boolean(
    req.session &&
    (req.session.userId || (req.session.user && req.session.user.role === "user"))
  );

  if (hasUserSession) {
    return next();
  }

  // If this is an AJAX, JSON API, or Razorpay order initiation endpoint, return HTTP 401
  const isApiRequest = Boolean(
    req.xhr ||
    req.headers["x-requested-with"] === "XMLHttpRequest" ||
    (req.headers.accept && req.headers.accept.includes("application/json")) ||
    req.path === "/create-razorpay-order"
  );

  if (isApiRequest) {
    return res.status(401).json({
      error: "Unauthorized",
      message: "Please log in before initiating or submitting a donation."
    });
  }

  // If direct POST submission without authentication, reject with 401 Unauthorized
  if (req.method === "POST") {
    return res.status(401).send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <title>401 Unauthorized - StreetBites</title>
        <script src="https://cdn.tailwindcss.com"></script>
      </head>
      <body class="bg-gray-50 flex items-center justify-center min-h-screen p-6 text-gray-800">
        <div class="max-w-md w-full bg-white p-8 rounded-2xl shadow-xl border border-gray-100 text-center">
          <div class="h-16 w-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path></svg>
          </div>
          <h2 class="text-2xl font-bold text-gray-900 mb-2">Login Required</h2>
          <p class="text-sm text-gray-500 mb-6">Direct donation submissions require an active authenticated user session. Please log in first.</p>
          <a href="/login?redirect=${encodeURIComponent(req.originalUrl || '/')}" class="inline-block bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-2.5 rounded-lg shadow transition">
            Log In to Donate
          </a>
        </div>
      </body>
      </html>
    `);
  }

  // Normal GET request to donation page: preserve destination and redirect to login
  const destination = req.originalUrl || "/";
  req.session.returnTo = destination;
  return res.redirect(
    `/login?redirect=${encodeURIComponent(destination)}&error=${encodeURIComponent("Please log in to make a donation.")}`
  );
}

function isGuest(req, res, next) {
  if (req.session && req.session.user) {
    if (req.session.user.role === "admin") {
      return res.redirect("/admin/dashboard");
    }
    const safeTarget = getSafeRedirectUrl(req.query.redirect || req.session.returnTo || "/");
    delete req.session.returnTo;
    return res.redirect(safeTarget);
  }
  next();
}

function attachUser(req, res, next) {
  res.locals.currentUser = req.session && req.session.user ? req.session.user : null;
  res.locals.adminUser = req.session && req.session.admin ? req.session.admin : null;
  res.locals.isAdmin = Boolean(
    req.session &&
    (req.session.admin || (req.session.user && req.session.user.role === "admin"))
  );
  res.locals.currentPath = req.path;
  res.locals.errorMsg = req.query.error || null;
  res.locals.successMsg = req.query.success || null;
  next();
}

module.exports = {
  getSafeRedirectUrl,
  requireLogin,
  isAuthenticated: requireLogin, // alias for consistency
  isGuest,
  attachUser
};
