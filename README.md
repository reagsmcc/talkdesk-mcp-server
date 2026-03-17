# Talkdesk Order Management MCP Server

A demo-ready MCP (Model Context Protocol) server for integrating with **Talkdesk AI Agent Platform**. Built around an e-commerce order management scenario — the same use case highlighted in Talkdesk's own MCP documentation.

---

## 🛠 Tools Exposed

| Tool | Description |
|---|---|
| `lookup_order` | Get full order details by order ID |
| `lookup_customer` | Find a customer by email, phone, or customer ID |
| `list_orders` | List recent orders for a customer |
| `update_order_status` | Change an order's status |
| `initiate_refund` | Start a refund on a delivered order |
| `check_product_stock` | Check inventory levels for a SKU |
| `create_ticket` | Create a support ticket |

---

## 🚀 Quick Start

**Requirements:** Node.js 18+

```bash
# Clone / copy this folder, then:
npm start
```

Server starts on **port 3000** (override with `PORT` env var):
- SSE endpoint:      `http://localhost:3000/sse`
- Messages endpoint: `http://localhost:3000/messages`
- Health check:      `http://localhost:3000/health`

---

## ☁️ Deploy to Production (Render.com — free tier)

Talkdesk needs to reach your MCP server over the public internet.

1. Push this folder to a GitHub repo
2. Go to [render.com](https://render.com) → New → Web Service
3. Connect your repo
4. Set:
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`
   - **Environment:** Node
5. Deploy → copy the public URL (e.g. `https://your-app.onrender.com`)

Your SSE URL will be: `https://your-app.onrender.com/sse`

Other options: Railway, Fly.io, Heroku, AWS App Runner, Azure App Service.

---

## 🔗 Configure in Talkdesk AI Agent Platform

For **each tool** you want to expose to an AI Agent:

1. In Talkdesk, go to **AI Agent Platform → Build**
2. Open your AI Agent orchestration
3. Add a new **Skill → MCP**
4. Fill in:
   - **Tool Name:** (e.g. `lookup_order`)
   - **MCP Server URL:** `https://your-app.onrender.com/sse`
   - **Tool Description:** copy from the table above
5. Map the input parameters to match the tool's `inputSchema`
6. Save → the MCP skill appears with a distinct icon in the orchestration

Repeat for each tool you want to enable.

---

## 🧪 Test Locally (curl)

```bash
# 1. Open SSE connection in one terminal (grab the sessionId from the endpoint event)
curl -N http://localhost:3000/sse

# 2. In another terminal — initialize
curl -X POST "http://localhost:3000/messages?sessionId=YOUR_SESSION_ID" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}'

# 3. List tools
curl -X POST "http://localhost:3000/messages?sessionId=YOUR_SESSION_ID" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'

# 4. Call a tool
curl -X POST "http://localhost:3000/messages?sessionId=YOUR_SESSION_ID" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"lookup_order","arguments":{"order_id":"ORD-78901"}}}'
```

---

## 📦 Demo Data Reference

### Customers
| ID | Name | Email | Tier |
|---|---|---|---|
| C-1001 | Maria Garcia | maria.garcia@email.com | Gold |
| C-1002 | James Wilson | james.wilson@email.com | Silver |
| C-1003 | Aisha Patel | aisha.patel@email.com | Platinum |

### Orders
| Order ID | Customer | Status | Total |
|---|---|---|---|
| ORD-78901 | C-1001 | in_transit | $249.99 |
| ORD-78902 | C-1001 | delivered | $89.95 |
| ORD-88100 | C-1002 | processing | $549.00 |
| ORD-99210 | C-1003 | delivered (refund pending) | $1,299.00 |

### SKUs
| SKU | Product | Stock |
|---|---|---|
| SKU-A1 | Wireless Headphones Pro | 14 |
| SKU-B3 | USB-C Charging Cable | 203 |
| SKU-C2 | Smart Watch Band | **Out of stock** |
| SKU-D5 | 4K Webcam Ultra | 3 |
| SKU-E9 | Mechanical Keyboard Deluxe | 8 |

---

## 💬 Demo Scenario Scripts

### Scenario 1 — Customer calls about a delayed order
> "Hi, I haven't received my order yet."
1. `lookup_customer` → identify caller by phone/email
2. `list_orders` → show recent orders
3. `lookup_order` → get tracking details for ORD-78901
4. `update_order_status` → escalate if needed

### Scenario 2 — Refund request
> "I want to return my keyboard, it arrived broken."
1. `lookup_customer` → find Aisha Patel (C-1003)
2. `lookup_order` → confirm ORD-99210 is delivered
3. `initiate_refund` → submit refund for $1,299.00
4. `create_ticket` → log ticket for product defect follow-up

### Scenario 3 — Product availability question
> "Is the webcam still available before I place an order?"
1. `check_product_stock` → query SKU-D5 (only 3 left — great urgency hook!)

---

## 🏗 Architecture

```
Talkdesk AI Agent
       │
       │  HTTP+SSE (MCP 2024-11-05)
       ▼
┌─────────────────────────────┐
│  MCP Server (this app)      │
│  GET  /sse   → SSE stream   │
│  POST /messages → JSON-RPC  │
└───────────┬─────────────────┘
            │
            ▼
    Mock data / plug in your
    real CRM, OMS, or DB here
```

---

## 🔒 Adding Authentication (Production)

For production, add an API key check in the HTTP handler:

```js
const API_KEY = process.env.MCP_API_KEY;

if (API_KEY && req.headers["x-api-key"] !== API_KEY) {
  res.writeHead(401, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Unauthorized" }));
  return;
}
```

Set `MCP_API_KEY` as an environment variable on your hosting platform.

---

## 🔌 Connecting to a Real Backend

Replace the mock data functions in `server.js` with real API calls:

```js
// Example: lookup_order calling a real OMS API
async function lookupOrder({ order_id }) {
  const res = await fetch(`https://your-oms.com/api/orders/${order_id}`, {
    headers: { Authorization: `Bearer ${process.env.OMS_API_KEY}` }
  });
  const data = await res.json();
  return { success: res.ok, order: data };
}
```
