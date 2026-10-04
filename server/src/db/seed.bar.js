import "dotenv/config";
import { db, pool } from "./index.js";
import { barTables, menuItems } from "./schema.all.js";

const tables = Array.from({ length: 12 }, (_, i) => ({ name: `Table ${i + 1}`, seats: i < 8 ? 4 : 6 }));
await db.insert(barTables).values(tables).onConflictDoNothing({ target: barTables.name });

const bar = (name, category, price) => ({ name, category, station: "bar", price });
const kit = (name, category, price) => ({ name, category, station: "kitchen", price });

const menu = [
  bar("Masala Chai", "drink", 60), bar("Filter Coffee", "drink", 90), bar("Fresh Lime Soda", "drink", 90),
  bar("Cold Coffee", "drink", 140), bar("Virgin Mojito", "drink", 180), bar("Fresh Orange Juice", "drink", 130),
  bar("Energy Drink", "drink", 150), bar("Water Bottle", "drink", 30),
  kit("Veg Sandwich", "food", 150), kit("Chicken Burger", "food", 280), kit("Paneer Wrap", "food", 220),
  kit("Pasta Arrabbiata", "food", 260), kit("Veg Biryani", "food", 240),
  kit("French Fries", "snack", 140), kit("Nachos", "snack", 180), kit("Samosa (2 pcs)", "snack", 60),
  kit("Chocolate Brownie", "dessert", 120),
];
await db.insert(menuItems).values(menu).onConflictDoNothing({ target: menuItems.name });

console.log("Seeded bar tables and menu.");
await pool.end();
