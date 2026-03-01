import api from './api';

// ─── Create order with QR ───────────────────────────────────────────────────

export const createOrder = async (orderData) => {
  const { data } = await api.post('/orders', orderData);
  return data;
};

export const getOrdersByToken = async () => {
  const { data } = await api.get('/orders/my-orders');
  return data;
};

export const getOrderById = async (orderId) => {
  const { data } = await api.get(`/orders/${orderId}`);
  return data;
};

export const updateOrderStatus = async (orderId, status) => {
  const { data } = await api.put(`/orders/${orderId}/status`, { status });
  return data;
};

export const updateQRImage = async (qrCode, imageUrl) => {
  const { data } = await api.put('/orders/qr-image', { qr_code: qrCode, qr_image_url: imageUrl });
  return data;
};

// ─── Customer orders ────────────────────────────────────────────────────────

export const getCustomerOrders = async () => {
  const { data } = await api.get('/orders');
  return data;
};

// ─── Farmer orders ──────────────────────────────────────────────────────────

export const getFarmerOrders = async () => {
  const { data } = await api.get('/farmers/orders');
  return data;
};

export const updateFarmerOrderStatus = async (orderId, status) => {
  const { data } = await api.put(`/farmers/orders/${orderId}/status`, { status });
  return data;
};

// ─── Delivery orders ────────────────────────────────────────────────────────

export const getDeliveryPickups = async () => {
  const { data } = await api.get('/delivery-persons/pickups');
  return data;
};

export const getDeliveryDrops = async () => {
  const { data } = await api.get('/delivery-persons/deliveries');
  return data;
};

export const updateDeliveryOrderStatus = async (orderId, status) => {
  const { data } = await api.put(`/delivery-persons/orders/${orderId}/status`, { status });
  return data;
};

// ─── Transporter orders ─────────────────────────────────────────────────────

export const getTransporterOrders = async () => {
  const { data } = await api.get('/transporter/orders');
  return data;
};

// ─── Admin orders ───────────────────────────────────────────────────────────

export const getAdminOrders = async () => {
  const { data } = await api.get('/admin/orders');
  return data;
};
