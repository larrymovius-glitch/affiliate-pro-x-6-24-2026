import { base44 } from "@/api/base44Client";

// Wrapper around the custom affiliate-pro-api integration
const API_SLUG = "affiliate-pro-api";

export async function apiCall(endpoint, options = {}) {
  const { payload, pathParams, queryParams } = options;
  const response = await base44.integrations.custom.call(
    API_SLUG,
    endpoint,
    { payload, pathParams, queryParams }
  );
  return response;
}

// Auth
export const authAPI = {
  register: (data) => apiCall("post:/api/auth/register", { payload: data }),
  login: (data) => apiCall("post:/api/auth/login", { payload: data }),
  exchangeSession: (data) => apiCall("post:/api/auth/session", { payload: data }),
  me: () => apiCall("get:/api/auth/me"),
  logout: () => apiCall("post:/api/auth/logout"),
};

// Products
export const productsAPI = {
  list: (params) => apiCall("get:/api/products", { queryParams: params }),
  create: (data) => apiCall("post:/api/products", { payload: data }),
  get: (id) => apiCall("get:/api/products/{product_id}", { pathParams: { product_id: id } }),
  update: (id, data) => apiCall("put:/api/products/{product_id}", { pathParams: { product_id: id }, payload: data }),
  delete: (id) => apiCall("delete:/api/products/{product_id}", { pathParams: { product_id: id } }),
};

// Links
export const linksAPI = {
  list: (params) => apiCall("get:/api/links", { queryParams: params }),
  create: (data) => apiCall("post:/api/links", { payload: data }),
  delete: (id) => apiCall("delete:/api/links/{link_id}", { pathParams: { link_id: id } }),
  getPostLog: (params) => apiCall("get:/api/links/post-log", { queryParams: params }),
  logPost: (data) => apiCall("post:/api/links/post-log", { payload: data }),
  checkCooldown: (params) => apiCall("get:/api/links/cooldown-status", { queryParams: params }),
};

// Campaigns
export const campaignsAPI = {
  list: (params) => apiCall("get:/api/campaigns", { queryParams: params }),
  create: (data) => apiCall("post:/api/campaigns", { payload: data }),
  update: (id, data) => apiCall("put:/api/campaigns/{campaign_id}", { pathParams: { campaign_id: id }, payload: data }),
  delete: (id) => apiCall("delete:/api/campaigns/{campaign_id}", { pathParams: { campaign_id: id } }),
};

// Analytics
export const analyticsAPI = {
  overview: (params) => apiCall("get:/api/analytics/overview", { queryParams: params }),
  chartData: (params) => apiCall("get:/api/analytics/chart-data", { queryParams: params }),
};

// Payouts
export const payoutsAPI = {
  list: (params) => apiCall("get:/api/payouts", { queryParams: params }),
  request: (data) => apiCall("post:/api/payouts", { payload: data }),
};

// Payments
export const paymentsAPI = {
  stripeCheckout: (data) => apiCall("post:/api/payments/stripe/checkout", { payload: data }),
  stripeStatus: (sessionId) => apiCall("get:/api/payments/stripe/status/{session_id}", { pathParams: { session_id: sessionId } }),
  paypalCreate: (data) => apiCall("post:/api/payments/paypal/create-order", { payload: data }),
  paypalCapture: (orderId) => apiCall("post:/api/payments/paypal/capture-order/{order_id}", { pathParams: { order_id: orderId } }),
};