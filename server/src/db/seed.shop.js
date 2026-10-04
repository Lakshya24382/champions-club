import "dotenv/config";
import { count } from "drizzle-orm";
import { db, pool } from "./index.js";
import { products, productVariants, stockMovements } from "./schema.all.js";

const shoe = (size, stock) => ({ sku: `SHO-NIK-${size}`, label: `UK ${size}`, price: 5500, stock, lowStockThreshold: 3 });
const tee = (size) => ({ sku: `APP-TEE-${size}`, label: size, price: 899, stock: 15, lowStockThreshold: 5 });

const catalog = [
  { name: "Yonex Astrox Badminton Racket", brand: "Yonex", category: "racket", sport: "badminton",
    variants: [{ sku: "RKT-YNX-AST", label: "Standard", price: 6500, stock: 12, lowStockThreshold: 4 }] },
  { name: "Wilson Pro Staff Tennis Racket", brand: "Wilson", category: "racket", sport: "tennis",
    variants: [{ sku: "RKT-WIL-PS", label: "Standard", price: 14500, stock: 6, lowStockThreshold: 3 }] },
  { name: "Dunlop Tennis Balls (can of 3)", brand: "Dunlop", category: "ball", sport: "tennis",
    variants: [{ sku: "BAL-DUN-TEN", label: "Can of 3", price: 550, stock: 40, lowStockThreshold: 10 }] },
  { name: "Yonex Mavis Shuttlecocks (tube of 6)", brand: "Yonex", category: "ball", sport: "badminton",
    variants: [{ sku: "BAL-YNX-MAV", label: "Tube of 6", price: 700, stock: 50, lowStockThreshold: 10 }] },
  { name: "Nike Court Shoes", brand: "Nike", category: "shoes", sport: "tennis",
    variants: [shoe(7, 4), shoe(8, 6), shoe(9, 6), shoe(10, 2)] },
  { name: "Racket String Set", brand: "Yonex", category: "accessory",
    variants: [{ sku: "ACC-STR-01", label: "Standard", price: 900, stock: 25, lowStockThreshold: 6 }] },
  { name: "Overgrip (pack of 3)", brand: "Wilson", category: "accessory",
    variants: [{ sku: "ACC-GRP-03", label: "Pack of 3", price: 350, stock: 30, lowStockThreshold: 8 }] },
  { name: "Champions Club T-Shirt", brand: "Champions Club", category: "apparel",
    variants: ["S", "M", "L", "XL"].map(tee) },
];

const [{ n }] = await db.select({ n: count() }).from(products);
if (n > 0) {
  console.log("Shop already has products, skipping seed.");
} else {
  await db.transaction(async (tx) => {
    for (const item of catalog) {
      const { variants, ...p } = item;
      const [prod] = await tx.insert(products).values(p).returning();
      const vs = await tx.insert(productVariants).values(variants.map((v) => ({ ...v, productId: prod.id }))).returning();
      await tx.insert(stockMovements).values(
        vs.filter((v) => v.stock > 0).map((v) => ({ variantId: v.id, change: v.stock, reason: "restock", note: "Opening stock" }))
      );
    }
  });
  console.log("Seeded shop catalog.");
}
await pool.end();
