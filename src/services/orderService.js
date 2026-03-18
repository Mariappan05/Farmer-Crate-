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

export const getFarmerOrders = async (status = 'all') => {
  let endpoint = '/farmers/orders';
  
  // Map to specific status endpoints based on backend routes
  switch (status.toLowerCase()) {
    case 'pending':
      endpoint = '/farmers/orders/pending';
      break;
    case 'accepted':
    case 'placed':
    case 'confirmed':
      endpoint = '/farmers/orders/accepted';
      break;
    case 'rejected':
    case 'cancelled':
      endpoint = '/farmers/orders/rejected';
      break;
    case 'completed':
    case 'delivered':
      endpoint = '/farmers/orders/completed';
      break;
    case 'all':
    default:
      endpoint = '/farmers/orders';
      break;
  }
  
  console.log('[OrderService] Fetching farmer orders from:', endpoint);
  const { data } = await api.get(endpoint);
  console.log('[OrderService] Response:', data);
  return data;
};

export const getFarmerOrdersByStatus = async (status) => {
  return getFarmerOrders(status);
};

export const acceptFarmerOrder = async (orderId) => {
  console.log('[OrderService] Accepting order:', orderId);
  const { data } = await api.put(`/farmers/orders/${orderId}/accept`);
  console.log('[OrderService] Accept response:', data);
  return data;
};

export const rejectFarmerOrder = async (orderId, reason = null) => {
  console.log('[OrderService] Rejecting order:', orderId, 'Reason:', reason);
  const payload = reason ? { reason } : {};
  const { data } = await api.put(`/farmers/orders/${orderId}/reject`, payload);
  console.log('[OrderService] Reject response:', data);
  return data;
};

export const getFarmerOrderById = async (orderId) => {
  const { data } = await api.get(`/orders/${orderId}`);
  return data;
};

export const updateFarmerOrderStatus = async (orderId, status) => {
  const { data } = await api.put(`/farmers/orders/${orderId}/status`, { status });
  return data;
};

export const assignTransporters = async (orderId) => {
  console.log('[OrderService] Assigning transporters for order:', orderId);
  const { data } = await api.put(`/farmers/orders/${orderId}/assign-transporters`);
  console.log('[OrderService] Assign transporters response:', data);
  return data;
};

// ─── Delivery orders ────────────────────────────────────────────────────────

export const getDeliveryPickups = async () => {
  try {
    console.log('[OrderService] Fetching delivery pickups from /delivery-persons/pickups');
    const { data } = await api.get('/delivery-persons/pickups');
    console.log('[OrderService] Pickup orders response:', data);
    return data;
  } catch (error) {
    console.error('[OrderService] Error fetching pickups:', error.response?.data || error.message);
    throw error;
  }
};

export const getDeliveryDrops = async () => {
  try {
    console.log('[OrderService] Fetching delivery drops from /delivery-persons/deliveries');
    const { data } = await api.get('/delivery-persons/deliveries');
    console.log('[OrderService] Delivery orders response:', data);
    return data;
  } catch (error) {
    console.error('[OrderService] Error fetching deliveries:', error.response?.data || error.message);
    throw error;
  }
};

export const updateDeliveryOrderStatus = async (orderId, status) => {
  const { data } = await api.put(`/delivery-persons/orders/${orderId}/status`, { status });
  return data;
};

// ─── Transporter details ────────────────────────────────────────────────────

export const getTransporterDetails = async (transporterId) => {
  console.log('[OrderService] Fetching transporter details for ID:', transporterId);
  
  // Try multiple endpoints to get transporter details
  const endpoints = [
    `/transporters/${transporterId}`,
    `/admin/transporters/${transporterId}`,
    `/transporter/${transporterId}`,
    `/farmers/transporters/${transporterId}`,
    `/transporters`, // Try getting all transporters and filter
    `/farmers/transporters` // Try getting all transporters for farmers
  ];
  
  for (let i = 0; i < endpoints.length; i++) {
    const endpoint = endpoints[i];
    try {
      console.log('[OrderService] Trying endpoint:', endpoint);
      const { data } = await api.get(endpoint);
      
      // If this is a list endpoint, try to find the specific transporter
      if (endpoint.includes('/transporters') && !endpoint.includes(`/${transporterId}`)) {
        console.log('[OrderService] Got transporters list, searching for ID:', transporterId);
        const transporters = Array.isArray(data) ? data : data?.transporters || data?.data || [];
        const transporter = transporters.find(t => 
          t.transporter_id === parseInt(transporterId) || 
          t.id === parseInt(transporterId) ||
          t.transporter_id === transporterId.toString() ||
          t.id === transporterId.toString()
        );
        
        if (transporter) {
          console.log('[OrderService] Found transporter in list:', transporter);
          return { success: true, data: transporter };
        } else {
          console.log('[OrderService] Transporter not found in list');
          continue;
        }
      } else {
        // Direct endpoint success
        console.log('[OrderService] Success with endpoint:', endpoint, 'Data:', data);
        return { success: true, data: data?.transporter || data };
      }
    } catch (error) {
      console.log('[OrderService] Failed endpoint:', endpoint, 'Error:', error.message);
      continue;
    }
  }
  
  // If all endpoints fail, throw error
  throw new Error(`No transporter endpoint available for ID: ${transporterId}`);
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
