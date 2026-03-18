/**
 * Talkdesk Demo MCP Server
 * Order Management & Customer Tools
 *
 * Compatible with: MCP Spec 2024-11-05 (HTTP+SSE) for Talkdesk AI Agent Platform
 *
 * Tools exposed:
 *   - lookup_order        : Get order details by order ID
 *   - lookup_customer     : Get customer profile by email or phone
 *   - list_orders         : List recent orders for a customer
 *   - update_order_status : Update an order's status
 *   - initiate_refund     : Initiate a refund for an order
 *   - check_product_stock : Check product availability
 *   - create_ticket       : Create a support ticket
 */

const http = require("http");
const crypto = require("crypto");

// ─── Mock Data ────────────────────────────────────────────────────────────────

const CUSTOMERS = {
  "C-1001": {
    id: "C-1001",
    name: "Maria Garcia",
    email: "maria.garcia@email.com",
    phone: "+1-555-0101",
    tier: "Gold",
    joinDate: "2022-03-15",
    totalOrders: 23,
    lifetimeValue: 4820.5,
  },
  "C-1002": {
    id: "C-1002",
    name: "James Wilson",
    email: "james.wilson@email.com",
    phone: "+1-555-0202",
    tier: "Silver",
    joinDate: "2023-07-01",
    totalOrders: 8,
    lifetimeValue: 1230.0,
  },
  "C-1003": {
    id: "C-1003",
    name: "Aisha Patel",
    email: "aisha.patel@email.com",
    phone: "+1-555-0303",
    tier: "Platinum",
    joinDate: "2021-01-20",
    totalOrders: 57,
    lifetimeValue: 12490.75,
  },
};

const ORDERS = {
  "ORD-78901": {
    id: "ORD-78901",
    customerId: "C-1001",
    status: "in_transit",
    createdAt: "2025-03-10T09:22:00Z",
    estimatedDelivery: "2025-03-20",
    total: 249.99,
    items: [
      { sku: "SKU-A1", name: "Wireless Headphones Pro", qty: 1, price: 199.99 },
      { sku: "SKU-B3", name: "USB-C Charging Cable", qty: 2, price: 24.99 },
    ],
    carrier: "FedEx",
    trackingNumber: "FX-9876543210",
    shippingAddress: "123 Maple St, Austin TX 78701",
  },
  "ORD-78902": {
    id: "ORD-78902",
    customerId: "C-1001",
    status: "delivered",
    createdAt: "2025-02-28T14:05:00Z",
    deliveredAt: "2025-03-04T11:30:00Z",
    total: 89.95,
    items: [{ sku: "SKU-C2", name: "Smart Watch Band", qty: 1, price: 89.95 }],
    carrier: "UPS",
    trackingNumber: "1Z9999999999999999",
    shippingAddress: "123 Maple St, Austin TX 78701",
  },
  "ORD-88100": {
    id: "ORD-88100",
    customerId: "C-1002",
    status: "processing",
    createdAt: "2025-03-15T07:45:00Z",
    estimatedDelivery: "2025-03-22",
    total: 549.0,
    items: [{ sku: "SKU-D5", name: "4K Webcam Ultra", qty: 1, price: 549.0 }],
    carrier: "UPS",
    trackingNumber: null,
    shippingAddress: "456 Oak Ave, Denver CO 80203",
  },
  "ORD-99210": {
    id: "ORD-99210",
    customerId: "C-1003",
    status: "delivered",
    createdAt: "2025-03-01T11:00:00Z",
    deliveredAt: "2025-03-05T15:00:00Z",
    total: 1299.0,
    refundStatus: "refund_pending",
    items: [
      { sku: "SKU-E9", name: "Mechanical Keyboard Deluxe", qty: 1, price: 1299.0 },
    ],
    carrier: "FedEx",
    trackingNumber: "FX-1122334455",
    shippingAddress: "789 Pine Blvd, Seattle WA 98101",
  },
};

