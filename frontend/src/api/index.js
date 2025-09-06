import axios from "axios";

/* --------------------------------- Config --------------------------------- */
const BASE_URL =
  process.env.REACT_APP_API_BASE ||
  process.env.VITE_API_BASE ||
  "https://payment-tracker-aswa.onrender.com/api";

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

/* ------------------------------ Axios instance ----------------------------- */
const api = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  withCredentials: true, // keep if your refresh/login uses cookies; otherwise OK to leave
  headers: {
    "Content-Type": "application/json",
  },
});

/* ----------------------------------- Cache -------------------------------- */
const apiCache = new Map();

/* ------------------------------- Interceptors ------------------------------ */
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("sessionToken");
    if (token) {
      // FIX: proper Bearer header
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Handle 403 refresh flow once
    if (error?.response?.status === 403 && !originalRequest?._retry) {
      originalRequest._retry = true;
      try {
        const resp = await api.post("/auth/refresh-token");
        const { sessionToken: newToken } = resp.data || {};
        if (newToken) {
          localStorage.setItem("sessionToken", newToken);
          originalRequest.headers = originalRequest.headers || {};
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
          return api(originalRequest);
        }
      } catch (refreshError) {
        localStorage.clear();
        window.location.href = "/";
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

/* ------------------------------ Cache wrapper ------------------------------ */
const withCache = async (key, apiCall, forceRefresh = false) => {
  if (!forceRefresh) {
    const cached = apiCache.get(key);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      console.log(`[Cache] HIT for key: ${key}`);
      return cached.data;
    }
  }
  console.log(`[Cache] MISS for key: ${key}`);
  const response = await apiCall();
  apiCache.set(key, { data: response.data, timestamp: Date.now() });
  return response.data;
};

/* ---------------------------------- API ----------------------------------- */
const apiService = {
  auth: {
    login: (credentials) => api.post("/auth/login", credentials),
    signup: (userData) => api.post("/auth/signup", userData),
    logout: () => api.post("/auth/logout"),
    googleSignIn: (googleToken) => api.post("/auth/google-signin", { googleToken }),
    googleSignUp: (userData) => api.post("/auth/google-signup", userData),
  },

  clients: {
    getClients: (forceRefresh) =>
      withCache("clients", () => api.get("/clients/get-clients"), forceRefresh),
    addClient: (clientData) => api.post("/clients/add-client", clientData),
    updateClient: (clientData) => api.put("/clients/update-client", clientData),
    deleteClient: (clientData) => api.delete("/clients/delete-client", { data: clientData }),
    bulkDeleteClients: (clientsArray) => api.post("/clients/bulk-delete", { clients: clientsArray })
  },

  payments: {
    getPaymentsByYear: (year, forceRefresh) =>
      withCache(
        `payments_${year}`,
        () => api.get(`/payments/get-by-year?year=${encodeURIComponent(year)}`),
        forceRefresh
      ),
    savePayment: (paymentData, year) =>
      api.post(`/payments/save-payment?year=${encodeURIComponent(year)}`, paymentData),
    addNewYear: (year) => api.post("/payments/add-new-year", { year }),
    importCsv: (csvData, year) => api.post(`/payments/import-csv?year=${encodeURIComponent(year)}`, csvData),
    saveRemark: (remarkData, year) => api.post(`/payments/save-remark?year=${encodeURIComponent(year)}`, remarkData),
    getUserYears: (forceRefresh) =>
      withCache("user_years", () => api.get("/payments/get-user-years"), forceRefresh),
  },

  types: {
    getTypes: (forceRefresh) =>
      withCache("types", () => api.get("/utilities/get-types"), forceRefresh),
    addType: (typeData) => api.post("/utilities/add-type", typeData),
  },

  notifications: {
    getQueue: () => api.get("/notifications/queue"),
    saveQueue: (queue) => api.post("/notifications/queue", { queue }),
    clearQueue: () => api.delete("/notifications/queue"),
  },

  messages: {
    // These must match your backend routes exactly
    sendEmail: (emailData) => api.post("/messages/send-email", emailData),
    sendWhatsApp: (whatsappData) => api.post("/messages/send-whatsapp", whatsappData),
    // keep only if you actually implemented this route on the server:
    verifyWhatsAppContact: (contactData) => api.post("/messages/verify-whatsapp", contactData),
  },

  
  utils: {
    testSMTP: () => api.get("/utils/test-smtp"),
  },
};

export default apiService;