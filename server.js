const http = require("http");
const crypto = require("crypto");

// ─── Mock Data ────────────────────────────────────────────────────────────────

const CUSTOMERS = {
  "C-1001": { id: "C-1001", name: "Maria Garcia", email: "maria.garcia@email.com", phone: "+1-555-0101", tier: "Gold", joinDate: "2022-03-15", totalOrders: 23, lifetimeValue: 4820.50 },
  "C-1002": { id: "C-1002", name: "James Wilson", email: "james.wilson@email.com", phone: "+1-555-0202", tier: "Silver", joinDate: "2023-07-01", totalOrders: 8, lifetimeValue: 1230.00 },
  "C-1003": { id: "C-1003", name: "Aisha Patel", email: "aisha.patel@email.com", phone: "+1-555-0303", tier: "Platinum", joinDate: "2021-01-20", totalOrders: 57, lifetimeValue: 12490.75 },
};

const ORDERS = {
  "ORD-78901": { id: "ORD-78901", customerId: "C-1001", status: "in_transit", createdAt: "2025-03-10T09:22:00Z", estimatedDelivery: "2025-03-20", total: 249.99, items: [{ sku: "SKU-A1", name: "Wireless Headphones Pro", qty: 1, price: 199.99 }], carrier: "FedEx", trackingNumber: "FX-9876543210", shippingAddress: "123 Maple St, Austin TX 78701" },
  "ORD-78902": { id: "ORD-78902", customerId: "C-1001", status: "delivered", createdAt: "2025-02-28T14:05:00Z", deliveredAt: "2025-03-04T11:30:00Z", total: 89.95, items: [{ sku: "SKU-C2", name: "Smart Watch Band", qty: 1, price: 89.95 }], carrier: "UPS", trackingNumber: "1Z9999999999999999", shippingAddress: "123 Maple St, Austin TX 78701" },
  "ORD-88100": { id: "ORD-88100", customerId: "C-1002", status: "processing", createdAt: "2025-03-15T07:45:00Z", estimatedDelivery: "2025-03-22", total: 549.00, items: [{ sku: "SKU-D5", name: "4K Webcam Ultra", qty: 1, price: 549.00 }], carrier: "UPS", trackingNumber: null, shippingAddress: "456 Oak Ave, Denver CO 80203" },
  "ORD-99210": { id: "ORD-99210", customerId: "C-1003", status: "delivered", createdAt: "2025-03-01T11:00:00Z", deliveredAt: "2025-03-05T15:00:00Z", total: 1299.00, items: [{ sku: "SKU-E9", name: "Mechanical Keyboard Deluxe", qty: 1, price: 1299.00 }], carrier: "FedEx", trackingNumber: "FX-1122334455", shippingAddress: "789 Pine Blvd, Seattle WA 98101" },
};

const INVENTORY = {
  "SKU-A1": { name: "Wireless Headphones Pro", stock: 14, reserved: 2 },
  "SKU-B3": { name: "USB-C Charging Cable", stock: 203, reserved: 10 },
  "SKU-C2": { name: "Smart Watch Band", stock: 0, reserved: 0 },
  "SKU-D5": { name: "4K Webcam Ultra", stock: 3, reserved: 1 },
  "SKU-E9": { name: "Mechanical Keyboard Deluxe", stock: 8, reserved: 0 },
};

let ticketCounter = 5000;
const TICKETS = {};

// ─── Tools ────────────────────────────────────────────────────────────────────

