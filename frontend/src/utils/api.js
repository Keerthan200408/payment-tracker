import axios from "axios";

// API Configuration
const BASE_URL = "https://payment-tracker-aswa.onrender.com/api";

// Create axios instance with default config
const api = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  withCredentials: true,
});

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("sessionToken");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    
    // Reset logout timer on API activity (if callback is available)
    if (window.resetLogoutTimer) {
      window.resetLogoutTimer();
    }
    
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor for token refresh
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    
    if (error.response?.status === 403 && !originalRequest._retry) {
      originalRequest._retry = true;
      
      try {
        const storedToken = localStorage.getItem("sessionToken");
        const response = await api.post("/refresh-token", {}, {
          headers: { Authorization: `Bearer ${storedToken}` },
        });
        
        const { sessionToken: newToken } = response.data;
        localStorage.setItem("sessionToken", newToken);
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        
        return api(originalRequest);
      } catch (refreshError) {
        // Token refresh failed, redirect to login
        localStorage.removeItem("sessionToken");
        localStorage.removeItem("currentUser");
        window.location.reload();
        return Promise.reject(refreshError);
      }
    }
    
    return Promise.reject(error);
  }
);

// API Methods
export const authAPI = {
  login: (credentials) => api.post("/login", credentials),
  signup: (userData) => api.post("/signup", userData),
  logout: () => api.post("/logout"),
  refreshToken: () => api.post("/refresh-token"),
  googleSignIn: (googleToken) => api.post("/google-signin", { googleToken }),
  googleSignUp: (userData) => api.post("/google-signup", userData),
};

export const clientsAPI = {
  getClients: () => api.get("/get-clients"),
  addClient: (clientData) => api.post("/add-client", clientData),
  updateClient: (clientData) => api.put("/update-client", clientData),
  deleteClient: (clientData) => api.delete("/delete-client", { data: clientData }),
};

export const paymentsAPI = {
  getPaymentsByYear: (year) => api.get(`/get-payments-by-year?year=${year}`),
  savePayment: (paymentData, year) => api.post(`/save-payment?year=${year}`, paymentData),
  batchSavePayments: (paymentsData) => api.post("/batch-save-payments", paymentsData),
};

export const typesAPI = {
  getTypes: () => api.get("/get-types"),
  addType: (typeData) => api.post("/add-type", typeData),
};

export const yearsAPI = {
  getUserYears: () => api.get("/get-user-years"),
  addNewYear: (yearData) => api.post("/add-new-year", yearData),
};

export const communicationAPI = {
  sendEmail: (emailData) => api.post("/send-email", emailData),
  sendWhatsApp: (whatsappData) => api.post("/send-whatsapp", whatsappData),
  verifyWhatsAppContact: (contactData) => api.post("/verify-whatsapp-contact", contactData),
};

export const importAPI = {
  importCSV: (csvData) => api.post("/import-csv", csvData),
};

export const utilityAPI = {
  testSMTP: () => api.get("/test-smtp"),
};

// Error handling utility
export const handleAPIError = (error, setErrorMessage) => {
  console.error("API Error:", error);
  
  if (error.response?.status === 401 || error.response?.status === 403) {
    // Authentication error - redirect to login
    localStorage.removeItem("sessionToken");
    localStorage.removeItem("currentUser");
    window.location.reload();
    return;
  }
  
  if (error.response?.status === 429) {
    setErrorMessage("Too many requests. Please wait a moment before trying again.");
    return;
  }
  
  const errorMessage = error.response?.data?.error || 
                      error.response?.data?.message || 
                      error.message || 
                      "An unexpected error occurred";
  
  setErrorMessage(errorMessage);
};

// Cache utility
export const createCacheKey = (endpoint, params = {}) => {
  const paramString = Object.keys(params)
    .sort()
    .map(key => `${key}=${params[key]}`)
    .join('&');
  return `${endpoint}${paramString ? `?${paramString}` : ''}`;
};

export default api; 