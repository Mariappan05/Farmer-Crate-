import api from './api';

const buildNotificationPayload = ({ orderId, event, status, actorRole, actorId, message, metadata }) => {
  const title = event
    ? `Order ${event.replace(/_/g, ' ')}`
    : 'Order workflow update';
  const body =
    message ||
    `Order ${orderId} updated${status ? ` to ${String(status).replace(/_/g, ' ')}` : ''}.`;

  return {
    order_id: orderId,
    orderId,
    event,
    status,
    actor_role: actorRole,
    actorRole,
    actor_id: actorId,
    actorId,
    message: body,
    title,
    body,
    type: 'order',
    notification_type: 'order',
    metadata: metadata || {},
  };
};

export const triggerOrderWorkflowNotification = async ({
  orderId,
  event,
  status,
  actorRole,
  actorId,
  message,
  metadata,
}) => {
  if (!orderId) return false;

  const payload = buildNotificationPayload({
    orderId,
    event,
    status,
    actorRole,
    actorId,
    message,
    metadata,
  });

  const endpoints = [
    '/notifications/order-workflow',
    '/notifications/order-status',
    '/notifications/send',
    '/notifications',
  ];

  for (const endpoint of endpoints) {
    try {
      await api.post(endpoint, payload);
      return true;
    } catch {
      // Try next endpoint shape without interrupting user flow.
    }
  }

  return false;
};

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
  triggerOrderWorkflowNotification({
    orderId,
    event: 'status_updated',
    status,
    actorRole: 'system',
  });
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
  triggerOrderWorkflowNotification({
    orderId,
    event: 'farmer_accepted',
    status: 'CONFIRMED',
    actorRole: 'farmer',
  });
  return data;
};

export const rejectFarmerOrder = async (orderId, reason = null) => {
  console.log('[OrderService] Rejecting order:', orderId, 'Reason:', reason);
  const payload = reason ? { reason } : {};
  const { data } = await api.put(`/farmers/orders/${orderId}/reject`, payload);
  console.log('[OrderService] Reject response:', data);
  triggerOrderWorkflowNotification({
    orderId,
    event: 'farmer_rejected',
    status: 'CANCELLED',
    actorRole: 'farmer',
    metadata: reason ? { reason } : undefined,
  });
  return data;
};

export const getFarmerOrderById = async (orderId) => {
  const { data } = await api.get(`/orders/${orderId}`);
  return data;
};

export const updateFarmerOrderStatus = async (orderId, status) => {
  const { data } = await api.put(`/farmers/orders/${orderId}/status`, { status });
  triggerOrderWorkflowNotification({
    orderId,
    event: 'farmer_status_updated',
    status,
    actorRole: 'farmer',
  });
  return data;
};

export const assignTransporters = async (orderId) => {
  console.log('[OrderService] Assigning transporters for order:', orderId);
  const attempts = [
    { method: 'put', endpoint: `/farmers/orders/${orderId}/assign-transporters` },
    { method: 'post', endpoint: `/farmers/orders/${orderId}/assign-transporters` },
    { method: 'put', endpoint: `/farmers/orders/${orderId}/assign-transporter` },
    { method: 'post', endpoint: `/farmers/orders/${orderId}/assign-transporter` },
    { method: 'put', endpoint: `/farmers/orders/${orderId}/assign` },
    { method: 'post', endpoint: `/farmers/orders/${orderId}/assign` },
  ];

  let lastError = null;
  for (const attempt of attempts) {
    try {
      const { data } = await api[attempt.method](attempt.endpoint);
      console.log('[OrderService] Assign transporters response:', data, 'via', attempt.method.toUpperCase(), attempt.endpoint);
      triggerOrderWorkflowNotification({
        orderId,
        event: 'transporters_assigned',
        status: 'ASSIGNED',
        actorRole: 'farmer',
      });
      return data;
    } catch (err) {
      lastError = err;
      console.warn(
        '[OrderService] Assign transporters attempt failed:',
        attempt.method.toUpperCase(),
        attempt.endpoint,
        err?.response?.data?.message || err.message
      );
    }
  }

  throw lastError || new Error('Failed to assign transporters');
};

// ─── Delivery orders ────────────────────────────────────────────────────────

const normalizeDeliveryOrders = (payload) =>
  Array.isArray(payload) ? payload : payload?.data || payload?.orders || [];

const isPickupOrder = (order) => {
  const deliveryType = (order?.delivery_type || '').toUpperCase();
  if (deliveryType === 'PICKUP') return true;
  if (deliveryType === 'DELIVERY') return false;

  // Fallback when backend doesn't provide delivery_type.
  const status = (order?.current_status || order?.status || '').toUpperCase();
  return ['ASSIGNED', 'PLACED', 'PICKUP_ASSIGNED', 'PICKUP_IN_PROGRESS', 'PICKED_UP'].includes(status);
};