const INVENTORY = {
  "SKU-A1": { name: "Wireless Headphones Pro", stock: 14, reserved: 2 },
  "SKU-B3": { name: "USB-C Charging Cable", stock: 203, reserved: 10 },
  "SKU-C2": { name: "Smart Watch Band", stock: 0, reserved: 0 },
  "SKU-D5": { name: "4K Webcam Ultra", stock: 3, reserved: 1 },
  "SKU-E9": { name: "Mechanical Keyboard Deluxe", stock: 8, reserved: 0 },
  "SKU-F2": { name: "Laptop Stand Aluminum", stock: 45, reserved: 5 },
};

let ticketCounter = 5000;
const TICKETS = {};

// ─── Tool Implementations ─────────────────────────────────────────────────────

function lookupOrder({ order_id }) {
  const order = ORDERS[order_id];
  if (!order) {
    return { success: false, error: `Order ${order_id} not found.` };
  }
  const customer = CUSTOMERS[order.customerId] || null;
  return {
    success: true,
    order: {
      ...order,
      customerName: customer?.name ?? "Unknown",
    },
  };
}

function lookupCustomer({ identifier }) {
  // identifier can be email, phone, or customer ID
  const id = identifier.trim().toUpperCase();
  if (CUSTOMERS[id]) return { success: true, customer: CUSTOMERS[id] };

  const byEmail = Object.values(CUSTOMERS).find(
    (c) => c.email.toLowerCase() === identifier.toLowerCase()
  );
  if (byEmail) return { success: true, customer: byEmail };

  const byPhone = Object.values(CUSTOMERS).find(
    (c) => c.phone === identifier || c.phone.replace(/\D/g, "") === identifier.replace(/\D/g, "")
  );
  if (byPhone) return { success: true, customer: byPhone };

  return { success: false, error: `No customer found for identifier: ${identifier}` };
}

function listOrders({ customer_id, limit = 5 }) {
  const orders = Object.values(ORDERS)
    .filter((o) => o.customerId === customer_id)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, limit)
    .map(({ id, status, createdAt, total, estimatedDelivery, deliveredAt }) => ({
      id,
      status,
      createdAt,
      total,
      estimatedDelivery: estimatedDelivery || null,
      deliveredAt: deliveredAt || null,
    }));

  return { success: true, customerId: customer_id, orders };
}

function updateOrderStatus({ order_id, new_status, reason }) {
  const validStatuses = ["processing", "in_transit", "delivered", "cancelled", "on_hold"];
  if (!validStatuses.includes(new_status)) {
    return { success: false, error: `Invalid status. Must be one of: ${validStatuses.join(", ")}` };
  }
  if (!ORDERS[order_id]) {
    return { success: false, error: `Order ${order_id} not found.` };
  }
  const prev = ORDERS[order_id].status;
  ORDERS[order_id].status = new_status;
  ORDERS[order_id].lastUpdated = new Date().toISOString();
  return {
    success: true,
    orderId: order_id,
    previousStatus: prev,
    newStatus: new_status,
    reason: reason || null,
    updatedAt: ORDERS[order_id].lastUpdated,
  };
}

function initiateRefund({ order_id, reason, amount }) {
  const order = ORDERS[order_id];
  if (!order) return { success: false, error: `Order ${order_id} not found.` };

  if (order.status !== "delivered") {
    return {
      success: false,
      error: `Refunds can only be initiated for delivered orders. Current status: ${order.status}`,
    };
  }
  if (order.refundStatus) {
    return { success: false, error: `A refund is already ${order.refundStatus} for this order.` };
  }

  const refundAmount = amount || order.total;
  const refundId = "REF-" + Date.now();
  ORDERS[order_id].refundStatus = "refund_pending";
  ORDERS[order_id].refundId = refundId;
  ORDERS[order_id].refundAmount = refundAmount;

  return {
    success: true,
    refundId,
    orderId: order_id,
    refundAmount,
    reason,
    estimatedProcessingTime: "3–5 business days",
    status: "refund_pending",
  };
}

function checkProductStock({ sku }) {
  const product = INVENTORY[sku.toUpperCase()];
  if (!product) return { success: false, error: `SKU ${sku} not found in inventory.` };
  const available = product.stock - product.reserved;
  return {
    success: true,
    sku,
    name: product.name,
    totalStock: product.stock,
    reserved: product.reserved,
    availableToPromise: available,
    inStock: available > 0,
  };
}

