import axios from "axios";
import { API_BASE } from "../config/api";

const TOKEN_STORAGE_KEY = "token";
const USER_STORAGE_KEY = "user";

function getStoredToken() {
  try {
    const rawToken = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (!rawToken) {
      return "";
    }

    return String(rawToken).replace(/^"(.*)"$/, "$1").trim();
  } catch (error) {
    return "";
  }
}

function toApiPath(path) {
  if (!path) {
    return "/";
  }

  if (path.startsWith("/api")) {
    return path.replace(/^\/api/, "") || "/";
  }

  return path.startsWith("/") ? path : `/${path}`;
}

function isPublicAuthPath(url = "") {
  return (
    url.includes("/auth/login") ||
    url.includes("/auth/register") ||
    url.includes("/admin/register") ||
    url.includes("/admin/login") ||
    url.includes("/schools") ||
    url.includes("/api/schools") ||
    url.includes("/public/") ||
    url.includes("/api/auth/login") ||
    url.includes("/api/auth/register") ||
    url.includes("/api/admin/register") ||
    url.includes("/api/admin/login") ||
    url.includes("/api/public/")
  );
}

function getLoginRoute() {
  const storedUser = localStorage.getItem(USER_STORAGE_KEY);
  try {
    const parsedUser = storedUser ? JSON.parse(storedUser) : null;
    if (parsedUser?.role === "admin") {
      return "/admin-login";
    }
  } catch (error) {
    // Ignore corrupted storage and fall back to pathname detection.
  }

  return window.location.pathname.startsWith("/admin") ? "/admin-login" : "/login";
}

function clearAuthAndRedirect() {
  localStorage.removeItem(TOKEN_STORAGE_KEY);
  localStorage.removeItem(USER_STORAGE_KEY);

  const loginRoute = getLoginRoute();
  if (window.location.pathname !== loginRoute) {
    window.location.assign(loginRoute);
  }
}

const api = axios.create({
  baseURL: API_BASE,
  timeout: 15000,
  headers: {
    "Content-Type": "application/json",
  },
});

api.interceptors.request.use(
  (config) => {
    const token = getStoredToken();
    const requestUrl = config.url || "";

    if (token) {
      config.headers = config.headers || {};
      config.headers["Content-Type"] = "application/json";
      config.headers.Authorization = `Bearer ${token}`;
      return config;
    }

    if (!isPublicAuthPath(requestUrl)) {
      clearAuthAndRedirect();
      return Promise.reject(new Error("Unauthorized: Token missing or invalid"));
    }

    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401) {
      clearAuthAndRedirect();
      error.message = error?.response?.data?.message || "Unauthorized: Token missing or invalid";
      return Promise.reject(error);
    }

    error.message = getApiErrorMessage(error);
    return Promise.reject(error);
  }
);

export function getApiErrorMessage(error) {
  if (error?.response?.data?.message && error?.response?.data?.error) {
    return `${error.response.data.message}: ${error.response.data.error}`;
  }

  if (error?.response?.data?.message) {
    return error.response.data.message;
  }

  if (error?.response?.data?.error) {
    return error.response.data.error;
  }

  if (Array.isArray(error?.response?.data?.errors) && error.response.data.errors.length > 0) {
    return error.response.data.errors[0];
  }

  if (error?.request) {
    return "Backend unreachable. Check that the API server is running.";
  }

  return error?.message || "Request failed";
}

export async function apiRequest(path, { method = "GET", body, params, isBlob = false } = {}) {
  const response = await api.request({
    url: toApiPath(path),
    method,
    data: body,
    params,
    responseType: isBlob ? "blob" : "json",
  });

  return response.data;
}

export const authApi = {
  health: () => api.get("/health"),
  register: (payload) => api.post("/auth/register", payload),
  login: (payload) => api.post("/auth/login", payload),
  schools: () => api.get("/schools"),
  adminRegister: (payload) => api.post("/admin/register", payload),
  adminLogin: (payload) => api.post("/admin/login", payload),
  adminProfile: () => api.get("/admin/profile"),
};

export default api;
