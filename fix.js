const fs = require('fs');
const path = '/Users/reaganmccauley/Desktop/talkdesk-mcp-server/server.js';
let c = fs.readFileSync(path, 'utf8');

// Fix lookup_order to accept both orderId and order_id
c = c.replace(
  'const order = ORDERS[args.order_id];',
  'const order = ORDERS[args.order_id] || ORDERS[args.orderId];'
);

// Fix all other tools similarly
c = c.replace(
  'if (!ORDERS[args.order_id]) return { success: false, error: `Order ${args.order_id} not found` };',
  'if (!ORDERS[args.order_id || args.orderId]) return { success: false, error: `Order ${args.order_id || args.orderId} not found` };'
);

// Normalize args at the top of callTool to always use order_id
c = c.replace(
  'function callTool(name, args) {',
  'function callTool(name, args) {\n  // Normalize camelCase to snake_case\n  if (args.orderId && !args.order_id) args.order_id = args.orderId;\n  if (args.customerId && !args.customer_id) args.customer_id = args.customerId;\n  if (args.newStatus && !args.new_status) args.new_status = args.newStatus;\n'
);

fs.writeFileSync(path, c);
console.log('done');