const TOOLS = [
  { name: "lookup_order", description: "Get full order details by order ID including status, items, tracking, and delivery info.", inputSchema: { type: "object", properties: { order_id: { type: "string", description: "Order ID e.g. ORD-78901" } }, required: ["order_id"] } },
  { name: "lookup_customer", description: "Find a customer profile by email, phone number, or customer ID. Returns tier, lifetime value, and contact details.", inputSchema: { type: "object", properties: { identifier: { type: "string", description: "Email, phone, or customer ID e.g. C-1001" } }, required: ["identifier"] } },
  { name: "list_orders", description: "List recent orders for a customer.", inputSchema: { type: "object", properties: { customer_id: { type: "string", description: "Customer ID e.g. C-1001" }, limit: { type: "integer", default: 5 } }, required: ["customer_id"] } },
  { name: "update_order_status", description: "Update the status of an order.", inputSchema: { type: "object", properties: { order_id: { type: "string" }, new_status: { type: "string", enum: ["processing","in_transit","delivered","cancelled","on_hold"] }, reason: { type: "string" } }, required: ["order_id","new_status"] } },
  { name: "initiate_refund", description: "Initiate a refund for a delivered order.", inputSchema: { type: "object", properties: { order_id: { type: "string" }, reason: { type: "string" }, amount: { type: "number" } }, required: ["order_id","reason"] } },
  { name: "check_product_stock", description: "Check inventory availability for a product SKU.", inputSchema: { type: "object", properties: { sku: { type: "string", description: "Product SKU e.g. SKU-A1" } }, required: ["sku"] } },
  { name: "create_ticket", description: "Create a support ticket for a customer.", inputSchema: { type: "object", properties: { customer_id: { type: "string" }, subject: { type: "string" }, description: { type: "string" }, priority: { type: "string", enum: ["low","normal","high","urgent"], default: "normal" }, category: { type: "string" } }, required: ["customer_id","subject","description"] } },
];

function callTool(name, args) {
  if (name === "lookup_order") {
    const order = ORDERS[args.order_id];
    if (!order) return { success: false, error: `Order ${args.order_id} not found` };
    return { success: true, order: { ...order, customerName: CUSTOMERS[order.customerId]?.name || "Unknown" } };
  }
  if (name === "lookup_customer") {
    const id = (args.identifier || "").trim().toUpperCase();
    if (CUSTOMERS[id]) return { success: true, customer: CUSTOMERS[id] };
    const byEmail = Object.values(CUSTOMERS).find(c => c.email.toLowerCase() === (args.identifier || "").toLowerCase());
    if (byEmail) return { success: true, customer: byEmail };
    const byPhone = Object.values(CUSTOMERS).find(c => c.phone === args.identifier);
    if (byPhone) return { success: true, customer: byPhone };
    return { success: false, error: `No customer found for: ${args.identifier}` };
  }
  if (name === "list_orders") {
    const orders = Object.values(ORDERS).filter(o => o.customerId === args.customer_id).sort((a,b) => new Date(b.createdAt)-new Date(a.createdAt)).slice(0, args.limit || 5);
    return { success: true, orders };
  }
  if (name === "update_order_status") {
    if (!ORDERS[args.order_id]) return { success: false, error: `Order ${args.order_id} not found` };
    const prev = ORDERS[args.order_id].status;
    ORDERS[args.order_id].status = args.new_status;
    return { success: true, orderId: args.order_id, previousStatus: prev, newStatus: args.new_status };
  }
  if (name === "initiate_refund") {
    const order = ORDERS[args.order_id];
    if (!order) return { success: false, error: `Order ${args.order_id} not found` };
    if (order.status !== "delivered") return { success: false, error: `Order not delivered. Status: ${order.status}` };
    const refundId = "REF-" + Date.now();
    order.refundStatus = "refund_pending";
    return { success: true, refundId, orderId: args.order_id, refundAmount: args.amount || order.total, reason: args.reason, estimatedProcessingTime: "3-5 business days" };
  }
  if (name === "check_product_stock") {
    const p = INVENTORY[(args.sku || "").toUpperCase()];
    if (!p) return { success: false, error: `SKU ${args.sku} not found` };
    const available = p.stock - p.reserved;
    return { success: true, sku: args.sku, name: p.name, availableToPromise: available, inStock: available > 0 };
  }
  if (name === "create_ticket") {
    const customer = CUSTOMERS[args.customer_id];
    if (!customer) return { success: false, error: `Customer ${args.customer_id} not found` };
    const ticketId = `TKT-${++ticketCounter}`;
    const ticket = { id: ticketId, customerId: args.customer_id, customerName: customer.name, subject: args.subject, description: args.description, priority: args.priority || "normal", status: "open", createdAt: new Date().toISOString() };
    TICKETS[ticketId] = ticket;
    return { success: true, ticket };
  }
  return { error: `Unknown tool: ${name}` };
}

// ─── MCP Handler ─────────────────────────────────────────────────────────────

