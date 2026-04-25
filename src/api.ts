// Medusa Backend API - Production Ready
// All API calls go through Nginx reverse proxy (same origin)
// Nginx proxies /store/, /admin/, /auth/, /health to Medusa on port 9000

import {
  getShippingDefaults,
  validateShippingDimensions,
  extractYardsFromTitle,
  type ShippingDimensions,
} from './shippingDefaults';

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

// ============================================================================
// Shipping defaults: usa FONTE UNICA de shippingDefaults.ts
// ZERO tabelas duplicadas. ZERO calculo local.
// ============================================================================

// ============================================================================
// URL NORMALIZATION (2026-04-25 FIX IMAGENS)
// ============================================================================
// O provider file-local do Medusa retorna URLs absolutas tipo
// http://localhost:9000/static/<filename>. Essa URL NAO funciona no browser
// do cliente porque 'localhost' aponta para a propria maquina dele.
// Normalizamos para path relativo /static/<filename>, que o nginx proxya
// diretamente para o Medusa na porta 9000.
function normalizeImageUrl(url: any): string {
  if (!url || typeof url !== 'string') return '';
  if (url.startsWith('/')) return url;
  try {
    const u = new URL(url);
    // URLs de upload do Medusa: qualquer host apontando para /static/
    if (u.pathname.startsWith('/static/')) {
      return u.pathname + (u.search || '');
    }
  } catch (_err) {
    // url invalida - deixa como esta
  }
  return url;
}

// Map Medusa product to our frontend format
// 2026-04-25: Usa shippingDefaults.ts centralizado com validacao rigorosa.
// NUNCA retorna null/0/undefined em dimensoes de frete.
function mapMedusaProduct(p: any) {
  const variant = p.variants?.[0];
  const price = variant?.calculated_price?.calculated_amount || 0;
  const metadata = p.metadata || {};
  const rawImage = p.images?.[0]?.url || p.thumbnail || "";
  const image = normalizeImageUrl(rawImage);
  const images = (p.images || [])
    .map((img: any) => normalizeImageUrl(img?.url))
    .filter(Boolean);

  // Extract yards from title
  const yards = extractYardsFromTitle(p.title || '') ?? (metadata.yards || null);

  // Buscar dimensoes do metadata (fonte primaria) e validar contra shippingDefaults
  const validation = validateShippingDimensions(
    {
      height: metadata.shipping_height,
      width: metadata.shipping_width,
      length: metadata.shipping_length,
      weight: metadata.shipping_weight,
    },
    p.title || '',
    yards,
  );

  // Log warnings em dev para auditoria
  if (validation.warnings.length > 0 && typeof window !== 'undefined') {
    console.warn(`[mapMedusaProduct] "${p.title}": ${validation.warnings.join('; ')}`);
  }

  return {
    id: p.id,
    medusa_id: p.id,
    title: p.title,
    handle: p.handle,
    description: p.description || "",
    vendor: p.subtitle || metadata.vendor || "Dente de Tubarão",
    price: price,
    image_url: image,
    images: images,
    yards: yards,
    variant_id: variant?.id,
    metadata: metadata,
    // GARANTIA: dimensoes SEMPRE validas (>= 1cm, >= 0.1kg)
    shipping: validation.dimensions,
    // Estoque (2026-04-25 FRENTE 2)
    unlimited_stock: metadata.unlimited_stock === true,
    stock: (metadata.unlimited_stock === true)
      ? null
      : (typeof metadata.stock_qty === 'number'
          ? Math.max(0, Math.floor(metadata.stock_qty))
          : (typeof metadata.stock_qty === 'string' && metadata.stock_qty.trim() !== '' && !isNaN(Number(metadata.stock_qty))
              ? Math.max(0, Math.floor(Number(metadata.stock_qty)))
              : null)),
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
  // 2026-04-25 v3 — ZERO calculo local. Validacao rigorosa via shippingDefaults.ts.
  //   - Envia SEMPRE `products[]` para o backend → Superfrete calcula caixa ideal
  //   - Dimensoes vem do campo `shipping` do produto (ja validado em mapMedusaProduct)
  //   - Se shipping estiver invalido → bloqueia com erro (nao envia lixo pra Superfrete)
  //   - ZERO fallback oculto. Tudo visivel e auditavel.
  calculateShipping: async (cep: string, items: any[]) => {
    try {
      // Validar CADA produto antes de enviar
      const products: Array<{ quantity: number; height: number; width: number; length: number; weight: number }> = [];
      const validationErrors: string[] = [];

      for (const item of items) {
        const shipping = item.shipping || {};
        const title = item.title || '';
        const yards = item.yards ?? extractYardsFromTitle(title);

        // Validacao rigorosa usando shippingDefaults.ts
        const result = validateShippingDimensions(
          {
            height: shipping.height,
            width: shipping.width,
            length: shipping.length,
            weight: shipping.weight,
          },
          title,
          yards,
        );

        if (!result.valid) {
          validationErrors.push(
            `"${title}": ${result.errors.join(', ')}`
          );
          continue;
        }

        if (result.warnings.length > 0) {
          console.warn(`[calculateShipping] "${title}": ${result.warnings.join('; ')}`);
        }

        products.push({
          quantity: Math.max(1, Math.floor(Number(item.quantity) || 1)),
          height: result.dimensions.height,
          width: result.dimensions.width,
          length: result.dimensions.length,
          weight: result.dimensions.weight,
        });
      }

      // Se algum produto falhou validacao, bloqueia o calculo
      if (validationErrors.length > 0) {
        console.error('[calculateShipping] BLOQUEADO - produtos com dimensoes invalidas:', validationErrors);
        return {
          success: false,
          error: `Produto(s) com dimensoes de frete invalidas. Contate o suporte.`,
          validation_errors: validationErrors,
        };
      }

      if (products.length === 0) {
        return { success: false, error: 'Nenhum produto valido para calcular frete.' };
      }

      // Debug log (visible in browser devtools)
      // Enable with: window.__DDT_DEBUG_SHIPPING__ = true
      if (typeof window !== "undefined" && (window as any).__DDT_DEBUG_SHIPPING__) {
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
        console.log("[calculateShipping] ←", data);
      }

      return data;
    } catch (error) {
      console.error("Erro no calculo de frete:", error);
      return { success: false, error: "Nao foi possivel calcular o frete." };
    }
  },

  // ============ HELPERS ============
  getMedusaUrl: () => MEDUSA_URL,
};