function createTicket({ customer_id, subject, description, priority = "normal", category }) {
  const customer = CUSTOMERS[customer_id];
  if (!customer) return { success: false, error: `Customer ${customer_id} not found.` };

  const ticketId = `TKT-${++ticketCounter}`;
  const ticket = {
    id: ticketId,
    customerId: customer_id,
    customerName: customer.name,
    subject,
    description,
    priority,
    category: category || "general",
    status: "open",
    createdAt: new Date().toISOString(),
    assignedTeam: priority === "urgent" ? "tier2_support" : "tier1_support",
  };
  TICKETS[ticketId] = ticket;
  return { success: true, ticket };
}

// ─── Tool Registry ─────────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: "lookup_order",
    description:
      "Retrieve full details for a single order by its order ID, including status, items, tracking, and delivery information.",
    inputSchema: {
      type: "object",
      properties: {
        order_id: {
          type: "string",
          description: 'The order ID to look up (e.g. "ORD-78901")',
        },
      },
      required: ["order_id"],
    },
  },
  {
    name: "lookup_customer",
    description:
      "Look up a customer profile by their email address, phone number, or customer ID. Returns tier, lifetime value, and contact details.",
    inputSchema: {
      type: "object",
      properties: {
        identifier: {
          type: "string",
          description: "Customer email, phone number, or customer ID (e.g. C-1001)",
        },
      },
      required: ["identifier"],
    },
  },
  {
    name: "list_orders",
    description: "List the most recent orders for a given customer ID.",
    inputSchema: {
      type: "object",
      properties: {
        customer_id: { type: "string", description: "The customer ID (e.g. C-1001)" },
        limit: {
          type: "integer",
          description: "Maximum number of orders to return (default 5)",
          default: 5,
        },
      },
      required: ["customer_id"],
    },
  },
  {
    name: "update_order_status",
    description:
      "Update the status of an order. Valid statuses: processing, in_transit, delivered, cancelled, on_hold.",
    inputSchema: {
      type: "object",
      properties: {
        order_id: { type: "string", description: "The order ID to update" },
        new_status: {
          type: "string",
          enum: ["processing", "in_transit", "delivered", "cancelled", "on_hold"],
          description: "The new status for the order",
        },
        reason: { type: "string", description: "Optional reason for the status change" },
      },
      required: ["order_id", "new_status"],
    },
  },
  {
    name: "initiate_refund",
    description:
      "Initiate a refund for a delivered order. Returns a refund ID and estimated processing time.",
    inputSchema: {
      type: "object",
      properties: {
        order_id: { type: "string", description: "The order ID to refund" },
        reason: { type: "string", description: "Reason for the refund" },
        amount: {
          type: "number",
          description: "Refund amount in USD. Defaults to the full order total if omitted.",
        },
      },
      required: ["order_id", "reason"],
    },
  },
  {
    name: "check_product_stock",
    description:
      "Check real-time inventory availability for a product SKU. Returns stock levels and whether the item is available to promise.",
    inputSchema: {
      type: "object",
      properties: {
        sku: { type: "string", description: 'Product SKU code (e.g. "SKU-A1")' },
      },
      required: ["sku"],
    },
  },
  {
    name: "create_ticket",
    description:
      "Create a support ticket for a customer. Automatically assigns to the appropriate support tier based on priority.",
    inputSchema: {
      type: "object",
      properties: {
        customer_id: { type: "string", description: "The customer ID" },
        subject: { type: "string", description: "Short subject line for the ticket" },
        description: { type: "string", description: "Detailed description of the issue" },
        priority: {
          type: "string",
          enum: ["low", "normal", "high", "urgent"],
          description: "Ticket priority (default: normal)",
          default: "normal",
        },
        category: {
          type: "string",
          enum: ["order_issue", "refund", "shipping", "product", "billing", "general"],
          description: "Ticket category",
        },
      },
      required: ["customer_id", "subject", "description"],
    },
  },
];

// ─── Tool Dispatch ────────────────────────────────────────────────────────────