function handleMcp(msg) {
  if (!msg || !msg.method) return { jsonrpc: "2.0", id: msg?.id || null, error: { code: -32600, message: "Invalid request" } };
  const { id, method, params } = msg;

  if (method === "initialize") {
    return { jsonrpc: "2.0", id, result: { protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "talkdesk-order-mcp", version: "1.0.0" } } };
  }
  if (method === "notifications/initialized") return null;
  if (method === "ping") return { jsonrpc: "2.0", id, result: {} };
  if (method === "tools/list") return { jsonrpc: "2.0", id, result: { tools: TOOLS } };
  if (method === "tools/call") {
    try {
      const result = callTool(params.name, params.arguments || {});
      return { jsonrpc: "2.0", id, result: { content: [{ type: "text", text: JSON.stringify(result, null, 2) }], isError: false } };
    } catch(e) {
      return { jsonrpc: "2.0", id, result: { content: [{ type: "text", text: JSON.stringify({ error: e.message }) }], isError: true } };
    }
  }
  return { jsonrpc: "2.0", id, error: { code: -32601, message: `Method not found: ${method}` } };
}

// ─── Streamable HTTP Server ───────────────────────────────────────────────────
// Implements MCP Streamable HTTP transport (spec 2025-03-26)
// Single endpoint: POST /mcp for requests, GET /mcp for SSE stream
// This is the ONLY transport type supported by Talkdesk

const PORT = process.env.PORT || 3000;
const sessions = new Map();

const server = http.createServer((req, res) => {
  const origin = req.headers.origin || "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept, Mcp-Session-Id, Last-Event-ID");
  res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");

  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

  const url = new URL(req.url, `http://localhost:${PORT}`);

  // Health check
  if (url.pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", server: "talkdesk-order-mcp", version: "1.0.0", transport: "streamable-http", tools: TOOLS.length }));
    return;
  }

  // ── /mcp endpoint (Streamable HTTP transport) ─────────────────────────────
  if (url.pathname === "/mcp") {

    // POST: client sends JSON-RPC request
    if (req.method === "POST") {
      let body = "";
      req.on("data", c => body += c);
      req.on("end", () => {
        let msg;
        try {
          msg = body ? JSON.parse(body) : null;
        } catch(e) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }));
          return;
        }

        // Get or create session
        let sessionId = req.headers["mcp-session-id"];
        if (!sessionId) {
          sessionId = crypto.randomUUID();
        }

        const response = handleMcp(msg);

        // Check if client accepts SSE
        const acceptsSSE = (req.headers["accept"] || "").includes("text/event-stream");

        if (acceptsSSE && response) {
          // Stream response as SSE
          res.writeHead(200, {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "Mcp-Session-Id": sessionId,
          });
          res.write(`event: message\ndata: ${JSON.stringify(response)}\n\n`);
          res.end();
        } else {
          // Return as plain JSON
          res.writeHead(200, {
            "Content-Type": "application/json",
            "Mcp-Session-Id": sessionId,
          });
          res.end(response ? JSON.stringify(response) : "{}");
        }
      });
      return;
    }

    // GET: open SSE stream for server-initiated messages
    if (req.method === "GET") {
      const sessionId = req.headers["mcp-session-id"] || crypto.randomUUID();
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "Mcp-Session-Id": sessionId,
        "X-Accel-Buffering": "no",
      });
      res.write(": connected\n\n");
      sessions.set(sessionId, res);
      const keepAlive = setInterval(() => { if (!res.writableEnded) res.write(": ping\n\n"); }, 20000);
      req.on("close", () => { clearInterval(keepAlive); sessions.delete(sessionId); });
      return;
    }

    // DELETE: end session
    if (req.method === "DELETE") {
      const sessionId = req.headers["mcp-session-id"];
      if (sessionId && sessions.has(sessionId)) {
        const sseRes = sessions.get(sessionId);
        if (!sseRes.writableEnded) sseRes.end();
        sessions.delete(sessionId);
      }
      res.writeHead(200); res.end();
      return;
    }
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
});

server.listen(PORT, () => {
  console.log(`\n✅ Talkdesk Order MCP Server running`);
  console.log(`   Transport: Streamable HTTP (MCP 2025-03-26)`);
  console.log(`   Port     : ${PORT}`);
  console.log(`   Endpoint : http://localhost:${PORT}/mcp`);
  console.log(`   Health   : http://localhost:${PORT}/health`);
  console.log(`\n📦 Tools (${TOOLS.length}): ${TOOLS.map(t => t.name).join(", ")}\n`);
});
