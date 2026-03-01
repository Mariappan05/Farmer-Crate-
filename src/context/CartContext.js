import React, { createContext, useContext, useState, useCallback } from 'react';
import api from '../services/api';

const CartContext = createContext({});

export const CartProvider = ({ children }) => {
  const [cartItems, setCartItems] = useState([]);
  const [cartCount, setCartCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  const fetchCart = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await api.get('/cart');
      const raw = res.data?.data || res.data?.cart || res.data?.items || res.data;
      const items = Array.isArray(raw) ? raw : [];
      setCartItems(items);
      setCartCount(items.length);
    } catch (e) { console.log('Cart error:', e.message); }
    finally { setIsLoading(false); }
  }, []);

  const addToCart = useCallback(async (productId, quantity = 1) => {
    try {
      await api.post('/cart', { product_id: productId, quantity });
      await fetchCart();
      return true;
    } catch (e) {
      console.log('Add to cart error:', e.message);
      return false;
    }
  }, [fetchCart]);

  const updateCartItem = useCallback(async (cartId, quantity) => {
    try {
      await api.put(`/cart/${cartId}`, { quantity });
      await fetchCart();
    } catch (e) {
      try {
        await api.put(`/cart/item/${cartId}`, { quantity });
        await fetchCart();
      } catch (e2) { console.log('Update cart error:', e2.message); }
    }
  }, [fetchCart]);

  const removeFromCart = useCallback(async (cartId) => {
    // Optimistic removal — item disappears instantly
    setCartItems(prev => prev.filter(i => (i.cart_id ?? i.cart_item_id ?? i.id) !== cartId));
    setCartCount(prev => Math.max(0, prev - 1));
    // Try multiple endpoint patterns used by different backend versions
    const endpoints = [
      `/cart/${cartId}`,
      `/cart/item/${cartId}`,
      `/cart/items/${cartId}`,
      `/cart/remove/${cartId}`,
    ];
    for (const endpoint of endpoints) {
      try {
        await api.delete(endpoint);
        return; // success — stop trying
      } catch (e) {
        // 404 means wrong endpoint — try next
        if (e.response && e.response.status !== 404) {
          console.log('Remove cart error:', e.message);
          return;
        }
      }
    }
    // All endpoints tried — refetch to sync
    try { await fetchCart(); } catch (_) {}
  }, [fetchCart]);

  const clearCart = useCallback(async () => {
    // Optimistic clear
    setCartItems([]);
    setCartCount(0);
    const endpoints = ['/cart/clear', '/cart/all', '/cart'];
    for (const ep of endpoints) {
      try {
        await api.delete(ep);
        return;
      } catch (e) {
        if (e.response && e.response.status !== 404) return; // real error, stop
      }
    }
  }, []);

  return (
    <CartContext.Provider value={{ cartItems, cartCount, isLoading, fetchCart, addToCart, updateCartItem, removeFromCart, clearCart }}>
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => useContext(CartContext);
export default CartContext;
