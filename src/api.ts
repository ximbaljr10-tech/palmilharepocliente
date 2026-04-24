// Medusa Backend API - Production Ready
// All API calls go through Nginx reverse proxy (same origin)
// Nginx proxies /store/, /admin/, /auth/, /health to Medusa on port 9000

// Auto-detect Medusa URL based on current host
// In production: frontend and API are on the same host via Nginx (port 80)
// In development: API is on localhost:9000
const MEDUSA_URL = (() => {
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    const port = window.location.port;
    // If served from port 80 (or no port = default), use same origin (Nginx proxy)
    if (port === '' || port === '80' || port === '443') {
      return `${window.location.protocol}//${host}`;
    }
    // Development: Vite dev server on 3000/5173/etc -> Medusa on 9000
    if (host === 'localhost' || host === '127.0.0.1') {
      return "http://localhost:9000";
    }
    // Other: direct to Medusa
    return `http://${host}:9000`;
  }
  return "http://localhost:9000";
})();

const PUBLISHABLE_KEY = "pk_b54130691636a84f3172ebbc1d0ac4d9b14bc2430db612d289a055e341b7b706";
const REGION_ID = "reg_01KK3F27J2GGKVBAPK30N9VBBH";

// Helper for Medusa Store API calls (with publishable key)
async function medusaStore(path: string, options: RequestInit = {}) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-publishable-api-key": PUBLISHABLE_KEY,
    ...(options.headers as Record<string, string> || {}),
  };

  const token = localStorage.getItem("medusa_token");
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${MEDUSA_URL}${path}`, {
    ...options,
    headers,
    credentials: "include",
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: "Erro de conexão" }));
    throw new Error(err.message || `HTTP ${res.status}`);
  }
  return res.json();
}

// Helper for Medusa Auth calls (no publishable key needed)
async function medusaAuth(path: string, options: RequestInit = {}) {
  const res = await fetch(`${MEDUSA_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers as Record<string, string> || {}),
    },
  });
  return res.json();
}

// Shipping dimensions by yards - accurate SuperFrete measurements
function getShippingByYards(yards: number | null, title: string): { height: number; width: number; length: number; weight: number } {
  // Check for carretilha (reel) in title
  if (title && /carretilha/i.test(title)) {
    return { height: 25, width: 33, length: 31, weight: 1.0 };
  }
  switch (yards) {
    case 50:   return { height: 12, width: 12, length: 12, weight: 0.2 };
    case 100:  return { height: 12, width: 12, length: 12, weight: 0.2 };
    case 200:  return { height: 12, width: 12, length: 12, weight: 0.2 };
    case 500:  return { height: 12, width: 12, length: 19, weight: 0.4 };
    case 600:  return { height: 12, width: 18, length: 18, weight: 0.3 };
    case 1000: return { height: 15, width: 15, length: 18, weight: 0.5 };
    case 2000: return { height: 18, width: 18, length: 19, weight: 1.0 };
    case 3000: return { height: 18, width: 18, length: 27, weight: 1.0 };
    case 6000: return { height: 19, width: 19, length: 25, weight: 2.0 };
    case 12000: return { height: 21, width: 21, length: 30, weight: 3.0 };
    default:   return { height: 12, width: 12, length: 12, weight: 0.2 };
  }
}

// Map Medusa product to our frontend format
function mapMedusaProduct(p: any) {
  const variant = p.variants?.[0];
  const price = variant?.calculated_price?.calculated_amount || 0;
  const metadata = p.metadata || {};
  const image = p.images?.[0]?.url || p.thumbnail || "";

  // Extract yards from title
  const yardsMatch = p.title?.match(/(\d+)\s*(j|jds|jardas)\b/i);
  const yards = yardsMatch ? parseInt(yardsMatch[1], 10) : (metadata.yards || null);

  const shipping = getShippingByYards(yards, p.title || '');

  return {
    id: p.id,
    medusa_id: p.id,
    title: p.title,
    handle: p.handle,
    description: p.description || "",
    vendor: p.subtitle || metadata.vendor || "Dente de Tubarão",
    price: price,
    image_url: image,
    yards: yards,
    variant_id: variant?.id,
    metadata: metadata,
    shipping: {
      height: metadata.shipping_height || shipping.height,
      width: metadata.shipping_width || shipping.width,
      length: metadata.shipping_length || shipping.length,
      weight: metadata.shipping_weight || shipping.weight,
    },
  };
}