export const getDeliveryPickups = async () => {
  try {
    console.log('[OrderService] Fetching delivery orders from /delivery-persons/orders (pickup filter)');
    const { data } = await api.get('/delivery-persons/orders');
    const orders = normalizeDeliveryOrders(data);
    const pickups = orders.filter(isPickupOrder);
    console.log('[OrderService] Pickup orders (from /orders) count:', pickups.length);
    return pickups;
  } catch (ordersError) {
    console.warn(
      '[OrderService] /delivery-persons/orders failed for pickups, trying /delivery-persons/pickups:',
      ordersError.response?.data || ordersError.message
    );

    try {
      const { data } = await api.get('/delivery-persons/pickups');
      const pickups = normalizeDeliveryOrders(data);
      console.log('[OrderService] Pickup orders (from /pickups) count:', pickups.length);
      return pickups;
    } catch (error) {
      console.error('[OrderService] Error fetching pickups:', error.response?.data || error.message);
      throw error;
    }
  }
};

export const getDeliveryDrops = async () => {
  try {
    console.log('[OrderService] Fetching delivery orders from /delivery-persons/orders (drop filter)');
    const { data } = await api.get('/delivery-persons/orders');
    const orders = normalizeDeliveryOrders(data);
    const drops = orders.filter((o) => !isPickupOrder(o));
    console.log('[OrderService] Delivery orders (from /orders) count:', drops.length);
    return drops;
  } catch (ordersError) {
    console.warn(
      '[OrderService] /delivery-persons/orders failed for drops, trying /delivery-persons/deliveries:',
      ordersError.response?.data || ordersError.message
    );

    try {
      const { data } = await api.get('/delivery-persons/deliveries');
      const drops = normalizeDeliveryOrders(data);
      console.log('[OrderService] Delivery orders (from /deliveries) count:', drops.length);
      return drops;
    } catch (error) {
      console.error('[OrderService] Error fetching deliveries:', error.response?.data || error.message);
      throw error;
    }
  }
};

export const updateDeliveryOrderStatus = async (orderId, status) => {
  const { data } = await api.put(`/delivery-persons/orders/${orderId}/status`, { status });
  triggerOrderWorkflowNotification({
    orderId,
    event: 'delivery_status_updated',
    status,
    actorRole: 'delivery_person',
  });
  return data;
};

export const updateTransporterOrderStatus = async (orderId, status) => {
  const { data } = await api.put(`/transporters/orders/${orderId}/status`, { status });
  triggerOrderWorkflowNotification({
    orderId,
    event: 'transporter_status_updated',
    status,
    actorRole: 'transporter',
  });
  return data;
};

export const assignTransporterDeliveryPerson = async (
  orderId,
  deliveryPersonId,
  assignmentType = 'delivery'
) => {
  const { data } = await api.put(`/transporters/orders/${orderId}/assign`, {
    delivery_person_id: deliveryPersonId,
  });
  triggerOrderWorkflowNotification({
    orderId,
    event: assignmentType === 'pickup' ? 'pickup_person_assigned' : 'delivery_person_assigned',
    status: assignmentType === 'pickup' ? 'PICKUP_ASSIGNED' : 'OUT_FOR_DELIVERY',
    actorRole: 'transporter',
    metadata: { delivery_person_id: deliveryPersonId, assignment_type: assignmentType },
  });
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

// ─── QR scan status update (transporter/delivery person validation) ─────────
// Backend validates scanner's assigned transporter_id matches the order
export const updateOrderStatusByQR = async (orderId, newStatus, scannerRole) => {
  const { data } = await api.put(`/orders/${orderId}/qr-status`, {
    status: newStatus,
    scanner_role: scannerRole,
  });
  triggerOrderWorkflowNotification({
    orderId,
    event: 'qr_status_updated',
    status: newStatus,
    actorRole: scannerRole,
  });
  return data;
};

// ─── Transporter orders ─────────────────────────────────────────────────────

export const getTransporterOrders = async () => {
  const { data } = await api.get('/transporters/orders');
  return data;
};

export const getTransporterActiveOrders = async () => {
  const { data } = await api.get('/transporters/orders/active');
  return data;
};

export const getOrderTracking = async (orderId) => {
  const { data } = await api.get(`/transporters/orders/${orderId}/track`);
  return data;
};

export const getTransporterOrderUpdates = async (orderId) => {
  const { data } = await api.get(`/transporters/orders/${orderId}/updates`);
  return data;
};

export const manualReceiveOrder = async (orderId, deliveryPersonId, vehicleId) => {
  const { data } = await api.post('/transporters/manual-receive-order', {
    order_id: orderId,
    delivery_person_id: deliveryPersonId,
    permanent_vehicle_id: vehicleId,
  });
  return data;
};

// ─── Admin orders ───────────────────────────────────────────────────────────

export const getAdminOrders = async () => {
  const { data } = await api.get('/admin/orders');
  return data;
};
