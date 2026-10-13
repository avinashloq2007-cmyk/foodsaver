// Runtime configuration for decoupled frontend hosting.
// If your backend API is on a separate domain (e.g., https://aravuun-api.onrender.com),
// set window.ARAVUUN_API_URL here.
// Leave as empty string '' if served from the same domain or in local demo mode.
window.ARAVUUN_API_URL = window.ARAVUUN_API_URL || window.FOODSAVER_API_URL || '';
window.FOODSAVER_API_URL = window.ARAVUUN_API_URL;