export const api = {
  // ============ PRODUCTS ============
  getProducts: async (limit = 100, offset = 0) => {
    try {
      const data = await medusaStore(
        // IMPORTANT: Medusa v2 Storefront API omits `metadata` by default.
        // Without `+metadata`, products arrive with metadata=null, which causes
        // calculateShipping() to silently fall back to getShippingByYards()
        // (e.g. 0.2 kg for 50-yard), so a 48-unit PACK (cadastrado como 1 kg)
        // is quoted as 0.2 kg and the freight barely scales with quantity.
        // See AUDIT 2026-04-17 / shipping bug.
        `/store/products?limit=${limit}&offset=${offset}&region_id=${REGION_ID}&fields=*variants.calculated_price,+metadata`
      );
      return {
        products: (data.products || []).map(mapMedusaProduct),
        count: data.count || 0,
      };
    } catch (err) {
      console.error("Erro ao buscar produtos:", err);
      return { products: [], count: 0 };
    }
  },

  getProduct: async (id: string) => {
    try {
      const data = await medusaStore(
        // +metadata: ver comentário em getProducts() acima. Sem isso,
        // todo cálculo de frete cai num fallback genérico de peso por yards.
        `/store/products/${id}?region_id=${REGION_ID}&fields=*variants.calculated_price,+metadata`
      );
      return mapMedusaProduct(data.product);
    } catch (err) {
      console.error("Erro ao buscar produto:", err);
      return null;
    }
  },

  // ============ AUTH ============
  register: async (userData: any) => {
    try {
      // 1. Create auth identity in Medusa
      const authRes = await medusaAuth("/auth/customer/emailpass/register", {
        method: "POST",
        body: JSON.stringify({
          email: userData.email,
          password: userData.password,
        }),
      });

      if (authRes.type === "invalid_data" || authRes.type === "duplicate_error") {
        return { success: false, error: "Email já cadastrado" };
      }

      const token = authRes.token;
      if (!token) {
        return { success: false, error: "Erro ao criar conta" };
      }

      // 2. Create customer profile
      const customerRes = await fetch(`${MEDUSA_URL}/store/customers`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-publishable-api-key": PUBLISHABLE_KEY,
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({
          first_name: userData.name?.split(" ")[0] || userData.firstName || "",
          last_name: userData.name?.split(" ").slice(1).join(" ") || userData.lastName || " ",
          email: userData.email,
          phone: userData.whatsapp || "",
          metadata: { whatsapp: userData.whatsapp || "" },
        }),
      });

      const customerData = await customerRes.json();

      if (customerData.customer) {
        localStorage.setItem("medusa_token", token);
        return {
          success: true,
          userId: customerData.customer.id,
          user: {
            id: customerData.customer.id,
            name: `${customerData.customer.first_name} ${customerData.customer.last_name}`.trim(),
            email: customerData.customer.email,
            role: "customer",
            whatsapp: userData.whatsapp || "",
          },
        };
      }

      // If customer creation failed but auth was created, still return token
      localStorage.setItem("medusa_token", token);
      return {
        success: true,
        userId: "unknown",
        user: {
          id: "unknown",
          name: userData.name || `${userData.firstName || ""} ${userData.lastName || ""}`.trim(),
          email: userData.email,
          role: "customer",
          whatsapp: userData.whatsapp || "",
        },
      };
    } catch (err: any) {
      console.error("Register error:", err);
      return { success: false, error: err.message || "Erro ao criar conta" };
    }
  },

  login: async (credentials: any) => {
    try {
      const authRes = await medusaAuth("/auth/customer/emailpass", {
        method: "POST",
        body: JSON.stringify({
          email: credentials.email,
          password: credentials.password,
        }),
      });

      if (!authRes.token) {
        return { success: false, error: "Credenciais inválidas" };
      }

      localStorage.setItem("medusa_token", authRes.token);

      // Get customer profile
      const customerRes = await fetch(`${MEDUSA_URL}/store/customers/me`, {
        headers: {
          "x-publishable-api-key": PUBLISHABLE_KEY,
          "Authorization": `Bearer ${authRes.token}`,
        },
      });

      const customerData = await customerRes.json();
      const c = customerData.customer;

      if (c) {
        return {
          success: true,
          user: {
            id: c.id,
            name: `${c.first_name || ""} ${c.last_name || ""}`.trim(),
            email: c.email,
            role: "customer",
            whatsapp: c.metadata?.whatsapp || c.phone || "",
          },
        };
      }

      return { success: false, error: "Perfil não encontrado" };
    } catch (err: any) {
      console.error("Login error:", err);
      return { success: false, error: "Credenciais inválidas" };
    }
  },

  logout: async () => {
    localStorage.removeItem("medusa_token");
  },

  // ============ CUSTOMER ============
  updateUser: async (_id: string, updateData: any) => {
    try {
      const res = await medusaStore("/store/customers/me", {
        method: "POST",
        body: JSON.stringify({
          first_name: updateData.name?.split(" ")[0],
          last_name: updateData.name?.split(" ").slice(1).join(" "),
          phone: updateData.whatsapp,
          metadata: { whatsapp: updateData.whatsapp },
        }),
      });
      return { success: true, user: res.customer };
    } catch (err) {
      return { success: false, error: "Erro ao atualizar" };
    }
  },

  // ============ ORDERS (via Medusa custom endpoint) ============
  createOrder: async (orderData: any) => {
    try {
      const res = await fetch(`${MEDUSA_URL}/store/orders-custom`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-publishable-api-key": PUBLISHABLE_KEY,
        },
        body: JSON.stringify({
          customerId: orderData.userId,
          customerName: orderData.name,
          customerEmail: orderData.email,
          customerWhatsapp: orderData.whatsapp,
          customerCpf: orderData.cpf,
          customerAddress: orderData.address,
          addressComponents: orderData.address_components,
          items: orderData.items,
          totalAmount: orderData.totalAmount,
          shippingService: orderData.shipping_service,
          shippingFee: orderData.shipping_fee,
          packageDimensions: orderData.package_dimensions,
          // 2026-04-24 FIX CÁLCULO FRETE: manda a caixa ideal retornada pela
          // SuperFrete (option.ideal_package) + os produtos exatamente como
          // foram enviados na cotação. O backend persiste em order_shipping_box
          // para a etiqueta usar EXATAMENTE as mesmas dimensões.
          idealPackage: orderData.ideal_package || null,
          shippingQuoteProducts: orderData.shipping_quote_products || null,
          shippingQuoteRaw: orderData.shipping_quote_raw || null,
        }),
      });
      const data = await res.json();
      return data;
    } catch (err) {
      console.error("Create order error:", err);
      return { success: false, error: "Erro ao criar pedido" };
    }
  },

  getUserOrders: async (email: string) => {
    try {
      const res = await fetch(
        `${MEDUSA_URL}/store/orders-custom?email=${encodeURIComponent(email)}`,
        {
          headers: {
            "Content-Type": "application/json",
            "x-publishable-api-key": PUBLISHABLE_KEY,
          },
        }
      );
      return await res.json();
    } catch (err) {
      console.error("Get user orders error:", err);
      return [];
    }
  },

  // ============ SHIPPING (SuperFrete via Medusa backend) ============
  //
  // AUDIT 2026-04-24 (v2 — fix cálculo frete):
  //   - Agora enviamos SEMPRE `products[]` (array de produtos individuais)
  //     para o backend, nunca `package`. A SuperFrete calcula a caixa ideal.
  //   - Lemos dimensões na ORDEM CORRETA:
  //       1. metadata.width_cm / height_cm / length_cm / weight_kg (fonte real,
  //          é onde o admin cadastra os valores)
  //       2. campos normalizados (`height`, `width`, `length`, `weight`)
  //       3. legado (`shipping_height`, etc.)
  //       4. fallback seguro (12x12x19, 0.3kg)
  //   - `cache: "no-store"` para garantir que o cálculo é sempre fresco.
  //   - O backend retorna a `package` ideal calculada pela SuperFrete junto
  //     com cada opção de serviço, para ser persistida no pedido.
  calculateShipping: async (cep: string, items: any[]) => {
    try {
      const products = items.map((item) => {
        const meta = item.metadata || {};
        const shipping = item.shipping || {};
        // Pick the first numeric, positive value from the candidates, else fallback
        const pick = (candidates: any[], min: number, fallback: number) => {
          for (const v of candidates) {
            const n = Number(v);
            if (Number.isFinite(n) && n > 0) return Math.max(min, n);
          }
          return fallback;
        };
        return {
          quantity: Math.max(1, Math.floor(Number(item.quantity) || 1)),
          height: pick(
            [meta.height_cm, shipping.shipping_height, shipping.height, item.height],
            1, 12
          ),
          width: pick(
            [meta.width_cm, shipping.shipping_width, shipping.width, item.width],
            1, 12
          ),
          length: pick(
            [meta.length_cm, shipping.shipping_length, shipping.length, item.length],
            1, 19
          ),
          weight: pick(
            [meta.weight_kg, shipping.shipping_weight, shipping.weight, item.weight],
            0.01, 0.3
          ),
        };
      });

      // Debug log (visible in browser devtools) — helps auditing quickly
      if (typeof window !== "undefined" && (window as any).__DDT_DEBUG_SHIPPING__) {
        // Enable with:  window.__DDT_DEBUG_SHIPPING__ = true
        // eslint-disable-next-line no-console
        console.log("[calculateShipping] →", { cep, products });
      }

      const res = await fetch(`${MEDUSA_URL}/store/shipping-quote`, {
        method: "POST",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          "x-publishable-api-key": PUBLISHABLE_KEY,
          "Cache-Control": "no-cache",
        },
        body: JSON.stringify({ cep, products }),
      });

      const data = await res.json();

      if (typeof window !== "undefined" && (window as any).__DDT_DEBUG_SHIPPING__) {
        // eslint-disable-next-line no-console
        console.log("[calculateShipping] ←", data);
      }

      return data;
    } catch (error) {
      console.error("Erro no cálculo de frete:", error);
      return { success: false, error: "Não foi possível calcular o frete." };
    }
  },

  // ============ HELPERS ============
  getMedusaUrl: () => MEDUSA_URL,
};