function callTool(name, args) {
  switch (name) {
    case "lookup_order":        return lookupOrder(args);
    case "lookup_customer":     return lookupCustomer(args);
    case "list_orders":         return listOrders(args);
    case "update_order_status": return updateOrderStatus(args);
    case "initiate_refund":     return initiateRefund(args);
    case "check_product_stock": return checkProductStock(args);
    case "create_ticket":       return createTicket(args);
    default:
      return { error: `Unknown tool: ${name}` };
  }
}

// ─── MCP JSON-RPC Handler ────────────────────────────────────────────────────

function handleMcpMessage(msg) {
  const { id, method, params } = msg;

  if (method === "initialize") {
    return {
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "talkdesk-order-mcp", version: "1.0.0" },
      },
    };
  }

  if (method === "notifications/initialized") return null;

  if (method === "tools/list") {
    return { jsonrpc: "2.0", id, result: { tools: TOOLS } };
  }

  if (method === "tools/call") {
    const { name, arguments: args } = params;
    try {
      const result = callTool(name, args || {});
      return {
        jsonrpc: "2.0",
        id,
        result: {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          isError: false,
        },
      };
    } catch (err) {
      return {
        jsonrpc: "2.0",
        id,
        result: {
          content: [{ type: "text", text: JSON.stringify({ error: err.message }) }],
          isError: true,
        },
      };
    }
  }

  if (method === "ping") {
    return { jsonrpc: "2.0", id, result: {} };
  }

  return {
    jsonrpc: "2.0",
    id,
    error: { code: -32601, message: `Method not found: ${method}` },
  };
}

// ─── HTTP Server (MCP HTTP+SSE Transport) ────────────────────────────────────

const PORT = process.env.PORT || 3000;
const sessions = new Map();

const server = http.createServer((req, res) => {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);

  // Health check
  if (url.pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", server: "talkdesk-order-mcp", version: "1.0.0" }));
    return;
  }

  // ── SSE endpoint: GET opens persistent stream, POST handles inline JSON-RPC ──
  if (url.pathname === "/sse") {

    // GET: open SSE stream
    if (req.method === "GET") {
      const sessionId = crypto.randomUUID();
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      res.write(`event: endpoint\ndata: /messages?sessionId=${sessionId}\n\n`);
      sessions.set(sessionId, res);
      req.on("close", () => sessions.delete(sessionId));
      return;
    }

    // POST: Talkdesk may POST JSON-RPC directly to /sse (connection test)
    if (req.method === "POST") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        let msg;
        try {
          msg = body ? JSON.parse(body) : { method: "ping", id: 0 };
        } catch {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Invalid JSON" }));
          return;
        }
        const response = handleMcpMessage(msg);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(response || { jsonrpc: "2.0", result: {} }));
      });
      return;
    }
  }

  // ── Message endpoint: client POSTs JSON-RPC here ───────────────────────────
  if (url.pathname === "/messages" && req.method === "POST") {
    const sessionId = url.searchParams.get("sessionId");
    const sseRes = sessionId ? sessions.get(sessionId) : null;

    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      let msg;
      try {
        msg = JSON.parse(body);
      } catch {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid JSON" }));
        return;
      }

      const response = handleMcpMessage(msg);

      // If no live SSE session, respond inline (handles sync clients / connection tests)
      if (!sseRes || sseRes.writableEnded) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(response || { jsonrpc: "2.0", result: {} }));
        return;
      }

      // Return 202 immediately and push response through SSE
      res.writeHead(202);
      res.end();
      if (response) {
        sseRes.write(`event: message\ndata: ${JSON.stringify(response)}\n\n`);
      }
    });
    return;
  }

  // 404
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
});

server.listen(PORT, () => {
  console.log(`\n✅ Talkdesk Order MCP Server running`);
  console.log(`   Port    : ${PORT}`);
  console.log(`   SSE     : http://localhost:${PORT}/sse`);
  console.log(`   Messages: http://localhost:${PORT}/messages`);
  console.log(`   Health  : http://localhost:${PORT}/health`);
  console.log(`\n📦 Tools available (${TOOLS.length}):`);
  TOOLS.forEach((t) => console.log(`   • ${t.name}`));
  console.log(`\n👤 Demo customers: C-1001 (Maria), C-1002 (James), C-1003 (Aisha)`);
  console.log(`📦 Demo orders   : ORD-78901, ORD-78902, ORD-88100, ORD-99210\n`);
});
