import axios from "axios";

// --- Configuration ---
const BASE_URL = "https://payment-tracker-aswa.onrender.com/api";
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// --- Axios Instance ---
// This instance will be used for all API calls.
const api = axios.create({
    baseURL: BASE_URL,
    timeout: 15000, // 15-second timeout
    withCredentials: true,
});

// --- In-Memory Cache ---
// A simple Map to store cached API responses.
const apiCache = new Map();

// --- Interceptors ---
// This code runs before every request to attach the auth token.
api.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem("sessionToken");
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => Promise.reject(error)
);

// This code runs after every response to handle token refreshing.
api.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config;
        if (error.response?.status === 403 && !originalRequest._retry) {
            originalRequest._retry = true;
            try {
                // Use the api instance itself to ensure interceptors are applied
                const response = await api.post("/auth/refresh-token");
                const { sessionToken: newToken } = response.data;
                localStorage.setItem("sessionToken", newToken);
                originalRequest.headers.Authorization = `Bearer ${newToken}`;
                return api(originalRequest);
            } catch (refreshError) {
                // If refresh fails, log out the user.
                localStorage.clear();
                window.location.href = '/'; // Force a reload to the sign-in page
                return Promise.reject(refreshError);
            }
        }
        return Promise.reject(error);
    }
);

// --- Cache Wrapper Function ---
// This function wraps our API calls to handle caching logic automatically.
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

// --- Exported API Methods ---
// This is the final object you will import into your components and contexts.
const apiService = {
    auth: {
        login: (credentials) => api.post("/auth/login", credentials),
        signup: (userData) => api.post("/auth/signup", userData),
        logout: () => api.post("/auth/logout"),
        googleSignIn: (googleToken) => api.post("/auth/google-signin", { googleToken }),
        googleSignUp: (userData) => api.post("/auth/google-signup", userData),
    },
    clients: {
        getClients: (forceRefresh) => withCache('clients', () => api.get("/clients/get-clients"), forceRefresh),
        addClient: (clientData) => api.post("/clients/add-client", clientData),
        updateClient: (clientData) => api.put("/clients/update-client", clientData),
        deleteClient: (clientData) => api.delete("/clients/delete-client", { data: clientData }),
    },
    payments: {
        getPaymentsByYear: (year, forceRefresh) => withCache(`payments_${year}`, () => api.get(`/payments/get-by-year?year=${year}`), forceRefresh),
        savePayment: (paymentData, year) => api.post(`/payments/save-payment?year=${year}`, paymentData),
        addNewYear: (year) => api.post("/payments/add-new-year", { year }),
        importCsv: (csvData, year) => api.post(`/payments/import-csv?year=${year}`, csvData),
        saveRemark: (remarkData, year) => api.post(`/payments/save-remark?year=${year}`, remarkData),
    },
    types: {
        getTypes: (forceRefresh) => withCache('types', () => api.get("/utilities/get-types"), forceRefresh),
        addType: (typeData) => api.post("/utilities/add-type", typeData),
    },
    notifications: {
        getQueue: () => api.get("/notifications/queue"),
        saveQueue: (queue) => api.post("/notifications/queue", { queue }),
        clearQueue: () => api.delete("/notifications/queue"),
    },
    messages: {
        sendEmail: (emailData) => api.post("/messages/send-email", emailData),
        sendWhatsApp: (whatsappData) => api.post("/messages/send-whatsapp", whatsappData),
        verifyWhatsAppContact: (contactData) => api.post("/messages/verify-whatsapp", contactData),
    },
    utils: {
        testSMTP: () => api.get("/utils/test-smtp"),
    }
};

export default apiService;

